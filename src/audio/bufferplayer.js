// Запасной проигрыватель медиатеки без Signalsmith — на обычных узлах Web Audio (буферы кусками по 2 с и громкость
// на дорожку). Нужен там, где AudioWorklet движка молчит (самопроверка в stretchplayer.js не прошла или сторож
// тишины сработал): дорожки записи с громкостью каждой, перемотка, пауза — работают; скорость меняет и высоту
// (как у плёнки), сдвиг тональности недоступен (setPitch — пустой, lite: true — плеер показывает это).
// Интерфейс — как у stretchplayer.js: currentTime, duration, paused, playbackRate, play(), pause(), load(blob),
// loadParts(blobs, gains), setMix(gains), события loadedmetadata / play / pause / ended / error.
// Раскодированные дорожки держатся как Int16 (вдвое меньше float); в узлы уходят куски по 2 с с запасом 1,2 с.
import { isHeld } from './context.js';
const CHUNK_SEC = 2, AHEAD = 1.2, TICK_MS = 250;
const toI16 = (f) => { const o = new Int16Array(f.length); for (let i = 0; i < f.length; i++) { const v = f[i]; o[i] = v >= 1 ? 32767 : v <= -1 ? -32768 : (v * 32767) | 0; } return o; };

export async function createBufferPlayer(c, dest) {
  const p = new EventTarget();
  const fire = (k) => p.dispatchEvent(new Event(k));
  let parts = {}, gains = {}, nodes = {}, len = 0, gen = 0;
  let playing = false, pos = 0, rate = 1, ended = false; // pos — положение в отсчётах
  let baseT = 0, basePos = 0, nextChunk = 0, timer = 0, live = [];
  const CH = Math.round(c.sampleRate * CHUNK_SEC);
  const curSamples = () => (playing ? Math.min(len, basePos + (c.currentTime - baseT) * rate * c.sampleRate) : pos);
  const gainOf = (k) => (gains[k] == null ? 1 : gains[k]);

  function nodeFor(k) {
    if (!nodes[k]) { const g = c.createGain(); g.gain.value = gainOf(k); g.connect(dest); nodes[k] = g; }
    return nodes[k];
  }
  function stopLive() { for (const s of live) { try { s.stop(); } catch { /* */ } } live = []; }
  // куски вперёд: для каждого куска — по источнику на дорожку, старт по общему времени
  function schedule() {
    if (!playing) return;
    const horizon = c.currentTime + AHEAD;
    while (true) {
      const s0 = nextChunk * CH;
      if (s0 >= len) break;
      const at = baseT + (s0 - basePos) / (rate * c.sampleRate);
      if (at > horizon) break;
      const n = Math.min(CH, len - s0), names = Object.keys(parts);
      let first = true;
      for (const k of names) {
        const P = parts[k], buf = c.createBuffer(2, n, c.sampleRate), L = buf.getChannelData(0), R = buf.getChannelData(1);
        for (let i = 0; i < n; i++) { L[i] = P.L[s0 + i] / 32767; R[i] = P.R[s0 + i] / 32767; }
        const src = c.createBufferSource();
        src.buffer = buf; src.playbackRate.value = rate;
        src.connect(nodeFor(k));
        const startAt = Math.max(c.currentTime, at), skip = startAt > at ? (startAt - at) * rate : 0; // кусок, начавшийся «в прошлом», — с нужного места
        if (skip < n / c.sampleRate) src.start(startAt, skip);
        live.push(src);
        if (first && s0 + n >= len) { const my = gen; src.onended = () => { if (my !== gen || !playing) return; playing = false; pos = len; ended = true; clearInterval(timer); timer = 0; fire('ended'); fire('pause'); }; }
        first = false;
      }
      nextChunk++;
    }
    live = live.filter((s) => !s.__done);
  }
  function startFrom(samples) {
    stopLive();
    basePos = Math.max(0, Math.min(len, samples)); baseT = c.currentTime + 0.02;
    nextChunk = Math.floor(basePos / CH);
    schedule();
    if (!timer) timer = setInterval(schedule, TICK_MS);
  }
  async function decode(blob) {
    const buf = await c.decodeAudioData(await blob.arrayBuffer());
    const n = buf.numberOfChannels;
    return { L: toI16(buf.getChannelData(0)), R: toI16(buf.getChannelData(Math.min(1, n - 1))), len: buf.length };
  }
  function reset() { stopLive(); playing = false; pos = 0; ended = false; clearInterval(timer); timer = 0; }

  Object.defineProperties(p, {
    currentTime: { get: () => curSamples() / c.sampleRate, set(t) { const s = Math.max(0, Math.min(len, (+t || 0) * c.sampleRate)); ended = false; if (playing) startFrom(s); else pos = s; } },
    duration: { get: () => len / c.sampleRate },
    paused: { get: () => !playing },
    playbackRate: { get: () => rate, set(r) { r = Math.max(0.25, Math.min(4, +r || 1)); if (r === rate) return; const at = curSamples(); rate = r; if (playing) startFrom(at); } },
    ended: { get: () => ended },
    lite: { value: true },
  });
  p.load = async (blob) => {
    const my = ++gen; reset();
    let P;
    try { P = await decode(blob); } catch (e) { if (my === gen) fire('error'); throw e; }
    if (my !== gen) return 0;
    for (const k of Object.keys(nodes)) { try { nodes[k].disconnect(); } catch { /* */ } }
    nodes = {}; parts = { mix: P }; gains = {}; len = P.len;
    fire('loadedmetadata');
    return len / c.sampleRate;
  };
  p.loadParts = async (blobs, g = {}) => {
    const my = ++gen; reset();
    const next = {};
    let L = 0;
    for (const k of Object.keys(blobs)) {
      let P;
      try { P = await decode(blobs[k]); } catch (e) { if (my === gen) fire('error'); throw e; }
      if (my !== gen) return 0;
      next[k] = P; L = Math.max(L, P.len);
    }
    for (const k of Object.keys(next)) if (next[k].len < L) { const P = next[k], l = new Int16Array(L), r = new Int16Array(L); l.set(P.L); r.set(P.R); next[k] = { L: l, R: r, len: L }; }
    for (const k of Object.keys(nodes)) { try { nodes[k].disconnect(); } catch { /* */ } }
    nodes = {}; parts = next; gains = { ...g }; len = L;
    fire('loadedmetadata');
    return len / c.sampleRate;
  };
  // громкости дорожек — сразу, плавно за 20 мс
  p.setMix = (g) => { gains = { ...g }; for (const k of Object.keys(parts)) { const n = nodeFor(k); n.gain.setTargetAtTime(gainOf(k), c.currentTime, 0.02); } };
  p.setPitch = () => {}; // сдвиг высоты здесь невозможен
  p.play = async () => {
    if (playing) return;
    try { if (c.state !== 'running' && !isHeld()) await c.resume(); } catch { /* по жесту */ } // пауза из шторки держит контекст
    if (ended || pos >= len - 1) { pos = 0; ended = false; }
    playing = true;
    startFrom(pos);
    fire('play');
  };
  p.pause = () => { if (!playing) return; pos = curSamples(); playing = false; stopLive(); clearInterval(timer); timer = 0; fire('pause'); };
  p.dispose = () => { reset(); for (const k of Object.keys(nodes)) { try { nodes[k].disconnect(); } catch { /* */ } } nodes = {}; parts = {}; };
  return p;
}
