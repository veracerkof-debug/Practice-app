// Выравнивание записей ансамбля (src/core/ensemble.js): каждый телефон пишет свою партию, начала файлов не совпадают
// (своя задержка микрофона, свой старт), а кварцы идут чуть по-разному (до ~100 миллионных — 30 мс за 5 минут).
// Хост даёт из динамика сигнал — короткий свист вверх — в начале и в конце записи; каждый микрофон его слышит.
// Здесь: сигнал, поиск его в записи (согласованный фильтр: свёртка с образцом через БПФ, огибающая — по аналитическому
// сигналу, вершина — с долей отсчёта) и перевод дорожки на общую шкалу хоста: начало — по первому сигналу, скорость —
// по расстоянию между сигналами (заодно и другая частота записи, 44,1 или 48 кГц). Пересчёт — интерполяция окном sinc
// (без потерь на слух); расхождение меньше полумиллисекунды за всю запись — без пересчёта, только сдвиг.
// Чистые функции, без DOM и звука.

export const CHIRP = { dur: 0.16, f0: 1200, f1: 6400, gain: 0.5 };
export const OUT_SR = 48000;

// Сигнал: линейный свист f0 → f1 с плавными краями (окно Ханна на 15 % с каждой стороны)
export function chirp(sr, { dur = CHIRP.dur, f0 = CHIRP.f0, f1 = CHIRP.f1, gain = CHIRP.gain } = {}) {
  const n = Math.round(dur * sr), x = new Float32Array(n), k = (f1 - f0) / dur, edge = Math.max(1, Math.round(n * 0.15));
  for (let i = 0; i < n; i++) {
    const t = i / sr, w = i < edge ? 0.5 - 0.5 * Math.cos((Math.PI * i) / edge) : i >= n - edge ? 0.5 - 0.5 * Math.cos((Math.PI * (n - 1 - i)) / edge) : 1;
    x[i] = gain * w * Math.sin(2 * Math.PI * (f0 * t + 0.5 * k * t * t));
  }
  return x;
}

// БПФ на месте (основание 2), re/im — Float64Array длины 2^k; inv — обратное (с делением на n)
export function fft(re, im, inv = false) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inv ? 2 : -2) * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang), h = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let j = 0; j < h; j++) {
        const a = i + j, b = a + h, tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
  if (inv) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}
const pow2 = (n) => { let p = 1; while (p < n) p <<= 1; return p; };

// Огибающая согласованного фильтра: env[i] — насколько похож кусок x с отсчёта i на образец tpl
export function matchEnvelope(x, tpl) {
  const n = pow2(x.length + tpl.length), xr = new Float64Array(n), xi = new Float64Array(n), tr = new Float64Array(n), ti = new Float64Array(n);
  xr.set(x); tr.set(tpl);
  fft(xr, xi); fft(tr, ti);
  // X · conj(T), только положительные частоты ×2 — аналитический сигнал свёртки
  for (let k = 0; k < n; k++) {
    const a = xr[k] * tr[k] + xi[k] * ti[k], b = xi[k] * tr[k] - xr[k] * ti[k], m = k === 0 || k === n / 2 ? 1 : k < n / 2 ? 2 : 0;
    xr[k] = a * m; xi[k] = b * m;
  }
  fft(xr, xi, true);
  const env = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) env[i] = Math.hypot(xr[i], xi[i]);
  return env;
}

// Найти сигнал в x на отрезке [a, b) отсчётов → { pos (доля отсчёта, начало сигнала), snr } или null.
// snr — вершина к медиане огибающей: ниже 8 — не нашли (сигнала не слышно, слишком громко играли, далеко)
export function findChirp(x, sr, a = 0, b = x.length, opts = {}) {
  a = Math.max(0, Math.floor(a)); b = Math.min(x.length, Math.ceil(b));
  const tpl = chirp(sr, opts);
  if (b - a < tpl.length * 2) return null;
  const env = matchEnvelope(x.subarray(a, b), tpl), last = b - a - tpl.length;
  let bi = 0, bv = -1;
  for (let i = 0; i <= last; i++) if (env[i] > bv) { bv = env[i]; bi = i; }
  const sorted = Float32Array.from(env.subarray(0, last + 1)).sort(), med = sorted[sorted.length >> 1] || 1e-12;
  // вершина с долей отсчёта — по параболе через три точки
  let frac = 0;
  if (bi > 0 && bi < last) { const y0 = env[bi - 1], y1 = env[bi], y2 = env[bi + 1], d = y0 - 2 * y1 + y2; if (d < 0) frac = (0.5 * (y0 - y2)) / d; }
  return { pos: a + bi + frac, snr: bv / Math.max(med, 1e-12) };
}
export const SNR_MIN = 8;

// Оба сигнала в записи: начальный — в первых head секундах, конечный — через gap секунд хоста после начального
// (с допуском на частоту записи и кварц: ±0,5 % и ±80 мс). → { s, e, rate, snr } — rate: отсчётов записи в секунде хоста
export function locate(x, sr, gap, { head = 20 } = {}) {
  // начальный сигнал — не позже, чем за gap секунд до конца записи (иначе в короткой записи найдётся конечный)
  const len = chirp(sr).length, lim = gap > 0.5 ? Math.max(len * 2, x.length - gap * sr * 0.995 + len) : x.length;
  const s = findChirp(x, sr, 0, Math.min(x.length, head * sr, lim));
  if (!s || s.snr < SNR_MIN) return { s: null, e: null, snr: s ? s.snr : 0 };
  const want = s.pos + gap * sr, tol = gap * sr * 0.005 + 0.08 * sr;
  const e = gap > 0.5 ? findChirp(x, sr, want - tol, want + tol + chirp(sr).length) : null;
  const ok = e && e.snr >= SNR_MIN;
  return { s: s.pos, e: ok ? e.pos : null, rate: ok ? (e.pos - s.pos) / gap : sr, snr: Math.min(s.snr, ok ? e.snr : s.snr), drift: !!ok };
}

// Ядро интерполяции: окно Блэкмана на sinc с полушириной Z отсчётов, cut — срез (1 — полоса записи, <1 — понижение
// частоты), таблица на P долей отсчёта
function kernel(Z, cut, P = 512) {
  const L = 2 * Z, tab = new Float32Array((P + 1) * L);
  for (let p = 0; p <= P; p++) {
    const f = p / P;
    for (let k = 0; k < L; k++) {
      const t = k - Z + 1 - f, u = (t + Z) / (2 * Z);
      const w = u <= 0 || u >= 1 ? 0 : 0.42 - 0.5 * Math.cos(2 * Math.PI * u) + 0.08 * Math.cos(4 * Math.PI * u);
      const s = t === 0 ? 1 : Math.sin(Math.PI * cut * t) / (Math.PI * cut * t);
      tab[p * L + k] = cut * s * w;
    }
  }
  return { tab, P, L, Z };
}

// Пересчитать канал: out[n] = x(start + n·step) — дробная позиция, интерполяция ядром. Позиции вне записи — тишина
export function resample(x, start, step, n, { Z = 16 } = {}) {
  const out = new Float32Array(n), K = kernel(Z, Math.min(1, 1 / step)), { tab, P, L } = K;
  for (let i = 0; i < n; i++) {
    const pos = start + i * step, ip = Math.floor(pos), f = pos - ip, ph = Math.min(P, Math.round(f * P)), base = ph * L, i0 = ip - Z + 1;
    let acc = 0;
    if (i0 >= 0 && i0 + L <= x.length) { for (let k = 0; k < L; k++) acc += x[i0 + k] * tab[base + k]; }
    else { for (let k = 0; k < L; k++) { const j = i0 + k; if (j >= 0 && j < x.length) acc += x[j] * tab[base + k]; } }
    out[i] = acc;
  }
  return out;
}

// План одной дорожки на общей шкале: время хоста τ от начального сигнала; выход — с a до b секунд хоста при частоте
// OUT_SR. Позиция в записи: s + τ·rate. Без пересчёта (shift), если частота та же и расхождение за запись < 0,5 мс
export function trackPlan(loc, sr, a, b) {
  const n = Math.max(0, Math.round((b - a) * OUT_SR)), step = loc.rate / OUT_SR, start = loc.s + a * loc.rate;
  const err = Math.abs(loc.rate - sr) / sr * (b - a);
  const shift = sr === OUT_SR && err < 0.0005;
  return { n, start, step: shift ? 1 : step, shift, driftMs: Math.round(((loc.rate - sr) / sr) * (b - a) * 10000) / 10 };
}

// Перевести каналы записи на общую шкалу; yieldEvery — каждые столько отсчётов отдать управление (await tick())
export async function alignChannels(ch, plan, tick = null) {
  const out = [];
  for (const x of ch) {
    if (plan.shift) {
      const y = new Float32Array(plan.n), s0 = Math.round(plan.start);
      for (let i = 0; i < plan.n; i++) { const j = s0 + i; y[i] = j >= 0 && j < x.length ? x[j] : 0; }
      out.push(y);
    } else {
      const y = new Float32Array(plan.n), BL = OUT_SR * 5;
      for (let i = 0; i < plan.n; i += BL) {
        y.set(resample(x, plan.start + i * plan.step, plan.step, Math.min(BL, plan.n - i)), i);
        if (tick) await tick();
      }
      out.push(y);
    }
  }
  return out;
}

// Часы: пары запросов телефона (t0 — отправил, th — время хоста, t1 — получил) → смещение хоста относительно телефона,
// по самым быстрым ответам (Wi-Fi рвано отвечает: медленные ответы врут). → { off, rtt } или null
export function clockFit(samples) {
  const ok = samples.filter((x) => x && x.t1 >= x.t0);
  if (!ok.length) return null;
  const by = ok.map((x) => ({ rtt: x.t1 - x.t0, off: x.th - (x.t0 + x.t1) / 2 })).sort((a, b) => a.rtt - b.rtt);
  const best = by.slice(0, Math.max(1, Math.ceil(by.length / 4))), offs = best.map((x) => x.off).sort((a, b) => a - b);
  return { off: offs[offs.length >> 1], rtt: best[0].rtt };
}
