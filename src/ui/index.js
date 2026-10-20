// Общие элементы интерфейса для ядра и модулей: шторка, сообщение, подтверждение, переключатели, иконки.
// Разметка и классы — как в прототипе (стили в ui.css).
import './ui.css';
import { loader } from './loader.js';
import { t, withText } from '../i18n/index.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const icons = {
  play: '<svg viewBox="0 0 24 24"><path d="M7 4.8v14.4c0 .8.9 1.3 1.6.9l11.3-7.2c.6-.4.6-1.4 0-1.8L8.6 3.9C7.9 3.5 7 4 7 4.8z"/></svg>',
  stop: '<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2.5"/></svg>',
  mic: '<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>',
  left: '<svg viewBox="0 0 24 24"><path d="M14.5 6l-6 6 6 6"/></svg>',
  right: '<svg viewBox="0 0 24 24"><path d="M9.5 6l6 6-6 6"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  chev: '<svg class="chev" viewBox="0 0 8 13"><path d="M1.5 1.5 6.5 6.5 1.5 11.5"/></svg>',
  check: '<svg class="check" viewBox="0 0 16 16"><path d="M3 8.5 6.5 12 13 4.5"/></svg>',
  help: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.7 9.4a2.4 2.4 0 1 1 3.4 2.2c-.7.4-1.1.9-1.1 1.7v.3"/><path d="M12 16.6v.2"/></svg>',
};

// Сегментированный выбор: opts — [[значение, подпись], …]
export const seg = (name, opts, cur, label = '') =>
  '<div class="seg" role="group" data-seg="' + name + '"' + (label ? ' aria-label="' + esc(label) + '"' : '') + '>' +
  opts.map(([v, l]) => '<button type="button" data-v="' + v + '" aria-pressed="' + (String(cur) === String(v)) + '">' + l + '</button>').join('') + '</div>';

// Переключатель
export const sw = (name, on, label) =>
  '<label class="sw"><input type="checkbox" data-sw="' + name + '"' + (on ? ' checked' : '') + ' aria-label="' + esc(label) + '"><i></i></label>';

// Кнопки − / +
export const stepper = (name, label) =>
  '<span class="stepper" role="group" aria-label="' + esc(label) + '"><button type="button" data-step="' + name + '" data-d="-1" aria-label="' + esc(t('ui.less')) + '">−</button>' +
  '<button type="button" data-step="' + name + '" data-d="1" aria-label="' + esc(t('ui.more')) + '">+</button></span>';

// Круглая кнопка-иконка с подписью для чтения с экрана
export const icb = (attrs, icon, label, cls) =>
  '<button type="button" class="ic' + (cls ? ' ' + cls : '') + '" ' + attrs + ' aria-label="' + esc(label) + '" title="' + esc(label) + '">' + icon + '</button>';

// Заголовок шторки: слева, по центру, справа
export const snav = (title, { left = '<span></span>', right = '<button class="link b r" data-close>' + esc(t('ui.done')) + '</button>' } = {}) =>
  '<div class="snav">' + left + '<div class="t">' + esc(title) + '</div>' + right + '</div>';

/* ---------- шторка ---------- */

let layer = null;
const stack = [];

// Открыть нижнюю шторку. render() → html; init(el, api) — один раз после открытия; onClose — после закрытия.
// Возвращает api: { el, close(), update() } — update перерисовывает, сохраняя прокрутку
/* ---------- плавный уход ---------- */

// Элемент уходит с анимацией (.leaving в styles/motion.css) и удаляется после неё. Сразу теряет id и нажатия,
// чтобы «Назад» и поиск по странице его уже не находили. «Уменьшить движение» — почти сразу
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
export function leave(el, ms = 240) {
  if (!el || el.classList.contains('leaving')) return;
  el.classList.add('leaving');
  el.removeAttribute('id');
  el.setAttribute('aria-hidden', 'true');
  setTimeout(() => el.remove(), reduced() ? 0 : ms);
}

export function sheet(render, init, { onClose } = {}) {
  if (!layer) {
    layer = document.createElement('div');
    layer.id = 'sheetLayer';
    document.body.appendChild(layer);
  }
  const prevFocus = document.activeElement;
  const scrim = document.createElement('div');
  scrim.className = 'scrim opening'; // содержимое поднимается по очереди только при открытии, не при каждом обновлении
  setTimeout(() => scrim.classList.remove('opening'), 650);
  scrim.style.zIndex = 45 + stack.length;
  scrim.innerHTML = '<div class="sheet" role="dialog" aria-modal="true"></div>';
  const el = scrim.firstChild;
  const api = {
    el,
    update() {
      const y = el.scrollTop;
      el.innerHTML = '<div class="grab"></div>' + withText(render); // настройки — с текстом и в «Минимале» без текста
      el.scrollTop = y;
    },
    close() {
      if (!stack.includes(api)) return;
      leave(scrim, 260);
      stack.splice(stack.indexOf(api), 1);
      document.removeEventListener('keydown', onKey);
      if (prevFocus && prevFocus.focus) prevFocus.focus();
      if (onClose) onClose();
    },
  };
  const onKey = (e) => { if (e.key === 'Escape' && stack.at(-1) === api) api.close(); };
  scrim.addEventListener('click', (e) => { if (e.target === scrim || e.target.closest('[data-close]')) api.close(); });
  document.addEventListener('keydown', onKey);
  layer.appendChild(scrim);
  stack.push(api);
  api.update();
  // Потянуть шторку вниз за полоску сверху или за заголовок (или в любом месте, если она прокручена в начало)
  let drag = null;
  el.addEventListener('pointerdown', (e) => {
    if (e.button > 0 || e.target.closest('input,textarea,select,[contenteditable],.sw,.seg,[role="slider"],canvas[data-stone],canvas[data-eq]')) return;
    const head = e.target.closest('.grab,.snav');
    if (!head && el.scrollTop > 0) return;
    drag = { y: e.clientY, t: performance.now(), dy: 0, id: e.pointerId, head: !!head };
  });
  el.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag.dy = Math.max(0, e.clientY - drag.y);
    if (!drag.head && drag.dy < 8) return;
    if (drag.dy > 4) { el.classList.add('dragging'); el.style.transform = 'translateY(' + drag.dy + 'px)'; scrim.style.backgroundColor = 'rgba(0,0,0,' + Math.max(0, 0.4 - drag.dy / 900) + ')'; }
  });
  const drop = (e) => {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    const v = drag.dy / Math.max(1, performance.now() - drag.t), d = drag.dy;
    drag = null;
    el.classList.remove('dragging');
    if (d > 110 || (d > 40 && v > 0.6)) { el.style.transform = ''; api.close(); return; }
    el.classList.add('snap');
    el.style.transform = '';
    scrim.style.backgroundColor = '';
    setTimeout(() => el.classList.remove('snap'), 300);
  };
  el.addEventListener('pointerup', drop);
  el.addEventListener('pointercancel', drop);
  el.setAttribute('tabindex', '-1');
  el.focus({ preventScroll: true });
  if (init) init(el, api);
  return api;
}

export const closeAllSheets = () => [...stack].reverse().forEach((s) => s.close());
// Закрыть верхнюю шторку (кнопка «Назад» на Android); false — шторок нет
export const closeTopSheet = () => { const s = stack.at(-1); if (!s) return false; s.close(); return true; };

/* ---------- сообщение ---------- */

export function toast(msg) {
  if (!msg || !String(msg).trim()) return; // «Минимал» без текста: сообщение без слов не показывается
  document.querySelectorAll('.toast').forEach((x) => x.remove()); // новое сообщение сменяет старое сразу
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => leave(el, 240), 2400);
}

/* ---------- подтверждение ---------- */

export function confirm(title, text, yes) {
  return new Promise((resolve) => {
    const d = document.createElement('div');
    d.className = 'ask';
    d.innerHTML = '<div class="alert" role="alertdialog" aria-label="' + esc(title) + '"><div class="ab"><h3>' + esc(title) + '</h3><p>' + esc(text) +
      '</p></div><div class="abtns"><button data-k="no">' + esc(t('ui.cancel')) + '</button><button data-k="yes" style="color:var(--red)">' + esc(yes) + '</button></div></div>';
    document.body.appendChild(d);
    d.querySelector('[data-k="no"]').focus();
    d.addEventListener('click', (e) => {
      const k = e.target.closest('[data-k]');
      if (!k && e.target !== d) return;
      leave(d, 160);
      resolve(!!k && k.dataset.k === 'yes');
    });
  });
}

export { loader };
export const ui = { esc, icons, seg, sw, stepper, icb, snav, sheet, toast, confirm, leave, loader };
