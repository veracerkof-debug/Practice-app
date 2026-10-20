// Воздушный голос (airsound.js, все рецепты) в AudioWorklet: один узел — одна нота, весь звук считается внутри
// в одном цикле (вместо ~20 узлов Web Audio на ноту). Таблицы волн и розовый шум — общие на все голоса
// (область модуля). Память голоса выделяется в конструкторе; в process() ничего не создаётся.
// processorOptions: { R — рецепт (airOf), f, t — старт по часам контекста, width, bright, fade, body { decay, floor }, uni }.
// Параметры (k-rate): freq — высота (скольжение: setTargetAtTime), vib — внешнее вибрато, центы.
// Сообщение { k: 'stop', t } — затихнуть за 10 мс к моменту t и завершиться (узел освобождается).
const TBL = 2048, PINK_SEC = 4;
const sine = new Float32Array(TBL + 1);
for (let i = 0; i <= TBL; i++) sine[i] = Math.sin((i / TBL) * 2 * Math.PI);
const waves = new Map(); // ключ гармоник → таблица
function waveOf(parts) {
  const k = parts.join(',');
  let w = waves.get(k);
  if (w) return w;
  w = new Float32Array(TBL + 1);
  let peak = 0;
  for (let i = 0; i <= TBL; i++) { const ph = (i / TBL) * 2 * Math.PI; let s = 0; for (let j = 0; j < parts.length; j++) s += parts[j] * Math.sin(ph * (j + 1)); w[i] = s; if (Math.abs(s) > peak) peak = Math.abs(s); }
  // как PeriodicWave с нормализацией: пик к единице
  for (let i = 0; i <= TBL; i++) w[i] /= peak || 1;
  waves.set(k, w);
  return w;
}
let pink = null;
function pinkNoise() {
  if (pink) return pink;
  const n = sampleRate * PINK_SEC; pink = new Float32Array(n);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0;
  for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898; pink[i] = (b0 + b1 + b2 + b3 + b4 + b5 + w * 0.5362) * 0.11; }
  return pink;
}
const rnd = (a, b) => a + Math.random() * (b - a);
// биквад (как Web Audio): c — коэффициенты [b0 b1 b2 a1 a2], s — состояние [x1 x2 y1 y2]
function coef(c, type, f, q, sr) {
  const w = 2 * Math.PI * Math.max(10, Math.min(f, sr * 0.45)) / sr, cs = Math.cos(w), sn = Math.sin(w), a = sn / (2 * Math.max(0.05, q));
  let b0, b1, b2; const a0 = 1 + a, a1 = -2 * cs, a2 = 1 - a;
  if (type === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; } else if (type === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; } else { b0 = a; b1 = 0; b2 = -a; }
  c[0] = b0 / a0; c[1] = b1 / a0; c[2] = b2 / a0; c[3] = a1 / a0; c[4] = a2 / a0;
}
const bq = (c, s, x) => { const y = c[0] * x + c[1] * s[0] + c[2] * s[1] - c[3] * s[2] - c[4] * s[3]; s[1] = s[0]; s[0] = x; s[3] = s[2]; s[2] = y; return y; };

class AirVoice extends AudioWorkletProcessor {
  static get parameterDescriptors() { return [{ name: 'freq', defaultValue: 220, minValue: 1, maxValue: 20000, automationRate: 'k-rate' }, { name: 'vib', defaultValue: 0, minValue: -2400, maxValue: 2400, automationRate: 'k-rate' }]; }
  constructor(options) {
    super();
    const o = options.processorOptions || {}, R = o.R || {}, sr = sampleRate;
    this.sr = sr; this.R = R; this.width = o.width == null ? 1 : o.width; this.bright = o.bright == null ? 1 : o.bright; this.fade = o.fade == null ? 2.5 : o.fade;
    this.f0 = o.f || 220; this.t0 = o.t || 0; this.started = false; this.n = 0; this.stopAt = Infinity; this.dead = false;
    this.wave = waveOf(R.parts || [1]); this.noise = pinkNoise();
    const n = Math.max(1, o.uni || R.uni || 1); this.uni = n;
    this.ph = new Float64Array(n); this.inc = new Float64Array(n); this.det = new Float64Array(n); this.drift = new Float64Array(n); this.dTarget = new Float64Array(n); this.panL = new Float32Array(n); this.panR = new Float32Array(n);
    const w = this.width;
    for (let i = 0; i < n; i++) { const k = n === 1 ? 0 : (i / (n - 1)) * 2 - 1; this.det[i] = k * (R.det || 0) * w + rnd(-1, 1); const p = Math.max(-1, Math.min(1, k * 0.7 * Math.min(1, w))); this.panL[i] = Math.cos((p + 1) * Math.PI / 4); this.panR[i] = Math.sin((p + 1) * Math.PI / 4); this.ph[i] = rnd(0, TBL); this.dTarget[i] = rnd(-1, 1) * (R.drift || 0); }
    this.lv = 1 / Math.sqrt(n); this.driftN = 0;
    // вибрато своё: [частота, центы, задержка]
    this.vibPh = 0; this.vibRate = R.vib ? R.vib[0] * rnd(0.95, 1.05) : 0;
    // мерцание и опора
    this.oph = new Float64Array(3); this.oph[1] = TBL / 3; this.oph[2] = rnd(0, TBL); this.fifthDet = rnd(-3, 3);
    // удар (felt): яркая волна, гаснет
    this.pingWave = R.ping ? waveOf(R.ping) : null; this.pingPh = 0; this.pingAmp = R.pingAmp == null ? 0.55 : R.pingAmp;
    // фильтры: основа lp, дыхание bp (+hp для низких), форманты, удар молоточка
    this.lpc = new Float64Array(5); this.lps = new Float64Array(4);
    this.bpc = new Float64Array(5); this.bps = new Float64Array(4); this.hpc = new Float64Array(5); this.hps = new Float64Array(4); this.useHp = false;
    this.fm = R.formant ? [[800, 5, 1], [1150, 6, 0.7], [2900, 8, 0.22]].map(([fq, q, g]) => { const c = new Float64Array(5); coef(c, 'bp', fq, q, sr); return { c, s: new Float64Array(4), g: g * 1.5 }; }) : null;
    this.thc = new Float64Array(5); this.ths = new Float64Array(4);
    this.nPos = Math.floor(rnd(0, this.noise.length - 1)); this.nPos2 = Math.floor(rnd(0, this.noise.length - 1));
    this.body = o.body || null; this.core = 1;
    this.tune(this.f0, 0);
    this.port.onmessage = (e) => { if (e.data && e.data.k === 'stop') this.stopAt = e.data.t == null ? currentTime : e.data.t; };
  }
  tune(f, vibCents) {
    const R = this.R, sr = this.sr, n = this.uni;
    for (let i = 0; i < n; i++) this.inc[i] = (f * Math.pow(2, (this.det[i] + this.drift[i] + vibCents) / 1200) / sr) * TBL;
    this.incO0 = (f * 2 * Math.pow(2, (-4 + vibCents) / 1200) / sr) * TBL; this.incO1 = (f * 2 * Math.pow(2, (4 + vibCents) / 1200) / sr) * TBL;
    this.incF = (f * 3 * Math.pow(2, (this.fifthDet + vibCents) / 1200) / sr) * TBL; this.incS = (f * 0.5 / sr) * TBL; this.incP = (f * Math.pow(2, vibCents / 1200) / sr) * TBL;
    if (f !== this.fTuned) {
      this.fTuned = f;
      coef(this.lpc, 'lp', Math.max(700, Math.min(18000, f * (R.cut || 7) * this.bright)), 0.3, sr);
      const fc = Math.min(9000, f * 2); coef(this.bpc, 'bp', fc, 0.9, sr); this.useHp = fc < 1200; if (this.useHp) coef(this.hpc, 'hp', 350, 0.7, sr);
      if (R.thump) coef(this.thc, 'lp', Math.min(900, f * 2.5), 0.7, sr);
    }
  }
  process(_in, outputs, params) {
    if (this.dead) return false;
    const out = outputs[0], L = out[0], Rr = out[1] || out[0], N = L.length, sr = this.sr, R = this.R, t = currentTime;
    // старт: до момента t0 — тишина (точность — отсчёт)
    let s0 = 0;
    if (!this.started) { if (t + N / sr <= this.t0) return true; s0 = Math.max(0, Math.min(N - 1, Math.round((this.t0 - t) * sr))); this.started = true; }
    // стоп: с момента stopAt — спад 10 мс, затем конец
    const stopIdx = this.stopAt <= t + N / sr ? Math.max(0, Math.round((this.stopAt - t) * sr)) : N + 1;
    // раз в квант: плавание, вибрато, высота, нарастания и спады (их шаг в 2,7 мс не слышен)
    const f = params.freq[0], vibExt = params.vib[0], age = this.n / sr, n = this.uni;
    if (R.drift) { this.driftN += N; if (this.driftN > sr * 1.7) { this.driftN = 0; for (let i = 0; i < n; i++) this.dTarget[i] = rnd(-1, 1) * R.drift; } for (let i = 0; i < n; i++) this.drift[i] += (this.dTarget[i] - this.drift[i]) * 0.02; }
    let vib = vibExt;
    if (this.vibRate) { const amt = age < R.vib[2] ? 0 : Math.min(1, (age - R.vib[2]) / 0.8) * R.vib[1]; this.vibPh += (this.vibRate / sr) * TBL * N; if (this.vibPh >= TBL) this.vibPh -= TBL; vib += sine[this.vibPh | 0] * amt; }
    this.tune(f, vib);
    if (this.body) { const tau = this.body.decay / 3; this.core += (this.body.floor - this.core) * (N / (tau * sr)); }
    const core = this.core, swell = this.fade > 0 ? Math.min(1, age / this.fade) : 1, lvl = R.lvl || 1;
    const oct = (R.oct || 0) * swell, fifth = (R.fifth || 0) * swell, sub = R.sub || 0, breath = R.breath || 0, chiff = R.chiff || 0, thump = R.thump || 0;
    // спады ударов и придыха — множителем на отсчёт (без exp в цикле)
    const pingOn = !!this.pingWave && age < 2, pingK = Math.exp(-1 / (0.14 * sr)), thumpOn = thump > 0 && age < 0.12, thumpK = Math.exp(-1 / (0.015 * sr)), chiffK = Math.exp(-1 / (0.06 * sr));
    let pingEnv = this.pingEnv == null ? 0 : this.pingEnv, thumpEnv = this.thumpEnv == null ? thump : this.thumpEnv, chiffEnv = this.chiffEnv == null ? Math.max(0, chiff - breath) : this.chiffEnv;
    const ph = this.ph, inc = this.inc, panL = this.panL, panR = this.panR, wave = this.wave, pingWave = this.pingWave, noise = this.noise, nLen = noise.length, lv = this.lv;
    const lpc = this.lpc, lps = this.lps, bpc = this.bpc, bps = this.bps, hpc = this.hpc, hps = this.hps, useHp = this.useHp, thc = this.thc, ths = this.ths, fm = this.fm;
    const incO0 = this.incO0, incO1 = this.incO1, incF = this.incF, incS = this.incS, incP = this.incP, pingAmp = this.pingAmp, oph = this.oph;
    let o0 = oph[0], o1 = oph[1], o2 = oph[2], pp = this.pingPh, nPos = this.nPos, nPos2 = this.nPos2, cnt = this.n, fadeOut = this.fadeOut == null ? 1 : this.fadeOut;
    const fadeStep = 1 / (0.01 * sr), attP = 1 / (0.004 * sr);
    for (let s = s0; s < N; s++) {
      if (s >= stopIdx) { fadeOut -= fadeStep; if (fadeOut <= 0) { this.dead = true; break; } }
      // основа: унисон по таблице, с панорамой
      let mL = 0, mR = 0;
      for (let i = 0; i < n; i++) { let p = ph[i] + inc[i]; if (p >= TBL) p -= TBL; ph[i] = p; const k = p | 0, x = (wave[k] + (wave[k + 1] - wave[k]) * (p - k)) * lv; mL += x * panL[i]; mR += x * panR[i]; }
      let mono = (mL + mR) * 0.7071;
      if (sub) { o2 += incS; if (o2 >= TBL) o2 -= TBL; mono += sine[o2 | 0] * sub; }
      if (pingOn) { pp += incP; if (pp >= TBL) pp -= TBL; if (cnt < 0.004 * sr) pingEnv += attP; else pingEnv *= pingK; const k = pp | 0; mono += (pingWave[k] + (pingWave[k + 1] - pingWave[k]) * (pp - k)) * pingAmp * pingEnv; }
      // в фильтр: основа (+ форманты у хора) и мерцание сверху; «ширина» — разность каналов мимо фильтра
      let inF = mono * core, inW = (mL - mR) * 0.7071 * core;
      if (fm) { let y = inF * 0.35; for (let j = 0; j < 3; j++) y += bq(fm[j].c, fm[j].s, inF) * fm[j].g; inF = y; }
      if (oct) { o0 += incO0; if (o0 >= TBL) o0 -= TBL; o1 += incO1; if (o1 >= TBL) o1 -= TBL; const a = sine[o0 | 0] * 0.5, b2 = sine[o1 | 0] * 0.5; inF += (a + b2) * oct; inW += (a - b2) * oct * 0.5; }
      if (fifth) { o2 += incF; if (o2 >= TBL) o2 -= TBL; inF += sine[o2 | 0] * fifth; }
      const yF = bq(lpc, lps, inF);
      // дыхание и придых: шум в полосе около ноты, мимо фильтра; удар молоточка — низкий шум 120 мс
      let br = 0;
      if (breath || chiff) { nPos++; if (nPos >= nLen) nPos = 0; let w = bq(bpc, bps, noise[nPos]); if (useHp) w = bq(hpc, hps, w); if (cnt > 0.03 * sr) chiffEnv *= chiffK; br = w * (breath + chiffEnv); }
      if (thumpOn) { nPos2++; if (nPos2 >= nLen) nPos2 = 0; if (cnt > 0.004 * sr) thumpEnv *= thumpK; br += bq(thc, ths, noise[nPos2]) * thumpEnv; }
      const g = lvl * fadeOut, wL = inW * 0.6;
      L[s] = (yF + wL + br) * g; Rr[s] = (yF - wL + br) * g;
      cnt++;
    }
    oph[0] = o0; oph[1] = o1; oph[2] = o2; this.pingPh = pp; this.nPos = nPos; this.nPos2 = nPos2; this.n = cnt; this.fadeOut = fadeOut; this.pingEnv = pingEnv; this.thumpEnv = thumpEnv; this.chiffEnv = chiffEnv;
    return !this.dead;
  }
}
registerProcessor('melete-airvoice', AirVoice);
