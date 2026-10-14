// Обработка записи диктофона (src/modules/voice): обрезка, усиление и нормализация, срез низа, шумоподавление
// (спектральный гейт по профилю шума), гейт, компрессия, лёгкая реверберация, WAV. Чистые функции над Float32Array —
// без DOM и без AudioContext (тесты — tests/voicefx.test.js). Всё на устройстве.
import { fft } from '../music/analyze.js';

const dbToLin = (db) => Math.pow(10, db / 20);
export const linToDb = (x) => (x > 1e-9 ? 20 * Math.log10(x) : -180);

// Обрезка [a, b) в секундах
export function trim(ch, sr, a, b) {
  const s = Math.max(0, Math.floor(a * sr)), e = Math.min(ch[0].length, Math.ceil(b * sr));
  return ch.map((x) => x.slice(s, Math.max(s, e)));
}

export const peakOf = (ch) => ch.reduce((m, x) => { for (let i = 0; i < x.length; i++) { const v = Math.abs(x[i]); if (v > m) m = v; } return m; }, 0);

// Усиление в дБ (на месте)
export function gain(ch, db) {
  const k = dbToLin(db);
  if (k !== 1) ch.forEach((x) => { for (let i = 0; i < x.length; i++) x[i] *= k; });
  return ch;
}
// Нормализация пика к target дБ (−1 по умолчанию)
export function normalize(ch, target = -1) {
  const p = peakOf(ch);
  return p > 1e-6 ? gain(ch, target - linToDb(p)) : ch;
}

// Срез низа: фильтр высоких частот 2-го порядка (Баттерворт), f — частота среза
export function highpass(ch, sr, f = 80) {
  const w = Math.tan((Math.PI * f) / sr), q = Math.SQRT1_2, n = 1 / (1 + w / q + w * w);
  const b0 = n, b1 = -2 * n, b2 = n, a1 = 2 * (w * w - 1) * n, a2 = (1 - w / q + w * w) * n;
  ch.forEach((x) => {
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) {
      const x0 = x[i], y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = x0; y2 = y1; y1 = y0; x[i] = y0;
    }
  });
  return ch;
}

// Гейт: тише порога (дБ) — приглушить на range дБ; плавная атака/отпускание, удержание hold
export function gateFx(ch, sr, thrDb = -50, { range = 40, attack = 0.005, release = 0.12, hold = 0.08 } = {}) {
  const thr = dbToLin(thrDb), floor = dbToLin(-range), aC = Math.exp(-1 / (attack * sr)), rC = Math.exp(-1 / (release * sr)), hN = Math.floor(hold * sr);
  const n = ch[0].length;
  let env = 0, g = floor, held = 0;
  for (let i = 0; i < n; i++) {
    let v = 0; for (const x of ch) v = Math.max(v, Math.abs(x[i]));
    env = v > env ? v : env * 0.9995 + v * 0.0005; // быстрый подъём, медленный спад огибающей
    let target;
    if (env >= thr) { target = 1; held = hN; } else if (held > 0) { target = 1; held--; } else target = floor;
    g = target > g ? target + (g - target) * aC : target + (g - target) * rC;
    for (const x of ch) x[i] *= g;
  }
  return ch;
}

// Компрессор: порог (дБ), степень (ratio), атака/отпускание; make-up — вернуть громкость. Пиковая огибающая в дБ
export function compress(ch, sr, { threshold = -20, ratio = 3, attack = 0.01, release = 0.15, makeup = true } = {}) {
  const aC = Math.exp(-1 / (attack * sr)), rC = Math.exp(-1 / (release * sr)), n = ch[0].length;
  let env = -120;
  for (let i = 0; i < n; i++) {
    let v = 0; for (const x of ch) v = Math.max(v, Math.abs(x[i]));
    const d = linToDb(v);
    env = d > env ? d + (env - d) * aC : d + (env - d) * rC;
    const over = env - threshold, red = over > 0 ? over - over / ratio : 0;
    const k = dbToLin(-red);
    for (const x of ch) x[i] *= k;
  }
  if (makeup) normalize(ch, -1);
  return ch;
}

// Шумоподавление: спектральный гейт. Профиль шума — средний спектр самых тихих 10 % кадров;
// полосы ниже профиля × запас приглушаются на amount (0…1). Окно Ханна 2048, шаг 512, сложение с перекрытием
export function denoise(ch, sr, amount = 0.7, { n = 2048, hop = 512, over = 2 } = {}) {
  const win = new Float32Array(n);
  for (let i = 0; i < n; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
  const half = n / 2 + 1, keep = 1 - Math.max(0, Math.min(1, amount));
  return ch.map((x) => {
    const len = x.length, frames = Math.max(1, Math.ceil((len + n) / hop));
    const re = new Float32Array(n), im = new Float32Array(n);
    // 1. спектры кадров (амплитуды) и энергия кадра
    const mags = [], energy = new Float32Array(frames);
    for (let f = 0; f < frames; f++) {
      const s = f * hop - n / 2;
      for (let i = 0; i < n; i++) { const j = s + i; re[i] = j >= 0 && j < len ? x[j] * win[i] : 0; im[i] = 0; }
      fft(re, im);
      const m = new Float32Array(half);
      let e = 0;
      for (let k = 0; k < half; k++) { m[k] = Math.hypot(re[k], im[k]); e += m[k] * m[k]; }
      mags.push(m); energy[f] = e;
    }
    // 2. профиль шума
    // (только кадры целиком внутри записи — края дополнены нулями и «тише» любого шума)
    let inside = Array.from(energy.keys()).filter((f) => f * hop - n / 2 >= 0 && f * hop + n / 2 <= len);
    if (!inside.length) inside = Array.from(energy.keys());
    const order = inside.sort((a, b) => energy[a] - energy[b]), q = order.slice(0, Math.max(1, Math.floor(order.length * 0.1)));
    const noise = new Float32Array(half);
    q.forEach((f) => { for (let k = 0; k < half; k++) noise[k] += mags[f][k] / q.length; });
    // 3. маска и обратное преобразование (плавная по частоте и по времени)
    const out = new Float32Array(len + n), norm = new Float32Array(len + n);
    let prev = new Float32Array(half).fill(1);
    for (let f = 0; f < frames; f++) {
      const s = f * hop - n / 2;
      for (let i = 0; i < n; i++) { const j = s + i; re[i] = j >= 0 && j < len ? x[j] * win[i] : 0; im[i] = 0; }
      fft(re, im);
      const mask = new Float32Array(half);
      for (let k = 0; k < half; k++) mask[k] = mags[f][k] > noise[k] * over ? 1 : keep;
      for (let k = 1; k < half - 1; k++) mask[k] = (mask[k - 1] + 2 * mask[k] + mask[k + 1]) / 4; // по частоте
      for (let k = 0; k < half; k++) { mask[k] = Math.max(mask[k], prev[k] * 0.6); } // по времени — без «бульканья»
      prev = mask;
      for (let k = 0; k < half; k++) { re[k] *= mask[k]; im[k] *= mask[k]; if (k && k < n / 2) { re[n - k] *= mask[k]; im[n - k] *= mask[k]; } }
      // обратное БПФ: сопряжение → прямое → сопряжение / n
      for (let i = 0; i < n; i++) im[i] = -im[i];
      fft(re, im);
      for (let i = 0; i < n; i++) {
        const j = s + i + n / 2;
        if (j >= 0 && j < out.length) { out[j] += (re[i] / n) * win[i]; norm[j] += win[i] * win[i]; }
      }
    }
    const y = new Float32Array(len);
    for (let i = 0; i < len; i++) { const j = i + n / 2; y[i] = norm[j] > 1e-6 ? out[j] / norm[j] : 0; }
    return y;
  });
}

// Реверберация «небольшая комната»: схема Шрёдера — 4 гребенчатых фильтра параллельно и 2 всепропускающих
// последовательно (быстро, линейно по длине записи). wet — доля (0…1), size — размер комнаты (0.5…1.5)
export function reverb(ch, sr, wet = 0.2, size = 1) {
  if (wet <= 0) return ch;
  const k = (sr / 44100) * size;
  const combs = [1116, 1188, 1277, 1356].map((d) => Math.max(1, Math.round(d * k))), aps = [556, 441].map((d) => Math.max(1, Math.round(d * k)));
  const fb = 0.78, damp = 0.25;
  return ch.map((x, ci) => {
    const n = x.length, y = new Float32Array(n), sp = ci * 23; // стерео — чуть разные задержки
    for (const d0 of combs) {
      const d = d0 + sp, buf = new Float32Array(d); let p = 0, lp = 0;
      for (let i = 0; i < n; i++) { const o = buf[p]; lp = o * (1 - damp) + lp * damp; buf[p] = x[i] + lp * fb; p = p + 1 === d ? 0 : p + 1; y[i] += o * 0.25; }
    }
    for (const d0 of aps) {
      const d = d0 + sp, buf = new Float32Array(d); let p = 0;
      for (let i = 0; i < n; i++) { const b = buf[p], v = y[i]; y[i] = -v + b; buf[p] = v + b * 0.5; p = p + 1 === d ? 0 : p + 1; }
    }
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = x[i] * (1 - wet * 0.4) + y[i] * wet;
    return out;
  });
}

// Цепочка обработки: o = { trim:[a,b], lowcut, denoise, gate, comp: 'off'|'light'|'mid'|'strong', gain, normalize, reverb }
export const COMP = { light: { threshold: -18, ratio: 2 }, mid: { threshold: -22, ratio: 3.5 }, strong: { threshold: -28, ratio: 6 } };
export function process(ch, sr, o = {}) {
  let c = ch.map((x) => Float32Array.from(x));
  if (o.trim) c = trim(c, sr, o.trim[0], o.trim[1]);
  if (o.lowcut) highpass(c, sr, o.lowcut === true ? 80 : o.lowcut);
  if (o.denoise > 0) c = denoise(c, sr, o.denoise);
  if (o.gate != null && o.gate > -90) gateFx(c, sr, o.gate);
  if (o.comp && COMP[o.comp]) compress(c, sr, COMP[o.comp]);
  if (o.gain) gain(c, o.gain);
  if (o.reverb > 0) c = reverb(c, sr, o.reverb);
  if (o.normalize) normalize(c, -1);
  // защита от перегруза
  c.forEach((x) => { for (let i = 0; i < x.length; i++) x[i] = Math.max(-1, Math.min(1, x[i])); });
  return c;
}

// WAV, 16 бит
export function encodeWav(ch, sr) {
  const n = ch[0].length, nc = ch.length, buf = new ArrayBuffer(44 + n * nc * 2), v = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * nc * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, nc, true); v.setUint32(24, sr, true); v.setUint32(28, sr * nc * 2, true);
  v.setUint16(32, nc * 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * nc * 2, true);
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < nc; c++) { const s = Math.max(-1, Math.min(1, ch[c][i])); v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2; }
  return new Uint8Array(buf);
}

// WAV (PCM 16/24/32f) → { ch: [Float32Array], sr } или null
export function decodeWav(u8) {
  const v = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), s = (o, n) => String.fromCharCode(...u8.subarray(o, o + n));
  if (u8.length < 44 || s(0, 4) !== 'RIFF' || s(8, 4) !== 'WAVE') return null;
  let o = 12, fmt = null;
  while (o + 8 <= u8.length) {
    const id = s(o, 4), size = v.getUint32(o + 4, true);
    if (id === 'fmt ') fmt = { tag: v.getUint16(o + 8, true), nc: v.getUint16(o + 10, true), sr: v.getUint32(o + 12, true), bits: v.getUint16(o + 22, true) };
    else if (id === 'data' && fmt) {
      const bps = fmt.bits / 8, frames = Math.floor(Math.min(size, u8.length - o - 8) / (bps * fmt.nc)), ch = Array.from({ length: fmt.nc }, () => new Float32Array(frames));
      let p = o + 8;
      for (let i = 0; i < frames; i++) for (let c = 0; c < fmt.nc; c++) {
        ch[c][i] = fmt.tag === 3 ? v.getFloat32(p, true) : bps === 2 ? v.getInt16(p, true) / 32768 : bps === 3 ? ((v.getInt8(p + 2) << 16) | (u8[p + 1] << 8) | u8[p]) / 8388608 : v.getInt32(p, true) / 2147483648;
        p += bps;
      }
      return { ch, sr: fmt.sr };
    }
    o += 8 + size + (size & 1);
  }
  return null;
}

// Волна для экрана: n столбиков — пик в каждом
export function peaks(ch, n = 400) {
  const len = ch[0].length, step = Math.max(1, Math.floor(len / n)), out = new Float32Array(Math.ceil(len / step));
  for (let b = 0; b < out.length; b++) { let m = 0; const e = Math.min(len, (b + 1) * step); for (let i = b * step; i < e; i++) for (const x of ch) { const v = Math.abs(x[i]); if (v > m) m = v; } out[b] = m; }
  return out;
}
