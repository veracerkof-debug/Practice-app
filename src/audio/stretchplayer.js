// Проигрыватель записей на движке Signalsmith Stretch (MIT, WebAssembly в AudioWorklet) в буферном режиме:
// запись раскодируется целиком и живёт внутри узла, узел сам её проигрывает — скорость (rate) без смены высоты и
// сдвиг высоты (полутоны, центы) считаются одним алгоритмом, без <audio>-элемента в цепочке. Элемент медиа на
// Android может звучать и напрямую, мимо Web Audio (сухой оригинал поверх сдвинутого), и тянет своё, худшее
// растяжение по скорости — поэтому звук из медиатеки идёт здесь; видео остаётся на элементе (кадры).
// Интерфейс как у медиа-элемента: currentTime, duration, paused, playbackRate, play(), pause(), события
// loadedmetadata / play / pause / ended / error — модуль медиатеки обращается к обоим одинаково.
// Узлов два (A и B): дорожки записи пересводятся в запасной узел, пока звучит рабочий, и подхватываются
// перекрёстным затуханием в 60 мс — смена громкости дорожки на ходу не рвёт звук и не сбивает положение.
let loading = null;
const lib = () => loading || (loading = import('./vendor/signalsmith-stretch.mjs').then((m) => m.default));

export const stretchAvailable = () => typeof AudioWorkletNode !== 'undefined';

// c — AudioContext, dest — шина медиатеки. → проигрыватель (EventTarget)
export async function createStretchPlayer(c, dest) {
  const make = await lib();
  const p = new EventTarget();
  let dur = 0, pos = 0, posAt = 0, playing = false, rate = 1, semi = 0, formant = false, gen = 0, lat = 0.12, ended = false;
  const now = () => performance.now();
  const lead = () => c.currentTime + lat; // изменения — с учётом задержки узла, иначе переход размазан
  const cur = () => (playing ? Math.min(dur, pos + ((now() - posAt) / 1000) * rate) : pos);
  const fire = (k) => p.dispatchEvent(new Event(k));
  // Вход объявлен, но не подключён: с numberOfInputs: 0 узел падает на первом же кванте, пока не активен
  // (в коде обёртки inputs[c % inputs.length] при inputs === undefined), и дальше молчит навсегда
  async function mk() {
    const node = await make(c, { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
    const g = c.createGain();
    node.connect(g); g.connect(dest);
    const u = { node, g, lat: 0.12 };
    // положение из узла — раз в 50 мс, пока играет; конец записи — «ended»
    node.setUpdateInterval(0.05, (t) => {
      if (!playing || u !== A) return;
      pos = Math.max(0, t); posAt = now();
      if (dur && t >= dur - 0.03) { playing = false; pos = dur; ended = true; node.schedule({ active: false }); fire('ended'); fire('pause'); }
    });
    return u;
  }
  let A = await mk(), B = null; // A — звучит, B — запасной (создаётся при первой смене дорожек)
  // задержка узла — только разумная (секунды, не отсчёты и не NaN): иначе отрезок включился бы через часы
  const refreshLatency = async (u = A) => { try { const l = await u.node.latency(); if (typeof l === 'number' && l > 0 && l < 2) { u.lat = l; if (u === A) lat = l; } } catch { /* */ } };
  // ошибка внутри процессора — наружу событием (процессор после неё молчит навсегда)
  A.node.onprocessorerror = (e) => p.dispatchEvent(Object.assign(new Event('procerror'), { detail: (e && e.message) || 'processorerror' }));
  // outputTime — когда вступает (ключ обёртки; в README он назван output), output — поле отрезка
  const schedOn = (u, o) => { const t = lead(); return u.node.schedule({ output: t, outputTime: t, ...o }); };
  const sched = (o) => schedOn(A, o);
  const stopAll = () => { A.node.schedule({ active: false }); if (B) B.node.schedule({ active: false }); };
  Object.defineProperties(p, {
    currentTime: { get: cur, set(t) { t = Math.max(0, Math.min(dur || 0, +t || 0)); pos = t; posAt = now(); ended = false; if (playing) sched({ input: t, active: true }); } },
    duration: { get: () => dur },
    paused: { get: () => !playing },
    playbackRate: { get: () => rate, set(r) { rate = Math.max(0.25, Math.min(4, +r || 1)); if (playing) { pos = cur(); posAt = now(); sched({ input: pos, rate }); } else sched({ rate }); } },
    ended: { get: () => ended },
  });
  // Самопроверка: 0,3 с тона в узел при нулевой громкости, замер на выходе узла (до громкости) → { db, sampleRate,
  // state, lat, channels, err } или null, если контекст не идёт. Тишина — движок на этом устройстве не звучит
  p.selfTest = async () => {
    if (c.state !== 'running') return null;
    const n = Math.round(c.sampleRate * 0.3), L = new Float32Array(n), R = new Float32Array(n);
    for (let i = 0; i < n; i++) { L[i] = R[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / c.sampleRate); }
    const an = c.createAnalyser(); an.fftSize = 2048; an.smoothingTimeConstant = 0;
    const was = A.g.gain.value;
    A.g.gain.value = 0;
    A.node.connect(an);
    let db = -180, err = '';
    try {
      await A.node.addBuffers([L, R]);
      await refreshLatency();
      sched({ active: true, input: 0, rate: 1, semitones: 0 });
      await new Promise((r) => setTimeout(r, Math.round(lat * 1000) + 250));
      const buf = new Float32Array(an.fftSize);
      an.getFloatTimeDomainData(buf);
      let e = 0; for (const v of buf) e += v * v;
      db = 20 * Math.log10(Math.sqrt(e / buf.length) + 1e-9);
    } catch (e) { err = String((e && e.message) || e); }
    finally {
      try { stopAll(); await A.node.dropBuffers(); } catch { /* */ }
      try { A.node.disconnect(an); } catch { /* */ }
      A.g.gain.value = was;
    }
    return { db, sampleRate: c.sampleRate, state: c.state, lat, channels: A.node.channelCount, err };
  };
  // Запись (Blob) → в узел; старое вычищается. Вернёт длительность
  p.load = async (blob) => {
    const my = ++gen;
    parts = null; gains = {};
    playing = false; pos = 0; posAt = now(); ended = false;
    stopAll();
    await A.node.dropBuffers();
    if (B) await B.node.dropBuffers();
    let buf;
    try { buf = await c.decodeAudioData(await blob.arrayBuffer()); } catch (e) { if (my === gen) fire('error'); throw e; }
    if (my !== gen) return 0; // пока раскодировали, выбрали другую запись
    const chs = buf.numberOfChannels, L = buf.length, CH = Math.min(2, chs);
    // кусками по 30 с: буферы уходят в поток звука переносом, главный поток не держит копию
    const STEP = c.sampleRate * 30;
    for (let s = 0; s < L; s += STEP) {
      const n = Math.min(STEP, L - s), chunk = [];
      for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(Math.min(ch, CH - 1)); chunk.push(d.slice(s, s + n)); }
      await A.node.addBuffers(chunk);
      if (my !== gen) return 0;
    }
    dur = buf.duration;
    await refreshLatency();
    fire('loadedmetadata');
    return dur;
  };
  p.play = async () => {
    if (playing) return;
    try { if (c.state !== 'running') await c.resume(); } catch { /* по жесту */ }
    if (ended || pos >= dur - 0.03) { pos = 0; ended = false; }
    playing = true; posAt = now();
    sched({ active: true, input: pos, rate, semitones: semi, formantCompensation: formant });
    fire('play');
  };
  p.pause = () => {
    if (!playing) return;
    pos = cur(); posAt = now(); playing = false;
    stopAll();
    fire('pause');
  };
  // Дорожки записи (stems) с громкостью каждой: parts — { имя: Blob }, gains — { имя: 0…1.5 }. Раскодированные дорожки
  // держатся в памяти как Int16 (в два раза меньше float), смесь считается по кускам в 30 с и уходит в узел переносом;
  // setMix — пересведение в запасной узел на ходу, подхват перекрёстным затуханием
  let parts = null, gains = {}, mixTm = 0, mixing = 0;
  const FADE = 0.06;
  const toI16 = (f) => { const o = new Int16Array(f.length); for (let i = 0; i < f.length; i++) { const v = f[i]; o[i] = v >= 1 ? 32767 : v <= -1 ? -32768 : (v * 32767) | 0; } return o; };
  async function pushMix(u, my) {
    const names = Object.keys(parts), len = parts[names[0]].len, STEP = c.sampleRate * 30;
    for (let s0 = 0; s0 < len; s0 += STEP) {
      const n = Math.min(STEP, len - s0), L = new Float32Array(n), R = new Float32Array(n);
      for (const k of names) {
        const g = (gains[k] == null ? 1 : gains[k]) / 32767, P = parts[k];
        if (!g) continue;
        for (let i = 0; i < n; i++) { L[i] += P.L[s0 + i] * g; R[i] += P.R[s0 + i] * g; }
      }
      await u.node.addBuffers([L, R]);
      if (my !== gen) return false;
    }
    return true;
  }
  p.loadParts = async (blobs, g = {}) => {
    const my = ++gen;
    playing = false; pos = 0; posAt = now(); ended = false;
    stopAll();
    await A.node.dropBuffers();
    if (B) await B.node.dropBuffers();
    const next = {};
    let len = 0;
    for (const k of Object.keys(blobs)) {
      let buf;
      try { buf = await c.decodeAudioData(await blobs[k].arrayBuffer()); } catch (e) { if (my === gen) fire('error'); throw e; }
      if (my !== gen) return 0;
      const CH = Math.min(2, buf.numberOfChannels);
      next[k] = { L: toI16(buf.getChannelData(0)), R: toI16(buf.getChannelData(CH - 1)), len: buf.length };
      len = Math.max(len, buf.length);
    }
    for (const k of Object.keys(next)) if (next[k].len < len) { // выровнять длины
      const P = next[k], L = new Int16Array(len), R = new Int16Array(len); L.set(P.L); R.set(P.R); next[k] = { L, R, len };
    }
    parts = next; gains = { ...g };
    if (!(await pushMix(A, my))) return 0;
    dur = len / c.sampleRate;
    await refreshLatency();
    fire('loadedmetadata');
    return dur;
  };
  // Пересведение: смесь строится в запасном узле, пока рабочий звучит; затем запасной вступает с того же места,
  // громкости меняются крест-накрест за 60 мс, узлы меняются ролями. Новая правка во время сведения — ждёт своей очереди
  async function remix() {
    if (mixing || !parts) return;
    mixing = 1;
    const my = gen;
    try {
      if (!B) B = await mk();
      await B.node.dropBuffers();
      if (my !== gen || !parts) return;
      if (!(await pushMix(B, my))) return;
      await refreshLatency(B);
      if (my !== gen || !parts) return;
      const old = A, nu = B;
      if (playing) {
        const t = c.currentTime + Math.max(old.lat, nu.lat), at = Math.min(dur, cur() + Math.max(0, t - c.currentTime) * rate);
        nu.node.schedule({ output: t, outputTime: t, active: true, input: at, rate, semitones: semi, formantCompensation: formant });
        nu.g.gain.cancelScheduledValues(0); nu.g.gain.setValueAtTime(0, t); nu.g.gain.linearRampToValueAtTime(1, t + FADE);
        old.g.gain.cancelScheduledValues(0); old.g.gain.setValueAtTime(1, t); old.g.gain.linearRampToValueAtTime(0, t + FADE);
        setTimeout(() => { if (my === gen) old.node.schedule({ active: false }); }, (Math.max(old.lat, nu.lat) + FADE + 0.05) * 1000);
      } else {
        nu.node.schedule({ active: false, rate, semitones: semi, formantCompensation: formant });
        nu.g.gain.cancelScheduledValues(0); nu.g.gain.value = 1; old.g.gain.cancelScheduledValues(0); old.g.gain.value = 0;
      }
      A = nu; B = old; lat = nu.lat;
      // старые буферы — вон, когда затухание прошло
      setTimeout(() => { if (my === gen && B === old) old.node.dropBuffers().catch(() => {}); }, (Math.max(old.lat, nu.lat) + FADE + 0.3) * 1000);
    } finally { mixing = 0; }
    if (dirty) { dirty = false; remix(); }
  }
  let dirty = false;
  p.setMix = (g) => {
    gains = { ...gains, ...g };
    if (!parts) return;
    clearTimeout(mixTm);
    mixTm = setTimeout(() => { if (mixing) dirty = true; else remix(); }, 120);
  };
  p.hasParts = () => !!parts;
  p.dropParts = () => { parts = null; gains = {}; };
  p.setPitch = (s = 0, cents = 0, f = false) => { semi = (+s || 0) + (+cents || 0) / 100; formant = !!f; sched({ semitones: semi, formantCompensation: formant }); };
  p.latency = () => lat;
  p.destroy = () => { gen++; try { stopAll(); A.node.disconnect(); A.g.disconnect(); if (B) { B.node.disconnect(); B.g.disconnect(); } } catch { /* */ } };
  return p;
}
