// Прототип: воздушный звук (airsound.js, рецепт «air») целиком в одном узле AudioWorklet — все голоса считаются
// в одном цикле над блоком 128 отсчётов, без узлов на каждую мелочь. На голос: унисон из трёх волн по таблице
// с расстройкой и «плаванием», мерцание октавой (два синуса, вступают медленно), дыхание (розовый шум в полосе
// около ноты), мягкий фильтр, огибающая. Память выделяется один раз — в process() ничего не создаётся.
// Сообщения: { k: 'on', id, f, v }, { k: 'off', id }, { k: 'set', id, f }, { k: 'all' } (снять всё).
const TBL = 2048, MAXV = 32, PINK = 4 * 48000;
const PARTS = [1, 0.16, 0.05, 0.015], DET = 7, DRIFT = 3, OCT = 0.1, BREATH = 0.03, CUT = 7, UNI = 3;

class AirSynth extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const sr = sampleRate;
    this.sr = sr;
    // таблица волны основы (гармоники) и синуса
    this.wave = new Float32Array(TBL + 1); this.sine = new Float32Array(TBL + 1);
    for (let i = 0; i <= TBL; i++) { const ph = (i / TBL) * 2 * Math.PI; let s = 0; PARTS.forEach((a, k) => { s += a * Math.sin(ph * (k + 1)); }); this.wave[i] = s / 1.2; this.sine[i] = Math.sin(ph); }
    // розовый шум, один на всех (как pinkNoise в waves.js)
    this.pink = new Float32Array(PINK);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0;
    for (let i = 0; i < PINK; i++) { const w = Math.random() * 2 - 1; b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898; this.pink[i] = (b0 + b1 + b2 + b3 + b4 + b5 + w * 0.5362) * 0.11; }
    // голоса — плоские массивы (без объектов в горячем цикле)
    this.v = Array.from({ length: MAXV }, () => ({ on: false, id: null, f: 220, vel: 0.8, env: 0, rel: false, t: 0,
      ph: new Float64Array(UNI), inc: new Float64Array(UNI), det: new Float64Array(UNI), drift: new Float64Array(UNI), dTarget: new Float64Array(UNI), pan: new Float32Array(UNI),
      oph: new Float64Array(2), nPos: 0, bp: new Float64Array(4), bpc: new Float64Array(5), lp: new Float64Array(4), lpc: new Float64Array(5), driftT: 0 }));
    this.port.onmessage = (e) => this.msg(e.data);
    // ноты сразу при создании (офлайн-рендер: сообщения порта туда доходят только на паузах)
    const po = options && options.processorOptions;
    if (po && Array.isArray(po.notes)) po.notes.forEach((n) => this.msg({ k: 'on', ...n }));
  }
  coef(c, type, f, q) { // коэффициенты биквада (как в Web Audio)
    const w = 2 * Math.PI * Math.min(f, this.sr * 0.45) / this.sr, cs = Math.cos(w), sn = Math.sin(w), a = sn / (2 * q);
    let b0, b1, b2; const a0 = 1 + a, a1 = -2 * cs, a2 = 1 - a;
    if (type === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = (1 - cs) / 2; } else { b0 = a; b1 = 0; b2 = -a; }
    c[0] = b0 / a0; c[1] = b1 / a0; c[2] = b2 / a0; c[3] = a1 / a0; c[4] = a2 / a0;
  }
  tune(V) {
    for (let i = 0; i < UNI; i++) { const k = UNI === 1 ? 0 : (i / (UNI - 1)) * 2 - 1; V.det[i] = k * DET; V.pan[i] = k * 0.7; V.inc[i] = (V.f * Math.pow(2, (V.det[i] + V.drift[i]) / 1200) / this.sr) * TBL; }
    this.coef(V.lpc, 'lp', Math.max(700, Math.min(18000, V.f * CUT)), 0.3);
    this.coef(V.bpc, 'bp', Math.min(9000, V.f * 2), 0.9);
  }
  msg(m) {
    if (m.k === 'all') { this.v.forEach((V) => { V.rel = true; }); return; }
    if (m.k === 'off') { const V = this.v.find((x) => x.on && x.id === m.id); if (V) V.rel = true; return; }
    if (m.k === 'set') { const V = this.v.find((x) => x.on && x.id === m.id); if (V) { V.f = Math.max(20, Math.min(8000, +m.f || 220)); this.tune(V); } return; }
    if (m.k !== 'on') return;
    let V = this.v.find((x) => !x.on) || this.v.reduce((a, b) => (a.env < b.env ? a : b)); // свободный или самый тихий
    V.on = true; V.id = m.id; V.f = Math.max(20, Math.min(8000, +m.f || 220)); V.vel = m.v == null ? 0.8 : m.v; V.env = 0; V.rel = false; V.t = 0; V.nPos = Math.floor(Math.random() * (PINK - 1)); V.driftT = 0;
    for (let i = 0; i < UNI; i++) { V.ph[i] = Math.random() * TBL; V.drift[i] = 0; V.dTarget[i] = (Math.random() * 2 - 1) * DRIFT; }
    V.oph[0] = 0; V.oph[1] = TBL / 3; V.bp.fill(0); V.lp.fill(0);
    this.tune(V);
  }
  process(_in, out) {
    const L = out[0][0], R = out[0][1] || out[0][0], n = L.length, sr = this.sr, wave = this.wave, sine = this.sine, pink = this.pink;
    const att = 1 / (0.25 * sr), relK = Math.exp(-1 / (0.5 * sr)), fadeOct = 1 / (2.5 * sr);
    for (let vi = 0; vi < MAXV; vi++) {
      const V = this.v[vi]; if (!V.on) continue;
      // плавание: раз в ~1,5 с новая цель, расстройка к ней за блок
      V.driftT += n; if (V.driftT > 1.5 * sr) { V.driftT = 0; for (let i = 0; i < UNI; i++) V.dTarget[i] = (Math.random() * 2 - 1) * DRIFT; }
      for (let i = 0; i < UNI; i++) { V.drift[i] += (V.dTarget[i] - V.drift[i]) * 0.02; V.inc[i] = (V.f * Math.pow(2, (V.det[i] + V.drift[i]) / 1200) / sr) * TBL; }
      const oinc0 = (V.f * 2 * Math.pow(2, -4 / 1200) / sr) * TBL, oinc1 = (V.f * 2 * Math.pow(2, 4 / 1200) / sr) * TBL, lv = 1 / Math.sqrt(UNI);
      const lpc = V.lpc, bpc = V.bpc, lp = V.lp, bp = V.bp;
      let env = V.env, t = V.t;
      for (let s = 0; s < n; s++) {
        // огибающая: вступление 0,25 с, спад 0,5 с
        if (V.rel) env *= relK; else if (env < 1) env = Math.min(1, env + att);
        // унисон по таблице с панорамой
        let mixL = 0, mixR = 0, mono = 0;
        for (let i = 0; i < UNI; i++) {
          let p = V.ph[i] + V.inc[i]; if (p >= TBL) p -= TBL; V.ph[i] = p;
          const k = p | 0, fr = p - k, x = (wave[k] + (wave[k + 1] - wave[k]) * fr) * lv, pn = V.pan[i];
          mixL += x * (1 - Math.max(0, pn)); mixR += x * (1 + Math.min(0, pn)); mono += x;
        }
        // мерцание октавой, вступает за 2,5 с
        const octA = Math.min(1, t * fadeOct) * OCT;
        let o0 = V.oph[0] + oinc0; if (o0 >= TBL) o0 -= TBL; V.oph[0] = o0;
        let o1 = V.oph[1] + oinc1; if (o1 >= TBL) o1 -= TBL; V.oph[1] = o1;
        // как в airVoice: два синуса по 0,5 на уровне OCT, разведены по сторонам
        mixL += (sine[o0 | 0] * 0.75 + sine[o1 | 0] * 0.25) * octA; mixR += (sine[o0 | 0] * 0.25 + sine[o1 | 0] * 0.75) * octA;
        // фильтр основы (биквад, прямая форма 1)
        const inL = mixL, inR = mixR;
        const yL = lpc[0] * inL + lpc[1] * lp[0] + lpc[2] * lp[1] - lpc[3] * lp[2] - lpc[4] * lp[3]; lp[1] = lp[0]; lp[0] = inL; lp[3] = lp[2]; lp[2] = yL;
        // правый канал тем же фильтром приблизительно: разница каналов мала — считаем моно-фильтр и ширину от панорамы
        const yR = yL + (inR - inL) * 0.8;
        // дыхание: розовый шум через полосовой фильтр около ноты
        let np = V.nPos + 1; if (np >= PINK) np = 0; V.nPos = np;
        const w = pink[np], nb = bpc[0] * w + bpc[1] * bp[0] + bpc[2] * bp[1] - bpc[3] * bp[2] - bpc[4] * bp[3]; bp[1] = bp[0]; bp[0] = w; bp[3] = bp[2]; bp[2] = nb;
        const g = env * V.vel * 1.3, breath = nb * BREATH * env; // ×1,3 — уровень как у airVoice
        L[s] += (yL + breath) * g; R[s] += (yR + breath) * g;
        t++;
      }
      V.env = env; V.t = t;
      if (V.rel && env < 1e-4) { V.on = false; V.id = null; }
    }
    return true;
  }
}
registerProcessor('melete-air', AirSynth);
