// Рабочий поток разделения на дорожки: ONNX Runtime Web + свой движок (demucs.js) живут здесь, главный поток свободен.
// Сообщения внутрь: { k: 'init', wasmPaths, modelUrl, threads } → { k: 'ready', stems } | { k: 'error', msg };
//                   { k: 'run', left, right, hq } → { k: 'progress', f } … { k: 'done', parts, order } | { k: 'error', msg };
//                   { k: 'cancel' } — прервать между сегментами (идущий сегмент досчитывается).
// Модель задаётся при init; другая модель (4 или 6 дорожек) — новый рабочий поток.
import * as ort from 'onnxruntime-web';
import { createDemucs } from './demucs.js';

let dm = null, cancelled = false;
self.onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.k === 'init') {
      if (dm) { self.postMessage({ k: 'ready' }); return; }
      ort.env.wasm.wasmPaths = m.wasmPaths;
      ort.env.wasm.numThreads = m.threads;
      dm = await createDemucs(ort, m.modelUrl, { onDownloadProgress: (done, total) => self.postMessage({ k: 'load', f: total ? done / total : 0 }) });
      self.postMessage({ k: 'ready' });
    } else if (m.k === 'run') {
      if (!dm) throw new Error('not ready');
      cancelled = false;
      const res = await dm.separate(m.left, m.right, { hq: !!m.hq, onProgress: (f) => self.postMessage({ k: 'progress', f: Math.min(1, f) }), isCancelled: () => cancelled });
      const parts = {}, buf = [];
      for (const k of dm.parts) { parts[k] = { left: res[k].left, right: res[k].right }; buf.push(res[k].left.buffer, res[k].right.buffer); }
      self.postMessage({ k: 'done', parts, order: dm.parts }, buf);
    } else if (m.k === 'cancel') cancelled = true;
  } catch (err) { self.postMessage({ k: 'error', msg: String(err && err.message || err) }); }
};
