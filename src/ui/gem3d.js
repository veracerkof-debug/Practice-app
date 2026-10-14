// Лиги в 3D: каждый камень — объёмный кристалл на холсте, как камень «Минимала»: сам медленно вращается, тянется
// пальцем, положение запоминается. Форма природная (не огранка), у каждого своя — по зерну профиля и лиге.
//   stone    — тот же камень, что в «Минимале» (src/ui/stone.js);
//   quartz   — щётка горного хрусталя: главный кристалл и несколько меньших на породе; призма с поперечной
//              штриховкой, ромбоэдр из больших и малых граней, крошечные трапецоэдрические грани; внутри — «фантом»
//              (след ранней вершины) и иногда иглы рутила;
//   amethyst — друза: много коротких фиолетовых вершин на породе, к вершинам темнее (зональность);
//   topaz    — ромбическая призма с продольной штриховкой, пирамида, купол и площадка, золотистый, с вуалью;
//   emerald  — призма берилла с фасками рёбер и вершины, плоская площадка, внутри — «сад» (тёмные включения);
//   sapphire — «бочонок» корунда: две ступени крутых пирамид, поперечные полосы роста, шёлк (тонкие иглы);
//   ruby     — плоская шестигранная таблетка с ромбоэдром, на площадке — треугольные знаки роста;
//   diamond  — октаэдр алмаза со скруглёнными рёбрами, на гранях — тригоны (перевёрнутые треугольные ямки);
//   obsidian — обломок вулканического стекла: раковистые сколы с концентрическими волнами, радужный отлив.
// Каждый кристалл — выпуклый многогранник, пересечение плоскостей граней (габитус), со случайным, но естественным
// разбросом величины и наклона граней. Рисуется без библиотек: грани с прозрачностью (задние видны насквозь),
// включения внутри, узор на гранях, блики от трёх источников — грани вспыхивают при вращении.
// frac 0…1 — путь до следующей лиги: блеск сильнее.
import { qmul, qaxis, stoneView } from './stone.js';

const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const strHash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

/* ---------- габитус: плоскости граней ---------- */
// плоскость: { n — нормаль, d — расстояние от центра, deco — узор грани }
const P = (n, d, deco) => ({ n: norm(n), d, deco });
const ring = (k, f) => Array.from({ length: k }, (_, i) => f((i * 2 * Math.PI) / k, i));
const Y = [0, 1, 0];

// Кристалл в своих координатах: ось роста — +y. j — разброс величины грани, tilt — наклона
function habit(kind, r, o = {}) {
  const j = (x, a = 0.1) => x * (1 + (r() * 2 - 1) * a);
  const tilt = (n, a = 0.05) => [n[0] + (r() * 2 - 1) * a, n[1] + (r() * 2 - 1) * a, n[2] + (r() * 2 - 1) * a];
  const rot = r() * Math.PI;
  const at = (a, y) => [Math.cos(a + rot), y, Math.sin(a + rot)];
  // головка из наклонных граней: вершина на высоте top, крутизна steep (у плоскости d = n·(0, top, 0))
  const head = (k, top, steep, off = 0, ja = 0.08, deco) => ring(k, (a) => { const n = norm(at(a + off, steep)); return P(tilt(n, 0.04), n[1] * j(top, ja), deco); });
  switch (kind) {
    case 'quartz': {
      // R — радиус призмы, L — высота призмы, сужение к вершине у природного кварца — едва заметное
      const R = o.R ?? 0.36, L = o.L ?? 1.1, taper = 0.03 + r() * 0.04, top = L + R * 1.15;
      return [
        ...ring(6, (a) => P(tilt(at(a, taper), 0.025), j(R, 0.12), { type: 'striae', along: Y, gap: 0.045 + r() * 0.04 })),
        // ромбоэдр: три больших (r) и три малых (z) грани
        ...ring(6, (a, i) => { const n = norm(at(a, 0.68)); return P(tilt(n, 0.04), n[1] * j(i % 2 ? top * 0.98 : top * 0.93, 0.05)); }),
        // трапецоэдр и тригональная пирамида — крошечные грани на углах между призмой и головкой
        ...ring(3, (a) => { const n = norm(at(a + Math.PI / 6, 0.32)); return P(n, j(R * 1.04 + 0.42 * n[1] * L, 0.02)); }),
        P(tilt([0, -1, 0], 0.35), j(o.base ?? 0.1, 0.2)), // скол основания (отломан от щётки)
      ];
    }
    case 'amethyst': {
      // у аметиста щётки — короткие: почти одна головка над короткой призмой
      const R = o.R ?? 0.36, L = o.L ?? 0.35, top = L + R * 1.2;
      return [
        ...ring(6, (a) => P(tilt(at(a, 0.04), 0.03), j(R, 0.14), { type: 'striae', along: Y, gap: 0.06 })),
        ...ring(6, (a, i) => { const n = norm(at(a, 0.7)); return P(tilt(n, 0.05), n[1] * j(i % 2 ? top : top * 0.9, 0.06)); }),
        P(tilt([0, -1, 0], 0.3), j(0.15, 0.3)),
      ];
    }
    case 'topaz': {
      const sw = { type: 'striae', along: null, gap: 0.05 }; // продольная штриховка призмы
      return [
        ...ring(4, (a) => P(tilt([Math.cos(a + Math.PI / 4 + rot), 0, Math.sin(a + Math.PI / 4 + rot) * 0.72], 0.02), j(0.46, 0.06), sw)), // m
        ...ring(4, (a) => P(tilt([Math.cos(a + Math.PI / 4 + rot) * 0.55, 0, Math.sin(a + Math.PI / 4 + rot)], 0.02), j(0.5, 0.06), sw)), // l
        ...ring(2, (a) => P([Math.cos(a + rot), 0, Math.sin(a + rot)], j(0.5, 0.05))), // b
        ...ring(4, (a) => { const n = norm([Math.cos(a + Math.PI / 4 + rot), 1.05, Math.sin(a + Math.PI / 4 + rot) * 0.8]); return P(tilt(n, 0.03), n[1] * j(1.25, 0.05)); }), // o
        ...ring(2, (a) => { const n = norm([Math.cos(a + Math.PI / 2 + rot) * 0.2, 1, Math.sin(a + Math.PI / 2 + rot)]); return P(n, n[1] * j(1.15, 0.04)); }), // d
        P(tilt(Y, 0.05), j(0.98, 0.05)), // c — площадка
        P(tilt([0, -1, 0], 0.3), j(0.55, 0.15)),
      ];
    }
    case 'emerald': {
      const R = 0.42, top = 0.85;
      return [
        ...ring(6, (a) => P(tilt(at(a, 0), 0.015), j(R, 0.07), { type: 'striae', along: null, gap: 0.07 })), // m
        ...ring(6, (a) => P(at(a + Math.PI / 6, 0), j(R * 0.985, 0.02))), // a — узкие фаски вертикальных рёбер
        P(tilt(Y, 0.03), j(top, 0.05)), // c
        ...ring(6, (a) => { const n = norm(at(a, 1.05)); return P(n, n[1] * j(top + R / 1.05 * 0.75, 0.03)); }), // p — фаски вершины
        P(tilt([0, -1, 0], 0.4), j(0.8, 0.12)),
      ];
    }
    case 'sapphire': {
      // грань, проходящая через пояс радиуса R (вершина пирамиды — на высоте R / steep): «бочонок» из двух ступеней
      const bands = { type: 'striae', along: Y, gap: 0.06 };
      const pyr = (R, steep, off, sign, deco) => ring(6, (a) => { const n = norm(at(a + off, steep * sign)); return P(tilt(n, 0.025), j(R, 0.05) * Math.hypot(n[0], n[2]), deco); });
      return [
        ...pyr(0.5, 0.2, 0, 1, bands), ...pyr(0.5, 0.2, 0, -1, bands),
        ...pyr(0.62, 0.55, Math.PI / 6, 1), ...pyr(0.62, 0.55, Math.PI / 6, -1),
        P(tilt(Y, 0.04), j(0.95, 0.06), { type: 'trigons' }), P(tilt([0, -1, 0], 0.04), j(0.95, 0.06)),
      ];
    }
    case 'ruby': {
      return [
        ...ring(6, (a) => P(tilt(at(a, 0), 0.03), j(0.66, 0.07), { type: 'striae', along: Y, gap: 0.05 })),
        P(tilt(Y, 0.03), j(0.3, 0.1), { type: 'trigons' }), P(tilt([0, -1, 0], 0.03), j(0.3, 0.1)),
        ...ring(3, (a) => { const n = norm(at(a, 1.2)); return P(n, n[1] * j(0.3 + 0.55 / 1.2, 0.05)); }),
        ...ring(3, (a) => { const n = norm(at(a + Math.PI / 3, -1.2)); return P(n, -n[1] * j(0.3 + 0.55 / 1.2, 0.05)); }),
      ];
    }
    case 'diamond': {
      const oct = [];
      for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) oct.push(P(tilt([x, y, z], 0.05), j(0.62, 0.06), { type: 'trigons', flip: x * y * z }));
      // скруглённые рёбра (растворение): грани ромбододекаэдра и тетрагон-триоктаэдра чуть внутри
      const dod = [[1, 1, 0], [1, -1, 0], [-1, 1, 0], [-1, -1, 0], [1, 0, 1], [1, 0, -1], [-1, 0, 1], [-1, 0, -1], [0, 1, 1], [0, 1, -1], [0, -1, 1], [0, -1, -1]];
      const tri = [];
      for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) tri.push([2 * x, y, z], [x, 2 * y, z], [x, y, 2 * z]);
      return [...oct, ...dod.map((n) => P(tilt(n, 0.03), j(0.69, 0.03))), ...tri.map((n) => P(tilt(n, 0.02), j(0.655, 0.02)))];
    }
    case 'matrix': {
      // порода под щёткой: приплюснутый обломок
      // плюс восемь плоскостей октаэдра подальше — обломок всегда замкнут
      const cap = [];
      for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) cap.push(P([x, y, z], 1));
      return [...cap, ...Array.from({ length: 18 }, () => P([r() * 2 - 1, (r() * 2 - 1) * 0.9, r() * 2 - 1], 0.6 + r() * 0.35))];
    }
    case 'obsidian': default: {
      // обломок с раковистыми сколами: много граней разной величины, на крупных — концентрические волны
      const n = 20 + Math.floor(r() * 6);
      return Array.from({ length: n }, () => P([r() * 2 - 1, (r() * 2 - 1) * 0.8, r() * 2 - 1], 0.55 + r() * 0.4, { type: 'conch' }));
    }
  }
}

/* ---------- многогранник из плоскостей ---------- */
// Вершины — пересечения троек плоскостей внутри всех остальных; грани — вершины своей плоскости по кругу
function hull(planes) {
  const pts = [], EPS = 1e-6;
  const inside = (p) => planes.every((q) => dot(q.n, p) <= q.d + 1e-5);
  for (let a = 0; a < planes.length; a++) for (let b = a + 1; b < planes.length; b++) for (let c = b + 1; c < planes.length; c++) {
    const A = planes[a], B = planes[b], C = planes[c], bc = cross(B.n, C.n), det = dot(A.n, bc);
    if (Math.abs(det) < EPS) continue;
    const ca = cross(C.n, A.n), ab = cross(A.n, B.n);
    const p = [(A.d * bc[0] + B.d * ca[0] + C.d * ab[0]) / det, (A.d * bc[1] + B.d * ca[1] + C.d * ab[1]) / det, (A.d * bc[2] + B.d * ca[2] + C.d * ab[2]) / det];
    if (Math.hypot(...p) < 6 && inside(p)) pts.push(p);
  }
  const V = [];
  pts.forEach((p) => { if (!V.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) < 1e-4)) V.push(p); });
  const F = [];
  planes.forEach((pl) => {
    const idx = V.map((p, i) => [p, i]).filter(([p]) => Math.abs(dot(pl.n, p) - pl.d) < 1e-4).map(([, i]) => i);
    if (idx.length < 3) return;
    const c = idx.reduce((s, i) => add(s, V[i], 1 / idx.length), [0, 0, 0]);
    const u = norm(add(V[idx[0]], c, -1)), w = cross(pl.n, u), ang = (i) => { const d = add(V[i], c, -1); return Math.atan2(dot(d, w), dot(d, u)); };
    idx.sort((i, k) => ang(i) - ang(k));
    F.push({ v: idx, n: pl.n, deco: pl.deco });
  });
  return { V, F };
}

/* ---------- сборка: кристаллы, порода, включения ---------- */
// Поворот, переводящий ось +y в направление dir, затем вращение вокруг неё на spin
function orient(dir, spin) {
  const d = norm(dir), ax = cross(Y, d), s = Math.hypot(...ax), c = d[1], ang = Math.atan2(s, c);
  const q = qmul(s > 1e-6 ? qaxis(ax[0] / s, ax[1] / s, ax[2] / s, ang) : c > 0 ? [1, 0, 0, 0] : qaxis(1, 0, 0, Math.PI), qaxis(0, 1, 0, spin));
  return qmat(q);
}
const mul = (M, v) => [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]];

// Добавить часть в общую сетку: kind — габитус, mat — материал, M — поворот, t — сдвиг, sc — масштаб [x, y, z]
function place(out, kind, r, { M, t = [0, 0, 0], sc = [1, 1, 1], mat, o, inc } = {}) {
  const h = hull(habit(kind, r, o));
  if (h.F.length < 4) return null;
  const base = out.V.length, tf = (p) => add(mul(M, [p[0] * sc[0], p[1] * sc[1], p[2] * sc[2]]), t);
  h.V.forEach((p) => out.V.push(tf(p)));
  const axis = mul(M, Y);
  h.F.forEach((f) => out.F.push({ v: f.v.map((i) => i + base), n: norm(mul(M, [f.n[0] / sc[0], f.n[1] / sc[1], f.n[2] / sc[2]])), deco: f.deco, m: mat, axis, a: r() }));
  // включения: отрезки внутри кристалла (в его координатах — по описанию inc)
  if (inc) inc(r, h).forEach((s) => out.L.push({ a: tf(s.a), b: tf(s.b), c: s.c, w: s.w, al: s.al }));
  return { tf, axis };
}

// Фантом (ранняя вершина внутри) — рёбра головки, уменьшенные к центру; иглы рутила; «сад»; шёлк
const edgesOf = (h, pred) => { const E = []; h.F.forEach((f) => { if (!pred(f)) return; f.v.forEach((i, k) => E.push([h.V[i], h.V[f.v[(k + 1) % f.v.length]]])); }); return E; };
const INC = {
  phantom: (k, col) => (r, h) => {
    const c = h.V.reduce((s, p) => add(s, p, 1 / h.V.length), [0, 0, 0]), sh = (p) => add(c, add(p, c, -1), k);
    return edgesOf(h, (f) => f.n[1] > 0.3).map(([a, b]) => ({ a: sh(a), b: sh(b), c: col, w: 0.6, al: 0.35 }));
  },
  needles: (n, col, len, w = 0.5, plane = false) => (r, h) => {
    const c = h.V.reduce((s, p) => add(s, p, 1 / h.V.length), [0, 0, 0]);
    return Array.from({ length: n }, () => {
      // шёлк корунда — иглы в плоскости поперёк оси, под 60°; рутил — как попало
      const ang = plane ? Math.floor(r() * 3) * (Math.PI / 3) : r() * 6.3, d = plane ? [Math.cos(ang), 0, Math.sin(ang)] : norm([r() - 0.5, r() - 0.5, r() - 0.5]);
      const p = add(c, [(r() - 0.5) * 0.5, (r() - 0.5) * 0.9, (r() - 0.5) * 0.5]), L = len * (0.5 + r());
      return { a: add(p, d, -L / 2), b: add(p, d, L / 2), c: col, w, al: plane ? 0.35 : 0.6 };
    });
  },
};

// Камень лиги: id, seed (зерно профиля) → { V, F, L — включения }; одинаковое зерно — тот же камень
const MESH = new Map();
export function gemMesh(gem, seed) {
  const key = gem + ':' + seed;
  if (MESH.has(key)) return MESH.get(key);
  const r = rng((seed ^ strHash(gem)) >>> 0), out = { V: [], F: [], L: [] }, mat = MAT[gem] || MAT.stone, I = orient(Y, 0);
  const lean = (a) => [(r() * 2 - 1) * a, 1, (r() * 2 - 1) * a];
  if (gem === 'quartz') {
    // щётка: главный кристалл и 2–4 меньших, наклонены в стороны; основания утоплены в породу
    place(out, 'matrix', r, { M: orient(Y, r() * 6.3), t: [0, -0.62, 0], sc: [0.72, 0.24, 0.55], mat: MAT.matrix });
    place(out, 'quartz', r, { M: orient(lean(0.15), r() * 6.3), t: [0, -0.55, 0], mat, o: { R: 0.36, L: 1.05 }, inc: (rr, h) => [...INC.phantom(0.62, '255,255,255')(rr, h), ...(rr() < 0.5 ? INC.needles(4, '214,170,80', 0.5, 0.5)(rr, h) : [])] });
    const n = 2 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.3 + r(), sc = 0.45 + r() * 0.3;
      place(out, 'quartz', r, { M: orient([Math.cos(a) * 0.65, 1, Math.sin(a) * 0.45], r() * 6.3), t: [Math.cos(a) * 0.3, -0.6, Math.sin(a) * 0.22], sc: [sc, sc, sc], mat, o: { R: 0.34, L: 0.85 } });
    }
  } else if (gem === 'amethyst') {
    // друза: много коротких вершин на породе, расходятся веером
    place(out, 'matrix', r, { M: orient(Y, r() * 6.3), t: [0, -0.32, 0], sc: [0.95, 0.3, 0.75], mat: MAT.matrix });
    const n = 8 + Math.floor(r() * 5);
    for (let i = 0; i < n; i++) {
      const a = r() * 6.3, rad = Math.sqrt(r()) * 0.7, sc = 0.75 + r() * 0.45 * (1 - rad * 0.6);
      place(out, 'amethyst', r, { M: orient([Math.cos(a) * rad * 1.1, 1, Math.sin(a) * rad * 0.8], r() * 6.3), t: [Math.cos(a) * rad * 0.7, -0.22, Math.sin(a) * rad * 0.5], sc: [sc, sc, sc], mat });
    }
  } else if (gem === 'topaz') {
    place(out, 'topaz', r, { M: orient(lean(0.12), 0), mat, inc: INC.needles(5, '255,255,255', 0.12, 0.6) });
  } else if (gem === 'emerald') {
    place(out, 'emerald', r, { M: orient(lean(0.1), 0), sc: [1, 1.15, 1], mat, inc: INC.needles(9, '40,70,50', 0.1, 1.1) });
  } else if (gem === 'sapphire') {
    place(out, 'sapphire', r, { M: orient(lean(0.1), 0), sc: [0.95, 1.1, 0.95], mat, inc: INC.needles(14, '255,255,255', 0.22, 0.5, true) });
  } else if (gem === 'ruby') {
    place(out, 'ruby', r, { M: orient(lean(0.1), 0), mat, inc: INC.needles(10, '255,230,235', 0.25, 0.5, true) });
  } else {
    place(out, gem === 'diamond' ? 'diamond' : 'obsidian', r, { M: I, mat });
  }
  if (out.F.length < 4) place(out, 'obsidian', rng(7), { M: I, mat: MAT.stone });
  // y вверх — на экране вверх (у холста y растёт вниз); центр и масштаб: вписан в единичную сферу
  const flip = (p) => [p[0], -p[1], p[2]];
  out.V = out.V.map(flip); out.F.forEach((f) => { f.n = flip(f.n); f.axis = flip(f.axis); }); out.L.forEach((s) => { s.a = flip(s.a); s.b = flip(s.b); });
  const lo = [0, 1, 2].map((k) => Math.min(...out.V.map((p) => p[k]))), hi = [0, 1, 2].map((k) => Math.max(...out.V.map((p) => p[k])));
  const c = lo.map((x, k) => (x + hi[k]) / 2), shift = (p) => add(p, c, -1);
  out.V = out.V.map(shift); out.L.forEach((s) => { s.a = shift(s.a); s.b = shift(s.b); });
  const m = Math.max(...out.V.map((p) => Math.hypot(...p)));
  out.V = out.V.map((p) => p.map((x) => x / m)); out.L.forEach((s) => { s.a = s.a.map((x) => x / m); s.b = s.b.map((x) => x / m); });
  out.F.forEach((f) => { f.cy = f.v.reduce((s, i) => s + out.V[i][1], 0) / f.v.length; f.dr = r(); });
  out.gem = gem;
  MESH.set(key, out);
  return out;
}

/* ---------- материалы ---------- */
// h, s, l — цвет тела; clear — прозрачность (1 — непрозрачный), shine — блеск, fire — радужные вспышки
const MAT = {
  stone: { h: 30, s: 6, l: 52, clear: 1, shine: 0.25, speck: true },
  matrix: { h: 28, s: 8, l: 46, clear: 1, shine: 0.15, speck: true },
  quartz: { h: 200, s: 12, l: 88, clear: 0.38, shine: 1 },
  amethyst: { h: 278, s: 58, l: 54, clear: 0.6, shine: 0.95, zone: true },
  topaz: { h: 38, s: 88, l: 58, clear: 0.58, shine: 0.95 },
  emerald: { h: 150, s: 62, l: 40, clear: 0.74, shine: 0.85 },
  sapphire: { h: 222, s: 74, l: 42, clear: 0.72, shine: 1 },
  ruby: { h: 348, s: 74, l: 44, clear: 0.72, shine: 1 },
  diamond: { h: 205, s: 8, l: 88, clear: 0.36, shine: 1.25, fire: true },
  obsidian: { h: 255, s: 14, l: 9, clear: 1, shine: 1.1, sheen: true },
};
const LIGHTS = [norm([-0.5, -0.75, 0.55]), norm([0.7, -0.3, 0.6]), norm([0.1, 0.8, 0.6])];
const HALF = LIGHTS.map((l) => norm([l[0], l[1], l[2] + 1]));
const hsl = (h, s, l, a) => 'hsla(' + (((h % 360) + 360) % 360).toFixed(0) + ',' + Math.max(0, Math.min(100, s)).toFixed(1) + '%,' + Math.max(0, Math.min(100, l)).toFixed(1) + '%,' + a.toFixed(3) + ')';

function qmat(q) {
  const [w, x, y, z] = q;
  return [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y), 2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x),
    2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)];
}

// Узор грани (в 3D, проецируется; рисуется внутри грани): штриховка, тригоны, раковистые волны
function decoPaint(ctx, f, P2, rot, prj, s, light) {
  const d = f.deco, c3 = f.v.reduce((acc, i) => add(acc, P2[i], 1 / f.v.length), [0, 0, 0]), n = f.nr;
  const ext = Math.max(...f.v.map((i) => Math.hypot(P2[i][0] - c3[0], P2[i][1] - c3[1], P2[i][2] - c3[2])));
  const r = rng(Math.floor(f.dr * 1e9));
  ctx.lineWidth = Math.max(0.5, s * 0.006);
  const seg = (a, b) => { const A = prj(a), B = prj(b); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); };
  if (d.type === 'striae') {
    // штрихи поперёк оси (along — ось кристалла) или вдоль неё
    const ax = f.axr, u0 = d.along ? norm(add(ax, n, -dot(ax, n))) : norm(cross(n, ax)), dir = norm(cross(n, u0));
    const gap = d.gap * (0.7 + 0.6 * r());
    ctx.beginPath();
    for (let t = -ext; t <= ext; t += gap * (0.5 + r())) { const p = add(c3, u0, t); seg(add(p, dir, -ext * 1.2), add(p, dir, ext * 1.2)); }
    ctx.strokeStyle = light ? 'rgba(255,255,255,.22)' : 'rgba(0,0,0,.13)'; ctx.stroke();
  } else if (d.type === 'trigons') {
    // треугольные ямки и знаки роста: одинаково ориентированы на грани
    const e1 = norm(cross(n, Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), e2 = cross(n, e1), flip = d.flip || 1;
    ctx.beginPath();
    for (let k = 0; k < 6; k++) {
      const p = add(add(c3, e1, (r() - 0.5) * ext), e2, (r() - 0.5) * ext), z = ext * (0.06 + r() * 0.1);
      const tri = [0, 1, 2].map((m) => { const a = (m * 2 * Math.PI) / 3 + (flip < 0 ? Math.PI : 0); return prj(add(add(p, e1, Math.cos(a) * z), e2, Math.sin(a) * z)); });
      ctx.moveTo(tri[0][0], tri[0][1]); ctx.lineTo(tri[1][0], tri[1][1]); ctx.lineTo(tri[2][0], tri[2][1]); ctx.closePath();
    }
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.stroke();
  } else if (d.type === 'conch') {
    // раковистый скол: концентрические дуги от точки удара у края грани
    const e1 = norm(cross(n, [0.3, 1, 0.2])), e2 = cross(n, e1), o = add(c3, e1, ext * 0.8);
    ctx.beginPath();
    for (let k = 1; k <= 5; k++) {
      const rr = ext * 0.3 * k;
      for (let m = 0; m <= 16; m++) { const a = Math.PI * 0.55 + (m / 16) * Math.PI * 0.9, p = prj(add(add(o, e1, Math.cos(a) * rr), e2, Math.sin(a) * rr)); if (m) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }
    }
    ctx.strokeStyle = 'rgba(200,210,255,.14)'; ctx.stroke();
  }
}

// Нарисовать камень лиги: q — поворот, (cx, cy) — центр, s — радиус, frac — блеск, dark — тёмная тема, mono — оттенки серого
export function paintGem(ctx, mesh, q, cx, cy, s, { frac = 0, dark = false, mono = false, shadow = true } = {}) {
  const M = qmat(q), rot = (v) => mul(M, v), prj = (p) => [cx + p[0] * s, cy + p[1] * s];
  const P2 = mesh.V.map(rot), f01 = Math.max(0, Math.min(1, frac)), detail = s > 34;
  if (shadow) {
    ctx.fillStyle = dark ? 'rgba(0,0,0,.45)' : 'rgba(0,0,0,.12)';
    ctx.beginPath(); ctx.ellipse(cx, cy + s * 1.0, s * 0.68, s * 0.08, 0, 0, Math.PI * 2); ctx.fill();
  }
  const faces = mesh.F.map((f) => { f.nr = rot(f.n); f.axr = rot(f.axis); f.z = f.v.reduce((a, i) => a + P2[i][2], 0) / f.v.length; return f; }).sort((a, b) => a.z - b.z);
  const path = (f) => { ctx.beginPath(); f.v.forEach((i, k) => { const p = prj(P2[i]); if (k) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); ctx.closePath(); };
  const sat = (x) => (mono ? 0 : x);
  // 1) задние грани прозрачных кристаллов — сквозь камень, глубже и темнее
  faces.forEach((f) => {
    if (f.nr[2] > 0 || f.m.clear >= 1) return;
    path(f);
    ctx.fillStyle = hsl(f.m.h, sat(f.m.s * 1.1), f.m.l * 0.55 + (f.m.fire ? 10 : 0), 0.5);
    ctx.fill();
  });
  // 2) включения внутри (фантом, иглы, «сад», шёлк) — видны сквозь передние грани
  if (detail) mesh.L.forEach((ln) => {
    const a = prj(rot(ln.a)), b = prj(rot(ln.b));
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
    ctx.strokeStyle = 'rgba(' + (mono ? '255,255,255' : ln.c) + ',' + (mono ? ln.al * 0.6 : ln.al) + ')';
    ctx.lineWidth = Math.max(0.4, s * 0.006 * ln.w); ctx.lineCap = 'round'; ctx.stroke();
  });
  // 3) передние грани
  const sparks = [];
  faces.forEach((f) => {
    const n = f.nr, m = f.m;
    if (n[2] <= 0) return;
    const lam = Math.max(0, dot(n, LIGHTS[0])) * 0.75 + Math.max(0, dot(n, LIGHTS[1])) * 0.25;
    let spec = 0;
    HALF.forEach((hv, k) => { spec += Math.pow(Math.max(0, dot(n, hv)), m.clear < 1 ? 40 : 24) * (k ? 0.6 : 1); });
    spec *= m.shine * (0.55 + 0.45 * f01);
    let h = m.h, sa = m.s * (0.75 + 0.25 * f01), l, a;
    if (m.clear < 1) {
      // прозрачный кристалл: грань «в лоб» — сквозь неё видна глубина (темнее), к краю — светлее
      l = m.l - 14 * n[2] + 18 * lam + (f.a - 0.5) * 8;
      if (m.zone) l -= (0.5 - f.cy) * 9; // аметист: к вершинам (вверх) темнее и насыщеннее
      a = m.clear + (1 - m.clear) * (1 - n[2]) * 0.6;
    } else {
      l = m.l * (0.45 + 0.75 * lam) + (m.speck ? (f.a - 0.5) * 14 : 0) + (m.sheen ? (f.a - 0.5) * 4 : 0);
      a = 1;
    }
    if (m.fire && spec > 0.25) { h = (n[0] * 300 + n[1] * 200 + 720) % 360; sa = 70 + 20 * f01; } // огонь алмаза
    path(f);
    // объём грани: от светлого края к тёмному (по направлению света на экране)
    const pts = f.v.map((i) => prj(P2[i])), xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const g = ctx.createLinearGradient(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)), L0 = Math.min(97, l + spec * (m.sheen ? 12 : 55));
    g.addColorStop(0, hsl(h, sat(sa), Math.min(98, L0 + 7), a)); g.addColorStop(1, hsl(h, sat(sa), L0 - 7, a));
    ctx.fillStyle = g;
    ctx.fill();
    if (m.sheen && lam > 0.5) { ctx.fillStyle = hsl(190 + n[0] * 110, sat(65), 45, (lam - 0.5) * (0.1 + 0.1 * f01)); ctx.fill(); }
    // узор грани — внутри неё
    if (detail && f.deco && f.v.length >= 3) { ctx.save(); ctx.clip(); decoPaint(ctx, f, P2, rot, prj, s, m.clear < 1 || dark); ctx.restore(); path(f); }
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(0.6, s * 0.011);
    ctx.strokeStyle = m.clear < 1 ? 'rgba(255,255,255,' + (0.32 + 0.3 * f01) + ')' : dark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.14)';
    ctx.stroke();
    if (spec > 0.85 && m.clear < 1) { const c = pts.reduce((acc, p) => [acc[0] + p[0] / pts.length, acc[1] + p[1] / pts.length], [0, 0]); sparks.push([c[0], c[1], Math.min(1, spec - 0.6)]); }
  });
  // 4) искры на вспыхнувших гранях
  sparks.slice(0, 3).forEach(([px, py, k]) => {
    const rr = s * (0.08 + 0.08 * k);
    ctx.fillStyle = 'rgba(255,255,255,' + (0.6 + 0.4 * k) + ')';
    ctx.beginPath();
    ctx.moveTo(px, py - rr); ctx.quadraticCurveTo(px, py, px + rr, py); ctx.quadraticCurveTo(px, py, px, py + rr); ctx.quadraticCurveTo(px, py, px - rr, py); ctx.quadraticCurveTo(px, py, px, py - rr);
    ctx.fill();
  });
}

/* ---------- живой камень на холсте ---------- */
const SAVED = new Map();
const isDark = () => (matchMedia('(prefers-color-scheme: dark)').matches && document.documentElement.dataset.theme !== 'light') || ['dark', 'oled'].includes(document.documentElement.dataset.theme) || document.documentElement.dataset.ownbg === 'dark';
const norm4 = (a) => { const l = Math.hypot(...a) || 1; return a.map((x) => x / l); };

// canvas — холст; gem, seed, frac; spin — вращаться самому; после перетаскивания click не уходит дальше
export function gemView(canvas, { gem, seed = 1, frac = 0, spin = true } = {}) {
  const mesh = gemMesh(gem, seed), key = gem + ':' + seed, ctx = canvas.getContext('2d');
  const r = rng(seed + 11);
  // стоит прямо (вершины вверх), чуть наклонён к зрителю — видно головку; поворот вокруг оси — свой у каждого
  let q = SAVED.get(key) || norm4(qmul(qaxis(0, 0, 1, (r() - 0.5) * 0.2), qmul(qaxis(1, 0, 0, -(0.25 + r() * 0.2)), qaxis(0, 1, 0, r() * 6.28))));
  let vx = 0, vy = 0, drag = null, raf = 0, lastT = 0, moved = 0;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const draw = () => {
    const dpr = Math.min(2.5, window.devicePixelRatio || 1), W = canvas.clientWidth, H = canvas.clientHeight;
    if (!W || !H) return;
    if (canvas.width !== Math.round(W * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    paintGem(ctx, mesh, q, W / 2, H / 2 - Math.min(W, H) * 0.03, Math.min(W, H) * 0.4, { frac, dark: isDark(), mono: document.documentElement.dataset.style === 'mono' });
  };
  const turn = (dx, dy) => { const a = Math.hypot(dx, dy); if (a > 1e-5) q = norm4(qmul(qaxis(dy / a, -dx / a, 0, a), q)); };
  // вращение — вокруг вертикали (как на витрине), с лёгким покачиванием
  const frame = (t) => {
    raf = 0;
    if (!canvas.isConnected) return;
    const dt = Math.min(50, lastT ? t - lastT : 16);
    lastT = t;
    if (!drag) {
      if (Math.abs(vx) + Math.abs(vy) > 1e-4) { turn(vx * dt, vy * dt); vx *= 0.94; vy *= 0.94; }
      else if (spin && !still) q = norm4(qmul(qaxis(0, 1, 0, -0.00035 * dt), q));
    }
    draw();
    SAVED.set(key, q);
    if ((spin && !still) || drag || Math.abs(vx) + Math.abs(vy) > 1e-4) raf = requestAnimationFrame(frame);
  };
  const kick = () => { if (!raf) { lastT = 0; raf = requestAnimationFrame(frame); } };
  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, t: performance.now() }; moved = 0; vx = vy = 0;
    try { canvas.setPointerCapture(e.pointerId); } catch { /* */ }
    kick();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y, now = performance.now(), dt = Math.max(1, now - drag.t);
    const k = 3 / Math.max(60, Math.min(canvas.clientWidth, canvas.clientHeight));
    turn(dx * k, dy * k); vx = (dx * k) / dt; vy = (dy * k) / dt;
    moved += Math.abs(dx) + Math.abs(dy);
    Object.assign(drag, { x: e.clientX, y: e.clientY, t: now });
  });
  const up = () => { if (!drag) return; drag = null; kick(); };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  // покрутили — это не нажатие: кнопка вокруг (шторка лиги) не открывается
  canvas.addEventListener('click', (e) => { if (moved >= 8) { e.stopPropagation(); e.preventDefault(); } moved = 0; });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') kick(); });
  kick();
  return { redraw: draw };
}

// Холст под камень лиги (оживляет mountGems): size — px, spin — вращаться самому
export const gemCanvas = (gem, frac, size, label = '', spin = true) => '<canvas class="gem3d" data-gem3d="' + gem + '" data-frac="' + (+frac || 0).toFixed(3) + '"' + (spin ? '' : ' data-still') +
  ' style="width:' + size + 'px;height:' + size + 'px"' + (label ? ' role="img" aria-label="' + label.replace(/"/g, '&quot;') + '"' : ' aria-hidden="true"') + '></canvas>';
// Оживить холсты камней лиг в root; seed — зерно профиля (у каждого свои камни).
// Первая лига «Камень» — тот же камень, что в «Минимале» (src/ui/stone.js): его же форма, порода и вращение
export function mountGems(root, seed) {
  root.querySelectorAll('canvas[data-gem3d]:not([data-live])').forEach((c) => {
    c.dataset.live = '1';
    if (c.dataset.gem3d === 'stone') {
      stoneView(c, { seed, hours: 0, detail: 3, key: 'league', spin: !('still' in c.dataset) });
      // покрутили — не нажатие (кнопка вокруг не срабатывает)
      let x0 = 0, y0 = 0, mv = 0;
      c.addEventListener('pointerdown', (e) => { x0 = e.clientX; y0 = e.clientY; mv = 0; });
      c.addEventListener('pointermove', (e) => { mv = Math.max(mv, Math.hypot(e.clientX - x0, e.clientY - y0)); });
      c.addEventListener('click', (e) => { if (mv >= 8) { e.stopPropagation(); e.preventDefault(); } mv = 0; });
      return;
    }
    gemView(c, { gem: c.dataset.gem3d, seed, frac: +c.dataset.frac || 0, spin: !('still' in c.dataset) });
  });
}
