// Проигрыватель записей на движке Signalsmith Stretch (MIT, WebAssembly в AudioWorklet) в буферном режиме:
// запись раскодируется целиком и живёт внутри узла, узел сам её проигрывает — скорость (rate) без смены высоты и
// сдвиг высоты (полутоны, центы) считаются одним алгоритмом, без <audio>-элемента в цепочке. Элемент медиа на
// Android может звучать и напрямую, мимо Web Audio (сухой оригинал поверх сдвинутого), и тянет своё, худшее
// растяжение по скорости — поэтому звук из медиатеки идёт здесь; видео остаётся на элементе (кадры).
// Интерфейс как у медиа-элемента: currentTime, duration, paused, playbackRate, play(), pause(), события
// loadedmetadata / play / pause / ended / error — модуль медиатеки обращается к обоим одинаково.
// Дорожки записи (вокал, ударные, бас…) живут внутри узла как Int16, смесь с громкостями считает сам узел на каждом
// кванте (правка 5 в копии библиотеки) — смена громкости дорожки мгновенна, без пересведения и без разрыва звука.
import { isHeld } from './context.js';
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
  const A = await mk(); // единственный узел: дорожки и их громкости — внутри него
  // задержка узла — только разумная (секунды, не отсчёты и не NaN): иначе отрезок включился бы через часы
  const refreshLatency = async () => { try { const l = await A.node.latency(); if (typeof l === 'number' && l > 0 && l < 2) { A.lat = l; lat = l; } } catch { /* */ } };
  // ошибка внутри процессора — наружу событием (процессор после неё молчит навсегда)
  A.node.onprocessorerror = (e) => p.dispatchEvent(Object.assign(new Event('procerror'), { detail: (e && e.message) || 'processorerror' }));
  // outputTime — когда вступает (ключ обёртки; в README он назван output), output — поле отрезка
  const sched = (o) => { const t = lead(); return A.node.schedule({ output: t, outputTime: t, ...o }); };
  const stopAll = () => { A.node.schedule({ active: false }); };
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
  // Запись (Blob) → в узел целиком (Int16 L/R, переносом): одна «дорожка» с громкостью 1; старое вычищается
  const toI16 = (f) => { const o = new Int16Array(f.length); for (let i = 0; i < f.length; i++) { const v = f[i]; o[i] = v >= 1 ? 32767 : v <= -1 ? -32768 : (v * 32767) | 0; } return o; };
  const yieldUI = () => new Promise((r) => setTimeout(r, 0));
  async function decodeI16(blob) {
    const buf = await c.decodeAudioData(await blob.arrayBuffer());
    const CH = Math.min(2, buf.numberOfChannels), L = toI16(buf.getChannelData(0));
    await yieldUI();
    const R = CH > 1 ? toI16(buf.getChannelData(1)) : L.slice();
    return { L, R, len: buf.length };
  }
  async function reset() {
    parts = null; gains = {}; names = [];
    playing = false; pos = 0; posAt = now(); ended = false;
    stopAll();
    await A.node.dropBuffers();
  }
  p.load = async (blob) => {
    const my = ++gen;
    await reset();
    let P;
    try { P = await decodeI16(blob); } catch (e) { if (my === gen) fire('error'); throw e; }
    if (my !== gen) return 0; // пока раскодировали, выбрали другую запись
    dur = await A.node.setParts([P], [1], [P.L.buffer, P.R.buffer]);
    await refreshLatency();
    fire('loadedmetadata');
    return dur;
  };
  p.play = async () => {
    if (playing) return;
    try { if (c.state !== 'running' && !isHeld()) await c.resume(); } catch { /* по жесту */ } // пауза из шторки держит контекст
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
  // Дорожки записи (stems) с громкостью каждой: parts — { имя: Blob }, gains — { имя: 0…1.5 }. Дорожки раскодируются,
  // переводятся в Int16 (вдвое меньше float) и уходят в узел переносом; смесь считает сам узел на каждом кванте
  // (правка 5 в vendor/signalsmith-stretch.mjs) — setMix действует мгновенно, без пересведения и без разрыва звука
  let parts = null, gains = {}, names = [];
  p.loadParts = async (blobs, g = {}) => {
    const my = ++gen;
    await reset();
    const next = {};
    let len = 0;
    for (const k of Object.keys(blobs)) {
      let P;
      try { P = await decodeI16(blobs[k]); } catch (e) { if (my === gen) fire('error'); throw e; }
      if (my !== gen) return 0;
      next[k] = P; len = Math.max(len, P.len);
    }
    for (const k of Object.keys(next)) if (next[k].len < len) { // выровнять длины
      const P = next[k], L = new Int16Array(len), R = new Int16Array(len); L.set(P.L); R.set(P.R); next[k] = { L, R, len };
    }
    names = Object.keys(next); gains = { ...g }; parts = true;
    const list = names.map((k) => next[k]), tr = [];
    list.forEach((P) => { tr.push(P.L.buffer); if (P.R.buffer !== P.L.buffer) tr.push(P.R.buffer); });
    dur = await A.node.setParts(list, names.map((k) => (gains[k] == null ? 1 : gains[k])), tr);
    if (my !== gen) return 0;
    await refreshLatency();
    fire('loadedmetadata');
    return dur;
  };
  p.setMix = (g) => {
    gains = { ...gains, ...g };
    if (!parts) return;
    A.node.setGains(names.map((k) => (gains[k] == null ? 1 : gains[k])));
  };
  p.hasParts = () => !!parts;
  p.dropParts = () => { parts = null; gains = {}; names = []; };
  p.setPitch = (s = 0, cents = 0, f = false) => { semi = (+s || 0) + (+cents || 0) / 100; formant = !!f; sched({ semitones: semi, formantCompensation: formant }); };
  p.latency = () => lat;
  p.destroy = () => { gen++; try { stopAll(); A.node.disconnect(); A.g.disconnect(); } catch { /* */ } };
  return p;
}
