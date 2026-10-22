// Вокал и инструментал на телефоне — модель UVR MDX-Net (Main 406: Kim/Anjok, KUIELab MDX-Net, MIT; ~67 МБ ONNX).
// Модель видит спектр, STFT — снаружи (здесь; в Android — Mdx.java тем же алгоритмом): n_fft 7680, шаг 1024, Ханн
// (периодический), центрирование с отражением; вход [1,4,3072,256] — L re, L im, R re, R im; бины 0–2 обнуляются,
// выше 3072 — нули. Запись режется на куски по 1024·255 отсчётов с перекрытием 1/4 (окно Ханна — симметричное),
// края куска по n_fft/2 отбрасываются, куски склеиваются взвешенной суммой — как эталон audio-separator/UVR
// (сверено на одной записи: tests/mdx.test.js, эталон — scratchpad). Громкий вход приводится к пику 0,9 и обратно.
// Вокал = выход модели × компенсация модели (1,075); инструментал = запись − вокал: дорожки в сумме — ровно исходная
// запись, плеер звучит одинаково при любом положении ползунков. Чистые функции, без DOM: run(Float32Array) → Promise<Float32Array>.

export const MDX = { nfft: 7680, hop: 1024, dimF: 3072, dimT: 256, comp: 1.075, peak: 0.9, overlap: 0.25 };

/* ---------- БПФ любого размера (Блюстейн через степень двойки) ---------- */

function pow2fft(n) {
  const rev = new Uint32Array(n), bits = Math.log2(n);
  for (let i = 0; i < n; i++) { let r = 0, x = i; for (let b = 0; b < bits; b++) { r = (r << 1) | (x & 1); x >>= 1; } rev[i] = r; }
  const cos = new Float64Array(n / 2), sin = new Float64Array(n / 2);
  for (let k = 0; k < n / 2; k++) { cos[k] = Math.cos((2 * Math.PI * k) / n); sin[k] = -Math.sin((2 * Math.PI * k) / n); }
  // на месте; inv — обратное без деления
  return (re, im, inv) => {
    for (let i = 0; i < n; i++) { const j = rev[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1, step = n / size;
      for (let i = 0; i < n; i += size) {
        for (let j = 0, k = 0; j < half; j++, k += step) {
          const wr = cos[k], wi = inv ? -sin[k] : sin[k], a = i + j, b = a + half;
          const tr = re[b] * wr - im[b] * wi, ti = re[b] * wi + im[b] * wr;
          re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        }
      }
    }
  };
}
// Комплексное БПФ размера n (прямое; inv — обратное с делением на n), на месте
export function makeFFT(n) {
  let m = 1; while (m < 2 * n - 1) m <<= 1;
  const f = pow2fft(m), wr = new Float64Array(n), wi = new Float64Array(n);
  for (let k = 0; k < n; k++) { const a = (Math.PI * ((k * k) % (2 * n))) / n; wr[k] = Math.cos(a); wi[k] = -Math.sin(a); }
  const br = new Float64Array(m), bi = new Float64Array(m);
  br[0] = wr[0]; bi[0] = -wi[0];
  for (let k = 1; k < n; k++) { br[k] = br[m - k] = wr[k]; bi[k] = bi[m - k] = -wi[k]; }
  f(br, bi, false);
  const ar = new Float64Array(m), ai = new Float64Array(m);
  return (re, im, inv) => {
    const s = inv ? -1 : 1;
    ar.fill(0); ai.fill(0);
    for (let k = 0; k < n; k++) { const xr = re[k], xi = im[k] * s; ar[k] = xr * wr[k] - xi * wi[k]; ai[k] = xr * wi[k] + xi * wr[k]; }
    f(ar, ai, false);
    for (let k = 0; k < m; k++) { const r = ar[k] * br[k] - ai[k] * bi[k], i = ar[k] * bi[k] + ai[k] * br[k]; ar[k] = r; ai[k] = i; }
    f(ar, ai, true);
    const sc = inv ? 1 / (m * n) : 1 / m;
    for (let k = 0; k < n; k++) { const r = (ar[k] * wr[k] - ai[k] * wi[k]) * sc, i = (ar[k] * wi[k] + ai[k] * wr[k]) * sc; re[k] = r; im[k] = i * s; }
  };
}

/* ---------- спектр куска ---------- */

const hannPeriodic = (n) => { const w = new Float64Array(n); for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n); return w; };
const hannSym = (n) => { const w = new Float64Array(n); if (n === 1) { w[0] = 1; return w; } for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)); return w; };
const reflect = (i, len) => { if (len === 1) return 0; const p = 2 * (len - 1); i = ((i % p) + p) % p; return i < len ? i : p - i; };

export function createMdx(p = MDX) {
  const { nfft, hop, dimF, dimT } = p, bins = nfft / 2 + 1, chunk = hop * (dimT - 1), trim = nfft / 2;
  const fft = makeFFT(nfft), win = hannPeriodic(nfft);
  const re = new Float64Array(nfft), im = new Float64Array(nfft);
  // Кусок (два канала, длина chunk) → вход модели [4, dimF, dimT]
  function spec(L, R) {
    const out = new Float32Array(4 * dimF * dimT), plane = dimF * dimT;
    for (let f = 0; f < dimT; f++) {
      const st = f * hop - trim;
      for (let i = 0; i < nfft; i++) { const j = reflect(st + i, chunk); re[i] = L[j] * win[i]; im[i] = R[j] * win[i]; } // L + iR одним преобразованием
      fft(re, im, false);
      for (let b = 3; b < dimF; b++) { // бины 0–2 — нули (как у модели при обучении)
        const nb = (nfft - b) % nfft, zr = re[b], zi = im[b], cr = re[nb], ci = -im[nb];
        const o = b * dimT + f;
        out[o] = (zr + cr) / 2; out[plane + o] = (zi + ci) / 2; // L = (Z + conj Z[-k]) / 2
        out[2 * plane + o] = (zi - ci) / 2; out[3 * plane + o] = -(zr - cr) / 2; // R = (Z − conj Z[-k]) / 2i
      }
    }
    return out;
  }
  // Выход модели [4, dimF, dimT] → кусок волны (два канала, длина chunk); обратное STFT с центрированием
  const acc = [new Float64Array(chunk + nfft), new Float64Array(chunk + nfft)], env = new Float64Array(chunk + nfft);
  function wave(y) {
    const plane = dimF * dimT;
    acc[0].fill(0); acc[1].fill(0); env.fill(0);
    for (let f = 0; f < dimT; f++) {
      re.fill(0); im.fill(0);
      // Z = L + iR: полный спектр из половинок, бины ≥ dimF (до Найквиста) — нули
      for (let b = 0; b < dimF; b++) {
        const o = b * dimT + f, lr = y[o], li = b ? y[plane + o] : 0, rr = y[2 * plane + o], ri = b ? y[3 * plane + o] : 0; // мнимая часть постоянной составляющей отбрасывается (как irfft)
        re[b] += lr - ri; im[b] += li + rr;
        if (b > 0 && b < bins - 1) { const nb = nfft - b; re[nb] += lr + ri; im[nb] += -li + rr; }
      }
      fft(re, im, true);
      const st = f * hop;
      for (let i = 0; i < nfft; i++) { const w = win[i]; acc[0][st + i] += re[i] * w; acc[1][st + i] += im[i] * w; env[st + i] += w * w; }
    }
    const L = new Float32Array(chunk), R = new Float32Array(chunk);
    for (let n = 0; n < chunk; n++) { const e = env[n + trim]; L[n] = e > 1e-11 ? acc[0][n + trim] / e : 0; R[n] = e > 1e-11 ? acc[1][n + trim] / e : 0; }
    return [L, R];
  }

  // Разделить запись: left, right (Float32Array, 44,1 кГц) → { vocals, inst }; run(вход) → выход модели
  // hq — «улучшенное»: модель на спектре и на минус-спектре, среднее (как denoise у UVR), время ×2
  async function separate(left, right, run, { onProgress = () => {}, isCancelled = () => false, overlap = p.overlap, hq = false } = {}) {
    const len = left.length;
    let peak = 0;
    for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
    const g = peak > p.peak ? p.peak / peak : 1;
    const gen = chunk - 2 * trim, pad = gen + trim - (len % gen), total = trim + len + pad;
    const mL = new Float32Array(total), mR = new Float32Array(total);
    for (let i = 0; i < len; i++) { mL[trim + i] = left[i] * g; mR[trim + i] = right[i] * g; }
    const step = Math.floor((1 - overlap) * chunk);
    const resL = new Float32Array(total), resR = new Float32Array(total), div = new Float32Array(total);
    const cL = new Float32Array(chunk), cR = new Float32Array(chunk);
    const n = Math.ceil(total / step);
    for (let i = 0, k = 0; i < total; i += step, k++) {
      if (isCancelled()) throw new Error('cancel');
      const end = Math.min(i + chunk, total), act = end - i;
      cL.fill(0); cR.fill(0); cL.set(mL.subarray(i, end)); cR.set(mR.subarray(i, end));
      const sp = spec(cL, cR);
      let out = await run(sp);
      if (hq) { if (isCancelled()) throw new Error('cancel'); const neg = sp.map((v) => -v), o2 = await run(neg), avg = new Float32Array(out.length); for (let j = 0; j < avg.length; j++) avg[j] = 0.5 * out[j] - 0.5 * o2[j]; out = avg; }
      const [oL, oR] = wave(out), w = overlap ? hannSym(act) : null;
      for (let j = 0; j < act; j++) { const ww = w ? w[j] : 1; resL[i + j] += oL[j] * ww; resR[i + j] += oR[j] * ww; div[i + j] += ww; }
      onProgress((k + 1) / n);
    }
    const vL = new Float32Array(len), vR = new Float32Array(len), iL = new Float32Array(len), iR = new Float32Array(len);
    const k = p.comp / g;
    for (let j = 0; j < len; j++) {
      const d = div[trim + j];
      const a = d ? (resL[trim + j] / d) * k : 0, b = d ? (resR[trim + j] / d) * k : 0;
      vL[j] = a; vR[j] = b; iL[j] = left[j] - a; iR[j] = right[j] - b;
    }
    return { vocals: { left: vL, right: vR }, inst: { left: iL, right: iR } };
  }
  return { spec, wave, separate, chunk, trim };
}
