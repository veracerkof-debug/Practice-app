// Рабочий поток разделения на дорожки: ONNX Runtime Web + свой движок (demucs.js) живут здесь, главный поток свободен.
// Сообщения внутрь: { k: 'init', wasmPaths, modelUrl, threads } → { k: 'ready', stems } | { k: 'error', msg };
//                   { k: 'run', left, right, hq } → { k: 'progress', f } … { k: 'done', parts, order } | { k: 'error', msg };
//                   { k: 'cancel' } — прервать между сегментами (идущий сегмент досчитывается).
// Модель задаётся при init; другая модель (вокал MDX-Net, 4 или 6 дорожек HTDemucs) — новый рабочий поток.
import * as ort from 'onnxruntime-web';
import { createDemucs } from './demucs.js';
import { createMdx, MDX } from './mdx.js';

// Вокал и инструментал (UVR MDX-Net, mdx.js) — с тем же контрактом, что у demucs.js: parts и separate
async function createMdxEngine(url, onDownloadProgress) {
  const r = await fetch(url), total = +r.headers.get('content-length') || 0, rd = r.body.getReader(), parts = [];
  let got = 0;
  for (;;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); got += value.length; onDownloadProgress(got, total); }
  const buf = new Uint8Array(got); let o = 0; for (const p of parts) { buf.set(p, o); o += p.length; }
  const sess = await ort.InferenceSession.create(buf, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
  const M = createMdx(), name = sess.inputNames[0];
  const run = async (x) => (await sess.run({ [name]: new ort.Tensor('float32', x, [1, 4, MDX.dimF, MDX.dimT]) }))[sess.outputNames[0]].data;
  return { parts: ['vocals', 'inst'], separate: (L, R, o2) => M.separate(L, R, run, o2) };
}

let dm = null, cancelled = false;
self.onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.k === 'init') {
      if (dm) { self.postMessage({ k: 'ready' }); return; }
      ort.env.wasm.wasmPaths = m.wasmPaths;
      ort.env.wasm.numThreads = m.threads;
      const onDownloadProgress = (done, total) => self.postMessage({ k: 'load', f: total ? done / total : 0 });
      dm = /\/mdx\//.test(m.modelUrl) ? await createMdxEngine(m.modelUrl, onDownloadProgress) : await createDemucs(ort, m.modelUrl, { onDownloadProgress });
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
