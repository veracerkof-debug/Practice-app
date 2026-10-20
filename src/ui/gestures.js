// Общие жесты: смахивание влево-вправо и щипок двумя пальцами. Принцип приложения: где жест удобен, понятен
// и принят в телефонах — он есть, а кнопки остаются для тех, кто жестов не знает.
// Защита от случайных срабатываний: смахивание — только почти горизонтальное, быстрое и достаточно длинное;
// не начинается на полях ввода, ползунках, клавишах, полосах выбора с прокруткой и там, где стоит data-noswipe.
const NOSWIPE = 'input, textarea, select, [contenteditable], .hscroll, .kb, canvas, [role="slider"], [data-noswipe], .mwheel';

// el — где слушать; left() — смахнули влево (дальше), right() — вправо (назад).
// min — сколько пикселей пройти; edge — начинать только у левого края (жест «назад»), 0 — где угодно
export function swipe(el, { left, right, min = 70, edge = 0, ok = () => true } = {}) {
  let s = null;
  const down = (e) => {
    if (e.pointerType === 'mouse' || !e.isPrimary || !ok(e)) { s = null; return; }
    if (e.target.closest && e.target.closest(NOSWIPE)) { s = null; return; }
    if (edge && e.clientX > edge) { s = null; return; }
    s = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
  };
  const up = (e) => {
    if (!s || e.pointerId !== s.id) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y, dt = performance.now() - s.t;
    s = null;
    if (dt > 700 || Math.abs(dx) < min || Math.abs(dx) < Math.abs(dy) * 2) return;
    if (document.getSelection && String(document.getSelection()).length) return; // выделяли текст
    if (dx < 0 && left) left(); else if (dx > 0 && right) right();
  };
  const cancel = () => { s = null; };
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', cancel);
  return () => { el.removeEventListener('pointerdown', down); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', cancel); };
}

// Щипок двумя пальцами: get() — текущее значение, set(v, live) — новое (live — во время жеста, false — в конце).
// Значение меняется пропорционально расстоянию между пальцами, в пределах min…max; ok(e) — начинать ли здесь
export function pinch(el, { get, set, min = 10, max = 64, ok = () => true }) {
  let p = null;
  const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  const start = (e) => { if (e.touches.length === 2 && ok(e)) p = { d: dist(e.touches), v: get() }; };
  const move = (e) => {
    if (!p || e.touches.length !== 2) return;
    e.preventDefault();
    set(Math.max(min, Math.min(max, Math.round(p.v * (dist(e.touches) / p.d)))), true);
  };
  const end = (e) => { if (p && e.touches.length < 2) { set(get(), false); p = null; } };
  el.addEventListener('touchstart', start, { passive: true });
  el.addEventListener('touchmove', move, { passive: false });
  el.addEventListener('touchend', end);
  el.addEventListener('touchcancel', end);
  return () => { el.removeEventListener('touchstart', start); el.removeEventListener('touchmove', move); el.removeEventListener('touchend', end); el.removeEventListener('touchcancel', end); };
}
