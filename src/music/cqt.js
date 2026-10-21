// Константно-добротное преобразование (CQT) по формулам librosa 0.11 (cqt: filter_scale 1, norm 1, окно Ханна,
// scale, дополнение нулями, без разрежения базиса) — признаки для модели аккордов (src/audio/mir.js: ChordMini
// обучена на librosa). Рекурсивно по октавам: верхняя октава считается на текущей частоте, затем сигнал
// прореживается вдвое (НЧ-фильтр Кайзера, 255 отводов) и так шесть раз; раннее прореживание — один раз.
// Чистые функции, без DOM; FFT — из analyze.js.
import { fft } from './analyze.js';

const C1 = 32.70319566257483;
const HANN_BW = 1.50018310546875; // ширина полосы окна Ханна (librosa.filters.window_bandwidth)
const TAPS = 255, BETA = 12, CUTOFF = 0.48;

// Модифицированная функция Бесселя I0 — для окна Кайзера
function i0(x) { let s = 1, t = 1; const h = x / 2; for (let k = 1; k < 50; k++) { t *= (h / k) * (h / k); s += t; if (t < s * 1e-12) break; } return s; }
// НЧ-фильтр для прореживания вдвое: sinc × Кайзер, сумма 1
function lowpass() {
  const h = new Float64Array(TAPS), M = (TAPS - 1) / 2, fc = CUTOFF / 2, d = i0(BETA);
  let sum = 0;
  for (let n = 0; n < TAPS; n++) {
    const k = n - M, s = k === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * k) / (Math.PI * k), r = k / M;
    h[n] = s * (i0(BETA * Math.sqrt(Math.max(0, 1 - r * r))) / d);
    sum += h[n];
  }
  for (let n = 0; n < TAPS; n++) h[n] /= sum;
  return h;
}
let LP = null;
// Прореживание вдвое с масштабом √2 (librosa resample scale=True); края — нули; длина — ceil(n/2)
export function halve(x) {
  LP ??= lowpass();
  const n = x.length, m = Math.ceil(n / 2), y = new Float32Array(m), D = (TAPS - 1) / 2, g = Math.SQRT2;
  for (let k = 0; k < m; k++) {
    const c = 2 * k; let s = 0;
    const j0 = Math.max(0, c - D), j1 = Math.min(n - 1, c + D);
    for (let j = j0; j <= j1; j++) s += x[j] * LP[j - c + D];
    y[k] = s * g;
  }
  return y;
}

// Отклик одной октавы: базис фильтров (FFT) × STFT сигнала (прямоугольное окно, центрирование нулями)
// freqs — частоты бинов октавы, sr — текущая частота, hop — шаг. → { re, im, frames } по [bin][frame]
function octave(x, sr, hop, freqs, Q) {
  const nb = freqs.length, lens = freqs.map((f) => (Q * sr) / f), nfft = 1 << Math.ceil(Math.log2(Math.max(...lens)));
  // базис: комплексная экспонента × Ханн, L1-норма, в центр окна nfft, × len/nfft, FFT
  const B = [];
  for (let b = 0; b < nb; b++) {
    const ilen = lens[b], a0 = Math.floor(-ilen / 2), a1 = Math.floor(ilen / 2), L = a1 - a0, re = new Float32Array(nfft), im = new Float32Array(nfft);
    const w = (i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / L), off = Math.floor((nfft - L) / 2);
    let l1 = 0;
    const fr = new Float64Array(L), fi = new Float64Array(L);
    for (let i = 0; i < L; i++) { const ph = (2 * Math.PI * freqs[b] * (a0 + i)) / sr, wi = w(i); fr[i] = Math.cos(ph) * wi; fi[i] = Math.sin(ph) * wi; l1 += Math.hypot(fr[i], fi[i]); }
    const g = ilen / nfft / l1;
    for (let i = 0; i < L; i++) { re[off + i] = fr[i] * g; im[off + i] = fi[i] * g; }
    fft(re, im);
    B.push({ re, im });
  }
  // STFT: кадры с нулями по nfft/2 с краёв
  const half = nfft >> 1, n = x.length, frames = 1 + Math.floor((n + 2 * half - nfft) / hop);
  const outR = Array.from({ length: nb }, () => new Float32Array(frames)), outI = Array.from({ length: nb }, () => new Float32Array(frames));
  const re = new Float32Array(nfft), im = new Float32Array(nfft), K = half + 1;
  for (let t = 0; t < frames; t++) {
    const s = t * hop - half;
    for (let i = 0; i < nfft; i++) { const j = s + i; re[i] = j >= 0 && j < n ? x[j] : 0; im[i] = 0; }
    fft(re, im);
    // базис · D: только k = 0…nfft/2 (как у librosa — односторонний спектр)
    for (let b = 0; b < nb; b++) {
      const br = B[b].re, bi = B[b].im;
      let sr2 = 0, si2 = 0;
      for (let k = 0; k < K; k++) { sr2 += br[k] * re[k] - bi[k] * im[k]; si2 += br[k] * im[k] + bi[k] * re[k]; }
      outR[b][t] = sr2; outI[b][t] = si2;
    }
  }
  return { re: outR, im: outI, frames };
}

// x — моно 22 050 Гц. → { mag: Float32Array[frames * nBins] (кадр за кадром, бины снизу вверх), frames, nBins, hop, sr }
export function cqt(x, { sr = 22050, hop = 2048, fmin = C1, nBins = 144, bpo = 24 } = {}) {
  const r = 2 ** (1 / bpo), alpha = (r * r - 1) / (r * r + 1), Q = 1 / alpha;
  const freqs = Array.from({ length: nBins }, (_, k) => fmin * 2 ** (k / bpo)), nOct = Math.ceil(nBins / bpo);
  // раннее прореживание (librosa __early_downsample_count)
  const cutoff = Math.max(...freqs.slice(-bpo)) * (1 + (0.5 * HANN_BW) / Q);
  const twos = Math.log2(hop & -hop);
  const early = Math.min(Math.max(0, Math.ceil(Math.log2((0.85 * (sr / 2)) / cutoff)) - 2), Math.max(0, twos - nOct + 1));
  let y = x, mySr = sr, myHop = hop;
  for (let i = 0; i < early; i++) { y = halve(y); mySr /= 2; myHop /= 2; }
  const resp = [];
  for (let o = 0; o < nOct; o++) {
    const hi = nBins - bpo * o, lo = Math.max(0, hi - bpo);
    resp.push({ lo, ...octave(y, mySr, myHop, freqs.slice(lo, hi), Q) });
    if (o < nOct - 1) { y = halve(y); mySr /= 2; myHop /= 2; }
  }
  const frames = Math.min(...resp.map((q) => q.frames)), mag = new Float32Array(frames * nBins);
  for (const q of resp) for (let b = 0; b < q.re.length; b++) {
    const bin = q.lo + b, scale = 1 / Math.sqrt((Q * sr) / freqs[bin]); // scale=True: /√длины фильтра на исходной частоте
    for (let t = 0; t < frames; t++) mag[t * nBins + bin] = Math.hypot(q.re[b][t], q.im[b][t]) * scale;
  }
  return { mag, frames, nBins, hop, sr };
}
