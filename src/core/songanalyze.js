// Темп и тональность по аудиофайлу: декодирование сразу в 22 050 Гц, смешение в моно, анализ в отдельном потоке.
// Всё на устройстве; файл никуда не отправляется и, если выбран только для анализа, не сохраняется.
import { analyze, SR } from '../music/analyze.js';

async function decode(blob) {
  const C = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  if (!C) throw Object.assign(new Error('decode'), { reason: 'unsupported' });
  const buf = await blob.arrayBuffer();
  let ab;
  try { ab = await new C(1, 1, SR).decodeAudioData(buf); }
  catch { throw Object.assign(new Error('decode'), { reason: 'format' }); }
  const n = ab.length, x = new Float32Array(n), ch = ab.numberOfChannels;
  for (let c = 0; c < ch; c++) { const d = ab.getChannelData(c); for (let i = 0; i < n; i++) x[i] += d[i] / ch; }
  return x;
}

const inWorker = (x) => new Promise((res, rej) => {
  const w = new Worker(new URL('./analyze.worker.js', import.meta.url), { type: 'module' });
  w.onmessage = (e) => { res(e.data); w.terminate(); };
  w.onerror = (e) => { rej(e); w.terminate(); };
  w.postMessage(x, [x.buffer]);
});

// → { tempo: { bpm, conf } | null, key: { pc, minor, conf } | null }
export async function analyzeAudio(blob) {
  const x = await decode(blob);
  if (typeof Worker !== 'undefined') { try { return await inWorker(x.slice()); } catch { /* без потока — на месте */ } }
  return analyze(x, SR);
}
