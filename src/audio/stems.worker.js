// Рабочий поток разделения на дорожки: ONNX Runtime Web + demucs-web живут здесь, главный поток свободен.
// Сообщения внутрь: { k: 'init', wasmPaths, modelUrl, threads } → { k: 'ready' } | { k: 'error', msg };
//                   { k: 'run', left, right } → { k: 'progress', f } … { k: 'done', parts } | { k: 'error', msg };
//                   { k: 'cancel' } — прервать между сегментами (идущий сегмент досчитывается).
import * as ort from 'onnxruntime-web';
import { DemucsProcessor } from 'demucs-web';

let proc = null, cancelled = false;
self.onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.k === 'init') {
      if (proc) { self.postMessage({ k: 'ready' }); return; }
      ort.env.wasm.wasmPaths = m.wasmPaths;
      ort.env.wasm.numThreads = m.threads;
      const p = new DemucsProcessor({ ort, sessionOptions: { executionProviders: ['wasm'], graphOptimizationLevel: 'basic' }, onDownloadProgress: (done, total) => self.postMessage({ k: 'load', f: total ? done / total : 0 }) });
      await p.loadModel(m.modelUrl);
      proc = p;
      self.postMessage({ k: 'ready' });
    } else if (m.k === 'run') {
      if (!proc) throw new Error('not ready');
      cancelled = false;
      proc.onProgress = (x) => { if (cancelled) throw new Error('cancel'); self.postMessage({ k: 'progress', f: Math.min(1, x.progress || 0) }); };
      const res = await proc.separate(m.left, m.right);
      const parts = {}, buf = [];
      for (const k of ['vocals', 'drums', 'bass', 'other']) { parts[k] = { left: res[k].left, right: res[k].right }; buf.push(res[k].left.buffer, res[k].right.buffer); }
      self.postMessage({ k: 'done', parts }, buf);
    } else if (m.k === 'cancel') cancelled = true;
  } catch (err) { self.postMessage({ k: 'error', msg: String(err && err.message || err) }); }
};
