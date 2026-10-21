// Проигрыватель записей на движке Signalsmith Stretch (MIT, WebAssembly в AudioWorklet) в буферном режиме:
// запись раскодируется целиком и живёт внутри узла, узел сам её проигрывает — скорость (rate) без смены высоты и
// сдвиг высоты (полутоны, центы) считаются одним алгоритмом, без <audio>-элемента в цепочке. Элемент медиа на
// Android может звучать и напрямую, мимо Web Audio (сухой оригинал поверх сдвинутого), и тянет своё, худшее
// растяжение по скорости — поэтому звук из медиатеки идёт здесь; видео остаётся на элементе (кадры).
// Интерфейс как у медиа-элемента: currentTime, duration, paused, playbackRate, play(), pause(), события
// loadedmetadata / play / pause / ended / error — модуль медиатеки обращается к обоим одинаково.
let loading = null;
const lib = () => loading || (loading = import('signalsmith-stretch').then((m) => m.default));

export const stretchAvailable = () => typeof AudioWorkletNode !== 'undefined';

// c — AudioContext, dest — шина медиатеки. → проигрыватель (EventTarget)
export async function createStretchPlayer(c, dest) {
  const make = await lib();
  // Вход объявлен, но не подключён: с numberOfInputs: 0 узел падает на первом же кванте, пока не активен
  // (в коде обёртки inputs[c % inputs.length] при inputs === undefined), и дальше молчит навсегда
  const node = await make(c, { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
  node.connect(dest);
  const p = new EventTarget();
  let dur = 0, pos = 0, posAt = 0, playing = false, rate = 1, semi = 0, formant = false, gen = 0, lat = 0.12, ended = false;
  const now = () => performance.now();
  const lead = () => c.currentTime + lat; // изменения — с учётом задержки узла, иначе переход размазан
  const cur = () => (playing ? Math.min(dur, pos + ((now() - posAt) / 1000) * rate) : pos);
  const fire = (k) => p.dispatchEvent(new Event(k));
  const refreshLatency = async () => { try { const l = await node.latency(); if (typeof l === 'number' && l > 0) lat = l; } catch { /* */ } };
  // положение из узла — раз в 50 мс, пока играет; конец записи — «ended»
  node.setUpdateInterval(0.05, (t) => {
    if (!playing) return;
    pos = Math.max(0, t); posAt = now();
    if (dur && t >= dur - 0.03) { playing = false; pos = dur; ended = true; node.schedule({ active: false }); fire('ended'); fire('pause'); }
  });
  // outputTime — когда вступает (ключ обёртки; в README он назван output), output — поле отрезка
  const sched = (o) => { const t = lead(); return node.schedule({ output: t, outputTime: t, ...o }); };
  Object.defineProperties(p, {
    currentTime: { get: cur, set(t) { t = Math.max(0, Math.min(dur || 0, +t || 0)); pos = t; posAt = now(); ended = false; if (playing) sched({ input: t, active: true }); } },
    duration: { get: () => dur },
    paused: { get: () => !playing },
    playbackRate: { get: () => rate, set(r) { rate = Math.max(0.25, Math.min(4, +r || 1)); if (playing) { pos = cur(); posAt = now(); sched({ input: pos, rate }); } else sched({ rate }); } },
    ended: { get: () => ended },
  });
  // Запись (Blob) → в узел; старое вычищается. Вернёт длительность
  p.load = async (blob) => {
    const my = ++gen;
    parts = null; gains = {};
    playing = false; pos = 0; posAt = now(); ended = false;
    node.schedule({ active: false });
    await node.dropBuffers();
    let buf;
    try { buf = await c.decodeAudioData(await blob.arrayBuffer()); } catch (e) { if (my === gen) fire('error'); throw e; }
    if (my !== gen) return 0; // пока раскодировали, выбрали другую запись
    const chs = buf.numberOfChannels, L = buf.length, CH = Math.min(2, chs);
    // кусками по 30 с: буферы уходят в поток звука переносом, главный поток не держит копию
    const STEP = c.sampleRate * 30;
    for (let s = 0; s < L; s += STEP) {
      const n = Math.min(STEP, L - s), parts = [];
      for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(Math.min(ch, CH - 1)); parts.push(d.slice(s, s + n)); }
      await node.addBuffers(parts);
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
    node.schedule({ active: false });
    fire('pause');
  };
  // Сдвиг высоты: полутоны и центы; formant — сохранять форманты (для голоса)
  // Дорожки записи (stems) с громкостью каждой: parts — { имя: Blob }, gains — { имя: 0…1.5 }. Раскодированные дорожки
  // держатся в памяти как Int16 (в два раза меньше float), смесь считается по кускам в 30 с и уходит в узел переносом;
  // setMix — пересведение на месте: положение и ход сохраняются (пауза на доли секунды)
  let parts = null, gains = {}, mixTm = 0;
  const toI16 = (f) => { const o = new Int16Array(f.length); for (let i = 0; i < f.length; i++) { const v = f[i]; o[i] = v >= 1 ? 32767 : v <= -1 ? -32768 : (v * 32767) | 0; } return o; };
  async function pushMix(my) {
    const names = Object.keys(parts), len = parts[names[0]].len, STEP = c.sampleRate * 30;
    for (let s0 = 0; s0 < len; s0 += STEP) {
      const n = Math.min(STEP, len - s0), L = new Float32Array(n), R = new Float32Array(n);
      for (const k of names) {
        const g = (gains[k] == null ? 1 : gains[k]) / 32767, P = parts[k];
        if (!g) continue;
        for (let i = 0; i < n; i++) { L[i] += P.L[s0 + i] * g; R[i] += P.R[s0 + i] * g; }
      }
      await node.addBuffers([L, R]);
      if (my !== gen) return false;
    }
    return true;
  }
  p.loadParts = async (blobs, g = {}) => {
    const my = ++gen;
    playing = false; pos = 0; posAt = now(); ended = false;
    node.schedule({ active: false });
    await node.dropBuffers();
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
    if (!(await pushMix(my))) return 0;
    dur = len / c.sampleRate;
    await refreshLatency();
    fire('loadedmetadata');
    return dur;
  };
  p.setMix = (g) => {
    gains = { ...gains, ...g };
    if (!parts) return;
    clearTimeout(mixTm);
    mixTm = setTimeout(async () => {
      const my = ++gen, was = playing, at = cur();
      playing = false; node.schedule({ active: false });
      await node.dropBuffers();
      if (my !== gen || !parts) return;
      if (!(await pushMix(my))) return;
      pos = at; posAt = now();
      if (was) { playing = true; sched({ active: true, input: at, rate, semitones: semi, formantCompensation: formant }); }
    }, 150);
  };
  p.hasParts = () => !!parts;
  p.dropParts = () => { parts = null; gains = {}; };
  p.setPitch = (s = 0, cents = 0, f = false) => { semi = (+s || 0) + (+cents || 0) / 100; formant = !!f; sched({ semitones: semi, formantCompensation: formant }); };
  p.latency = () => lat;
  p.destroy = () => { gen++; try { node.schedule({ active: false }); node.disconnect(); } catch { /* */ } };
  return p;
}
