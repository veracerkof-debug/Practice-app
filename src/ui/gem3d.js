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
// разбросом величины и наклона граней. Рисуется попиксельно, в одной стилистике с нашим камнем (src/ui/stone.js):
// луч зрителя входит в кристалл через переднюю грань и выходит через заднюю — толщина на просвет даёт глубину цвета,
// задние грани — рисунок отражений внутри, у рёбер — мягкий блик кромки; на гранях — штриховка и шероховатость,
// внутри — облачка, фантом, «сад»; порода под щётками — та же фактура, что у камня. frac 0…1 — блеск сильнее.
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
function place(out, kind, r, { M, t = [0, 0, 0], sc = [1, 1, 1], mat, o, inc, phantom = 0 } = {}) {
  const pl = habit(kind, r, o), h = hull(pl);
  if (h.F.length < 4) return null;
  const base = out.V.length, tf = (p) => add(mul(M, [p[0] * sc[0], p[1] * sc[1], p[2] * sc[2]]), t);
  h.V.forEach((p) => out.V.push(tf(p)));
  const axis = mul(M, Y);
  h.F.forEach((f) => out.F.push({ v: f.v.map((i) => i + base), n: norm(mul(M, [f.n[0] / sc[0], f.n[1] / sc[1], f.n[2] / sc[2]])), deco: f.deco, m: mat, axis, a: r() }));
  // часть для попиксельной отрисовки: плоскости граней в общих координатах (масштаб, поворот, сдвиг)
  const planes = pl.map((q) => {
    const n1 = [q.n[0] / sc[0], q.n[1] / sc[1], q.n[2] / sc[2]], len = Math.hypot(...n1), n2 = mul(M, n1.map((x) => x / len));
    return { n: n2, d: q.d / len + dot(n2, t), deco: q.deco, fp: null, k: r() };
  });
  const c = h.V.reduce((acc, p) => add(acc, tf(p), 1 / h.V.length), [0, 0, 0]);
  // точка удара раковистого скола — у края грани (для обсидиана)
  planes.forEach((q) => { const off = norm(cross(q.n, [r() - 0.5, r() - 0.5, r() - 0.5])); q.fp = add(add(c, q.n, q.d - dot(q.n, c)), off, 0.5 + r() * 0.4); });
  out.parts.push({ planes, mat, axis, c, from: base, to: out.V.length, phantom, seed: Math.floor(r() * 1e9) });
  // включения: отрезки внутри кристалла (в его координатах — по описанию inc)
  if (inc) inc(r, h).forEach((sg) => out.L.push({ a: tf(sg.a), b: tf(sg.b), c: sg.c, w: sg.w, al: sg.al }));
  return { tf, axis };
}

// Иглы внутри: рутил в кварце, шёлк корунда, вуаль топаза («сад» и фантом рисуются попиксельно)
const INC = {
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
  const r = rng((seed ^ strHash(gem)) >>> 0), out = { V: [], F: [], L: [], parts: [] }, mat = MAT[gem] || MAT.stone, I = orient(Y, 0);
  const lean = (a) => [(r() * 2 - 1) * a, 1, (r() * 2 - 1) * a];
  if (gem === 'quartz') {
    // щётка: главный кристалл и 2–4 меньших, наклонены в стороны; основания утоплены в породу
    place(out, 'matrix', r, { M: orient(Y, r() * 6.3), t: [0, -0.62, 0], sc: [0.72, 0.24, 0.55], mat: MAT.matrix });
    place(out, 'quartz', r, { M: orient(lean(0.15), r() * 6.3), t: [0, -0.55, 0], mat, o: { R: 0.36, L: 1.05 }, phantom: 0.62, inc: (rr, h) => (rr() < 0.5 ? INC.needles(4, '214,170,80', 0.5, 0.5)(rr, h) : []) });
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
  // части — тем же преобразованием: отражение по y, сдвиг к центру, масштаб (у плоскости: n·p ≤ d)
  out.parts.forEach((pt) => {
    const tr = (p) => add(flip(p), c, -1).map((x) => x / m);
    pt.planes.forEach((q) => { q.n = flip(q.n); q.d = (q.d - dot(q.n, c)) / m; q.fp = tr(q.fp); });
    pt.axis = flip(pt.axis); pt.c = tr(pt.c);
    pt.r = Math.max(...out.V.slice(pt.from, pt.to).map((p) => Math.hypot(p[0] - pt.c[0], p[1] - pt.c[1], p[2] - pt.c[2]))) * 1.02;
    // фантом — тот же кристалл, уменьшенный к своему центру
    if (pt.phantom) pt.planes.forEach((q) => { q.dph = dot(q.n, pt.c) + (q.d - dot(q.n, pt.c)) * pt.phantom; });
  });
  out.gem = gem;
  MESH.set(key, out);
  return out;
}

/* ---------- материалы ---------- */
// Прозрачные: tint — цвет на просвет (0…1), dens — насыщенность цвета с толщиной (закон Бугера), clear — прозрачность,
// cloud — молочные облачка внутри, zone — зональность (аметист к вершинам гуще), band — полосы роста (сапфир),
// frost — шероховатость поверхности (природный алмаз), fire — дисперсия. Непрозрачные (opaque): rock — порода как у
// нашего камня (src/ui/stone.js), glass — обсидиан (чёрное стекло, раковистые волны, радужный отлив).
const MAT = {
  stone: { opaque: 'rock', alb: [0.56, 0.54, 0.51] },
  matrix: { opaque: 'rock', alb: [0.5, 0.47, 0.43] },
  quartz: { tint: [0.96, 0.98, 1], dens: 0.12, clear: 0.78, cloud: 0.55, base: 0.5 },
  amethyst: { tint: [0.6, 0.3, 0.86], dens: 1.15, clear: 0.55, cloud: 0.25, zone: true, base: 0.4 },
  topaz: { tint: [1, 0.72, 0.22], dens: 0.7, clear: 0.6, cloud: 0.1 },
  emerald: { tint: [0.16, 0.72, 0.4], dens: 1.25, clear: 0.42, cloud: 0.4, garden: true },
  sapphire: { tint: [0.14, 0.28, 0.92], dens: 1.35, clear: 0.42, cloud: 0.2, band: true },
  ruby: { tint: [0.95, 0.08, 0.24], dens: 1.3, clear: 0.42, cloud: 0.22, glow: true },
  diamond: { tint: [0.97, 0.98, 1], dens: 0.04, clear: 0.62, cloud: 0.04, frost: 0.05, fire: true },
  obsidian: { opaque: 'glass', alb: [0.03, 0.028, 0.035] },
};

/* ---------- шум (как узор породы у камня) ---------- */
// табличный шум: без синусов — в 5–6 раз быстрее (каждый кадр считается попиксельно)
const PERM = new Uint8Array(512), RV = new Float32Array(256);
{ const r = rng(918273); const p = Array.from({ length: 256 }, (_, i) => i); for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; } for (let i = 0; i < 512; i++) PERM[i] = p[i & 255]; for (let i = 0; i < 256; i++) RV[i] = r(); }
const hash3 = (x, y, z) => RV[PERM[PERM[PERM[x & 255] + (y & 255)] + (z & 255)]];
function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const a0 = hash3(xi, yi, zi), a1 = hash3(xi + 1, yi, zi), a2 = hash3(xi, yi + 1, zi), a3 = hash3(xi + 1, yi + 1, zi);
  const b0 = hash3(xi, yi, zi + 1), b1 = hash3(xi + 1, yi, zi + 1), b2 = hash3(xi, yi + 1, zi + 1), b3 = hash3(xi + 1, yi + 1, zi + 1);
  const c0 = a0 + (a1 - a0) * u, c1 = a2 + (a3 - a2) * u, c2 = b0 + (b1 - b0) * u, c3 = b2 + (b3 - b2) * u;
  const d0 = c0 + (c1 - c0) * v, d1 = c2 + (c3 - c2) * v;
  return d0 + (d1 - d0) * w;
}
const fbm = (x, y, z) => vnoise(x, y, z) * 0.55 + vnoise(x * 2.1, y * 2.1, z * 2.1) * 0.3 + vnoise(x * 4.3, y * 4.3, z * 4.3) * 0.15;
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function qmat(q) {
  const [w, x, y, z] = q;
  return [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y), 2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x),
    2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)];
}

// Свет (экран: y вниз, зритель — со стороны +z): главный сверху-слева, заполняющий справа, контровой снизу-сзади
const L0 = norm([-0.5, -0.75, 0.55]), L1 = norm([0.75, -0.25, 0.5]), L2 = norm([0.2, 0.7, 0.45]);
const H0 = norm([L0[0], L0[1], L0[2] + 1]), H1 = norm([L1[0], L1[1], L1[2] + 1]), H2 = norm([L2[0], L2[1], L2[2] + 1]);
const LIN = norm([0.45, -0.55, -0.7]); // свет внутри камня — входит сверху и отражается от задних граней

/* ---------- попиксельная отрисовка ---------- */
// Каждый кристалл — выпуклый многогранник: луч зрителя входит через переднюю грань и выходит через заднюю.
// Отсюда всё «как в природе»: толщина на просвет даёт глубину цвета (тонкий край светлее, толща — гуще),
// задняя грань — рисунок отражений внутри, близость ребра — мягкий блик кромки, фантом и облачка — внутри.
let OFF = null;
export function paintGem(ctx, mesh, q, cx, cy, s, { frac = 0, dark = false, mono = false, shadow = true, res = 1.25 } = {}) {
  const M = qmat(q), f01 = Math.max(0, Math.min(1, frac));
  if (shadow) {
    ctx.fillStyle = dark ? 'rgba(0,0,0,.45)' : 'rgba(0,0,0,.12)';
    ctx.beginPath(); ctx.ellipse(cx, cy + s * 1.0, s * 0.68, s * 0.08, 0, 0, Math.PI * 2); ctx.fill();
  }
  // части в координатах экрана
  const parts = mesh.parts.map((pt) => {
    const n = pt.planes.length, NX = new Float64Array(n), NY = new Float64Array(n), NZ = new Float64Array(n), D = new Float64Array(n), DP = pt.phantom ? new Float64Array(n) : null;
    pt.planes.forEach((pl, i) => { const v = mul(M, pl.n); NX[i] = v[0]; NY[i] = v[1]; NZ[i] = v[2]; D[i] = pl.d; if (DP) DP[i] = pl.dph; });
    const c = mul(M, pt.c);
    return { pt, n, NX, NY, NZ, D, DP, cx: c[0], cy: c[1], r2: pt.r * pt.r, m: pt.mat || MAT.stone, ax: mul(M, pt.axis) };
  });
  const tf = ctx.getTransform ? ctx.getTransform() : { a: 1, e: 0, f: 0 }, K0 = tf.a || 1, k = Math.min(K0, res), up = K0 / k;
  const bx = Math.floor(tf.e + K0 * (cx - s * 1.05)), by = Math.floor(tf.f + K0 * (cy - s * 1.05)), W = Math.ceil(k * s * 2.1) + 2, H = W;
  if (typeof document === 'undefined') return;
  if (!OFF) OFF = document.createElement('canvas');
  if (OFF.width < W || OFF.height < H) { OFF.width = Math.max(W, OFF.width); OFF.height = Math.max(H, OFF.height); }
  const o = OFF.getContext('2d'), img = o.createImageData(W, H), DA = img.data;
  const R1 = {}, R2 = {}, R3 = {}; // записи попаданий (без новых объектов на каждый пиксель)
  const hit = (P, X, Y, rec) => {
    let zf = Infinity, z2 = Infinity, zb = -Infinity, zb2 = -Infinity, fi = -1, fj = -1, bi = -1;
    for (let i = 0; i < P.n; i++) {
      const nz = P.NZ[i], val = P.D[i] - P.NX[i] * X - P.NY[i] * Y;
      if (nz > 1e-7) { const z = val / nz; if (z < zf) { z2 = zf; fj = fi; zf = z; fi = i; } else if (z < z2) { z2 = z; fj = i; } }
      else if (nz < -1e-7) { const z = val / nz; if (z > zb) { zb2 = zb; zb = z; bi = i; } else if (z > zb2) zb2 = z; }
      else if (val < 0) return null;
    }
    if (!(zf > zb)) return null;
    rec.P = P; rec.zf = zf; rec.zb = zb; rec.fi = fi; rec.fj = fj; rec.bi = bi; rec.gap = z2 - zf; rec.gapb = zb - zb2;
    return rec;
  };
  // фантом: тот же луч через уменьшенный кристалл — тонкая плёнка и светлые рёбра внутри
  const phantomAt = (P, X, Y) => {
    let zf = Infinity, z2 = Infinity, zb = -Infinity;
    for (let i = 0; i < P.n; i++) {
      const nz = P.NZ[i], val = P.DP[i] - P.NX[i] * X - P.NY[i] * Y;
      if (nz > 1e-7) { const z = val / nz; if (z < zf) { z2 = zf; zf = z; } else if (z < z2) z2 = z; }
      else if (nz < -1e-7) { const z = val / nz; if (z > zb) zb = z; }
      else if (val < 0) return 0;
    }
    return zf > zb ? 0.07 + 0.35 * Math.exp(-(z2 - zf) / 0.018) : 0;
  };
  const sparks = [], PO = [0, 0, 0], MID = [0, 0, 0];
  const shade = (h, X, Y, out) => {
    const P = h.P, m = P.m;
    // нормаль передней грани; у ребра — мягко к соседней (кромки не бритвенные — как у природного кристалла)
    let nx = P.NX[h.fi], ny = P.NY[h.fi], nz = P.NZ[h.fi];
    const ew = 0.022, edge = h.fj >= 0 ? Math.exp(-h.gap / ew) : 0;
    if (edge > 0.01) { nx += P.NX[h.fj] * edge * 0.5; ny += P.NY[h.fj] * edge * 0.5; nz += P.NZ[h.fj] * edge * 0.5; }
    const zz = h.zf, po0 = M[0] * X + M[3] * Y + M[6] * zz, po1 = M[1] * X + M[4] * Y + M[7] * zz, po2 = M[2] * X + M[5] * Y + M[8] * zz, po = PO;
    po[0] = po0; po[1] = po1; po[2] = po2;
    const pl = P.pt.planes[h.fi];
    // фактура поверхности: штриховка граней, шероховатость, раковистые волны
    if (pl.deco && pl.deco.type === 'striae') {
      const a = P.pt.axis, ph = (po[0] * a[0] + po[1] * a[1] + po[2] * a[2]) * (pl.deco.along ? 70 : 0) + (pl.deco.along ? 0 : (po[0] + po[2]) * 60);
      const amp = 0.04 * Math.sin(ph + vnoise(po[0] * 9, po[1] * 9, po[2] * 9) * 3);
      nx += P.ax[0] * amp; ny += P.ax[1] * amp; nz += P.ax[2] * amp;
    }
    const fr = (m.frost || 0.025) * (pl.deco && pl.deco.type === 'trigons' ? 1.3 : 1);
    const b1 = vnoise(po[0] * 40 + pl.k * 9, po[1] * 40, po[2] * 40) - 0.5, b2 = vnoise(po[0] * 40, po[1] * 40 + 5, po[2] * 40 + pl.k * 9) - 0.5;
    nx += b1 * fr; ny += b2 * fr;
    if (m.opaque === 'glass') { // обсидиан: концентрические волны раковистого скола от точки удара
      const fp = pl.fp, dx = po[0] - fp[0], dy = po[1] - fp[1], dz = po[2] - fp[2], dd = Math.hypot(dx, dy, dz) || 1, rip = Math.sin(dd * (14 + 6 * pl.k) + vnoise(po[0] * 3, po[1] * 3, po[2] * 3) * 8) * 0.018 * smooth(0.1, 0.6, dd);
      const rd = mul(M, [dx / dd, dy / dd, dz / dd]);
      nx += rd[0] * rip; ny += rd[1] * rip; nz += rd[2] * rip;
    }
    const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
    const lam = Math.max(0, nx * L0[0] + ny * L0[1] + nz * L0[2]) * 0.85 + Math.max(0, nx * L1[0] + ny * L1[1] + nz * L1[2]) * 0.3;
    const sp = (Hh, e) => Math.pow(Math.max(0, nx * Hh[0] + ny * Hh[1] + nz * Hh[2]), e);
    const fres = 0.04 + 0.96 * Math.pow(1 - Math.max(0, nz), 5);
    // отражение «неба»: сверху светлее (отражённый вектор смотрит вверх — y < 0)
    const ry = 2 * nz * ny, env = 0.35 + 0.65 * Math.max(0, Math.min(1, -ry * 0.8 + 0.3));
    const thick = h.zf - h.zb, cover = smooth(0, 0.02, thick); // у силуэта толщина → 0: мягкий край без «лесенки»
    let r, g, b, a;
    if (m.opaque) {
      if (m.opaque === 'rock') {
        // порода как у нашего камня: пятна, зерно, крап, светлые жилки
        const mo = fbm(po[0] * 3 + 7, po[1] * 3, po[2] * 3), gr = vnoise(po[0] * 28, po[1] * 28, po[2] * 28), hs = hash3(Math.floor(po[0] * 90), Math.floor(po[1] * 90), Math.floor(po[2] * 90));
        const vein = Math.exp(-Math.pow((po[0] * 0.6 + po[1] * 0.8 + po[2] * 0.3 - 0.1 + (mo - 0.5) * 0.3) / 0.03, 2)) * 0.25;
        const alb = 0.72 + (mo - 0.5) * 0.5 + (gr - 0.5) * 0.18 + (hs < 0.08 ? -0.3 : hs > 0.95 ? 0.22 : 0) + vein;
        const li = 0.16 + 0.95 * lam, spc = (sp(H0, 18) + sp(H1, 18) * 0.5) * 0.12;
        r = m.alb[0] * alb * li + spc; g = m.alb[1] * alb * li + spc; b = m.alb[2] * alb * li + spc;
      } else {
        // чёрное стекло: почти всё — отражение (блики, небо по Френелю), радужный отлив в толще у поверхности
        const spc = sp(H0, 90) * 1.4 + sp(H1, 60) * 0.5 + sp(H2, 40) * 0.2, rf = 0.05 + fres * 0.32;
        const sh = fbm(po[0] * 2.2, po[1] * 5, po[2] * 2.2), rb = Math.max(0, Math.sin(sh * 9)) * 0.06 * lam * (0.6 + 0.6 * f01);
        r = m.alb[0] + env * rf * 0.6 + spc + rb * 0.4; g = m.alb[1] + env * rf * 0.62 + spc + rb * 0.9; b = m.alb[2] + env * rf * 0.7 + spc + rb;
        if (spc > 0.9) sparks.push([X, Y, spc]);
      }
      a = cover;
    } else {
      // прозрачный кристалл. Толщина и середина луча — в координатах камня
      const zm = (h.zf + h.zb) / 2, mid = MID;
      mid[0] = M[0] * X + M[3] * Y + M[6] * zm; mid[1] = M[1] * X + M[4] * Y + M[7] * zm; mid[2] = M[2] * X + M[5] * Y + M[8] * zm;
      let dens = m.dens * (0.85 + 0.3 * f01);
      if (m.zone) dens *= 0.35 + 1.25 * smooth(-0.6, 0.5, -mid[1]); // аметист: у основания почти бесцветный, к вершинам гуще
      if (m.band) dens *= 0.75 + 0.5 * (0.5 + 0.5 * Math.sin((mid[0] * P.pt.axis[0] + mid[1] * P.pt.axis[1] + mid[2] * P.pt.axis[2]) * 26)); // полосы роста
      if (m.base) dens *= 1; // кварц: цвет не меняется
      const Tr = Math.exp(-(-Math.log(m.tint[0])) * thick * dens * 2.2), Tg = Math.exp(-(-Math.log(m.tint[1])) * thick * dens * 2.2), Tb = Math.exp(-(-Math.log(m.tint[2])) * thick * dens * 2.2);
      // рисунок отражений внутри — по задней грани (её ребра тоже видны насквозь)
      const bx2 = P.NX[h.bi], by2 = P.NY[h.bi], bz2 = P.NZ[h.bi];
      const inner = 0.42 + 0.85 * Math.pow(Math.max(0, -(bx2 * LIN[0] + by2 * LIN[1] + bz2 * LIN[2])), 2) + 0.25 * Math.exp(-h.gapb / 0.02);
      let ir = inner * Tr, ig = inner * Tg, ib = inner * Tb;
      if (m.fire) { // огонь алмаза: задние грани под светом — в цвета радуги
        const fl = Math.pow(Math.max(0, -(bx2 * LIN[0] + by2 * LIN[1] + bz2 * LIN[2])), 6) * (0.5 + 0.6 * f01), hue = (bx2 * 2.1 + by2 * 3.3 + 7) * 2.4;
        ir += fl * (0.5 + 0.5 * Math.sin(hue)); ig += fl * (0.5 + 0.5 * Math.sin(hue + 2.1)); ib += fl * (0.5 + 0.5 * Math.sin(hue + 4.2));
      }
      if (m.glow) { ir += 0.12 * lam; } // рубин светится красным (флуоресценция)
      // облачка (молочные включения), «сад» изумруда — внутри, по середине луча
      const cl = fbm(mid[0] * 3.3 + P.pt.seed % 97, mid[1] * 3.3, mid[2] * 3.3), cloud = smooth(0.55, 0.85, cl) * m.cloud * Math.min(1, thick * 1.4);
      let gard = 0;
      if (m.garden) gard = smooth(0.62, 0.8, fbm(mid[0] * 7 + 3, mid[1] * 7, mid[2] * 7)) * 0.55 * Math.min(1, thick * 2);
      const ph = P.DP ? phantomAt(P, X, Y) : 0;
      const spc = sp(H0, 220) * 0.95 + sp(H1, 140) * 0.45 + sp(H2, 90) * 0.2; // узкие блики: грань вспыхивает пятнами, а не вся
      const rim = 0.32 * edge * (0.6 + 0.5 * lam); // кромка ловит свет
      const refl = fres * env * 0.55 + 0.08 * lam;
      r = ir * (1 - gard) + cloud * 0.85 + ph * 0.9 + refl + spc + rim;
      g = ig * (1 - gard * 0.6) + cloud * 0.86 + ph * 0.9 + refl + spc + rim;
      b = ib * (1 - gard) + cloud * 0.9 + ph * 0.92 + refl + spc + rim;
      // сквозь прозрачное видно фон — меньше там, где камень густой, в бликах и облачках
      const meanT = (Tr + Tg + Tb) / 3;
      a = Math.min(1, (1 - m.clear * meanT * (1 - fres)) + cloud + spc * 0.8 + rim * 0.6 + ph * 0.4) * cover;
      a = Math.max(a, 0.32 * cover);
      if (spc > 1.1 && thick > 0.05) sparks.push([X, Y, spc]);
    }
    if (mono) { const yv = r * 0.3 + g * 0.59 + b * 0.11; r = g = b = yv; }
    out[0] = r; out[1] = g; out[2] = b; out[3] = a;
  };
  const c1 = [0, 0, 0, 0], c2 = [0, 0, 0, 0];
  for (let py = 0; py < H; py++) {
    const Y = ((by + (py + 0.5) * up - tf.f) / K0 - cy) / s;
    for (let px = 0; px < W; px++) {
      const X = ((bx + (px + 0.5) * up - tf.e) / K0 - cx) / s;
      if (X * X + Y * Y > 1.1) continue;
      // два ближайших попадания: R1 — ближайшее, R2 — следующее (поля копируются, без новых объектов)
      let n1 = false, n2 = false;
      for (let j = 0; j < parts.length; j++) {
        const P = parts[j], dx = X - P.cx, dy = Y - P.cy;
        if (dx * dx + dy * dy > P.r2) continue;
        if (!hit(P, X, Y, R3)) continue;
        if (!n1 || R3.zf > R1.zf) { if (n1) { Object.assign(R2, R1); n2 = true; } Object.assign(R1, R3); n1 = true; }
        else if (!n2 || R3.zf > R2.zf) { Object.assign(R2, R3); n2 = true; }
      }
      const h1 = n1 ? R1 : null, h2 = n2 ? R2 : null;
      if (!h1) continue;
      shade(h1, X, Y, c1);
      let r = c1[0], g = c1[1], b = c1[2], a = c1[3];
      // за прозрачным — следующий кристалл или порода
      if (a < 0.98 && h2) {
        shade(h2, X, Y, c2);
        const a2 = c2[3] * (1 - a);
        r = (r * a + c2[0] * a2) / Math.max(1e-6, a + a2); g = (g * a + c2[1] * a2) / Math.max(1e-6, a + a2); b = (b * a + c2[2] * a2) / Math.max(1e-6, a + a2);
        a += a2;
      }
      const q4 = (py * W + px) * 4;
      DA[q4] = Math.min(255, r * 255); DA[q4 + 1] = Math.min(255, g * 255); DA[q4 + 2] = Math.min(255, b * 255); DA[q4 + 3] = Math.min(255, a * 255);
    }
  }
  o.clearRect(0, 0, W, H);
  o.putImageData(img, 0, 0);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(OFF, 0, 0, W, H, bx, by, W * up, H * up);
  ctx.restore();
  // иглы внутри (рутил, шёлк) — тонкими линиями
  if (s > 34) mesh.L.forEach((ln) => {
    const A = mul(M, ln.a), B = mul(M, ln.b);
    ctx.beginPath(); ctx.moveTo(cx + A[0] * s, cy + A[1] * s); ctx.lineTo(cx + B[0] * s, cy + B[1] * s);
    ctx.strokeStyle = 'rgba(' + (mono ? '255,255,255' : ln.c) + ',' + (ln.al * 0.7).toFixed(2) + ')';
    ctx.lineWidth = Math.max(0.4, s * 0.005 * ln.w); ctx.lineCap = 'round'; ctx.stroke();
  });
  // искры: самые яркие блики, не ближе друг к другу
  sparks.sort((p1, p2) => p2[2] - p1[2]);
  const picked = [];
  sparks.forEach((sk) => { if (picked.length < 3 && picked.every((p0) => Math.hypot(p0[0] - sk[0], p0[1] - sk[1]) > 0.35)) picked.push(sk); });
  picked.forEach(([x, y, k2]) => {
    const px = cx + x * s, py = cy + y * s, rr = s * (0.06 + 0.05 * Math.min(1, k2 - 0.8)) * (0.7 + 0.5 * f01);
    ctx.fillStyle = 'rgba(255,255,255,.9)';
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
  let vx = 0, vy = 0, drag = null, raf = 0, lastT = 0, moved = 0, acc = 99;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const draw = () => {
    const dpr = Math.min(2.5, window.devicePixelRatio || 1), W = canvas.clientWidth, H = canvas.clientHeight;
    if (!W || !H) return;
    if (canvas.width !== Math.round(W * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    paintGem(ctx, mesh, q, W / 2, H / 2 - Math.min(W, H) * 0.03, Math.min(W, H) * 0.4, { frac, dark: isDark(), mono: document.documentElement.dataset.style === 'mono', res: W > 80 ? 1 : 1.5 });
  };
  const turn = (dx, dy) => { const a = Math.hypot(dx, dy); if (a > 1e-5) q = norm4(qmul(qaxis(dy / a, -dx / a, 0, a), q)); };
  // вращение — вокруг вертикали (как на витрине), с лёгким покачиванием
  const frame = (t) => {
    raf = 0;
    if (!canvas.isConnected) return;
    const dt = Math.min(50, lastT ? t - lastT : 16);
    lastT = t;
    let auto = false;
    if (!drag) {
      if (Math.abs(vx) + Math.abs(vy) > 1e-4) { turn(vx * dt, vy * dt); vx *= 0.94; vy *= 0.94; }
      else if (spin && !still) { q = norm4(qmul(qaxis(0, 1, 0, -0.00025 * dt), q)); auto = true; }
    }
    // само вращается медленно — 14–25 кадров в секунду хватает (каждый кадр считается попиксельно)
    acc += dt;
    if (!auto || acc >= (canvas.clientWidth > 80 ? 70 : 40)) { acc = 0; draw(); }
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
