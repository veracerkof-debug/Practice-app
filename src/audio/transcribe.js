// Ноты со слуха: запись → ноты (MIDI) — модель Basic Pitch (Spotify, Apache-2.0) в TensorFlow.js, всё на устройстве.
// Модель (0,9 МБ) лежит в сборке (public/bp/), сеть не нужна. Считает в главном потоке по кускам в 2 с (между
// кусками интерфейс дышит), ход — долями; на телефоне — WebGL, без него — процессор, медленнее.
// Выход — события игры как у записей инструментов (src/music/midi.js: on/mv/off), сырые ноты и темп; ритм (сетка долей,
// длительности, паузы, такты) и файл .mid с темпом — в src/core/jobs.js через src/music/quantize.js.
import { writeMidi } from '../music/midi.js';
import { detectTempo } from '../music/analyze.js';

const SR = 22050;
let lib = null;
const load = () => lib || (lib = import('@spotify/basic-pitch'));
const modelUrl = () => new URL('bp/model.json', document.baseURI).href;
let model = null;

// Запись (Blob) → моно 22,05 кГц (вход модели)
async function decodeMono(blob) {
  const C = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext, oc = new C(1, SR, SR);
  const raw = await oc.decodeAudioData(await blob.arrayBuffer());
  const out = oc.createBuffer(1, raw.length, raw.sampleRate), d = out.getChannelData(0), n = raw.numberOfChannels;
  for (let ch = 0; ch < n; ch++) { const x = raw.getChannelData(ch); for (let i = 0; i < d.length; i++) d[i] += x[i] / n; }
  return out;
}

// Ноты модели → события игры: { t, k: 'on' | 'mv' | 'off', id, m, v }; bends — изгибы высоты (треть полутона на деление)
export function notesToEvents(notes, { bends = false } = {}) {
  const ev = [];
  notes.forEach((n, i) => {
    const id = 'n' + i, t0 = n.startTimeSeconds, d = Math.max(0.03, n.durationSeconds), v = Math.max(0.05, Math.min(1, n.amplitude || 0.7));
    ev.push({ t: t0, k: 'on', id, m: n.pitchMidi, v });
    if (bends && n.pitchBends && n.pitchBends.length > 1) {
      const L = n.pitchBends.length;
      n.pitchBends.forEach((b, j) => { if (j && b) ev.push({ t: t0 + (j * d) / L, k: 'mv', id, m: n.pitchMidi + b / 3 }); });
    }
    ev.push({ t: t0 + d, k: 'off', id });
  });
  return ev.sort((a, b) => a.t - b.t);
}

// Снять ноты: → { promise → { ev, mid (Uint8Array), notes, dur }, cancel() }
// opts: onStage(stage, frac) — 'load' | 'decode' | 'run'; sens — 'normal' | 'high' (чувствительность); bends; name — имя файла
export function transcribe(blob, { onStage = () => {}, sens = 'normal', bends = false, name = '' } = {}) {
  let cancelled = false;
  const promise = (async () => {
    onStage('load', 0);
    const bp = await load();
    if (!model) model = new bp.BasicPitch(modelUrl());
    if (cancelled) throw new Error('cancel');
    onStage('decode', 0);
    const buf = await decodeMono(blob);
    if (cancelled) throw new Error('cancel');
    onStage('run', 0);
    const frames = [], onsets = [], contours = [];
    await model.evaluateModel(buf, (f, o, c) => { frames.push(...f); onsets.push(...o); contours.push(...c); }, (p) => { if (cancelled) throw new Error('cancel'); onStage('run', p); });
    if (cancelled) throw new Error('cancel');
    const [onT, frT, minLen] = sens === 'high' ? [0.35, 0.25, 6] : [0.5, 0.3, 11];
    const notes = bp.noteFramesToTime(bp.addPitchBendsToNoteEvents(contours, bp.outputToNotesPoly(frames, onsets, onT, frT, minLen)));
    const ev = notesToEvents(notes, { bends });
    const dur = ev.length ? ev[ev.length - 1].t : buf.duration;
    // сырые ноты и темп записи — для ритма (src/music/quantize.js в jobs.js), когда разбора записи (rec.ana) нет
    const raw = notes.map((n) => ({ t: n.startTimeSeconds, d: n.durationSeconds, m: n.pitchMidi, v: Math.max(0.05, Math.min(1, n.amplitude || 0.7)) }));
    let tempo = null;
    try { tempo = detectTempo(buf.getChannelData(0), SR); } catch { /* без темпа — 120 */ }
    return { ev, mid: writeMidi(ev, { name }), notes: notes.length, dur, raw, tempo };
  })();
  return { promise, cancel() { cancelled = true; } };
}
