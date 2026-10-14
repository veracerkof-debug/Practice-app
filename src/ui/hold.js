// Долгое нажатие: меню у кнопки (onHold + holdMenu) и перестановка строк перетаскиванием (sortable).
// Касание и обычная прокрутка не меняются: удержание срабатывает, только если палец почти не сдвинулся за HOLD_MS;
// после срабатывания ближайший click гасится, чтобы удержание не открыло ещё и сам инструмент.
import { esc } from './index.js';
import './hold.css';

export const HOLD_MS = 450;
const buzz = () => { try { navigator.vibrate && navigator.vibrate(12); } catch { /* нет вибрации */ } };

// root — где слушать, sel — какие элементы; cb(el, e) — сработало удержание
export function onHold(root, sel, cb, ms = HOLD_MS) {
  let tm = 0, st = null, fired = false;
  const cancel = () => { clearTimeout(tm); st = null; };
  root.addEventListener('pointerdown', (e) => {
    const el = e.target.closest && e.target.closest(sel);
    if (!el || !root.contains(el) || e.button > 0) return;
    fired = false;
    st = { x: e.clientX, y: e.clientY, el };
    clearTimeout(tm);
    tm = setTimeout(() => { if (!st) return; fired = true; buzz(); cb(st.el, e); st = null; }, ms);
  });
  root.addEventListener('pointermove', (e) => { if (st && Math.hypot(e.clientX - st.x, e.clientY - st.y) > 8) cancel(); });
  root.addEventListener('pointerup', cancel);
  root.addEventListener('pointercancel', cancel);
  root.addEventListener('click', (e) => { if (fired) { fired = false; e.preventDefault(); e.stopPropagation(); } }, true);
  root.addEventListener('contextmenu', (e) => { if (e.target.closest && e.target.closest(sel)) e.preventDefault(); });
}

// Меню у элемента: items — [{ icon, label, run, danger }]; закрывается касанием мимо, Escape и после выбора
export function holdMenu(anchor, items, title = '') {
  document.querySelectorAll('.hmenu').forEach((m) => m.remove());
  const m = document.createElement('div');
  m.className = 'hmenu';
  m.setAttribute('role', 'menu');
  if (title) m.setAttribute('aria-label', title);
  m.innerHTML = (title ? '<div class="hmt">' + esc(title) + '</div>' : '') + items.map((it, i) => '<button role="menuitem" data-i="' + i + '"' + (it.danger ? ' class="dng"' : '') + '>' +
    (it.icon ? '<span class="hmi">' + it.icon + '</span>' : '') + '<span>' + esc(it.label) + '</span></button>').join('');
  document.body.appendChild(m);
  anchor.classList.add('held');
  // под элементом, если не помещается — над ним; по горизонтали — в пределах окна
  const r = anchor.getBoundingClientRect(), mw = m.offsetWidth, mh = m.offsetHeight;
  const x = Math.max(8, Math.min(innerWidth - mw - 8, r.left + r.width / 2 - mw / 2));
  const y = r.bottom + 8 + mh < innerHeight - 8 ? r.bottom + 8 : Math.max(8, r.top - mh - 8);
  m.style.left = x + 'px'; m.style.top = y + 'px';
  const close = () => { m.remove(); anchor.classList.remove('held'); document.removeEventListener('pointerdown', out, true); document.removeEventListener('keydown', key); };
  const out = (e) => { if (!m.contains(e.target)) { close(); if (anchor.contains(e.target)) e.stopPropagation(); } };
  const key = (e) => { if (e.key === 'Escape') close(); };
  setTimeout(() => { document.addEventListener('pointerdown', out, true); document.addEventListener('keydown', key); }, 0);
  m.addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (!b) return; close(); items[+b.dataset.i].run(); });
  m.querySelector('button').focus({ preventScroll: true });
  return close;
}

// Перестановка строк: удержать строку (rowSel внутри list) и вести вверх-вниз; onDrop(ids) — новый порядок
// (ids — значения атрибута key у строк). Пока строка поднята, прокрутка не мешает.
export function sortable(list, rowSel, key, onDrop) {
  let drag = null;
  const rows = () => [...list.querySelectorAll(rowSel)];
  onHold(list, rowSel, (row, e) => {
    const r = row.getBoundingClientRect();
    drag = { row, id: e.pointerId, y0: e.clientY, top: r.top, h: r.height, moved: false };
    row.classList.add('lifted');
    list.classList.add('sorting');
    document.addEventListener('pointermove', move, { passive: false });
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
  });
  const move = (e) => {
    if (!drag) return;
    e.preventDefault();
    const { row } = drag;
    row.style.transform = 'translateY(' + (e.clientY - drag.y0) + 'px)';
    // сосед, через середину которого прошёл палец, — меняемся местами
    const all = rows(), i = all.indexOf(row);
    const prev = all[i - 1], next = all[i + 1];
    if (next) { const nr = next.getBoundingClientRect(); if (e.clientY > nr.top + nr.height / 2) { next.after(row); drag.y0 += nr.height; drag.moved = true; row.style.transform = 'translateY(' + (e.clientY - drag.y0) + 'px)'; } }
    if (prev) { const pr = prev.getBoundingClientRect(); if (e.clientY < pr.top + pr.height / 2) { prev.before(row); drag.y0 -= pr.height; drag.moved = true; row.style.transform = 'translateY(' + (e.clientY - drag.y0) + 'px)'; } }
  };
  const up = () => {
    if (!drag) return;
    const { row, moved } = drag;
    drag = null;
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    document.removeEventListener('pointercancel', up);
    row.style.transform = '';
    row.classList.remove('lifted');
    list.classList.remove('sorting');
    if (moved) onDrop(rows().map((r) => r.getAttribute(key)));
  };
  // touchmove не должен прокручивать страницу, пока строка поднята
  list.addEventListener('touchmove', (e) => { if (drag) e.preventDefault(); }, { passive: false });
}
