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

// Кнопка с автоповтором (±1 мс в лупере, шаги): нажатие — fn(el, false) сразу, удержание — fn(el, true) каждые every мс
// после delay; click гасится — шаг уже сделан на pointerdown
export function holdRepeat(root, sel, fn, { delay = 350, every = 60 } = {}) {
  let tm = 0, iv = 0, cur = null;
  const stop = () => { clearTimeout(tm); clearInterval(iv); tm = iv = 0; cur = null; };
  root.addEventListener('pointerdown', (e) => {
    const el = e.target.closest(sel); if (!el || e.button > 0) return;
    stop(); cur = el; fn(el, false);
    tm = setTimeout(() => { if (cur === el) iv = setInterval(() => (cur === el ? fn(el, true) : stop()), every); }, delay);
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => root.addEventListener(ev, stop));
  root.addEventListener('click', (e) => { if (e.target.closest(sel)) { e.preventDefault(); e.stopPropagation(); } }, true); // шаг уже сделан на pointerdown
}

// Меню у элемента: items — [{ icon, label, run, danger }]; закрывается касанием мимо, Escape и после выбора
export function holdMenu(anchor, items, title = '') {
  document.querySelectorAll('.hmenu').forEach((m) => m.remove());
  // (закрытое меню уходит с анимацией — .hmenu.leaving)
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
  const close = () => { m.classList.add('leaving'); setTimeout(() => m.remove(), 140); anchor.classList.remove('held'); document.removeEventListener('pointerdown', out, true); document.removeEventListener('keydown', key); };
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

// Перестановка, как значков на главном экране телефона: удержать элемент — он приподнимается и идёт за пальцем,
// соседи расступаются (сетка или список — неважно, меняются местами элементы одного родителя); отпустить —
// элемент встаёт на новое место, onDrop(ids, el) — новый порядок (значения атрибута key). Удержание без движения —
// onStill(el, e) (меню). skip(e) — не начинать (например, касание пришлось на вложенный элемент). У края экрана —
// прокрутка. Пока элемент поднят, страница не прокручивается пальцем.
export function dragSort(root, sel, key, { onDrop, onStill, skip } = {}) {
  let D = null, last = null;
  root.addEventListener('pointermove', (e) => { last = e; }, { passive: true });
  onHold(root, sel, (el, e) => {
    if (skip && skip(e)) return;
    const p = last && last.pointerId === e.pointerId ? last : e;
    D = { el, id: e.pointerId, x0: p.clientX, y0: p.clientY, x: p.clientX, y: p.clientY, moved: false, e, raf: 0, scroller: scrollerOf(el) };
    el.classList.add('lifting');
    el.parentElement.classList.add('draghost');
    document.documentElement.classList.add('sorting');
    document.addEventListener('pointermove', move, { passive: false });
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
    D.raf = requestAnimationFrame(edge);
  });
  const siblings = (el) => [...el.parentElement.children].filter((x) => x.matches(sel));
  const place = () => { const { el, x, y, x0, y0 } = D; el.style.transform = 'translate(' + (x - x0) + 'px,' + (y - y0) + 'px) scale(1.04)'; };
  function move(e) {
    if (!D || e.pointerId !== D.id) return;
    e.preventDefault();
    D.x = e.clientX; D.y = e.clientY;
    if (!D.el.isConnected) { end(); return; }
    if (Math.hypot(D.x - D.x0, D.y - D.y0) > 6) D.moved = true;
    place();
    // элемент под пальцем — по раскладке, без учёта анимации соседей (offset*), — меняемся местами;
    // соседи переезжают плавно (FLIP)
    const all = siblings(D.el), host = D.el.parentElement, hb = host.getBoundingClientRect();
    const tg = all.find((x) => {
      if (x === D.el) return false;
      const l = hb.left + host.clientLeft + x.offsetLeft, t = hb.top + host.clientTop + x.offsetTop;
      return D.x >= l && D.x <= l + x.offsetWidth && D.y >= t && D.y <= t + x.offsetHeight;
    });
    if (!tg) return;
    const before = new Map(all.map((x) => [x, x.getBoundingClientRect()]));
    const r0 = before.get(D.el), dx0 = D.x - D.x0, dy0 = D.y - D.y0;
    if (all.indexOf(D.el) < all.indexOf(tg)) tg.after(D.el); else tg.before(D.el);
    D.el.style.transform = '';
    const r1 = D.el.getBoundingClientRect();
    // палец остаётся на том же месте элемента
    D.x0 += r1.left - (r0.left - dx0); D.y0 += r1.top - (r0.top - dy0);
    place();
    all.forEach((x) => {
      if (x === D.el) return;
      const a = before.get(x), b = x.getBoundingClientRect();
      if (!a || (a.left === b.left && a.top === b.top)) return;
      x.style.transition = 'none';
      x.style.transform = 'translate(' + (a.left - b.left) + 'px,' + (a.top - b.top) + 'px)';
      requestAnimationFrame(() => { x.style.transition = 'transform .18s ease'; x.style.transform = ''; });
    });
  }
  // у верхнего и нижнего края — прокрутка (элемент остаётся под пальцем)
  function edge() {
    if (!D) return;
    const s = D.scroller, h = innerHeight, v = D.y < 90 ? -Math.ceil((90 - D.y) / 6) : D.y > h - 110 ? Math.ceil((D.y - (h - 110)) / 6) : 0;
    if (v && s) {
      const before = s === document.scrollingElement ? scrollY : s.scrollTop;
      if (s === document.scrollingElement) scrollBy(0, v); else s.scrollTop += v;
      const moved = (s === document.scrollingElement ? scrollY : s.scrollTop) - before;
      if (moved) { D.y0 -= moved; place(); }
    }
    D.raf = requestAnimationFrame(edge);
  }
  function end() {
    if (!D) return null;
    const d = D;
    D = null;
    cancelAnimationFrame(d.raf);
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    document.removeEventListener('pointercancel', up);
    document.documentElement.classList.remove('sorting');
    d.el.classList.remove('lifting');
    if (d.el.parentElement) d.el.parentElement.classList.remove('draghost');
    d.el.style.transform = ''; d.el.style.pointerEvents = '';
    return d;
  }
  function up(e) {
    if (!D || e.pointerId !== D.id) return;
    const d = end();
    if (!d.el.isConnected) return;
    if (d.moved) {
      const id = d.el.getAttribute(key);
      if (onDrop) onDrop(siblings(d.el).map((x) => x.getAttribute(key)), d.el);
      // встал на место — мягко «садится» (и после перерисовки)
      const at = (root.isConnected && root.querySelector('[' + key + '="' + CSS.escape(id) + '"]')) || d.el;
      at.classList.add('settle');
      setTimeout(() => at.classList.remove('settle'), 420);
    }
    else onStill && onStill(d.el, d.e);
  }
  // пока элемент поднят, страница пальцем не прокручивается
  document.addEventListener('touchmove', (e) => { if (D) e.preventDefault(); }, { passive: false });
}

function scrollerOf(el) {
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight) return p;
  }
  return document.scrollingElement;
}
