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
  p.setPitch = (s = 0, cents = 0, f = false) => { semi = (+s || 0) + (+cents || 0) / 100; formant = !!f; sched({ semitones: semi, formantCompensation: formant }); };
  p.latency = () => lat;
  p.destroy = () => { gen++; try { node.schedule({ active: false }); node.disconnect(); } catch { /* */ } };
  return p;
}
