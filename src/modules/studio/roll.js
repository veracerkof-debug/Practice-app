// Пиано-ролл на холсте: сетка тактов и долей по горизонтали, высоты по вертикали, ноты — плашки цвета дорожки.
// Жесты: касание пустого места — нота (длина — сетка), касание ноты — убрать, вести ноту — переместить,
// вести за правый край — длина, вести по пустому — прокрутка, щипок — масштаб по горизонтали.
// Линия хода — при проигрывании. Без зависимости от модуля: получает проект, дорожку и обратные вызовы.
import { toggleNote, noteAt, moveNote, resizeNote, beatsOf, NOTE_LO, NOTE_HI } from '../../music/project.js';
import { pinch } from '../../ui/gestures.js';
const buzz = () => { try { navigator.vibrate && navigator.vibrate(12); } catch { /* нет вибрации */ } };

const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const BLACK = [1, 3, 6, 8, 10];
const HOLD_MS = 450;

// host — элемент под холст; get() → { p, tr, grid }; on: { change(), audition(m) }
export function createRoll(host, get, on) {
  const cv = document.createElement('canvas'), g = cv.getContext('2d');
  cv.className = 'srcv';
  host.appendChild(cv);
  const V = { pxb: 48, rowH: 22, x: 0, y: 0, dpr: Math.min(2, devicePixelRatio || 1), pos: -1 };
  let W = 0, H = 0, raf = 0, drag = null, holdT = 0, css = null;
  const colors = () => css || (css = (() => { const s = getComputedStyle(host); return { ink: s.getPropertyValue('--ink').trim(), l2: s.getPropertyValue('--l2').trim(), sep: s.getPropertyValue('--sep').trim(), fill: s.getPropertyValue('--fill').trim(), cell: s.getPropertyValue('--cell').trim(), tint: s.getPropertyValue('--tint').trim() }; })());
  const rows = NOTE_HI - NOTE_LO + 1;
  const mOfY = (y) => NOTE_HI - Math.floor((y + V.y) / V.rowH);
  const tOfX = (x) => (x + V.x) / V.pxb;
  const clampView = () => {
    const { p } = get();
    V.x = Math.max(0, Math.min(Math.max(0, beatsOf(p) * V.pxb - W + 40), V.x));
    V.y = Math.max(0, Math.min(rows * V.rowH - H, V.y));
  };

  function size() {
    const r = host.getBoundingClientRect();
    W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
    cv.width = W * V.dpr; cv.height = H * V.dpr;
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    if (!V.init) { V.init = true; V.y = Math.max(0, (NOTE_HI - 72) * V.rowH - H / 3); } // начать около первой октавы
    draw();
  }

  function draw() {
    const { p, tr, grid } = get(), C = colors(), total = beatsOf(p);
    g.setTransform(V.dpr, 0, 0, V.dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    clampView();
    // ряды: чёрные клавиши темнее, до каждой октавы — подпись
    for (let m = mOfY(0); m >= mOfY(H) && m >= NOTE_LO; m--) {
      const y = (NOTE_HI - m) * V.rowH - V.y;
      g.fillStyle = BLACK.includes(m % 12) ? C.fill : C.cell;
      g.fillRect(0, y, W, V.rowH);
      if (m % 12 === 0) { g.fillStyle = C.l2; g.font = '11px system-ui'; g.fillText('C' + (m / 12 - 1), 4, y + V.rowH - 6); }
    }
    // сетка: доли тонко, такты толще; за концом проекта — пусто
    for (let b = 0; b <= total; b += grid) {
      const x = b * V.pxb - V.x;
      if (x < -1 || x > W) continue;
      const bar = b % p.num === 0, beat = Number.isInteger(b);
      g.strokeStyle = bar ? C.l2 : C.sep; g.lineWidth = bar ? 1.5 : beat ? 1 : 0.5;
      g.globalAlpha = bar || beat ? 1 : 0.6;
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke();
      g.globalAlpha = 1;
      if (bar && b < total) { g.fillStyle = C.l2; g.font = '11px system-ui'; g.fillText(String(b / p.num + 1), x + 4, 12); }
    }
    const endX = total * V.pxb - V.x;
    if (endX < W) { g.fillStyle = C.fill; g.globalAlpha = 0.6; g.fillRect(endX, 0, W - endX, H); g.globalAlpha = 1; }
    // ноты
    tr.notes.forEach((n) => {
      const x = n.t * V.pxb - V.x, y = (NOTE_HI - n.m) * V.rowH - V.y, w = n.d * V.pxb;
      if (x + w < 0 || x > W || y + V.rowH < 0 || y > H) return;
      g.fillStyle = tr.color; g.globalAlpha = drag && drag.n === n ? 0.6 : 0.92;
      rr(x + 1, y + 2, Math.max(6, w - 2), V.rowH - 4, 5); g.fill();
      g.globalAlpha = 1;
      if (w > 30) { g.fillStyle = '#fff'; g.font = '11px system-ui'; g.fillText(NAMES[n.m % 12], x + 6, y + V.rowH - 7); }
    });
    // ход
    if (V.pos >= 0) { const x = V.pos * V.pxb - V.x; g.strokeStyle = C.tint; g.lineWidth = 2; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  }
  function rr(x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

  /* ---------- жесты ---------- */
  const pt = (e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  cv.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary) { drag = null; return; }
    const { p, tr, grid } = get(), q = pt(e), t = tOfX(q.x), m = mOfY(q.y), n = noteAt(tr, Math.floor(t / grid) * grid, m);
    cv.setPointerCapture(e.pointerId);
    const edge = n && (n.t + n.d) * V.pxb - V.x - q.x < 14 && n.d * V.pxb > 24;
    drag = { id: e.pointerId, x0: q.x, y0: q.y, x: q.x, y: q.y, n, edge, moved: false, t0: n ? n.t : 0, m0: n ? n.m : 0, d0: n ? n.d : 0, vx: V.x, vy: V.y, t, m, grid, p, tr };
    clearTimeout(holdT);
    if (n) holdT = setTimeout(() => { if (drag && !drag.moved && drag.n === n) { tr.notes.splice(tr.notes.indexOf(n), 1); buzz(); drag = null; on.change(); draw(); } }, HOLD_MS);
  });
  cv.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const q = pt(e), dx = q.x - drag.x0, dy = q.y - drag.y0;
    if (!drag.moved && Math.hypot(dx, dy) > 6) { drag.moved = true; clearTimeout(holdT); }
    if (!drag.moved) return;
    const { p, n, grid } = drag;
    if (n && drag.edge) resizeNote(p, n, drag.d0 + dx / V.pxb, grid);
    else if (n) { n.t = drag.t0; n.m = drag.m0; moveNote(p, n, dx / V.pxb, -dy / V.rowH, grid); }
    else { V.x = drag.vx - dx; V.y = drag.vy - dy; }
    draw();
  });
  const up = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    clearTimeout(holdT);
    const d = drag;
    drag = null;
    if (!d.moved) {
      if (d.n) return; // короткое касание ноты — ничего (убрать — удержанием)
      const { p, tr, grid } = get(), t = Math.floor(d.t / grid) * grid;
      if (t < 0 || t >= beatsOf(p) || d.m < NOTE_LO || d.m > NOTE_HI) return;
      const n = toggleNote(tr, t, d.m, grid);
      if (n) on.audition(d.m);
      on.change(); draw();
    } else if (d.n) on.change();
  };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
  const offPinch = pinch(cv, { min: 16, max: 160, get: () => V.pxb, set: (v) => { const mid = tOfX(W / 2); V.pxb = v; V.x = mid * v - W / 2; draw(); } });
  cv.addEventListener('wheel', (e) => { e.preventDefault(); if (e.ctrlKey) { V.pxb = Math.max(16, Math.min(160, V.pxb - e.deltaY / 10)); } else { V.x += e.deltaX; V.y += e.deltaY; } draw(); }, { passive: false });
  const ro = new ResizeObserver(size);
  ro.observe(host);
  size();

  return {
    draw,
    // ход проигрывания (доля) — линия; -1 — нет
    pos(b) { V.pos = b; cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); },
    // показать нужную долю (начало проигрывания — в кадре)
    follow(b) { const x = b * V.pxb; if (x < V.x || x > V.x + W - 20) { V.x = Math.max(0, x - 40); draw(); } },
    destroy() { ro.disconnect(); offPinch(); clearTimeout(holdT); cancelAnimationFrame(raf); cv.remove(); },
  };
}
