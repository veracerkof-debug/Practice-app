// Рабочий поток разбора записи моделями (src/audio/mir.js): ONNX Runtime Web и три модели живут здесь.
// Сообщения внутрь: { k: 'init', wasmPaths, base } → { k: 'ready' }; { k: 'run', x (моно 22 050 Гц), what: ['key', 'beats', 'chords'] }
// → { k: 'stage', stage } … { k: 'done', key, beats, chords } | { k: 'error', msg }. Прервать — terminate() снаружи.
// Модели грузятся по одной при первом обращении и остаются (ключ — 0,3 МБ, доли — 10 МБ, аккорды — 17 МБ).
import * as ort from 'onnxruntime-web';
import { cqt } from '../music/cqt.js';
import { detectTuning } from '../music/analyze.js';
import { KEYMAP, CHORD_LABELS, segmentsOf, segmentsFromLabels, viterbiLabels, beatsFromLogits } from './mirpost.js';

let base = '', sessions = {}, m_pc = true; // m_pc — модели аккордов компьютера доступны (нет файла — запасной путь)
const session = async (name) => (sessions[name] ??= await ort.InferenceSession.create(base + name + '.onnx', { executionProviders: ['wasm'], graphOptimizationLevel: 'all' }));
const stage = (s) => self.postMessage({ k: 'stage', stage: s });

// Тональность: S-KEY — весь сигнал одним прогоном (до 4 минут из середины), пик нормирован к 1
async function key(x) {
  const s = await session('skey'), MAX = 22050 * 240;
  let y = x;
  if (x.length > MAX) { const off = Math.floor((x.length - MAX) / 2); y = x.subarray(off, off + MAX); }
  let pk = 0; for (let i = 0; i < y.length; i++) { const a = Math.abs(y[i]); if (a > pk) pk = a; }
  const z = new Float32Array(y.length); if (pk > 0) for (let i = 0; i < y.length; i++) z[i] = y[i] / pk;
  const r = await s.run({ audio: new ort.Tensor('float32', z, [1, z.length]) }), p = r.probs.data;
  let best = 0, second = 0;
  for (let i = 1; i < 24; i++) if (p[i] > p[best]) best = i;
  for (let i = 0; i < 24; i++) if (i !== best && p[i] > p[second]) second = i;
  const km = KEYMAP[best];
  return { pc: km.pc, minor: km.minor, conf: Math.round(p[best] * 100) / 100, margin: Math.round((p[best] - p[second]) * 100) / 100 };
}
// Доли и сильные доли: мел-спектр (вспомогательный граф, 50 кадров/с, log1p(1000·mel)) → Beat This! кусками
// по 1500 кадров с запасом 6 с краёв (первый кусок — приоритет в перекрытии), логиты → пики
async function beats(x) {
  const mel = await session('mel_spectrogram'), m = await session('small0');
  const r = await mel.run({ audio_pcm: new ort.Tensor('float32', x, [1, x.length]) });
  const spec = r.mel_spectrogram.data, T = r.mel_spectrogram.dims[1], F = 128;
  const CH = 1500, B = 6, STEP = CH - 2 * B;
  const beat = new Float32Array(T).fill(-1000), down = new Float32Array(T).fill(-1000);
  const starts = [];
  if (T <= STEP) starts.push(-B);
  else { for (let s = -B; s + CH - B < T; s += STEP) starts.push(s); const last = T - (CH - B); if (starts[starts.length - 1] !== last) starts.push(last); }
  for (const s of starts) {
    const chunk = new Float32Array(CH * F);
    for (let t = 0; t < CH; t++) { const j = s + t; if (j >= 0 && j < T) chunk.set(spec.subarray(j * F, (j + 1) * F), t * F); }
    const o = await m.run({ spectrogram: new ort.Tensor('float32', chunk, [1, CH, F]) }), bl = o.beat.data, dl = o.downbeat.data;
    for (let t = B; t < CH - B; t++) { const j = s + t; if (j < 0 || j >= T) continue; if (beat[j] === -1000) { beat[j] = bl[t]; down[j] = dl[t]; } }
  }
  return beatsFromLogits(beat, down, 50);
}
// Аккорды на компьютере — ансамбль двух моделей ChordMini (MIT; дообучены псевдо-разметкой и дистилляцией знаний):
// BTC CL и ChordNet CL (2E1D), нормировка признаков вшита в ONNX. Признаки — лог-CQT как у librosa (у нашего cqt.js
// другая нормировка фильтров: поправка ½·ln2 на октаву и постоянная, сверено на записи — tests/mirpost.test.js), окна по
// 108 кадров с перекрытием в половину, вероятности обеих моделей и всех окон усредняются, затем Витерби — аккорд
// держится, пока смена не окупится. Сверено на последовательности C–G–Am–F–Dm7–E7: все шесть верно.
export const CHORD_PC = ['btc_cl', 'chordnet_cl'];
async function chordsPc(x) {
  const { mag, frames, nBins, hop, sr } = cqt(x), NL = CHORD_LABELS.length, W = 108, S = 54, G = 16;
  const feat = new Float32Array(mag.length);
  for (let t = 0; t < frames; t++) for (let k = 0; k < nBins; k++) feat[t * nBins + k] = Math.log(mag[t * nBins + k] + 1e-6) + 0.165 + ((nBins - k) * Math.LN2) / 48;
  const starts = []; for (let s = 0; s === 0 || s + W - S < frames; s += S) starts.push(s);
  const prob = new Float32Array(frames * NL), cnt = new Float32Array(frames);
  for (const name of CHORD_PC) {
    const sess = await session(name);
    for (let g0 = 0; g0 < starts.length; g0 += G) {
      const n = Math.min(G, starts.length - g0), inp = new Float32Array(n * W * nBins);
      for (let w = 0; w < n; w++) { const f0 = starts[g0 + w], m = Math.min(W, frames - f0); if (m > 0) inp.set(feat.subarray(f0 * nBins, (f0 + m) * nBins), w * W * nBins); }
      const L = (await sess.run({ features: new ort.Tensor('float32', inp, [n, W, nBins]) })).logits.data;
      for (let w = 0; w < n; w++) {
        const f0 = starts[g0 + w];
        for (let t = 0; t < W && f0 + t < frames; t++) {
          const o = (w * W + t) * NL; let mx = -Infinity; for (let k = 0; k < NL; k++) mx = Math.max(mx, L[o + k]);
          let z = 0; for (let k = 0; k < NL; k++) z += Math.exp(L[o + k] - mx);
          const d = (f0 + t) * NL; for (let k = 0; k < NL; k++) prob[d + k] += Math.exp(L[o + k] - mx) / z;
          cnt[f0 + t]++;
        }
      }
    }
  }
  const logp = new Float32Array(frames * NL);
  for (let t = 0; t < frames; t++) for (let k = 0; k < NL; k++) logp[t * NL + k] = Math.log(prob[t * NL + k] / Math.max(1, cnt[t]) + 1e-9);
  return segmentsFromLabels(viterbiLabels(logp, frames, NL, 4), hop / sr);
}
// Прежний путь (одна модель ChordMini 2E1D, 17 МБ): лог-CQT (144 бина, шаг 2048) → окна по 108 кадров группами по 16 →
// логиты → сглаживание 9 кадров → argmax. Остаётся запасным, если моделей компьютера нет
async function chords(x) {
  if (m_pc) { try { return await chordsPc(x); } catch (e) { m_pc = false; } }
  const s = await session('chordnet');
  const { mag, frames, nBins, hop, sr } = cqt(x);
  const feat = new Float32Array(mag.length);
  for (let i = 0; i < mag.length; i++) feat[i] = Math.log(mag[i] + 1e-6);
  const W = 108, G = 16, nw = Math.max(1, Math.ceil(frames / W)), NL = CHORD_LABELS.length, logits = new Float32Array(frames * NL);
  for (let g0 = 0; g0 < nw; g0 += G) {
    const inp = new Float32Array(G * W * nBins);
    for (let w = 0; w < G && g0 + w < nw; w++) { const f0 = (g0 + w) * W, n = Math.min(W, frames - f0); inp.set(feat.subarray(f0 * nBins, (f0 + n) * nBins), w * W * nBins); }
    const o = await s.run({ features: new ort.Tensor('float32', inp, [G, W, nBins]) }), L = o.logits.data;
    for (let w = 0; w < G && g0 + w < nw; w++) { const f0 = (g0 + w) * W, n = Math.min(W, frames - f0); logits.set(L.subarray(w * W * NL, (w * W + n) * NL), f0 * NL); }
  }
  return segmentsOf(logits, frames, NL, hop / sr);
}

self.onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.k === 'init') { ort.env.wasm.wasmPaths = m.wasmPaths; ort.env.wasm.numThreads = 1; base = m.base; self.postMessage({ k: 'ready' }); return; }
    if (m.k !== 'run') return;
    const out = {}, what = m.what || ['key', 'beats', 'chords'];
    if (what.includes('key')) { stage('key'); out.key = await key(m.x); try { out.key.cents = Math.round(detectTuning(m.x, 22050).cents); } catch { /* без строя */ } }
    if (what.includes('beats')) { stage('beats'); out.beats = await beats(m.x); }
    if (what.includes('chords')) { stage('chords'); out.chords = await chords(m.x); }
    self.postMessage({ k: 'done', ...out });
  } catch (err) { self.postMessage({ k: 'error', msg: String((err && err.message) || err) }); }
};
