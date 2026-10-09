// Камень режима «Минимал». Не драгоценный: обычный камень с дороги, у каждого свой (по зерну профиля).
// С часами занятий в приложении он, как галька в реке, теряет грани и выступы и становится круглее:
//   • сначала скругляются рёбра — быстро: половина за ~210 ч (EDGE_H), почти все — к ~1000 ч;
//   • потом уходят сколы и выступы — камень становится скруглённым собой: половина за ~2100 ч (FORM_H);
//   • и дольше всего — круглота: выпуклое стачивается сильнее, и камень приходит к шару (половина — ~6000 ч, ROUND_H).
// Так у реальной гальки: острые углы скалываются в первые километры пути, скругляется она за сотни, круглой — за тысячи.
// Рисуется без библиотек — сеткой из треугольников на <canvas>, оттенками серого. Камень можно крутить пальцем.
// Порода у каждого своя (по зерну): гранит с крапом, кварцевые жилы, слоистый песчаник, тёмный базальт — как галька
// в реках Узбекистана. Узор привязан к телу камня, поэтому стороны различимы и у совсем круглого; полировка
// с часами растёт — блик и переливы сильнее. Положение, в котором камень оставили, сохраняется.

export const EDGE_H = 300, FORM_H = 3000, ROUND_H = 9000;

// Сколько камень «прошёл» за эти часы. По опытам с галькой в потоке (Кюнен, Кранбейн) гранит теряет острые рёбра
// за первые ~10–20 км, а округлым становится за сотни километров. Наша кривая: половина рёбер — ~210 ч, почти
// вся форма — ~7000 ч; с 50 м на час это ~10 км и ~350 км — в масштабе настоящей гальки. Цифра образная, примерная.
export const KM_PER_H = 0.05;
export const stoneKm = (hours) => Math.max(0, +hours || 0) * KM_PER_H;

// Насколько камень сгладился: edges — рёбра, form — сколы и выступы (камень становится скруглённым собой),
// round — круглота (выпуклые места стачиваются сильнее впадин — так обкатанный камень приходит к шару).
// 0 — как с дороги, 1 — до конца. Круглота идёт медленнее всего: половина — ~6000 ч, почти шар — к ~25 000 ч
// Насколько камень круглый в целом (для подписей): рёбра, сколы и круглота вместе, 0…1
export const roundness = (w) => w.edges * 0.25 + w.form * 0.35 + w.round * 0.4;
export function wear(hours) {
  const h = Math.max(0, +hours || 0);
  return { edges: 1 - Math.exp(-h / EDGE_H), form: 1 - Math.exp(-h / FORM_H), round: 1 - Math.exp(-h / ROUND_H) };
}

function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

// Сфера из треугольников (икосаэдр, делённый n раз)
const SPHERES = new Map();
function sphere(n) {
  if (SPHERES.has(n)) return SPHERES.get(n);
  const p = (1 + Math.sqrt(5)) / 2;
  let V = [[-1, p, 0], [1, p, 0], [-1, -p, 0], [1, -p, 0], [0, -1, p], [0, 1, p], [0, -1, -p], [0, 1, -p], [p, 0, -1], [p, 0, 1], [-p, 0, -1], [-p, 0, 1]].map(norm);
  let F = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  for (let k = 0; k < n; k++) {
    const mid = new Map(), F2 = [];
    const m = (a, b) => {
      const key = a < b ? a + '_' + b : b + '_' + a;
      if (!mid.has(key)) { V.push(norm([(V[a][0] + V[b][0]) / 2, (V[a][1] + V[b][1]) / 2, (V[a][2] + V[b][2]) / 2])); mid.set(key, V.length - 1); }
      return mid.get(key);
    };
    F.forEach(([a, b, c]) => { const ab = m(a, b), bc = m(b, c), ca = m(c, a); F2.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]); });
    F = F2;
  }
  const s = { V, F };
  SPHERES.set(n, s);
  return s;
}

// Соседи вершин сферы (для обточки)
const NB = new Map();
function neighbours(SP, F) {
  if (NB.has(SP)) return NB.get(SP);
  const sets = SP.V.map(() => new Set());
  F.forEach(([a, b, c]) => { sets[a].add(b).add(c); sets[b].add(a).add(c); sets[c].add(a).add(b); });
  const nb = sets.map((x) => [...x]);
  NB.set(SP, nb);
  return nb;
}

// Сетка камня: { V — вершины, F — грани, A — светлота вершин (зерно породы) }
export function stoneMesh(seed, hours, detail = 3) {
  const r = rng(seed), { edges, form, round } = wear(hours);
  // исходный камень — пересечение случайных плоскостей (сколы)
  const planes = Array.from({ length: 11 + Math.floor(r() * 6) }, () => ({ n: norm([r() * 2 - 1, (r() * 2 - 1) * 0.8, r() * 2 - 1]), d: 0.62 + r() * 0.38 }));
  // (ось приплюснутости больше не нужна: обкатанный камень круглеет, а не превращается в яйцо; зерно сохраняем)
  r(); r(); r();
  const bumps = Array.from({ length: 5 }, () => ({ n: norm([r() * 2 - 1, r() * 2 - 1, r() * 2 - 1]), f: 1.5 + r() * 2.5, ph: r() * 6.3, a: 0.02 + r() * 0.03 }));
  const grain = Array.from({ length: 6 }, () => ({ n: norm([r() * 2 - 1, r() * 2 - 1, r() * 2 - 1]), f: 6 + r() * 20, ph: r() * 6.3 }));
  const kind = rockOf(seed), rv = () => norm([r() * 2 - 1, r() * 2 - 1, r() * 2 - 1]);
  // пятна (крупная неоднородность), жилы (светлые полосы по плоскостям), слои (у песчаника)
  const mottle = Array.from({ length: 3 }, () => ({ n: rv(), f: 1.6 + r() * 2.4, ph: r() * 6.3 }));
  const veins = Array.from({ length: kind.veins }, () => ({ n: rv(), c: (r() - 0.5) * 0.9, w: 0.05 + r() * 0.05, a: 0.38 + r() * 0.25 }));
  const layer = { n: rv(), f: 7 + r() * 8, ph: r() * 6.3 };
  const hash = (v) => { const x = Math.sin(v[0] * 127.1 + v[1] * 311.7 + v[2] * 74.7 + seed * 0.013) * 43758.5453; return x - Math.floor(x); };
  const k = 0.018 + 0.11 * edges; // мягкость рёбер (новый камень тоже не бритвенно острый)
  const SP = sphere(detail), { V: S, F } = SP;
  const V = [], A = [], R0 = [];
  S.forEach((v) => {
    // расстояние до сколов по направлению v: мягкий минимум (k → 0 — острые рёбра)
    const rs = [];
    planes.forEach((p) => { const c = v[0] * p.n[0] + v[1] * p.n[1] + v[2] * p.n[2]; if (c > 0.02) rs.push(p.d / c); });
    rs.push(1.25);
    const lo = Math.min(...rs);
    const soft = (kk) => { let sum = 0; rs.forEach((x) => { sum += Math.exp(-(x - lo) / kk); }); return lo - kk * Math.log(sum); };
    const rough = soft(k);
    let bump = 0;
    bumps.forEach((b) => { bump += b.a * Math.sin(b.f * (v[0] * b.n[0] + v[1] * b.n[1] + v[2] * b.n[2]) + b.ph); });
    // обкатка только снимает: точка поверхности уходит внутрь и никогда не выходит за исходный камень
    const r0 = soft(0.018) * (1 + bump);
    R0.push(r0);
    V.push([v[0], v[1], v[2], Math.min(r0, rough * (1 + bump))]); // направление и радиус — дальше обтачивается
    const dot = (n) => v[0] * n[0] + v[1] * n[1] + v[2] * n[2];
    let g = 0, mo = 0, vn = 0;
    grain.forEach((q) => { g += Math.sin(q.f * dot(q.n) + q.ph); });
    mottle.forEach((q) => { mo += Math.sin(q.f * dot(q.n) + q.ph); });
    veins.forEach((q) => { const d = (dot(q.n) - q.c) / q.w; vn += q.a * Math.exp(-d * d); });
    const h = hash(v), speck = h < kind.speck ? -0.34 : h > 1 - kind.speck * 0.6 ? 0.24 : 0;
    const lay = kind.layers ? 0.13 * Math.sin(layer.f * dot(layer.n) + layer.ph) : 0;
    A.push(Math.max(0, Math.min(1.25, 0.5 + g / 22 + mo * kind.mottle + vn + speck + lay + (r() - 0.5) * 0.08)));
  });
  // Обточка — только снятием: радиус точки может лишь уменьшаться
  let rad = V.map((p) => p[3]);
  const nb = neighbours(SP, F);
  // сколы и выступы: острое (углы, рёбра — самые дальние точки) срезается до среднего соседей; впадины не растут
  const smoothDown = (n) => { for (let it = 0; it < n; it++) rad = rad.map((x, i) => Math.min(x, nb[i].reduce((a, j) => a + rad[j], 0) / nb[i].length)); };
  smoothDown(Math.round(form * 26));
  // круглота: всё, что выше уровня большей части поверхности, стачивается к нему — камень приходит к шару
  if (round > 0) {
    const ball = rad.slice().sort((a, b) => a - b)[Math.floor(rad.length * 0.3)];
    rad = rad.map((x) => (x > ball ? x - (x - ball) * round : x));
    smoothDown(Math.round(round * 10));
  }
  V.forEach((p, i) => { p[0] *= rad[i]; p[1] *= rad[i]; p[2] *= rad[i]; p.length = 3; });
  // масштаб — по исходному камню (без единого часа): обточенный рисуется меньше, каким и стал
  const m = Math.max(...R0);
  V.forEach((p) => { p[0] /= m; p[1] /= m; p[2] /= m; });
  // нормали вершин (среднее граней вокруг): обкатанный камень освещается по ним — без видимых треугольников
  const N = V.map(() => [0, 0, 0]);
  F.forEach(([a, b, c]) => {
    const pa = V[a], pb = V[b], pc = V[c], u = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]], w = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]];
    const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    [a, b, c].forEach((i) => { N[i][0] += n[0]; N[i][1] += n[1]; N[i][2] += n[2]; });
  });
  // гладкость освещения: сколы нового камня видны гранями, обкатанный — гладкий
  const smooth = Math.min(1, 0.25 + 0.35 * edges + 0.5 * form + 0.3 * round);
  // и узор у гладкого мягче: мелкая рябь по вершинам сглаживается соседями
  if (form > 0.05) {
    const sum = A.map(() => 0), cnt = A.map(() => 0);
    F.forEach((f) => f.forEach((i) => f.forEach((j) => { sum[i] += A[j]; cnt[i]++; })));
    for (let i = 0; i < A.length; i++) A[i] = A[i] * (1 - 0.6 * form) + (sum[i] / cnt[i]) * 0.6 * form;
  }
  return { V, F, A, N: N.map(norm), kind, smooth };
}

// Порода по зерну профиля: светлота основы, лёгкий тёплый или холодный оттенок (почти серый), жилы, крап, слои
const ROCKS = [
  { id: 'granite', base: 0.02, tint: [4, 1, -3], veins: 1, speck: 0.16, mottle: 0.1, layers: false },
  { id: 'quartzite', base: 0.04, tint: [1, 1, 2], veins: 3, speck: 0.03, mottle: 0.1, layers: false },
  { id: 'sandstone', base: 0.04, tint: [6, 3, -4], veins: 0, speck: 0.06, mottle: 0.1, layers: true },
  { id: 'basalt', base: -0.2, tint: [-1, 0, 3], veins: 2, speck: 0.03, mottle: 0.08, layers: false },
  { id: 'slate', base: -0.08, tint: [-3, 0, 4], veins: 1, speck: 0.02, mottle: 0.08, layers: true },
];
export const rockOf = (seed) => ROCKS[(seed >>> 0) % ROCKS.length];
// Зерно камня — от даты создания профиля: у каждого свой
export const stoneSeed = (st) => { const c = (st.profile && st.profile.createdAt) || 0; return (c % 2147483647) || 20260915; };
export { qmul, qaxis };

// Поворот: кватернион [w, x, y, z]
const qmul = (a, b) => [a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3], a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
  a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1], a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0]];
const qaxis = (x, y, z, ang) => { const s = Math.sin(ang / 2); return [Math.cos(ang / 2), x * s, y * s, z * s]; };
function qmat(q) {
  const [w, x, y, z] = q;
  return [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y), 2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x),
    2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)];
}

// Нарисовать камень: mesh — stoneMesh, q — поворот, (cx, cy) — центр, s — радиус в пикселях.
// dark — тёмная тема, polish — полировка 0…1, shadow — тень снизу. Общая для главной и сцен помодоро.
const L = norm([-0.55, -0.75, 0.6]);
export const dark = () => matchMedia('(prefers-color-scheme: dark)').matches && document.documentElement.dataset.theme !== 'light' || document.documentElement.dataset.theme === 'dark' || document.documentElement.dataset.theme === 'oled';
export function paintStone(ctx, mesh, q, cx, cy, s, { dark: dk = false, polish = 0, shadow = true } = {}) {
  const M = qmat(q);
  const rot = (v) => [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]];
  const P = mesh.V.map(rot), NV = mesh.N ? mesh.N.map(rot) : null, sm = mesh.smooth ?? 0;
  const list = [];
  mesh.F.forEach((f) => {
    const a = P[f[0]], b = P[f[1]], c = P[f[2]];
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2];
    const n = norm([uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx]);
    if (n[2] <= 0) return; // обратная сторона
    // освещение — между нормалью грани (сколы) и средней нормалью вершин (обкатанная поверхность)
    const sn = NV && sm > 0 ? norm([0, 1, 2].map((k) => n[k] * (1 - sm) + (NV[f[0]][k] + NV[f[1]][k] + NV[f[2]][k]) / 3 * sm)) : n;
    list.push([a[2] + b[2] + c[2], f, sn]);
  });
  list.sort((x, y) => x[0] - y[0]);
  if (shadow) {
    ctx.fillStyle = dk ? 'rgba(0,0,0,.45)' : 'rgba(0,0,0,.10)';
    ctx.beginPath(); ctx.ellipse(cx, cy + s * 0.98, s * 0.7, s * 0.09, 0, 0, Math.PI * 2); ctx.fill();
  }
  const K = mesh.kind, tn = K.tint;
  // цвет точки поверхности по нормали n и светлоте породы alb
  const shade = (n, alb) => {
    const lam = Math.max(0, n[0] * L[0] + n[1] * L[1] + n[2] * L[2]);
    // блик: у полированной гальки — острее и ярче; переливы — блик чуть гуляет по узору породы
    const hv = Math.max(0, n[2] * 0.6 + lam * 0.4), spec = Math.pow(hv, 18 + 30 * polish) * (0.08 + 0.16 * polish) * (0.7 + 0.6 * alb);
    const rim = Math.pow(1 - Math.max(0, n[2]), 3) * (6 + 10 * polish); // край светлее — объём
    let v = (dk ? 28 : 34) + (dk ? 150 : 185) * (0.16 + 0.84 * lam) * (0.6 + 0.72 * alb) + spec * 255 + rim;
    v = Math.max(8, Math.min(245, v));
    const sh = (k) => Math.max(0, Math.min(255, v + k * (0.6 + 0.4 * lam)));
    return [sh(tn[0]), sh(tn[1]), sh(tn[2])];
  };
  // обкатанный камень — плавно, по точкам (цвет вершин переходит внутри треугольника): ни граней, ни ступенек
  if (NV && sm >= 0.5 && ctx.getTransform && typeof document !== 'undefined') { smoothPaint(ctx, list, P, NV, mesh, shade, cx, cy, s); return; }
  list.forEach(([, f, n]) => {
    const alb = (mesh.A[f[0]] + mesh.A[f[1]] + mesh.A[f[2]]) / 3 + K.base, c = shade(n, alb);
    const col = 'rgb(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ')';
    ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(cx + P[f[0]][0] * s, cy + P[f[0]][1] * s); ctx.lineTo(cx + P[f[1]][0] * s, cy + P[f[1]][1] * s); ctx.lineTo(cx + P[f[2]][0] * s, cy + P[f[2]][1] * s);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  });
}

// Плавная закраска (Гуро) в пикселях экрана: треугольники от дальних к ближним, цвет — смесь цветов вершин.
// Холст-черновик один на все камни; край сглаживается полупрозрачной обводкой силуэта
let OFF = null;
function smoothPaint(ctx, list, P, NV, mesh, shade, cx, cy, s) {
  // поверхность гладкая — считается в разрешении не выше 1,25 точки на пиксель и растягивается (быстрее в 3–4 раза)
  const tf = ctx.getTransform(), K0 = tf.a, k = Math.min(K0, 1.25), up = K0 / k;
  const bx = Math.floor(tf.e + K0 * (cx - s * 1.02)), by = Math.floor(tf.f + K0 * (cy - s * 1.02)), W = Math.ceil(k * s * 2.04) + 2, H = W;
  if (!OFF) OFF = document.createElement('canvas');
  if (OFF.width < W || OFF.height < H) { OFF.width = Math.max(W, OFF.width); OFF.height = Math.max(H, OFF.height); }
  const o = OFF.getContext('2d'), img = o.createImageData(W, H), D = img.data;
  const X = (p) => (tf.e + K0 * (cx + p[0] * s) - bx) / up, Y = (p) => (tf.f + K0 * (cy + p[1] * s) - by) / up;
  const C = new Map(), base = mesh.kind.base;
  const col = (i) => { let c = C.get(i); if (!c) { c = shade(NV[i], mesh.A[i] + base); C.set(i, c); } return c; };
  list.forEach(([, f]) => {
    const x0 = X(P[f[0]]), y0 = Y(P[f[0]]), x1 = X(P[f[1]]), y1 = Y(P[f[1]]), x2 = X(P[f[2]]), y2 = Y(P[f[2]]);
    const den = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
    if (Math.abs(den) < 1e-9) return;
    const c0 = col(f[0]), c1 = col(f[1]), c2 = col(f[2]);
    const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2))), maxX = Math.min(W - 1, Math.ceil(Math.max(x0, x1, x2)));
    const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2))), maxY = Math.min(H - 1, Math.ceil(Math.max(y0, y1, y2)));
    const ia = (y1 - y2) / den, ib = (y2 - y0) / den; // шаг весов по x
    for (let py = minY; py <= maxY; py++) {
      const yc = py + 0.5, xs = minX + 0.5;
      let a = ((y1 - y2) * (xs - x2) + (x2 - x1) * (yc - y2)) / den, b = ((y2 - y0) * (xs - x2) + (x0 - x2) * (yc - y2)) / den;
      for (let px = minX; px <= maxX; px++, a += ia, b += ib) {
        const g = 1 - a - b;
        if (a < -0.02 || b < -0.02 || g < -0.02) continue;
        const q = (py * W + px) * 4;
        D[q] = a * c0[0] + b * c1[0] + g * c2[0]; D[q + 1] = a * c0[1] + b * c1[1] + g * c2[1]; D[q + 2] = a * c0[2] + b * c1[2] + g * c2[2]; D[q + 3] = 255;
      }
    }
  });
  o.clearRect(0, 0, W, H);
  o.putImageData(img, 0, 0);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(OFF, 0, 0, W, H, bx, by, W * up, H * up);
  ctx.restore();
}

// Положение камня: в памяти (между перерисовками экрана) и на устройстве (между запусками)
const SAVED = new Map();
function loadQ(key) {
  if (!key) return null;
  if (SAVED.has(key)) return SAVED.get(key);
  try { const a = JSON.parse(localStorage.getItem('practice.v1.stone.' + key) || 'null'); if (Array.isArray(a) && a.length === 4 && a.every(Number.isFinite)) return a; } catch { /* нет хранилища */ }
  return null;
}
function saveQ(key, q) {
  if (!key) return;
  SAVED.set(key, q);
  try { localStorage.setItem('practice.v1.stone.' + key, JSON.stringify(q.map((x) => +x.toFixed(5)))); } catch { /* нет хранилища */ }
}

// Живой камень на холсте: сам медленно поворачивается, тянется пальцем; onTap — касание без поворота
export function stoneView(canvas, { seed = 1, hours = 0, detail = 3, spin = true, onTap = null, key = null } = {}) {
  let mesh = stoneMesh(seed, hours, detail), polish = wear(hours).edges, vx = 0, vy = 0, drag = null, raf = 0, lastT = 0;
  // положение, в котором камень оставили (для того же места: главная, шторка)
  let q = loadQ(key) || norm4(qmul(qaxis(1, 0, 0, 0.5), qaxis(0, 1, 0, 0.6)));
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ctx = canvas.getContext('2d');

  function draw() {
    const dpr = Math.min(2.5, window.devicePixelRatio || 1), W = canvas.clientWidth, H = canvas.clientHeight;
    if (!W || !H) return;
    if (canvas.width !== Math.round(W * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    paintStone(ctx, mesh, q, W / 2, H / 2, Math.min(W, H) * 0.44, { dark: dark(), polish });
  }
  function norm4(a) { const l = Math.hypot(...a) || 1; return a.map((x) => x / l); }
  const turn = (dx, dy) => { const a = Math.hypot(dx, dy); if (a > 1e-5) q = norm4(qmul(qaxis(dy / a, -dx / a, 0, a), q)); };

  function frame(t) {
    raf = 0;
    if (!canvas.isConnected) return;
    const dt = Math.min(50, lastT ? t - lastT : 16);
    lastT = t;
    if (!drag) {
      if (Math.abs(vx) + Math.abs(vy) > 1e-4) { turn(vx * dt, vy * dt); vx *= 0.94; vy *= 0.94; }
      else if (spin && !still) turn(-0.00012 * dt, 0.00004 * dt);
    }
    draw();
    if (key) SAVED.set(key, q);
    if (spin && !still || drag || Math.abs(vx) + Math.abs(vy) > 1e-4) raf = requestAnimationFrame(frame);
  }
  const kick = () => { if (!raf) { lastT = 0; raf = requestAnimationFrame(frame); } };

  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 };
    vx = vy = 0;
    try { canvas.setPointerCapture(e.pointerId); } catch { /* */ }
    kick();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y, now = performance.now(), dt = Math.max(1, now - drag.t);
    const k = 3 / Math.max(80, Math.min(canvas.clientWidth, canvas.clientHeight));
    turn(dx * k, dy * k);
    vx = (dx * k) / dt; vy = (dy * k) / dt;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    Object.assign(drag, { x: e.clientX, y: e.clientY, t: now });
  });
  // касание открывается по click, а не по pointerup: иначе следующий за ним click попадает в фон открытой шторки и закрывает её
  let tapped = false;
  const up = (e) => {
    if (!drag) return;
    tapped = e.type === 'pointerup' && drag.moved < 8;
    drag = null;
    if (tapped) vx = vy = 0;
    saveQ(key, q);
    kick();
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('click', (e) => { if (!tapped || !onTap) return; tapped = false; e.stopPropagation(); onTap(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') kick(); else saveQ(key, q); });

  kick();
  return {
    setHours(h) { mesh = stoneMesh(seed, h, detail); polish = wear(h).edges; kick(); },
    redraw: draw,
  };
}
