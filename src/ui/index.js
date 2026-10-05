// Общие элементы интерфейса для ядра и модулей: шторка, сообщение, подтверждение, переключатели, иконки.
// Разметка и классы — как в прототипе (стили в ui.css).
import './ui.css';
import { t } from '../i18n/index.js';

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
export function sheet(render, init, { onClose } = {}) {
  if (!layer) {
    layer = document.createElement('div');
    layer.id = 'sheetLayer';
    document.body.appendChild(layer);
  }
  const prevFocus = document.activeElement;
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  scrim.style.zIndex = 45 + stack.length;
  scrim.innerHTML = '<div class="sheet" role="dialog" aria-modal="true"></div>';
  const el = scrim.firstChild;
  const api = {
    el,
    update() {
      const y = el.scrollTop;
      el.innerHTML = '<div class="grab"></div>' + render();
      el.scrollTop = y;
    },
    close() {
      scrim.remove();
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
  el.setAttribute('tabindex', '-1');
  el.focus({ preventScroll: true });
  if (init) init(el, api);
  return api;
}

export const closeAllSheets = () => [...stack].reverse().forEach((s) => s.close());

/* ---------- сообщение ---------- */

export function toast(msg) {
  document.querySelectorAll('.toast').forEach((x) => x.remove());
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2400);
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
      d.remove();
      resolve(!!k && k.dataset.k === 'yes');
    });
  });
}

export const ui = { esc, icons, seg, sw, stepper, icb, snav, sheet, toast, confirm };
