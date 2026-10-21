// Разделение на дорожки в WebAssembly (ONNX Runtime Web) — свой движок вместо demucs-web: те же шаги, что
// в Demucs.java на Android, для любого числа дорожек и двух раскладок спектра. Модели «STFT снаружи»:
// • 4 дорожки (timcsy/demucs-web-onnx): входы волна [1,2,N] и спектр [1,4,2048,336] (L re, L im, R re, R im);
// • 6 дорожек (Andremi/audioweb-models): волна [1,2,N] и спектр [1,2,2048,336,2] (канал, бин, кадр, re/im).
// Раскладка — по форме второго входа, число дорожек — по форме выхода. Сегменты по 7,8 с с перекрытием 1/4,
// спектрограмма (Ханн 4096, шаг 1024, отражённые поля), выходы — волна и комплексная маска → обратное STFT,
// сумма ветвей, склейка окном. Без DOM — работает в рабочем потоке (stems.worker.js).

export const SR = 44100, N = 343980, FFT = 4096, HOP = 1024, BINS = 2048, FRAMES = 336, STRIDE = Math.floor(N * 0.75);
export const PARTS4 = ['drums', 'bass', 'other', 'vocals'], PARTS6 = ['drums', 'bass', 'other', 'vocals', 'guitar', 'piano'];
export const partsOf = (n) => (n === 6 ? PARTS6 : PARTS4);

/* ---------- БПФ (основание 2, 4096), окно Ханна, STFT и обратное — как в Demucs.java ---------- */
const HANN = new Float32Array(FFT), TW_R = new Float32Array(FFT / 2), TW_I = new Float32Array(FFT / 2), REV = new Int32Array(FFT);
for (let i = 0; i < FFT; i++) HANN[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / FFT));
for (let k = 0; k < FFT / 2; k++) { const a = (-2 * Math.PI * k) / FFT; TW_R[k] = Math.cos(a); TW_I[k] = Math.sin(a); }
for (let i = 0; i < FFT; i++) { let r = 0, n = i; for (let b = 0; b < 12; b++) { r = (r << 1) | (n & 1); n >>= 1; } REV[i] = r; }
// на месте; inverse — обратное (делит на n)
function fft(re, im, inverse) {
  for (let i = 0; i < FFT; i++) { const j = REV[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
  for (let size = 2; size <= FFT; size <<= 1) {
    const half = size >> 1, step = FFT / size;
    for (let i = 0; i < FFT; i += size) for (let j = 0; j < half; j++) {
      const k = j * step, tr = TW_R[k], ti = inverse ? -TW_I[k] : TW_I[k], a = i + j, b = a + half;
      const or = re[b] * tr - im[b] * ti, oi = re[b] * ti + im[b] * tr;
      re[b] = re[a] - or; im[b] = im[a] - oi; re[a] += or; im[a] += oi;
    }
  }
  if (inverse) for (let i = 0; i < FFT; i++) { re[i] /= FFT; im[i] /= FFT; }
}
function reflectPad(s, left, right) {
  const len = s.length, o = new Float32Array(left + len + right);
  for (let i = 0; i < left; i++) o[i] = s[Math.min(left - i, len - 1)];
  o.set(s, left);
  for (let i = 0; i < right; i++) o[left + len + i] = s[Math.max(0, len - 2 - i)];
  return o;
}
const RE = new Float32Array(FFT), IM = new Float32Array(FFT);
// STFT: кадры по HOP, масштаб 1/√FFT → { real, imag, numFrames, numBins } (кадр × бин)
function stft(x) {
  const frames = Math.floor((x.length - FFT) / HOP) + 1, nb = FFT / 2 + 1, real = new Float32Array(frames * nb), imag = new Float32Array(frames * nb), sc = 1 / Math.sqrt(FFT);
  for (let f = 0; f < frames; f++) {
    const st = f * HOP;
    for (let i = 0; i < FFT; i++) { RE[i] = x[st + i] * HANN[i]; IM[i] = 0; }
    fft(RE, IM, false);
    const o = f * nb;
    for (let k = 0; k < nb; k++) { real[o + k] = RE[k] * sc; imag[o + k] = IM[k] * sc; }
  }
  return { real, imag, numFrames: frames, numBins: nb };
}
// Обратное STFT (кадр × бин, эрмитово дополнение), окно и нормировка суммой квадратов окна
function istft(real, imag, frames, nb, len) {
  const out = new Float32Array(len), wsum = new Float32Array(len), sc = Math.sqrt(FFT);
  for (let f = 0; f < frames; f++) {
    RE.fill(0); IM.fill(0);
    const o = f * nb;
    for (let k = 0; k < nb; k++) { RE[k] = real[o + k]; IM[k] = imag[o + k]; }
    for (let k = 1; k < nb - 1; k++) { RE[FFT - k] = RE[k]; IM[FFT - k] = -IM[k]; }
    fft(RE, IM, true);
    const st = f * HOP;
    for (let i = 0; i < FFT && st + i < len; i++) { out[st + i] += RE[i] * HANN[i] * sc; wsum[st + i] += HANN[i] * HANN[i]; }
  }
  for (let i = 0; i < len; i++) if (wsum[i] > 1e-8) out[i] /= wsum[i];
  return out;
}

// Спектр канала: поля 1536/1620, центрирование 2048, кадры 2…337, бины 0…2047 → в spec по смещениям re/im и шагу
function spectrum(ch, spec, reOff, imOff, stride) {
  const le = Math.ceil(N / HOP), pad = Math.floor(HOP / 2) * 3, padRight = pad + le * HOP - N;
  const x = reflectPad(reflectPad(ch, pad, padRight), FFT / 2, FFT / 2), S = stft(x);
  for (let f = 0; f < FRAMES; f++) {
    const src = (f + 2) * S.numBins;
    for (let b = 0; b < BINS; b++) { const k = (b * FRAMES + f) * stride; spec[reOff + k] = S.real[src + b]; spec[imOff + k] = S.imag[src + b]; }
  }
}
// Обратное STFT маски одного канала (bins×frames, кадры сдвинуты на 2) → N отсчётов, прибавляются к out
const SCR = { real: new Float32Array((FRAMES + 4) * (BINS + 1)), imag: new Float32Array((FRAMES + 4) * (BINS + 1)) };
function ispec(freq, reOff, imOff, out) {
  const frames = FRAMES + 4, pb = BINS + 1, re = SCR.real, im = SCR.imag;
  re.fill(0); im.fill(0);
  for (let f = 0; f < FRAMES; f++) { const dst = (f + 2) * pb; for (let b = 0; b < BINS; b++) { const k = b * FRAMES + f; re[dst + b] = freq[reOff + k]; im[dst + b] = freq[imOff + k]; } }
  const y = istft(re, im, frames, pb, (frames - 1) * HOP + FFT), off = FFT / 2 + Math.floor(HOP / 2) * 3;
  for (let i = 0; i < N; i++) out[i] += y[off + i];
}

// ort — модуль onnxruntime-web; modelUrl — файл модели. → { stems, parts, separate(L, R, { onProgress, isCancelled }) }
export async function createDemucs(ort, modelUrl, { sessionOptions = {}, onDownloadProgress = () => {} } = {}) {
  const r = await fetch(modelUrl);
  if (!r.ok) throw new Error('model ' + r.status);
  const total = +r.headers.get('Content-Length') || 0, chunks = [];
  let got = 0;
  if (r.body) { const rd = r.body.getReader(); for (;;) { const { done, value } = await rd.read(); if (done) break; chunks.push(value); got += value.length; onDownloadProgress(got, total); } }
  const buf = new Uint8Array(got); let o = 0; for (const c of chunks) { buf.set(c, o); o += c.length; }
  const session = await ort.InferenceSession.create(buf.buffer, { executionProviders: ['wasm'], graphOptimizationLevel: 'basic', ...sessionOptions });
  const meta = session.inputMetadata || null;
  // имена и раскладка: вход с формой длины 3 — волна, другой — спектр (длина 5 — чередование re/im)
  let waveName = session.inputNames[0], specName = session.inputNames[1], interleaved = false;
  if (meta) for (const m of Array.isArray(meta) ? meta : Object.values(meta)) { const d = m.shape || m.dimensions || []; if (d.length === 3) waveName = m.name; else if (d.length >= 4) { specName = m.name; interleaved = d.length === 5; } }
  const api = {
    stems: 0, parts: null, interleaved,
    async separate(L, R, { onProgress = () => {}, isCancelled = () => false } = {}) {
      const total = L.length, segs = total <= N ? 1 : Math.ceil((total - N) / STRIDE) + 1;
      const wave = new Float32Array(2 * N), spec = new Float32Array(4 * BINS * FRAMES), seg = new Float32Array(N), wt = new Float32Array(total);
      let outs = null, idx = 0;
      const half = STRIDE * 0.5, win = (i, len) => Math.min(Math.min(i / half, (len - i) / half), 1);
      for (let start = 0; start < total; start += STRIDE, idx++) {
        if (isCancelled()) throw new Error('cancel');
        const len = Math.min(N, total - start);
        wave.fill(0); wave.set(L.subarray(start, start + len), 0); wave.set(R.subarray(start, start + len), N);
        const left = wave.subarray(0, N), right = wave.subarray(N, 2 * N);
        if (interleaved) { spectrum(left, spec, 0, 1, 2); spectrum(right, spec, 2 * BINS * FRAMES, 2 * BINS * FRAMES + 1, 2); }
        else { spectrum(left, spec, 0, BINS * FRAMES, 1); spectrum(right, spec, 2 * BINS * FRAMES, 3 * BINS * FRAMES, 1); }
        const feeds = {};
        feeds[waveName] = new ort.Tensor('float32', wave, [1, 2, N]);
        feeds[specName] = new ort.Tensor('float32', spec, interleaved ? [1, 2, BINS, FRAMES, 2] : [1, 4, BINS, FRAMES]);
        const res = await session.run(feeds);
        let time = null, freq = null, stems = 0;
        for (const k of Object.keys(res)) { const t = res[k]; if (t.dims.length === 4 && t.dims[2] === 2) { time = t.data; stems = t.dims[1]; } else if (t.dims.length === 5 && t.dims[2] === 4) freq = t.data; }
        if (!time) throw new Error('no time output');
        if (!outs) { api.stems = stems; api.parts = partsOf(stems); outs = api.parts.map(() => [new Float32Array(total), new Float32Array(total)]); }
        for (let i = 0; i < len; i++) wt[start + i] += win(i, len);
        const trackStride = 4 * BINS * FRAMES;
        for (let k = 0; k < stems; k++) for (let ch = 0; ch < 2; ch++) {
          seg.set(time.subarray((k * 2 + ch) * N, (k * 2 + ch + 1) * N));
          if (freq) ispec(freq, k * trackStride + (ch * 2) * BINS * FRAMES, k * trackStride + (ch * 2 + 1) * BINS * FRAMES, seg);
          const o = outs[k][ch];
          for (let i = 0; i < len; i++) o[start + i] += seg[i] * win(i, len);
        }
        onProgress((idx + 1) / segs);
      }
      for (const [l, r2] of outs) for (let i = 0; i < total; i++) { const w = wt[i] > 0 ? wt[i] : 1; l[i] /= w; r2[i] /= w; }
      const result = {};
      api.parts.forEach((p, k) => { result[p] = { left: outs[k][0], right: outs[k][1] }; });
      return result;
    },
  };
  return api;
}
