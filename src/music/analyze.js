// Темп и тональность по записи — на устройстве, без сети. Чистые функции над моно-сигналом (Float32Array).
// Темп: спектральный поток (где громкость в полосах резко растёт) → автокорреляция → самый сильный период
// в разумном диапазоне с предпочтением около 120 bpm. Тональность: хрома (энергия по 12 высотам) →
// корреляция с профилями Крумхансла–Кесслер для 24 тональностей. Результат приблизительный.

export const SR = 22050; // частота, на которой анализируем (запись приводится к ней при декодировании)

// Быстрое преобразование Фурье на месте (re, im — длина степени двойки)
export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang), h = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < h; k++) {
        const a = i + k, b = a + h, tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

// Амплитудные спектры кадров: каждый кадр — Float32Array(n/2)
function frames(x, n, hop, each) {
  const win = new Float32Array(n), re = new Float32Array(n), im = new Float32Array(n), mag = new Float32Array(n / 2);
  for (let i = 0; i < n; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
  for (let s = 0; s + n <= x.length; s += hop) {
    for (let i = 0; i < n; i++) { re[i] = x[s + i] * win[i]; im[i] = 0; }
    fft(re, im);
    for (let k = 0; k < n / 2; k++) mag[k] = Math.hypot(re[k], im[k]);
    each(mag);
  }
}

/* ---------- темп ---------- */

const T_N = 1024, T_HOP = 256;

// Огибающая начал звуков: положительный прирост логарифма спектра, без медленной составляющей
export function onsetEnvelope(x, sr = SR) {
  const top = Math.min(T_N / 2, Math.round((8000 * T_N) / sr)), env = [];
  let prev = null;
  frames(x, T_N, T_HOP, (mag) => {
    const cur = new Float32Array(top);
    let flux = 0;
    for (let k = 1; k < top; k++) {
      cur[k] = Math.log1p(100 * mag[k]);
      if (prev) { const d = cur[k] - prev[k]; if (d > 0) flux += d; }
    }
    prev = cur;
    env.push(flux);
  });
  const fps = sr / T_HOP, w = Math.max(1, Math.round(fps * 0.4)), out = new Float32Array(env.length);
  let acc = 0;
  for (let i = 0; i < env.length; i++) {
    acc += env[i] - (i - w * 2 - 1 >= 0 ? env[i - w * 2 - 1] : 0);
    const mean = acc / Math.min(i + 1, w * 2 + 1);
    out[i] = Math.max(0, env[i] - mean);
  }
  return { env: out, fps };
}

// bpm (с десятыми) и уверенность 0…1; null — ритма не слышно
export function detectTempo(x, sr = SR, { min = 60, max = 200 } = {}) {
  const { env, fps } = onsetEnvelope(x, sr);
  if (env.length < fps * 4) return null;
  const lo = Math.floor((fps * 60) / max), hi = Math.ceil((fps * 60) / min) + 1;
  const ac = new Float32Array(hi * 2 + 2);
  let zero = 0;
  for (let i = 0; i < env.length; i++) zero += env[i] * env[i];
  if (zero <= 0) return null;
  for (let L = 1; L < ac.length; L++) {
    let s = 0;
    for (let i = L; i < env.length; i++) s += env[i] * env[i - L];
    ac[L] = s / (env.length - L);
  }
  // Период: автокорреляция + её кратные (такт в 2 раза длиннее тоже совпадает), с весом около 120 bpm
  let best = 0, bestL = 0;
  for (let L = lo; L <= hi; L++) {
    const bpm = (fps * 60) / L, w = Math.exp(-0.5 * (Math.log2(bpm / 120) / 1.0) ** 2);
    const s = (ac[L] + 0.5 * (ac[2 * L] || 0)) * w;
    if (s > best) { best = s; bestL = L; }
  }
  if (!bestL) return null;
  // уточнение по параболе между соседними периодами
  const a = ac[bestL - 1], b = ac[bestL], c = ac[bestL + 1], den = a - 2 * b + c;
  const L = bestL + (den < 0 ? (0.5 * (a - c)) / den : 0);
  const conf = Math.max(0, Math.min(1, b / (zero / env.length)));
  return { bpm: Math.round(((fps * 60) / L) * 10) / 10, conf };
}

/* ---------- тональность ---------- */

const K_N = 4096, K_HOP = 2048;
// Профили Крумхансла–Кесслер (мажор, минор) от тоники
const MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MIN = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

// Энергия по 12 высотам (до = 0); кадры уравниваются по громкости
export function chroma(x, sr = SR) {
  const out = new Float64Array(12), pcs = new Int8Array(K_N / 2).fill(-1);
  for (let k = 1; k < K_N / 2; k++) {
    const f = (k * sr) / K_N;
    if (f >= 65 && f <= 2100) pcs[k] = (((Math.round(12 * Math.log2(f / 440)) + 69) % 12) + 12) % 12;
  }
  const c = new Float64Array(12);
  frames(x, K_N, K_HOP, (mag) => {
    c.fill(0);
    for (let k = 0; k < mag.length; k++) if (pcs[k] >= 0) c[pcs[k]] += mag[k];
    const m = Math.max(...c);
    if (m > 1e-6) for (let i = 0; i < 12; i++) out[i] += c[i] / m;
  });
  return out;
}

// Хрома живого звука по одному кадру анализатора (спектр в дБ, как getFloatFrequencyData). Берутся только вершины
// спектра, которые выше местного фона хотя бы на 6 дБ, и только близкие к нотам (не дальше 40 центов): так в хрому
// попадают звуки струн, а шум и гул — нет. { chroma — 12 сил (до = 0, сильнейшая — 1), level — громкость звуков 0…1 }
export function chromaOfSpectrum(db, sampleRate, { fmin = 70, fmax = 2200 } = {}) {
  const hz = sampleRate / (db.length * 2), c = new Float64Array(12);
  const k0 = Math.max(13, Math.floor(fmin / hz)), k1 = Math.min(db.length - 14, Math.ceil(fmax / hz));
  let top = -Infinity;
  for (let k = k0; k <= k1; k++) {
    const v = db[k];
    if (!(v > db[k - 1] && v >= db[k + 1])) continue;
    let bg = 0, n = 0;
    for (let j = k - 12; j <= k + 12; j += 2) if (Math.abs(j - k) > 2) { bg += db[j]; n++; }
    if (v - bg / n < 6) continue;
    const a = db[k - 1], b = db[k + 1], den = a - 2 * v + b, f = (k + (den < 0 ? (0.5 * (a - b)) / den : 0)) * hz;
    const midi = 69 + 12 * Math.log2(f / 440), near = Math.round(midi), dev = Math.abs(midi - near);
    if (dev > 0.4) continue;
    c[((near % 12) + 12) % 12] += Math.pow(10, v / 20) * (1 - dev / 0.5);
    if (v > top) top = v;
  }
  const m = Math.max(...c);
  return { chroma: Array.from(c, (x) => (m > 0 ? x / m : 0)), level: m > 0 ? Math.max(0, Math.min(1, (top + 80) / 60)) : 0 };
}

const pearson = (a, b) => {
  const n = a.length, ma = a.reduce((s, v) => s + v, 0) / n, mb = b.reduce((s, v) => s + v, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return da && db ? num / Math.sqrt(da * db) : 0;
};

// По хроме: { pc (тоника, до = 0), minor, conf — отрыв от следующей тональности }
export function keyFromChroma(ch) {
  const scores = [];
  for (let pc = 0; pc < 12; pc++) {
    const rot = (p) => Array.from({ length: 12 }, (_, i) => p[(i - pc + 12) % 12]);
    scores.push({ pc, minor: false, r: pearson(ch, rot(MAJ)) }, { pc, minor: true, r: pearson(ch, rot(MIN)) });
  }
  scores.sort((a, b) => b.r - a.r);
  if (!(scores[0].r > 0)) return null;
  return { pc: scores[0].pc, minor: scores[0].minor, conf: Math.max(0, Math.min(1, (scores[0].r - scores[1].r) * 5)) };
}

export const detectKey = (x, sr = SR) => keyFromChroma(chroma(x, sr));

// Кусок для анализа: до maxSec из середины записи (начало и конец часто без ритма)
export function middle(x, sr = SR, maxSec = 75) {
  const n = Math.floor(maxSec * sr);
  if (x.length <= n) return x;
  const s = Math.floor((x.length - n) / 2);
  return x.subarray(s, s + n);
}

export function analyze(x, sr = SR) {
  const m = middle(x, sr);
  return { tempo: detectTempo(m, sr), key: detectKey(m, sr) };
}
