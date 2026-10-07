// Камень режима «Минимал». Не драгоценный: обычный камень с дороги, у каждого свой (по зерну профиля).
// С часами занятий в приложении он, как галька в реке, теряет грани и выступы и становится круглее:
//   • сначала скругляются рёбра — быстро: половина за ~210 ч (EDGE_H), почти все — к ~1000 ч;
//   • потом медленно уходит сама угловатая форма: половина за ~2100 ч (FORM_H), почти вся — к ~10 000 ч.
// Так у реальной гальки: острые углы скалываются в первые километры пути, а округлой она становится за сотни.
// Рисуется без библиотек — сеткой из треугольников на <canvas>, оттенками серого. Камень можно крутить пальцем.

export const EDGE_H = 300, FORM_H = 3000;

// Насколько камень сгладился: edges — рёбра, form — форма (0 — как с дороги, 1 — круглая галька)
export function wear(hours) {
  const h = Math.max(0, +hours || 0);
  return { edges: 1 - Math.exp(-h / EDGE_H), form: 1 - Math.exp(-h / FORM_H) };
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

// Сетка камня: { V — вершины, F — грани, A — светлота вершин (зерно породы) }
export function stoneMesh(seed, hours, detail = 3) {
  const r = rng(seed), { edges, form } = wear(hours);
  // исходный камень — пересечение случайных плоскостей (сколы)
  const planes = Array.from({ length: 11 + Math.floor(r() * 6) }, () => ({ n: norm([r() * 2 - 1, (r() * 2 - 1) * 0.8, r() * 2 - 1]), d: 0.62 + r() * 0.38 }));
  // во что он превращается — приплюснутая галька
  const ax = [1.12 + r() * 0.12, 0.62 + r() * 0.14, 0.9 + r() * 0.12];
  const bumps = Array.from({ length: 5 }, () => ({ n: norm([r() * 2 - 1, r() * 2 - 1, r() * 2 - 1]), f: 1.5 + r() * 2.5, ph: r() * 6.3, a: 0.02 + r() * 0.03 }));
  const grain = Array.from({ length: 6 }, () => ({ n: norm([r() * 2 - 1, r() * 2 - 1, r() * 2 - 1]), f: 6 + r() * 20, ph: r() * 6.3 }));
  const k = 0.018 + 0.11 * edges; // мягкость рёбер (новый камень тоже не бритвенно острый)
  const { V: S, F } = sphere(detail);
  const V = [], A = [];
  S.forEach((v) => {
    // расстояние до сколов по направлению v: мягкий минимум (k → 0 — острые рёбра)
    const rs = [];
    planes.forEach((p) => { const c = v[0] * p.n[0] + v[1] * p.n[1] + v[2] * p.n[2]; if (c > 0.02) rs.push(p.d / c); });
    rs.push(1.25);
    const lo = Math.min(...rs);
    let sum = 0;
    rs.forEach((x) => { sum += Math.exp(-(x - lo) / k); });
    const rough = lo - k * Math.log(sum);
    const ell = 1 / Math.sqrt((v[0] / ax[0]) ** 2 + (v[1] / ax[1]) ** 2 + (v[2] / ax[2]) ** 2);
    let bump = 0;
    bumps.forEach((b) => { bump += b.a * Math.sin(b.f * (v[0] * b.n[0] + v[1] * b.n[1] + v[2] * b.n[2]) + b.ph); });
    const R = (rough * (1 - form) + ell * 0.86 * form) * (1 + bump * (1 - form));
    V.push([v[0] * R, v[1] * R, v[2] * R]);
    let g = 0;
    grain.forEach((q) => { g += Math.sin(q.f * (v[0] * q.n[0] + v[1] * q.n[1] + v[2] * q.n[2]) + q.ph); });
    A.push(0.5 + g / 14 + (r() - 0.5) * 0.12);
  });
  // в единичный размер
  const m = Math.max(...V.map((p) => Math.hypot(p[0], p[1], p[2])));
  V.forEach((p) => { p[0] /= m; p[1] /= m; p[2] /= m; });
  return { V, F, A };
}

// Поворот: кватернион [w, x, y, z]
const qmul = (a, b) => [a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3], a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
  a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1], a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0]];
const qaxis = (x, y, z, ang) => { const s = Math.sin(ang / 2); return [Math.cos(ang / 2), x * s, y * s, z * s]; };
function qmat(q) {
  const [w, x, y, z] = q;
  return [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y), 2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x),
    2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)];
}

// Живой камень на холсте: сам медленно поворачивается, тянется пальцем; onTap — касание без поворота
export function stoneView(canvas, { seed = 1, hours = 0, detail = 3, spin = true, onTap = null } = {}) {
  let mesh = stoneMesh(seed, hours, detail), q = norm4(qmul(qaxis(1, 0, 0, 0.5), qaxis(0, 1, 0, 0.6))), vx = 0, vy = 0, drag = null, raf = 0, lastT = 0;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ctx = canvas.getContext('2d');
  const dark = () => matchMedia('(prefers-color-scheme: dark)').matches && document.documentElement.dataset.theme !== 'light' || document.documentElement.dataset.theme === 'dark' || document.documentElement.dataset.theme === 'oled';
  const L = norm([-0.55, -0.75, 0.6]);

  function draw() {
    const dpr = Math.min(2.5, window.devicePixelRatio || 1), W = canvas.clientWidth, H = canvas.clientHeight;
    if (!W || !H) return;
    if (canvas.width !== Math.round(W * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const M = qmat(q), s = Math.min(W, H) * 0.44, cx = W / 2, cy = H / 2;
    const P = mesh.V.map((v) => [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]]);
    const dk = dark(), list = [];
    mesh.F.forEach((f) => {
      const a = P[f[0]], b = P[f[1]], c = P[f[2]];
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2];
      const n = norm([uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx]);
      if (n[2] <= 0) return; // обратная сторона
      list.push([a[2] + b[2] + c[2], f, n]);
    });
    list.sort((x, y) => x[0] - y[0]);
    // тень под камнем
    ctx.fillStyle = dk ? 'rgba(0,0,0,.45)' : 'rgba(0,0,0,.10)';
    ctx.beginPath(); ctx.ellipse(cx, cy + s * 0.98, s * 0.7, s * 0.09, 0, 0, Math.PI * 2); ctx.fill();
    list.forEach(([, f, n]) => {
      const lam = Math.max(0, n[0] * L[0] + n[1] * L[1] + n[2] * L[2]);
      const alb = (mesh.A[f[0]] + mesh.A[f[1]] + mesh.A[f[2]]) / 3;
      const spec = Math.pow(Math.max(0, n[2] * 0.6 + lam * 0.4), 24) * 0.12;
      let v = (dk ? 28 : 34) + (dk ? 150 : 185) * (0.16 + 0.84 * lam) * (0.82 + 0.36 * alb) + spec * 255;
      v = Math.max(8, Math.min(245, Math.round(v)));
      const col = 'rgb(' + v + ',' + v + ',' + Math.min(255, v + 2) + ')';
      ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(cx + P[f[0]][0] * s, cy + P[f[0]][1] * s); ctx.lineTo(cx + P[f[1]][0] * s, cy + P[f[1]][1] * s); ctx.lineTo(cx + P[f[2]][0] * s, cy + P[f[2]][1] * s);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    });
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
  const up = () => {
    if (!drag) return;
    const tap = drag.moved < 8;
    drag = null;
    if (tap) { vx = vy = 0; if (onTap) onTap(); }
    kick();
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') kick(); });

  kick();
  return {
    setHours(h) { mesh = stoneMesh(seed, h, detail); kick(); },
    redraw: draw,
  };
}
