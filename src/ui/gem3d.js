// Лиги в 3D: каждый камень — объёмный кристалл на холсте, как камень «Минимала»: сам медленно вращается, тянется
// пальцем, положение запоминается. Форма — природная (не огранка): у каждого своя, по зерну профиля и лиге.
//   stone    — обломок породы (сколы, серый, с крапом);
//   quartz   — шестигранный кристалл горного хрусталя с острой головкой, прозрачный;
//   amethyst — такой же, короче и толще, фиолетовый, к вершине темнее;
//   topaz    — ромбическая призма с пирамидкой и площадкой, золотистый;
//   emerald  — шестигранная призма берилла с плоской вершиной, зелёный;
//   sapphire — «бочонок» корунда (крутая двойная пирамида со срезами), синий;
//   ruby     — плоская шестигранная таблетка корунда, красный;
//   diamond  — октаэдр алмаза со слегка скруглёнными рёбрами, бесцветный, с «огнём»;
//   obsidian — обломок вулканического стекла с раковистыми сколами, чёрный, с радужным отливом.
// Форма строится как выпуклый многогранник — пересечение плоскостей граней (габитус кристалла), каждая плоскость
// чуть сдвинута и наклонена случайно, но естественно (как у настоящих кристаллов: грани разной величины).
// Рисуется без библиотек: грани-многоугольники с прозрачностью (задние грани видны сквозь камень), блики от трёх
// источников света — грани вспыхивают при вращении. frac 0…1 — путь до следующей лиги: блеск сильнее.
import { qmul, qaxis, stoneView } from './stone.js';

const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const strHash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

/* ---------- габитус: плоскости граней ---------- */
// плоскость: { n — нормаль, d — расстояние от центра }
const P = (n, d) => ({ n: norm(n), d });
const ring = (k, f) => Array.from({ length: k }, (_, i) => f((i * 2 * Math.PI) / k, i));

function habit(gem, r) {
  const j = (x, a = 0.12) => x * (1 + (r() * 2 - 1) * a); // естественный разброс величины граней
  const tilt = (n, a = 0.06) => [n[0] + (r() * 2 - 1) * a, n[1] + (r() * 2 - 1) * a, n[2] + (r() * 2 - 1) * a];
  const rot = r() * Math.PI; // поворот кристалла вокруг оси
  switch (gem) {
    case 'quartz': case 'amethyst': {
      const am = gem === 'amethyst', R = am ? 0.48 : 0.42, top = am ? 0.62 : 0.95, steep = 0.62;
      return [
        ...ring(6, (a) => P(tilt([Math.cos(a + rot), 0, Math.sin(a + rot)]), j(R))),
        // головка: шесть ромбоэдрических граней, большие и малые чередуются
        ...ring(6, (a, i) => { const n = norm([Math.cos(a + rot), steep, Math.sin(a + rot)]); return P(tilt(n, 0.05), n[1] * j(top + R / steep, i % 2 ? 0.04 : 0.1)); }),
        P(tilt([0, -1, 0], 0.35), j(am ? 0.55 : 0.75, 0.1)), // скол основания (кристалл отломан от друзы)
      ];
    }
    case 'topaz': {
      const pr = ring(4, (a) => P(tilt([Math.cos(a + Math.PI / 4 + rot) * 1.0, 0, Math.sin(a + Math.PI / 4 + rot) * 0.7]), j(0.48)));
      const pin = ring(2, (a) => P(tilt([Math.cos(a + rot), 0, Math.sin(a + rot)]), j(0.5)));
      return [...pr, ...pin, ...ring(4, (a) => { const n = norm([Math.cos(a + Math.PI / 4 + rot), 1.1, Math.sin(a + Math.PI / 4 + rot)]); return P(tilt(n), n[1] * j(1.05)); }),
        P(tilt([0, 1, 0], 0.08), j(0.72)), P(tilt([0, -1, 0], 0.3), j(0.6))];
    }
    case 'emerald': {
      const R = 0.42;
      return [...ring(6, (a) => P(tilt([Math.cos(a + rot), 0, Math.sin(a + rot)], 0.04), j(R, 0.08))),
        P(tilt([0, 1, 0], 0.05), j(0.78, 0.06)), P(tilt([0, -1, 0], 0.25), j(0.72)),
        // узкие фаски у вершины
        ...ring(6, (a) => { const n = norm([Math.cos(a + rot), 1.3, Math.sin(a + rot)]); return P(n, n[1] * j(0.78 + R / 1.3 * 0.8, 0.05)); })];
    }
    case 'sapphire': {
      return [...ring(6, (a) => { const n = norm([Math.cos(a + rot), 0.28, Math.sin(a + rot)]); return P(tilt(n, 0.04), j(0.5, 0.08)); }),
        ...ring(6, (a) => { const n = norm([Math.cos(a + rot), -0.28, Math.sin(a + rot)]); return P(tilt(n, 0.04), j(0.5, 0.08)); }),
        P(tilt([0, 1, 0], 0.06), j(0.8, 0.08)), P(tilt([0, -1, 0], 0.06), j(0.8, 0.08))];
    }
    case 'ruby': {
      return [...ring(6, (a) => P(tilt([Math.cos(a + rot), 0, Math.sin(a + rot)], 0.04), j(0.66, 0.08))),
        P(tilt([0, 1, 0], 0.04), j(0.32, 0.1)), P(tilt([0, -1, 0], 0.04), j(0.32, 0.1)),
        ...ring(3, (a) => { const n = norm([Math.cos(a + rot), 1.2, Math.sin(a + rot)]); return P(n, n[1] * j(0.32 + 0.66 / 1.2 * 0.75, 0.06)); }),
        ...ring(3, (a) => { const n = norm([Math.cos(a + rot + Math.PI / 3), -1.2, Math.sin(a + rot + Math.PI / 3)]); return P(n, -n[1] * j(0.32 + 0.66 / 1.2 * 0.75, 0.06)); })];
    }
    case 'diamond': {
      const oct = [];
      for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) oct.push(P(tilt([x, y, z], 0.08), j(0.62, 0.07)));
      // скругление рёбер — грани ромбододекаэдра чуть внутри
      const dod = [[1, 1, 0], [1, -1, 0], [-1, 1, 0], [-1, -1, 0], [1, 0, 1], [1, 0, -1], [-1, 0, 1], [-1, 0, -1], [0, 1, 1], [0, 1, -1], [0, -1, 1], [0, -1, -1]];
      return [...oct, ...dod.map((n) => P(tilt(n, 0.05), j(0.7, 0.04)))];
    }
    case 'obsidian': default: {
      // обломок: случайные сколы (раковистые — много мелких граней), как камень «Минимала»
      const n = gem === 'stone' ? 13 + Math.floor(r() * 5) : 18 + Math.floor(r() * 6);
      return Array.from({ length: n }, () => P([r() * 2 - 1, (r() * 2 - 1) * 0.8, r() * 2 - 1], 0.55 + r() * 0.4));
    }
  }
}

/* ---------- многогранник из плоскостей ---------- */
// Вершины — пересечения троек плоскостей, лежащие внутри всех остальных; грани — вершины своей плоскости по кругу
function hull(planes) {
  const pts = [], EPS = 1e-6;
  const inside = (p) => planes.every((q) => dot(q.n, p) <= q.d + 1e-5);
  for (let a = 0; a < planes.length; a++) for (let b = a + 1; b < planes.length; b++) for (let c = b + 1; c < planes.length; c++) {
    const A = planes[a], B = planes[b], C = planes[c], bc = cross(B.n, C.n), det = dot(A.n, bc);
    if (Math.abs(det) < EPS) continue;
    const ca = cross(C.n, A.n), ab = cross(A.n, B.n);
    const p = [(A.d * bc[0] + B.d * ca[0] + C.d * ab[0]) / det, (A.d * bc[1] + B.d * ca[1] + C.d * ab[1]) / det, (A.d * bc[2] + B.d * ca[2] + C.d * ab[2]) / det];
    if (Math.hypot(...p) < 4 && inside(p)) pts.push(p);
  }
  // склеить близкие точки
  const V = [];
  pts.forEach((p) => { if (!V.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) < 1e-4)) V.push(p); });
  const F = [];
  planes.forEach((pl) => {
    const idx = V.map((p, i) => [p, i]).filter(([p]) => Math.abs(dot(pl.n, p) - pl.d) < 1e-4).map(([, i]) => i);
    if (idx.length < 3) return;
    const c = idx.reduce((s, i) => [s[0] + V[i][0] / idx.length, s[1] + V[i][1] / idx.length, s[2] + V[i][2] / idx.length], [0, 0, 0]);
    const u = norm([V[idx[0]][0] - c[0], V[idx[0]][1] - c[1], V[idx[0]][2] - c[2]]), w = cross(pl.n, u);
    idx.sort((i, k) => Math.atan2(dot([V[i][0] - c[0], V[i][1] - c[1], V[i][2] - c[2]], w), dot([V[i][0] - c[0], V[i][1] - c[1], V[i][2] - c[2]], u)) -
      Math.atan2(dot([V[k][0] - c[0], V[k][1] - c[1], V[k][2] - c[2]], w), dot([V[k][0] - c[0], V[k][1] - c[1], V[k][2] - c[2]], u)));
    F.push({ v: idx, n: pl.n });
  });
  return { V, F };
}

// Камень лиги: id, seed (зерно профиля) → { V, F, m — материал }; одинаковое зерно — тот же камень
const MESH = new Map();
export function gemMesh(gem, seed) {
  const key = gem + ':' + seed;
  if (MESH.has(key)) return MESH.get(key);
  const r = rng((seed ^ strHash(gem)) >>> 0);
  let mesh = hull(habit(gem, r));
  if (mesh.F.length < 4) mesh = hull(habit('stone', rng(7))); // на всякий случай — простой обломок
  // центр и масштаб: камень вписан в единичную сферу
  const c = mesh.V.reduce((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + p[2]], [0, 0, 0]).map((x) => x / mesh.V.length);
  mesh.V = mesh.V.map((p) => [p[0] - c[0], p[1] - c[1], p[2] - c[2]]);
  const m = Math.max(...mesh.V.map((p) => Math.hypot(...p)));
  mesh.V = mesh.V.map((p) => p.map((x) => x / m));
  // светлота граней — у обломков пятнами (порода), у кристаллов — чуть разная (включения, зонарность)
  mesh.F.forEach((f) => { f.a = r(); f.y = f.v.reduce((s, i) => s + mesh.V[i][1], 0) / f.v.length; });
  mesh.m = MAT[gem] || MAT.stone;
  mesh.gem = gem;
  MESH.set(key, mesh);
  return mesh;
}

/* ---------- материалы ---------- */
// h, s, l — цвет тела; clear — прозрачность (1 — непрозрачный), shine — блеск, fire — радужные вспышки
const MAT = {
  stone: { h: 30, s: 6, l: 52, clear: 1, shine: 0.25, speck: true },
  quartz: { h: 200, s: 12, l: 86, clear: 0.42, shine: 1 },
  amethyst: { h: 278, s: 58, l: 52, clear: 0.62, shine: 0.9, zone: true },
  topaz: { h: 38, s: 88, l: 58, clear: 0.6, shine: 0.95 },
  emerald: { h: 150, s: 62, l: 40, clear: 0.72, shine: 0.85 },
  sapphire: { h: 222, s: 74, l: 42, clear: 0.72, shine: 1 },
  ruby: { h: 348, s: 74, l: 44, clear: 0.72, shine: 1 },
  diamond: { h: 205, s: 8, l: 88, clear: 0.38, shine: 1.25, fire: true },
  obsidian: { h: 255, s: 14, l: 9, clear: 1, shine: 1.1, sheen: true },
};
const LIGHTS = [norm([-0.5, -0.75, 0.55]), norm([0.7, -0.3, 0.6]), norm([0.1, 0.8, 0.6])];
const HALF = LIGHTS.map((l) => norm([l[0], l[1], l[2] + 1]));
const hsl = (h, s, l, a) => 'hsla(' + ((h % 360) + 360) % 360 + ',' + Math.max(0, Math.min(100, s)).toFixed(1) + '%,' + Math.max(0, Math.min(100, l)).toFixed(1) + '%,' + a.toFixed(3) + ')';

function qmat(q) {
  const [w, x, y, z] = q;
  return [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y), 2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x),
    2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)];
}

// Нарисовать камень лиги: q — поворот, (cx, cy) — центр, s — радиус, frac — блеск, dark — тёмная тема, mono — оттенки серого
export function paintGem(ctx, mesh, q, cx, cy, s, { frac = 0, dark = false, mono = false, shadow = true } = {}) {
  const M = qmat(q), rot = (v) => [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]];
  const P2 = mesh.V.map(rot), m = mesh.m, f = Math.max(0, Math.min(1, frac));
  if (shadow) {
    ctx.fillStyle = dark ? 'rgba(0,0,0,.45)' : 'rgba(0,0,0,.12)';
    ctx.beginPath(); ctx.ellipse(cx, cy + s * 1.0, s * 0.62, s * 0.08, 0, 0, Math.PI * 2); ctx.fill();
  }
  const faces = mesh.F.map((fc) => {
    const n = rot(fc.n), z = fc.v.reduce((a, i) => a + P2[i][2], 0) / fc.v.length;
    return { fc, n, z };
  }).sort((a, b) => a.z - b.z);
  const path = (fc) => { ctx.beginPath(); fc.v.forEach((i, k) => { const p = P2[i]; if (k) ctx.lineTo(cx + p[0] * s, cy + p[1] * s); else ctx.moveTo(cx + p[0] * s, cy + p[1] * s); }); ctx.closePath(); };
  const sat = (x) => (mono ? 0 : x);
  // задние грани — сквозь прозрачный камень, глубже и темнее
  if (m.clear < 1) faces.forEach(({ fc, n }) => {
    if (n[2] > 0) return;
    path(fc);
    ctx.fillStyle = hsl(m.h, sat(m.s * 1.1), m.l * 0.55 + (m.fire ? 10 : 0), 0.55);
    ctx.fill();
  });
  const sparks = [];
  faces.forEach(({ fc, n }) => {
    if (n[2] <= 0) return;
    const lam = Math.max(0, dot(n, LIGHTS[0])) * 0.75 + Math.max(0, dot(n, LIGHTS[1])) * 0.25;
    // блик: от каждого источника — грань вспыхивает, когда встаёт «зеркалом» к свету
    let spec = 0;
    HALF.forEach((hv, k) => { spec += Math.pow(Math.max(0, dot(n, hv)), m.clear < 1 ? 40 : 24) * (k ? 0.6 : 1); });
    spec *= m.shine * (0.55 + 0.45 * f);
    let h = m.h, sa = m.s * (0.75 + 0.25 * f), l, a;
    if (m.clear < 1) {
      // прозрачный кристалл: грань «в лоб» — сквозь неё видно глубину (темнее и насыщеннее), к краю — светлее
      const face = n[2];
      l = m.l - 14 * face + 18 * lam + (fc.a - 0.5) * 8;
      if (m.zone) l -= (0.5 - fc.y) * -10; // аметист: к вершине (вверх по y — минус) темнее
      a = m.clear + (1 - m.clear) * (1 - face) * 0.6;
    } else {
      l = m.l * (0.45 + 0.75 * lam) + (m.speck ? (fc.a - 0.5) * 14 : 0);
      a = 1;
    }
    if (m.fire && spec > 0.25) { h = (n[0] * 300 + n[1] * 200 + 720) % 360; sa = 70 + 20 * f; } // огонь алмаза
    path(fc);
    ctx.fillStyle = hsl(h, sat(sa), Math.min(97, l + spec * 55), a);
    ctx.fill();
    // радужный отлив обсидиана — на гранях под светом
    if (m.sheen && lam > 0.4) { ctx.fillStyle = hsl(180 + n[0] * 120, sat(70), 55, (lam - 0.4) * (0.25 + 0.3 * f)); ctx.fill(); }
    // рёбра: у кристаллов светлые, у обломков — тёмные и тонкие
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(0.6, s * 0.012);
    ctx.strokeStyle = m.clear < 1 ? 'rgba(255,255,255,' + (0.35 + 0.3 * f) + ')' : dark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.12)';
    ctx.stroke();
    if (spec > 0.85) { const c = fc.v.reduce((acc, i) => [acc[0] + P2[i][0] / fc.v.length, acc[1] + P2[i][1] / fc.v.length], [0, 0]); sparks.push([c[0], c[1], Math.min(1, spec - 0.6)]); }
  });
  // искры на вспыхнувших гранях
  if (m.clear < 1 || m.sheen) sparks.slice(0, 3).forEach(([x, y, k]) => {
    const px = cx + x * s, py = cy + y * s, rr = s * (0.1 + 0.1 * k);
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
  let q = SAVED.get(key) || norm4(qmul(qaxis(0, 0, 1, (r() - 0.5) * 0.7), qmul(qaxis(1, 0, 0, 0.35 + r() * 0.3), qaxis(0, 1, 0, r() * 6.28))));
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
