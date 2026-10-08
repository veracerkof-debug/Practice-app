// Гриф гитары по кадру: лады, струны, порожек и бридж. Без обученной модели — только геометрия.
// Работает, только когда гриф виден целиком — от порожка до бриджа, со струнами; иначе ответ { ok: false, reason }:
// none — грифа нет, nut — не виден порожек, bridge — не виден бридж.
// Лады стоят по строгому закону: n-й лад — на доле 1 − 2^(−n/12) длины струны от порожка. Снимок под углом искажает
// прямую только перспективой (три параметра), поэтому закон узнаётся под любым углом, а лады под рукой достраиваются.
// 1) кандидаты в гриф — пары почти параллельных линий и одиночные линии (Хаф по направлению перепада яркости);
// 2) полоса «выпрямляется», вдоль неё ищутся поперечные светлые линии; к ним подгоняется закон ладов;
// 3) каждый лад прослеживается поперёк — так находятся настоящие края грифа и наклон ладов;
// 4) струны — шесть равноотстоящих тонких линий вдоль; без них полоса не считается грифом;
// 5) порожек — начало сплошного ряда ладов с головкой за ним; бридж — седло там, где закон ставит конец струны.
// Номер лада от порожка по одной картинке определяется не всегда: проективно ряд ладов неотличим от себя же,
// сдвинутого на несколько ладов (конец струны при этом не меняется), так что номер даёт только вид самого порожка.
// Чистые функции: на входе { width, height, data } (RGBA).

const PI = Math.PI;
export const zOf = (n) => 1 - Math.pow(2, -n / 12); // доля мензуры от порожка до n-го лада
export const nOf = (z) => -12 * Math.log2(1 - z);
export const MAX_FRET = 24;

const HOUGH_SIDE = 480; // поиск линий — по уменьшенному кадру
const FINE_SIDE = 1280; // лады и маркеры — по кадру не крупнее этого

/* ---------- изображение ---------- */

// Яркость (уменьшенная усреднением, если кадр больше maxSide): { g, W, H, k } — k: доля от исходного размера
export function grayOf(img, maxSide = Infinity) {
  const { width: W0, height: H0, data } = img;
  const k = Math.min(1, maxSide / Math.max(W0, H0));
  const W = Math.max(1, Math.round(W0 * k)), H = Math.max(1, Math.round(H0 * k)), g = new Float32Array(W * H);
  if (k === 1) {
    for (let i = 0, p = 0; i < g.length; i++, p += 4) g[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
    return { g, W, H, k: 1 };
  }
  const cnt = new Float32Array(W * H), kx = W / W0, ky = H / H0;
  for (let y = 0; y < H0; y++) {
    const row = Math.min(H - 1, (y * ky) | 0) * W;
    for (let x = 0, p = y * W0 * 4; x < W0; x++, p += 4) {
      const i = row + Math.min(W - 1, (x * kx) | 0);
      g[i] += 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
      cnt[i]++;
    }
  }
  for (let i = 0; i < g.length; i++) g[i] /= cnt[i] || 1;
  return { g, W, H, k: kx };
}

// Яркость в дробной точке (NaN — за краем)
function sample(G, x, y) {
  if (!(x >= 0 && y >= 0 && x <= G.W - 1 && y <= G.H - 1)) return NaN;
  const x0 = x | 0, y0 = y | 0, x1 = Math.min(x0 + 1, G.W - 1), y1 = Math.min(y0 + 1, G.H - 1), fx = x - x0, fy = y - y0, g = G.g;
  const a = g[y0 * G.W + x0], b = g[y0 * G.W + x1], c = g[y1 * G.W + x0], d = g[y1 * G.W + x1];
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

function quantile(arr, q) {
  let mx = 0;
  for (let i = 0; i < arr.length; i++) if (arr[i] > mx) mx = arr[i];
  if (!mx) return 0;
  const N = 512, h = new Uint32Array(N);
  for (let i = 0; i < arr.length; i++) h[Math.min(N - 1, ((arr[i] / mx) * N) | 0)]++;
  let need = arr.length * q;
  for (let i = 0; i < N; i++) { need -= h[i]; if (need <= 0) return ((i + 1) / N) * mx; }
  return mx;
}

const median = (a) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/* ---------- линии ---------- */

// Перепады яркости (Собель) и порог «сильных»
function edgesOf(G) {
  const { g, W, H } = G, n = W * H, gx = new Float32Array(n), gy = new Float32Array(n), mag = new Float32Array(n);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1, i = y * W + 1; x < W - 1; x++, i++) {
      const a = g[i - W - 1], b = g[i - W], c = g[i - W + 1], d = g[i - 1], f = g[i + 1], h = g[i + W - 1], k = g[i + W], l = g[i + W + 1];
      const X = c + 2 * f + l - a - 2 * d - h, Y = h + 2 * k + l - a - 2 * b - c;
      gx[i] = X; gy[i] = Y; mag[i] = Math.hypot(X, Y);
    }
  }
  return { gx, gy, mag, thr: Math.max(24, quantile(mag, 0.86)) };
}

const NT = 180;
const angDiff = (a, b) => { let d = Math.abs(a - b) % PI; return Math.min(d, PI - d); };

// Прямые (Хаф): каждый сильный перепад голосует только за прямые поперёк своего направления — быстро и без мусора
function houghPeaks(G, E, max = 70) {
  const { W, H } = G, D = Math.ceil(Math.hypot(W, H)), NR = 2 * D + 1, acc = new Float32Array(NT * NR);
  const C = new Float32Array(NT), S = new Float32Array(NT);
  for (let t = 0; t < NT; t++) { C[t] = Math.cos((t / NT) * PI); S[t] = Math.sin((t / NT) * PI); }
  const { gx, gy, mag, thr } = E;
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1, i = y * W + 1; x < W - 1; x++, i++) {
      if (mag[i] < thr) continue;
      let phi = Math.atan2(gy[i], gx[i]);
      if (phi < 0) phi += PI;
      const t0 = Math.round((phi / PI) * NT);
      for (let dt = -2; dt <= 2; dt++) {
        const t = (t0 + dt + NT) % NT, r = Math.round(x * C[t] + y * S[t]) + D;
        acc[t * NR + r] += dt === 0 ? 1 : Math.abs(dt) === 1 ? 0.7 : 0.35;
      }
    }
  }
  const minV = Math.min(W, H) * 0.06, cand = [];
  for (let t = 0; t < NT; t++) {
    for (let r = 4; r < NR - 4; r++) {
      const v = acc[t * NR + r];
      if (v < minV) continue;
      let peak = true;
      for (let dt = -3; dt <= 3 && peak; dt++) {
        const tt = (t + dt + NT) % NT;
        for (let dr = -4; dr <= 4; dr++) { if ((dt || dr) && acc[tt * NR + r + dr] > v) { peak = false; break; } }
      }
      if (peak) cand.push({ phi: (t / NT) * PI, rho: r - D, v });
    }
  }
  return cand.sort((a, b) => b.v - a.v).slice(0, max);
}

// Отрезок прямой, который действительно лежит на перепадах (самый длинный, разрывы до gap точек)
function segmentOf(G, E, phi, rho, gap) {
  const { W, H } = G, c = Math.cos(phi), s = Math.sin(phi), dx = -s, dy = c;
  const off = (W / 2) * c + (H / 2) * s - rho, px = W / 2 - off * c, py = H / 2 - off * s, T = Math.hypot(W, H) / 2 + 2;
  const { gx, gy, mag, thr } = E, tol = (14 / 180) * PI;
  let best = null, start = 0, last = -1e9, n = 0;
  for (let t = -T; t <= T; t += 1) {
    const x = px + t * dx, y = py + t * dy;
    if (x < 1 || y < 1 || x > W - 2 || y > H - 2) continue;
    let on = false;
    for (let o = -1; o <= 1 && !on; o++) {
      const i = Math.round(y + o * s) * W + Math.round(x + o * c);
      if (mag[i] < thr) continue;
      let p = Math.atan2(gy[i], gx[i]);
      if (p < 0) p += PI;
      if (angDiff(p, phi) < tol) on = true;
    }
    if (!on) continue;
    if (t - last > gap) { start = t; n = 0; }
    n++; last = t;
    if (!best || n > best.n) best = { t0: start, t1: t, n };
  }
  return best && { phi, rho, c, s, dx, dy, px, py, ...best };
}

// Точка прямой (c·x + s·y = rho) на поперечной линии u·X = a
function onLine(L, u, a) {
  const det = L.c * u.y - L.s * u.x;
  return { x: (L.rho * u.y - L.s * a) / det, y: (L.c * a - u.x * L.rho) / det };
}
const scaleLine = (L, q) => ({ ...L, rho: L.rho * q, px: L.px * q, py: L.py * q, t0: L.t0 * q, t1: L.t1 * q });

// Пары почти параллельных длинных отрезков — кандидаты в края грифа
function pairsOf(G, segs) {
  const minD = Math.min(G.W, G.H), maxD = Math.max(G.W, G.H), minLen = maxD * 0.12, out = [];
  const ok = segs.filter((L) => L.t1 - L.t0 >= minLen && L.n / (L.t1 - L.t0 + 1) >= 0.4);
  for (let i = 0; i < ok.length; i++) {
    for (let j = i + 1; j < ok.length; j++) {
      const A = ok[i], B = ok[j];
      if (angDiff(A.phi, B.phi) > (8 / 180) * PI) continue;
      const u = { x: A.dx, y: A.dy }, ends = (L) => {
        const p = [L.px + L.t0 * L.dx, L.py + L.t0 * L.dy], q = [L.px + L.t1 * L.dx, L.py + L.t1 * L.dy];
        const a = p[0] * u.x + p[1] * u.y, b = q[0] * u.x + q[1] * u.y;
        return [Math.min(a, b), Math.max(a, b)];
      };
      const [a0, a1] = ends(A), [b0, b1] = ends(B), lo = Math.max(a0, b0), hi = Math.min(a1, b1), ov = hi - lo;
      if (ov < minLen * 0.8 || ov < 0.4 * Math.min(a1 - a0, b1 - b0)) continue;
      const w = (a) => { const P = onLine(A, u, a); return Math.abs(P.x * B.c + P.y * B.s - B.rho); };
      const w1 = w(lo), w2 = w(hi);
      if (Math.min(w1, w2) < 4 || Math.max(w1, w2) > minD * 0.25 || Math.max(w1, w2) / Math.min(w1, w2) > 2.2) continue;
      out.push({ A, B, u, lo: Math.min(a0, b0), hi: Math.max(a1, b1), w: (w1 + w2) / 2, v: Math.min(A.n, B.n) });
    }
  }
  return out.sort((a, b) => b.v - a.v);
}

/* ---------- полоса грифа и лады ---------- */

// Выпрямленная полоса между прямыми A и B (в координатах G): столбцы вдоль, строки поперёк (v: 0 — A, 1 — B)
function stripOf(G, A, B, u, s0, s1, step, rows, va = 0, vb = 1) {
  const n = Math.max(2, Math.floor((s1 - s0) / step)), data = new Float32Array(rows * n), wc = new Float32Array(n), vs = new Float32Array(rows);
  for (let k = 0; k < rows; k++) vs[k] = va + ((vb - va) * k) / (rows - 1);
  for (let j = 0; j < n; j++) {
    const a = s0 + j * step, P = onLine(A, u, a), Q = onLine(B, u, a);
    wc[j] = Math.hypot(Q.x - P.x, Q.y - P.y) / step; // ширина грифа в столбцах
    for (let k = 0; k < rows; k++) { const v = vs[k]; data[k * n + j] = sample(G, P.x + (Q.x - P.x) * v, P.y + (Q.y - P.y) * v); }
  }
  return { data, n, rows, s0, step, wc, vs };
}

// «Гребни» поперёк каждой строки полосы: светлая линия шириной около w столбцов (sign = −1 — тёмная)
function ridgeRows(St, w, sign, all = false) {
  const { data, n, rows } = St, out = [];
  for (let k = 0; k < rows; k++) {
    const v = St.vs[k];
    if (!all && (v < 0.12 || v > 0.88)) continue;
    const r = new Float32Array(n).fill(NaN), o = k * n;
    for (let j = w; j < n - w; j++) r[j] = sign * (data[o + j] - 0.5 * (data[o + j - w] + data[o + j + w]));
    out.push({ v, r });
  }
  return out;
}

// Лад на снимке не обязан быть перпендикулярным грифу: гитару видно сбоку — лады скошены, и из-за перспективы
// по-разному вдоль грифа. Скос — сдвиг лада вдоль (в ширинах грифа) от одного края до другого: d0 + d1·(j/n − ½).
const shiftOf = (sk, j, n, v, wc) => (sk[0] + sk[1] * (j / n - 0.5)) * (v - 0.5) * wc[Math.max(0, Math.min(n - 1, j | 0))];
const lerpAt = (r, x) => { const i = x | 0, f = x - i; if (i < 0 || i + 1 >= r.length) return NaN; const a = r[i], b = r[i + 1]; return a + (b - a) * f; };

// Профиль ладов вдоль полосы при данном скосе: медиана по строкам (маркеры и пальцы задевают не все строки);
// fast — среднее по части строк и столбцов (для перебора скосов)
function skewProfile(rr, n, sk, wc, fast) {
  const R = new Float32Array(n), vals = [], dk = fast ? 2 : 1, dj = fast ? 2 : 1;
  for (let j = 0; j < n; j += dj) {
    vals.length = 0;
    let sum = 0;
    for (let k = 0; k < rr.length; k += dk) {
      const x = lerpAt(rr[k].r, j + shiftOf(sk, j, n, rr[k].v, wc));
      if (x === x) { vals.push(x); sum += x; }
    }
    R[j] = vals.length < 3 ? 0 : fast ? sum / vals.length : median(vals);
  }
  return R;
}
const energy = (R) => { let e = 0; for (let j = 0; j < R.length; j++) if (R[j] > 0) e += R[j] * R[j]; return e; };

// Скос, при котором поперечные линии самые чёткие
function bestSkew(rr, n, wc, coarse) {
  let best = [0, 0], be = -1;
  for (let d0 = -1.4; d0 <= 1.401; d0 += coarse ? 0.1 : 0.07) { const e = energy(skewProfile(rr, n, [d0, 0], wc, true)); if (e > be) { be = e; best = [d0, 0]; } }
  for (let d1 = -0.8; d1 <= 0.801; d1 += coarse ? 0.4 : 0.1) { const sk = [best[0], d1], e = energy(skewProfile(rr, n, sk, wc, true)); if (e > be) { be = e; best = sk; } }
  if (coarse) return best;
  const [c0, c1] = best;
  for (let d0 = c0 - 0.06; d0 <= c0 + 0.061; d0 += 0.02) for (let d1 = c1 - 0.08; d1 <= c1 + 0.081; d1 += 0.04) {
    const e = energy(skewProfile(rr, n, [d0, d1], wc, true)); if (e > be) { be = e; best = [d0, d1]; }
  }
  return best;
}

function peaksOf(R, sep, minV) {
  const out = [];
  for (let j = 1; j < R.length - 1; j++) {
    const v = R[j];
    if (v < minV) continue;
    let top = true;
    for (let d = 1; d <= sep && top; d++) if (R[j - d] > v || (j + d < R.length && R[j + d] >= v)) top = false;
    if (!top) continue;
    const a = R[j - 1], b = R[j + 1], den = a - 2 * v + b; // уточнение вершины параболой
    out.push({ p: j + (den < 0 ? (0.5 * (a - b)) / den : 0), v });
  }
  return out;
}

// Перспектива на прямой: p = (a·z + b) / (c·z + 1)
function solve3(M, y) {
  const [a, b, c] = M, det = a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
  if (Math.abs(det) < 1e-12) return null;
  const col = (i) => M.map((r, k) => r.map((x, j) => (j === i ? y[k] : x)));
  const d3 = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  return [d3(col(0)) / det, d3(col(1)) / det, d3(col(2)) / det];
}
// уравнение на точку: a·z + b − c·z·p = p
function fitModel(pts) {
  if (pts.length === 3) return solve3(pts.map(({ z, p }) => [z, 1, -z * p]), pts.map(({ p }) => p));
  const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], y = [0, 0, 0];
  pts.forEach(({ z, p }) => { const r = [z, 1, -z * p]; for (let i = 0; i < 3; i++) { y[i] += r[i] * p; for (let j = 0; j < 3; j++) M[i][j] += r[i] * r[j]; } });
  return solve3(M, y);
}
const posOf = (m, n) => { const z = zOf(n), d = m[2] * z + 1; return d > 0 ? (m[0] * z + m[1]) / d : NaN; };

// Лучший закон ладов для найденных вершин: { m: модель, inl: [{ n (условный номер), p, v }], score }
function fitFrets(peaks, len, wpx, sigma) {
  if (peaks.length < 4) return null;
  const P = peaks.slice().sort((a, b) => a.p - b.p), near = (x) => {
    let lo = 0, hi = P.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (P[m].p < x) lo = m; else hi = m; }
    return Math.abs(P[lo].p - x) < Math.abs(P[hi].p - x) ? P[lo] : P[hi];
  };
  const minSp = wpx * 0.1, maxSp = wpx * 1.7;
  // Перспектива бывает только такая, при которой точка схода лежит вне струны — от порожка (условный номер не ниже −24)
  // до подставки (z = 1). Иначе закон ладов «переворачивается»: проективно ряд 2^(−n/12) неотличим от обратного.
  const evalModel = (m) => {
    if (!(m[2] + 1 > 0.2 && m[2] * zOf(-MAX_FRET) + 1 > 0.2)) return null;
    let score = 0, inl = [], miss = 0, prev = NaN;
    for (let n = -26; n <= 26; n++) {
      const p = posOf(m, n), q = posOf(m, n + 1), sp = Math.abs(q - p);
      if (!(p === p) || !(q === q)) continue;
      if (p < 2 || p > len - 3) continue;
      if (prev === prev && (p - prev) * (q - p) < 0) return null; // перспектива «перевернулась» внутри кадра
      prev = p;
      if (sp < minSp || sp > maxSp) continue;
      const pk = near(p);
      if (Math.abs(pk.p - p) < Math.max(1.2, sp * 0.16)) { inl.push({ n, p: pk.p, v: pk.v }); score += Math.min(pk.v / sigma, 6); }
      else inl.push({ n, miss: true });
    }
    // промахи считаются только между крайними попаданиями
    const hit = inl.filter((x) => !x.miss);
    if (hit.length < 4) return null;
    const lo = hit[0].n, hi = hit[hit.length - 1].n;
    miss = inl.filter((x) => x.miss && x.n > lo && x.n < hi).length;
    return { m, inl: hit, score: score - miss * 2.5, lo, hi, miss };
  };
  let best = null;
  for (let i = 0; i < P.length; i++) {
    for (let j = i + 1; j <= i + 2 && j < P.length; j++) {
      for (let k = j + 1; k <= j + 2 && k < P.length; k++) {
        for (const g1 of [1, 2]) for (const g2 of [1, 2]) for (const sg of [1, -1]) {
          const m = fitModel([{ z: zOf(0), p: P[i].p }, { z: zOf(sg * g1), p: P[j].p }, { z: zOf(sg * (g1 + g2)), p: P[k].p }]);
          if (!m) continue;
          const r = evalModel(m);
          if (r && (!best || r.score > best.score)) best = r;
        }
      }
    }
  }
  if (!best) return null;
  // уточнение по всем попаданиям (условные номера сдвигаются к нулю, чтобы z были умеренными)
  for (let it = 0; it < 3; it++) {
    const m = fitModel(best.inl.map((x) => ({ z: zOf(x.n), p: x.p })));
    const r = m && evalModel(m);
    if (!r || r.score < best.score) break;
    best = r;
  }
  return best;
}

/* ---------- маркеры и номер лада ---------- */

// Порожек — там, где ряд ладов начинается: со стороны грифа на предсказанных законом местах лады есть, а за порожком
// (головка) — нет. Сила лада n — вершина профиля рядом с предсказанным местом. Возвращает { n — условный номер порожка,
// contrast } для лучшей «ступеньки» со стороны меньших номеров или null.
function nutOf(R, sigma, fit, inside, R2, sigma2) {
  const S = (n) => Math.max(S1(R, sigma, n), S1(R2, sigma2, n));
  const S1 = (R, sigma, n) => {
    const a = posOf(fit.m, n), b = posOf(fit.m, n + 1);
    if (!(a === a) || !(b === b) || a < 2 || a > R.length - 3) return NaN;
    const win = Math.max(1, Math.abs(b - a) * 0.15);
    let mx = -Infinity;
    for (let x = a - win; x <= a + win; x += 0.5) { const y = lerpAt(R, x); if (y > mx) mx = y; }
    return Math.min(mx / sigma, 8);
  };
  // кандидаты: сильный лад, за которым (в кадре) — головка; первый — начало сплошного ряда (из пяти подряд сильных
  // не меньше четырёх: один может быть под пальцем), остальные — на случай выбросов (колки, надписи на головке)
  const strong = (n) => S(n) >= 3, out = [];
  for (let n = fit.lo - 3; n <= fit.lo + 6; n++) {
    if (!strong(n) || !inside(posOf(fit.m, n - 1))) continue;
    let cnt = 0;
    for (let i = 0; i < 5; i++) if (strong(n + i)) cnt++;
    if (cnt < 3) continue;
    out.push({ n, run: cnt >= 4 && !(strong(n - 1) && strong(n - 2)) });
  }
  const best = out;
  return best;
}

/* ---------- полоса-кандидат ---------- */

// Прямая через две точки (в виде c·x + s·y = rho)
function lineThrough(P, Q) {
  const L = Math.hypot(Q.x - P.x, Q.y - P.y) || 1, dx = (Q.x - P.x) / L, dy = (Q.y - P.y) / L, c = dy, s = -dx;
  return { c, s, rho: c * P.x + s * P.y, dx, dy, px: P.x, py: P.y, t0: 0, t1: L, phi: Math.atan2(s, c) };
}

// Лады в полосе между прямыми A и B: лучший из «светлые лады» / «тёмные лады» — { St, fit, sk, sign, w, score, wpx }
// coarse — быстрый грубый проход (шаг 1 точка, меньше строк и скосов): только чтобы отобрать лучших кандидатов
// skFixed — скос уже известен (по прослеженным ладам): только небольшое уточнение вокруг него
function evalBand(Gf, A, B, u, s0, s1, wpx, coarse = false, skFixed = null) {
  const step = coarse ? 1 : 0.5, St = stripOf(Gf, A, B, u, s0, s1, step, coarse ? 13 : 25), w = Math.max(coarse ? 1 : 2, Math.round((wpx / 24) / step));
  let best = null;
  for (const sign of [1, -1]) {
    const rr = ridgeRows(St, w, sign);
    let sk = skFixed;
    if (skFixed) {
      let be = energy(skewProfile(rr, St.n, sk, St.wc, true));
      for (let d = -0.04; d <= 0.041; d += 0.02) { const t = [skFixed[0] + d, skFixed[1]], e = energy(skewProfile(rr, St.n, t, St.wc, true)); if (e > be) { be = e; sk = t; } }
    } else sk = bestSkew(rr, St.n, St.wc, coarse);
    const R = skewProfile(rr, St.n, sk, St.wc, false), abs = [];
    for (let j = 0; j < R.length; j++) abs.push(Math.abs(R[j]));
    const sigma = Math.max(0.6, 1.4826 * median(abs));
    const pk = peaksOf(R, Math.max(2, Math.round((wpx * 0.09) / step)), sigma * 2.2);
    const fit = fitFrets(pk, St.n, wpx / step, sigma);
    // лад — металл, почти всегда светлее накладки; тёмная линия рядом — его тень, и если взять её, сетка сдвинется
    // на толщину лада. Тёмные лады берутся, только если они заметно чётче светлых
    const sc = fit ? fit.score * (sign > 0 ? 1.35 : 1) : 0;
    if (fit && (!best || sc > best.sc)) best = { St, fit, sk, sign, w, score: fit.score, sc, wpx, R, sigma };
  }
  return best;
}

// Каждый найденный лад прослеживается поперёк — строка за строкой, от середины к краям, по местному максимуму
// «светлой линии» рядом с ожидаемым местом. Где лады кончаются — там края грифа (кирпичи, решётки, полосы ткани
// продолжаются дальше: open — сколько сторон «не кончается»). По прослеженным точкам заново считается скос ладов.
// { v0, v1, open, sk }
function extentOf(Gf, c) {
  const { A, B, pr, St, fit, sk, sign, w } = c, VA = -0.8, VB = 1.8, RX = 53;
  const X = stripOf(Gf, A, B, pr.u, St.s0, St.s0 + St.n * St.step, St.step, RX, VA, VB), rr = ridgeRows(X, w, sign, true);
  const k5 = rr.findIndex((r) => r.v >= 0.5), tr = [], v0s = [], v1s = [];
  fit.inl.forEach(({ n }) => {
    const cn = posOf(fit.m, n), sp = Math.abs(posOf(fit.m, n + 1) - cn) || 4, win = Math.max(2, sp * 0.25);
    const pick = (k, around) => {
      const r = rr[k].r;
      let bx = around, bv = -Infinity;
      for (let x = around - win; x <= around + win; x += 0.5) { const y = lerpAt(r, x); if (y > bv) { bv = y; bx = x; } }
      return { x: bx, y: bv };
    };
    const c0 = pick(k5, cn + shiftOf(sk, cn, X.n, rr[k5].v, X.wc));
    if (!(c0.y > 0)) return;
    const thr = c0.y * 0.3, pts = [{ v: rr[k5].v, x: c0.x }];
    let lo = k5, hi = k5;
    for (const dir of [-1, 1]) {
      let k = k5 + dir, x = c0.x, gap = 0;
      while (k >= 0 && k < rr.length) {
        const exp = x + (shiftOf(sk, cn, X.n, rr[k].v, X.wc) - shiftOf(sk, cn, X.n, rr[k - dir].v, X.wc)), q = pick(k, exp);
        if (q.y > thr && Math.abs(q.x - exp) < win * 0.8) { x = q.x; gap = 0; pts.push({ v: rr[k].v, x }); if (dir < 0) lo = k; else hi = k; }
        else if (++gap > 2) break;
        k += dir;
      }
    }
    v0s.push(rr[lo].v); v1s.push(rr[hi].v);
    if (pts.length >= 5) tr.push({ j: cn, pts });
  });
  if (!v0s.length) return null;
  const v0 = median(v0s), v1 = median(v1s), open = (v0 <= VA + 0.1 ? 1 : 0) + (v1 >= VB - 0.1 ? 1 : 0);
  // скос по прослеженным ладам: наклон x(v) каждого лада в ширинах грифа, затем d0 + d1·(j/n − ½) наименьшими квадратами
  const ds = tr.map(({ j, pts }) => {
    const mv = pts.reduce((a, p) => a + p.v, 0) / pts.length, mx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
    let num = 0, den = 0;
    pts.forEach((p) => { num += (p.v - mv) * (p.x - mx); den += (p.v - mv) ** 2; });
    return { t: j / X.n - 0.5, d: den ? num / den / X.wc[Math.max(0, Math.min(X.n - 1, j | 0))] : NaN };
  }).filter((q) => q.d === q.d);
  let sk2 = sk;
  if (ds.length >= 3) {
    const mt = ds.reduce((a, q) => a + q.t, 0) / ds.length, md = ds.reduce((a, q) => a + q.d, 0) / ds.length;
    let num = 0, den = 0;
    ds.forEach((q) => { num += (q.t - mt) * (q.d - md); den += (q.t - mt) ** 2; });
    const d1 = den > 1e-6 ? num / den : 0;
    sk2 = [md - d1 * mt, d1];
  }
  return { v0, v1, open, sk: sk2 };
}

/* ---------- струны ---------- */

// Струны — тонкие линии вдоль грифа. Поперёк полосы строится профиль «тонкая светлая (или тёмная) линия» — медиана
// вдоль грифа, чтобы пальцы не мешали, — и в нём ищутся шесть равноотстоящих вершин. Отдельно для ближней и дальней
// половины найденных ладов: так струны получаются отрезками со своим наклоном (края грифа могут быть неточны).
// Возвращает { ev — насколько струны видны (в долях шума), parts: [{ s, vs: [6] }] } или null.
function stringsOf(Gf, A, B, u, sA, sB) {
  const parts = [];
  for (const [a0, a1] of [[sA, sA + (sB - sA) / 2], [sA + (sB - sA) / 2, sB]]) { const pp = stringsPart(Gf, A, B, u, a0, a1); if (pp) parts.push(pp); }
  if (!parts.length) return null;
  return { ev: Math.max(...parts.map((p) => p.ev)), parts };
}

// Шесть струн на участке грифа a0…a1: { s — середина участка, vs — доли ширины, ev — насколько видны }
function stringsPart(Gf, A, B, u, a0, a1) {
  const RS = 81, VA = -0.12, VB = 1.12, len = Math.abs(a1 - a0);
  if (len < 8) return null;
  const step = Math.max(1, len / 240), X = stripOf(Gf, A, B, u, Math.min(a0, a1), Math.max(a0, a1), step, RS, VA, VB);
  const dv = (VB - VA) / (RS - 1), d = 2; // строка ≈ 1/65 ширины грифа, струна — около 1/40: соседи через две строки уже мимо неё
  const P = new Float32Array(RS);
  for (let k = d; k < RS - d; k++) {
    const vals = [];
    for (let j = 0; j < X.n; j++) {
      const c = X.data[k * X.n + j], up = X.data[(k - d) * X.n + j], dn = X.data[(k + d) * X.n + j];
      if (c === c && up === up && dn === dn) vals.push(c - 0.5 * (up + dn));
    }
    P[k] = vals.length > X.n * 0.3 ? median(vals) : 0;
  }
  const noise = Math.max(0.4, 1.4826 * median(Array.from(P).map(Math.abs)));
  const at = (v, sg) => { const x = (v - VA) / dv; return x < 0 || x > RS - 1 ? -noise : sg * lerpAt(P, Math.min(RS - 1.001, x)); };
  let best = null;
  for (const sg of [1, -1]) {
    for (let sp = 0.1; sp <= 0.2001; sp += 0.004) {
      for (let v0 = -0.06; v0 + 5 * sp <= 1.06; v0 += 0.004) {
        let sc = 0, mid = 0;
        for (let i = 0; i < 6; i++) { sc += Math.min(at(v0 + i * sp, sg), noise * 8); if (i < 5) mid += at(v0 + (i + 0.5) * sp, sg); }
        sc -= 0.5 * Math.max(0, mid);
        if (!best || sc > best.sc) best = { sc, v0, sp, sg };
      }
    }
  }
  // каждая струна — к своей вершине поблизости
  const vs = [];
  for (let i = 0; i < 6; i++) {
    let bv = best.v0 + i * best.sp, bx = at(bv, best.sg);
    for (let dd = -best.sp * 0.3; dd <= best.sp * 0.3; dd += dv / 2) { const x = at(best.v0 + i * best.sp + dd, best.sg); if (x > bx) { bx = x; bv = best.v0 + i * best.sp + dd; } }
    vs.push(bv);
  }
  return { s: (a0 + a1) / 2, vs, ev: best.sc / 6 / noise };
}

/* ---------- бридж ---------- */

// Бридж — там, где закон ладов ставит конец струны (z = 1). Ищется седло: светлая поперечная полоса через все струны
// (кость или пластик на тёмной подставке, металлические сёдла у электрогитары) — в окне ±10 % мензуры вокруг
// предсказанного места. Если окно уходит за кадр — бриджа в кадре нет. { j — столбец полосы St } или null.
function bridgeOf(Gf, A, B, u, St, jNut, jBr, sk, w, inside, trace) {
  const L = jBr - jNut, j0 = Math.min(jBr - 0.1 * L, jBr + 0.1 * L), j1 = Math.max(jBr - 0.1 * L, jBr + 0.1 * L);
  if (trace) trace.push({ bridgeWin: [j0, j1], jNut, jBr, in0: inside(j0), in1: inside(j1), n: St.n });
  if (!inside(j0) || !inside(j1)) return null;
  const X = stripOf(Gf, A, B, u, St.s0 + j0 * St.step, St.s0 + j1 * St.step, St.step, 31);
  const skB = [sk[0] + sk[1] * (jBr / St.n - 0.5), 0]; // скос у бриджа — продолжение скоса ладов
  // сила поперечной линии в каждом столбце — лучшая по толщине и небольшому скосу седла
  const Z = new Float32Array(X.n);
  for (const ww of [w, Math.round(w * 1.8)]) {
    const rr = ridgeRows(X, ww, 1);
    for (let dd = -0.15; dd <= 0.151; dd += 0.05) {
      const R = skewProfile(rr, X.n, [skB[0] + dd, 0], X.wc, false), sigma = Math.max(0.5, 1.4826 * median(Array.from(R).map(Math.abs)));
      for (let j = 0; j < X.n; j++) Z[j] = Math.max(Z[j], R[j] / sigma);
    }
  }
  // кандидаты: вершины не слабее 4 шумов (седло, ряд штифтов, край подставки — какая из них конец струны,
  // решает закон ладов), не у самого края окна
  const sep = Math.max(3, Math.round(X.n * 0.02)), out = [];
  for (let j = 3; j < X.n - 3; j++) {
    if (Z[j] < 4) continue;
    let top = true;
    for (let d = 1; d <= sep && top; d++) if ((j - d >= 0 && Z[j - d] > Z[j]) || (j + d < X.n && Z[j + d] >= Z[j])) top = false;
    if (top) out.push({ z: Z[j], j: j0 + j });
  }
  if (trace) trace.push({ bridgeCands: out });
  return out.sort((a, b) => b.z - a.z).slice(0, 6);
}

/* ---------- главное ---------- */

// Найти гриф. Возвращает { ok: false, reason } или { ok: true, frets: [{ n, a, b, seen }] (0 — порожек), strings: [{ i, a, b }]
// (i — от края A, от порожка до бриджа), nut, bridge: { a, b }, edges, alts: [{ shift, prior }] — запасные номера ладов,
// geo — для locate и pointAt }. Точки — в пикселях кадра; a — край A, b — край B. opts.trace — массив для отладки.
export function detectFretboard(img, opts = {}) {
  const Gh = grayOf(img, HOUGH_SIDE), E = edgesOf(Gh);
  const segs = houghPeaks(Gh, E).map((L) => segmentOf(Gh, E, L.phi, L.rho, Math.max(6, Gh.W * 0.02))).filter(Boolean);
  // кандидаты: пары почти параллельных линий и одиночные длинные линии (второй край грифа часто не виден —
  // тёмная доска на тёмном корпусе): от линии в обе стороны пробуется полоса, ширина потом уточняется по ладам
  const bands = pairsOf(Gh, segs).slice(0, 30), minD = Math.min(Gh.W, Gh.H), maxD = Math.max(Gh.W, Gh.H);
  segs.filter((L) => L.t1 - L.t0 >= maxD * 0.15).sort((x, y) => y.n - x.n).slice(0, 10).forEach((L) => {
    const u = { x: L.dx, y: L.dy }, e0 = (L.px + L.t0 * L.dx) * u.x + (L.py + L.t0 * L.dy) * u.y, e1 = (L.px + L.t1 * L.dx) * u.x + (L.py + L.t1 * L.dy) * u.y;
    for (const side of [1, -1]) for (const f of [0.05, 0.09]) {
      const o = side * f * minD, B = { ...L, rho: L.rho + o, px: L.px + o * L.c, py: L.py + o * L.s };
      bands.push({ A: L, B, u, lo: Math.min(e0, e1), hi: Math.max(e0, e1), w: Math.abs(o), v: L.n });
    }
  });
  if (opts.trace) opts.trace.push({ segs: segs.length, bands: bands.length, lines: segs.map((L) => ({ x0: (L.px + L.t0 * L.dx) / Gh.k, y0: (L.py + L.t0 * L.dy) / Gh.k, x1: (L.px + L.t1 * L.dx) / Gh.k, y1: (L.py + L.t1 * L.dy) / Gh.k, n: L.n })) });
  if (!bands.length) return { ok: false, reason: 'none' };
  const Gf = grayOf(img, FINE_SIDE), q = Gf.W / Gh.W;
  // полоса — по всей длине прямых в кадре: лады ищутся и там, где края грифа закрыты рукой
  const span = (u) => {
    const pts = [[0, 0], [Gf.W - 1, 0], [0, Gf.H - 1], [Gf.W - 1, Gf.H - 1]].map(([x, y]) => x * u.x + y * u.y);
    return [Math.min(...pts), Math.max(...pts)];
  };
  // 1) грубо — все кандидаты
  const rough = [];
  for (const pr of bands) {
    const A = scaleLine(pr.A, q), B = scaleLine(pr.B, q), len = (pr.hi - pr.lo) * q, [m0, m1] = span(pr.u);
    const s0 = Math.max(m0, pr.lo * q - len * 0.5), s1 = Math.min(m1, pr.hi * q + len * 0.5);
    const c = evalBand(Gf, A, B, pr.u, s0, s1, pr.w * q, true);
    if (c) rough.push({ score: c.score, pr, A, B, s0, s1, wpx: pr.w * q });
  }
  rough.sort((x, y) => y.score - x.score);
  if (opts.trace) opts.trace.push({ rough: rough.length });
  // 2) точно — лучшие: лады, где они кончаются поперёк (края), уточнение по краям, струны
  let best = null;
  for (const r of rough.slice(0, 8)) {
    let c = evalBand(Gf, r.A, r.B, r.pr.u, r.s0, r.s1, r.wpx);
    if (!c) continue;
    c = { ...c, pr: r.pr, A: r.A, B: r.B };
    // Лады обрываются на краях грифа, а кирпичи, решётки, полосы ткани продолжаются за ними
    const ex = extentOf(Gf, c);
    if (!ex) continue;
    {
      // края — где лады кончаются, скос — по прослеженным ладам; лады — заново по уточнённой полосе
      const { A, B, St, pr } = c, sE = St.s0 + St.n * St.step, edge = (v) => {
        const P0 = onLine(A, pr.u, St.s0), Q0 = onLine(B, pr.u, St.s0), P1 = onLine(A, pr.u, sE), Q1 = onLine(B, pr.u, sE);
        return lineThrough({ x: P0.x + (Q0.x - P0.x) * v, y: P0.y + (Q0.y - P0.y) * v }, { x: P1.x + (Q1.x - P1.x) * v, y: P1.y + (Q1.y - P1.y) * v });
      };
      const wide = ex.v1 - ex.v0 > 0.3, A2 = wide ? edge(ex.v0) : A, B2 = wide ? edge(ex.v1) : B;
      const c2 = evalBand(Gf, A2, B2, pr.u, St.s0, sE, c.wpx * (wide ? ex.v1 - ex.v0 : 1), false, ex.sk);
      if (c2 && c2.fit.inl.length >= c.fit.inl.length * 0.7) c = { ...c2, pr, A: A2, B: B2 };
    }
    // струны — на участке найденных ладов
    const pA = c.St.s0 + posOf(c.fit.m, c.fit.lo) * c.St.step, pB = c.St.s0 + posOf(c.fit.m, c.fit.hi) * c.St.step;
    const str = stringsOf(Gf, c.A, c.B, c.pr.u, Math.min(pA, pB), Math.max(pA, pB));
    const strEv = str ? str.ev : 0, pen = ex.open === 2 ? 0.15 : ex.open === 1 ? 0.55 : 1;
    const score = c.score * pen * Math.min(1.5, Math.max(0.1, strEv / 2.5));
    if (opts.trace) opts.trace.push({ A: scaleLine(c.A, 1 / Gf.k), B: scaleLine(c.B, 1 / Gf.k), u: c.pr.u, s0: c.St.s0 / Gf.k, s1: (c.St.s0 + c.St.n * c.St.step) / Gf.k, score, raw: c.score, pen, ex, strEv, hits: c.fit.inl.length, miss: c.fit.miss, sk: c.sk });
    if (!best || score > best.score) best = { ...c, score, ex, str, strEv };
  }
  // гриф должен быть виден по-настоящему — лады и струны, — и целиком: порожек и бридж в кадре. Иначе — причина:
  // none — грифа нет, nut — не виден порожек, bridge — не виден бридж
  if (!best || best.fit.inl.length < 5 || best.strEv < (opts.minStrings ?? 1.5)) return { ok: false, reason: 'none' };
  const { A, B, St, pr, sk } = best, u = pr.u, fit0 = best.fit;
  const inside = (j) => [0.15, 0.5, 0.85].every((v) => {
    const s = St.s0 + j * St.step, P = onLine(A, u, s), Q = onLine(B, u, s), x = P.x + (Q.x - P.x) * v, y = P.y + (Q.y - P.y) * v;
    return x >= 0 && y >= 0 && x <= Gf.W - 1 && y <= Gf.H - 1;
  });
  // порожек толще лада: второй профиль — с окном под его толщину (в узкое окно толстая планка не видна)
  const R2 = skewProfile(ridgeRows(St, Math.round(best.w * 2.5), best.sign), St.n, sk, St.wc, false);
  const sigma2 = Math.max(0.6, 1.4826 * median(Array.from(R2).map(Math.abs)));
  const nuts = nutOf(best.R, best.sigma, fit0, inside, R2, sigma2);
  if (!nuts.length) return { ok: false, reason: 'nut' };
  // порожек и бридж — та пара, при которой найденные лады лучше всего ложатся на закон (z = 0 у порожка, 1 у бриджа):
  // при неверном порожке или не той поперечной линии у бриджа лады между ними не сходятся
  let pick = null, anyBridge = false;
  const byNut = new Map(); // лучший результат для каждого кандидата в порожек — для запасных вариантов номера
  for (const nut of nuts) {
    const jNut = posOf(fit0.m, nut.n), jBr = (fit0.m[0] + fit0.m[1]) / (fit0.m[2] + 1); // z = 1 — конец струны
    const brs = bridgeOf(Gf, A, B, u, St, jNut, jBr, sk, best.w, inside, opts.trace);
    if (!brs || !brs.length) continue;
    anyBridge = true;
    const hits = fit0.inl.filter((x) => x.n >= nut.n).map((x) => ({ n: x.n - nut.n, p: x.p }));
    if (hits.length < 4) continue;
    for (const br of brs) {
      const pts = hits.map((x) => ({ z: zOf(x.n), p: x.p }));
      for (let i = 0; i < 3; i++) pts.push({ z: 0, p: jNut }, { z: 1, p: br.j });
      const m = fitModel(pts);
      if (!m || !(m[2] + 1 > 0.2)) continue;
      const err = median(hits.map((x) => Math.abs(posOf(m, x.n) - x.p) / (Math.abs(posOf(m, x.n + 1) - posOf(m, x.n)) || 1)));
      const sc = err - (nut.run ? 0.03 : 0); // начало сплошного ряда — при прочих равных
      if (opts.trace) opts.trace.push({ nut: nut.n, run: nut.run, br: Math.round(br.j), z: +br.z.toFixed(1), err: +err.toFixed(3) });
      if (!pick || sc < pick.sc) pick = { sc, err, m, hits, nut, br };
      if (!byNut.has(nut.n) || err < byNut.get(nut.n).err) byNut.set(nut.n, { err, nut });
    }
  }
  if (!pick) return { ok: false, reason: anyBridge ? 'nut' : 'bridge' };
  if (!(pick.err < 0.15)) return { ok: false, reason: 'bridge' };
  const { m, hits, err } = pick;
  // Запасные номера: каждый другой кандидат в порожек (с тем же законом) сдвигает все номера на целое число ладов.
  // Какой верный — решают схема аккорда (у открытых аккордов звучат открытые струны) и звук; prior — исходное доверие
  const alts = [...byNut.values()].filter((x) => x.err < 0.15).map(({ nut }) => ({ shift: pick.nut.n - nut.n, prior: nut === pick.nut ? 1 : nut.run ? 0.5 : 0.3 }))
    .filter((a) => Math.abs(a.shift) <= 4).sort((a, b) => b.prior - a.prior);
  const last = Math.min(MAX_FRET, Math.max(...hits.map((x) => x.n)));
  // точка лада n на доле ширины v (с учётом скоса), в пикселях кадра
  const sOfJ = (j) => (St.s0 + j * St.step) / Gf.k, gA = scaleLine(A, 1 / Gf.k), gB = scaleLine(B, 1 / Gf.k);
  const pt = (s, v) => { const P = onLine(gA, u, s), Q = onLine(gB, u, s); return { x: P.x + (Q.x - P.x) * v, y: P.y + (Q.y - P.y) * v }; };
  const atJ = (c, v) => pt(sOfJ(c + shiftOf(sk, c, St.n, v, St.wc)), v);
  const seen = new Set(hits.map((x) => x.n)), frets = [];
  for (let n = 0; n <= last; n++) { const c = posOf(m, n); frets.push({ n, a: atJ(c, 0), b: atJ(c, 1), seen: seen.has(n) }); }
  const jB = (m[0] + m[1]) / (m[2] + 1), bridge = { a: atJ(jB, 0), b: atJ(jB, 1) };
  // струны — прямые от порожка до бриджа: у порожка (между ним и 2-м ладом) и перед бриджем (над декой)
  const sJ = (z) => St.s0 + ((m[0] * z + m[1]) / (m[2] * z + 1)) * St.step;
  const pN = stringsPart(Gf, A, B, u, sJ(zOf(0.3)), sJ(zOf(2.5))), pB = stringsPart(Gf, A, B, u, sJ(0.86), sJ(0.97));
  const parts = [pN, pB].filter((pp) => pp && pp.ev >= 1.2).map((pp) => ({ s: pp.s / Gf.k, vs: pp.vs }));
  if (!parts.length) parts.push(...best.str.parts.map((pp) => ({ s: pp.s / Gf.k, vs: pp.vs })));
  const sN = sJ(0) / Gf.k, sBr = sJ(1) / Gf.k, strings = [];
  for (let i = 0; i < 6; i++) strings.push({ i, a: pt(sN, stringV(parts, i, sN)), b: pt(sBr, stringV(parts, i, sBr)) });
  return {
    ok: true, frets, strings, bridge, nut: frets[0], alts,
    edges: [[pt(sN, 0), pt(sBr, 0)], [pt(sN, 1), pt(sBr, 1)]],
    score: best.score, strings_ev: best.strEv, err,
    // для locate: всё в пикселях исходного кадра
    geo: { A: gA, B: gB, u, s0: St.s0 / Gf.k, step: St.step / Gf.k, m, k: 0, sk, n: St.n, wc: St.wc, parts },
  };
}

// Доля ширины струны i в точке s вдоль грифа
function stringV(parts, i, s) {
  if (parts.length < 2 || Math.abs(parts[1].s - parts[0].s) < 1e-6) return parts[0].vs[i];
  const [a, b] = parts, t = (s - a.s) / (b.s - a.s);
  return a.vs[i] + (b.vs[i] - a.vs[i]) * t;
}

// Где на грифе точка кадра (x, y в пикселях): { fret — лад, который зажимает палец (промежуток n−1…n → n; 0 и меньше —
// за порожком: если там палец, значит, номера занижены),
// pos — дробная позиция в ладах, v — доля поперёк (0 — край A), near — ближайшая струна 0…5 от края A,
// string — она же, если точка на ней (не дальше половины промежутка), иначе null, sd — расстояние в долях промежутка }
export function locate(fb, x, y) {
  if (!fb || !fb.ok) return null;
  const { A, B, u, s0, step, m, k, parts } = fb.geo, s = x * u.x + y * u.y, P = onLine(A, u, s), Q = onLine(B, u, s);
  const dx = Q.x - P.x, dy = Q.y - P.y, L2 = dx * dx + dy * dy, v = ((x - P.x) * dx + (y - P.y) * dy) / (L2 || 1);
  const j = (s - s0) / step, p = j - shiftOf(fb.geo.sk, j, fb.geo.n, v, fb.geo.wc), z = (p - m[1]) / (m[0] - m[2] * p), pos = nOf(z) + k;
  if (!(pos === pos)) return null;
  const vs = [0, 1, 2, 3, 4, 5].map((i) => stringV(parts, i, s)), gap = Math.abs(vs[5] - vs[0]) / 5 || 0.17;
  let si = 0;
  vs.forEach((sv, i) => { if (Math.abs(sv - v) < Math.abs(vs[si] - v)) si = i; });
  const sd = Math.abs(vs[si] - v) / gap;
  return { pos, fret: Math.ceil(pos - 1e-9), v, near: si, string: sd <= 0.5 ? si : null, sd };
}

// Гриф по четырём точкам — концам порожка и бриджа (край A, край B): когда гриф размечен вручную касаниями или в тестах.
// Без перспективы вдоль грифа (лады — по закону на прямой), струны — равномерно с полями. Ответ — как у detectFretboard.
export function boardFromPoints(nut, bridge, { nutEdge = 0.085, bridgeEdge = 0.1 } = {}) {
  const mid = (p) => ({ x: (p.a.x + p.b.x) / 2, y: (p.a.y + p.b.y) / 2 }), N = mid(nut), Br = mid(bridge);
  const L = Math.hypot(Br.x - N.x, Br.y - N.y) || 1, u = { x: (Br.x - N.x) / L, y: (Br.y - N.y) / L };
  const A = lineThrough(nut.a, bridge.a), B = lineThrough(nut.b, bridge.b), sN = N.x * u.x + N.y * u.y, n = Math.max(1, Math.round(L));
  const pt = (s, v) => { const P = onLine(A, u, s), Q = onLine(B, u, s); return { x: P.x + (Q.x - P.x) * v, y: P.y + (Q.y - P.y) * v }; };
  const vs = (e) => [0, 1, 2, 3, 4, 5].map((i) => e + (i * (1 - 2 * e)) / 5);
  const parts = [{ s: sN, vs: vs(nutEdge) }, { s: sN + L, vs: vs(bridgeEdge) }];
  const frets = [];
  for (let k = 0; k <= 20; k++) { const s = sN + L * zOf(k); frets.push({ n: k, a: pt(s, 0), b: pt(s, 1), seen: false }); }
  const strings = [0, 1, 2, 3, 4, 5].map((i) => ({ i, a: pt(sN, parts[0].vs[i]), b: pt(sN + L, parts[1].vs[i]) }));
  return {
    ok: true, frets, strings, nut: frets[0], bridge: { a: pt(sN + L, 0), b: pt(sN + L, 1) }, alts: [{ shift: 0, prior: 1 }],
    edges: [[pt(sN, 0), pt(sN + L, 0)], [pt(sN, 1), pt(sN + L, 1)]], err: 0,
    geo: { A, B, u, s0: sN, step: 1, m: [L, 0, 0], k: 0, sk: [0, 0], n, wc: new Float32Array(n).fill(1), parts },
  };
}

// Точка кадра на струне i (от края A) там, где палец зажимает лад n: чуть позади лада, в 35 % промежутка от него
export function pointAt(fb, i, n) {
  if (!fb || !fb.ok) return null;
  const { A, B, u, s0, step, m, sk, wc, parts } = fb.geo, c = posOf(m, n - 0.35);
  let v = 0.5, s = 0;
  for (let it = 0; it < 3; it++) { s = s0 + (c + shiftOf(sk, c, fb.geo.n, v, wc)) * step; v = stringV(parts, i, s); }
  const P = onLine(A, u, s), Q = onLine(B, u, s);
  return { x: P.x + (Q.x - P.x) * v, y: P.y + (Q.y - P.y) * v };
}
