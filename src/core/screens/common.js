// Общее для экранов ядра: значки, дни недели, «сегодня/вчера», шкала выученности.
// Перенесено из legacy/practice.html (ICONS, IC, AVATAR, CHEV, relDay, mRing, mBadge, mCap, mInput, bindM, lvl).
import { t, tn, bareNow, withText } from '../../i18n/index.js';
import { esc, seg } from '../../ui/index.js';
import { dayStart, DAY } from '../time.js';
import { scaleOf, toScale, fromScale, masteryLevel } from '../library.js';
import { isOn } from '../settings.js';

export const AVATAR = '<svg viewBox="0 0 24 24"><circle cx="12" cy="9" r="3.6"/><path d="M5 19.5c1.4-3.2 4-4.6 7-4.6s5.6 1.4 7 4.6"/></svg>';
export const CHEV = '<svg class="chev" viewBox="0 0 8 13"><path d="M1.5 1.5 6.5 6.5 1.5 11.5"/></svg>';
export const BACK = '<svg viewBox="0 0 12 20"><path d="M10 2 2 10l8 8"/></svg>';
export const PLAY = '<svg viewBox="0 0 24 24"><path d="M7 4.8v14.4c0 .8.9 1.3 1.6.9l11.3-7.2c.6-.4.6-1.4 0-1.8L8.6 3.9C7.9 3.5 7 4 7 4.8z"/></svg>';
export const IC = {
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  minus: '<svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg>',
  up: '<svg viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></svg>',
  pen: '<svg viewBox="0 0 24 24"><path d="M15.5 5.5l3 3L9 18l-4 1 1-4z"/></svg>',
  clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l2.5 1.5"/></svg>',
  stack: '<svg viewBox="0 0 24 24"><path d="M4 8l8-4 8 4-8 4zM4 12l8 4 8-4M4 16l8 4 8-4"/></svg>',
  bolt: '<svg viewBox="0 0 24 24"><path d="M13 3 6 13h5l-1 8 7-10h-5z"/></svg>',
  metro: '<svg viewBox="0 0 24 24"><path d="M8 21h8l-3-17h-2zM12 14l5-7"/></svg>',
  notes: '<svg viewBox="0 0 24 24"><rect x="5" y="3.5" width="14" height="17" rx="2.5"/><path d="M8.5 8h7M8.5 12h7M8.5 16h4"/></svg>',
};
// Вкладки приложения (экраны ядра); порядок и видимость — settings.tabs / settings.tabsOff.
// «Студия» — не инструмент, а своя вкладка (модуль studio на весь экран, как «Библия»)
export const TAB_IDS = ['home', 'library', 'calendar', 'tools', 'studio'];
// В церковном режиме — ещё вкладка «Библия» (модуль bible на весь экран)
export const tabIds = (st) => (isOn(st, 'bible') ? [...TAB_IDS, 'bible'] : TAB_IDS);
// Вкладки, за которыми стоит модуль на весь экран
export const TAB_MODULES = { bible: 'bible', studio: 'studio' };
export const TAB_ICONS = {
  home: '<svg viewBox="0 0 28 28"><circle cx="14" cy="14" r="10"/><path d="M14 8.5V14l3.6 2.4"/></svg>',
  library: '<svg viewBox="0 0 28 28"><path d="M11 20V7.5l11-2.5V17.5"/><circle cx="8" cy="20" r="3"/><circle cx="19" cy="17.5" r="3"/></svg>',
  calendar: '<svg viewBox="0 0 28 28"><rect x="4.5" y="6" width="19" height="17.5" rx="3.5"/><path d="M4.5 11.5h19M9.5 3.5v4.5M18.5 3.5v4.5"/><circle cx="10" cy="16.5" r="1.3" fill="currentColor" stroke="none"/><circle cx="14" cy="16.5" r="1.3" fill="currentColor" stroke="none"/><circle cx="18" cy="16.5" r="1.3" fill="currentColor" stroke="none"/></svg>',
  bible: '<svg viewBox="0 0 28 28"><path d="M7 5.5A1.5 1.5 0 0 1 8.5 4H22v17H8.5A1.5 1.5 0 0 0 7 22.5z"/><path d="M7 22.5A1.5 1.5 0 0 0 8.5 24H22M14.5 7.5v7M12 10h5"/></svg>',
  tools: '<svg viewBox="0 0 28 28"><path d="M7 6v16M14 6v16M21 6v16"/><rect x="4.5" y="9" width="5" height="3.5" rx="1"/><rect x="11.5" y="15" width="5" height="3.5" rx="1"/><rect x="18.5" y="11" width="5" height="3.5" rx="1"/></svg>',
  studio: '<svg viewBox="0 0 28 28"><rect x="4" y="6" width="4.5" height="4.5" rx="1.2"/><rect x="11.75" y="6" width="4.5" height="4.5" rx="1.2"/><rect x="19.5" y="6" width="4.5" height="4.5" rx="1.2"/><rect x="4" y="13.5" width="4.5" height="4.5" rx="1.2"/><rect x="19.5" y="13.5" width="4.5" height="4.5" rx="1.2"/><rect x="4" y="21" width="20" height="3" rx="1.2"/></svg>',
};

// Пн…Вс на языке интерфейса
export const weekdays = () => (bareNow() ? Array(7).fill('') : withText(() => t('wd')).split(' ')); // «Минимал» без текста — без названий

export function relDay(ts, now = Date.now()) {
  const d = Math.round((dayStart(now) - dayStart(ts)) / DAY);
  return d === 0 ? t('rel.today') : d === 1 ? t('rel.yesterday') : tn('rel.daysAgo', d);
}

export const topbar = (right = '') => '<div class="topbar"><button class="avatar" data-act="panel" aria-label="' + esc(t('panel.aria')) + '">' + AVATAR + '</button>' + right + '</div>';

/* ---------- выученность: шкала 1–5 (полоски), 1–10 или % (кольцо) ---------- */

export const masteryLabel = (p) => t('mastery.' + masteryLevel(p));

const lvl = (n) => '<span class="lvl" role="img" aria-label="' + esc(t('mastery.aria5', { n })) + '">' +
  [1, 2, 3, 4, 5].map((i) => '<i class="' + (i <= n ? 'on' : '') + '" style="height:' + (5 + i * 1.6) + 'px"></i>').join('') + '</span>';

export function mRing(p, sz, n) {
  sz = Math.max(sz || 34, 34);
  const sw = sz >= 44 ? 4 : 3, r = sz / 2 - sw / 2 - 0.5, c = 2 * Math.PI * r, v = toScale(p, n), pc = n === 100, ns = String(v), cx = sz / 2;
  const fs = sz >= 44 ? (ns.length > 2 ? 14 : 16) : ns.length > 2 ? 10.5 : 12, ss = sz >= 44 ? 8 : 6.2;
  const sp = pc && (sz >= 44 || ns.length < 3), nw = ns.length * fs * 0.58, pw = sp ? ss * 0.85 : 0, x0 = cx - (nw + pw) / 2;
  return '<svg class="mring" width="' + sz + '" height="' + sz + '" viewBox="0 0 ' + sz + ' ' + sz + '" aria-hidden="true"><circle cx="' + cx + '" cy="' + cx + '" r="' + r + '" fill="none" stroke="var(--fill2)" stroke-width="' + sw + '"/>' +
    (p > 0 ? '<circle cx="' + cx + '" cy="' + cx + '" r="' + r + '" fill="none" stroke="var(--tint)" stroke-width="' + sw + '" stroke-linecap="round" stroke-dasharray="' + ((c * Math.min(100, p)) / 100).toFixed(2) + ' ' + c.toFixed(2) + '" transform="rotate(-90 ' + cx + ' ' + cx + ')"/>' : '') +
    '<text x="' + (x0 + nw / 2).toFixed(1) + '" y="' + (cx + fs * 0.36).toFixed(1) + '" text-anchor="middle" style="font:700 ' + fs + 'px var(--font);letter-spacing:-.03em;fill:var(--ink);font-variant-numeric:tabular-nums">' + ns + '</text>' +
    (sp ? '<text x="' + (x0 + nw + 0.3).toFixed(1) + '" y="' + (cx + fs * 0.36 - fs * 0.32).toFixed(1) + '" style="font:600 ' + ss + 'px var(--font);fill:var(--l2)">%</text>' : '') + '</svg>';
}

export function mBadge(p, settings, sz) {
  const n = scaleOf(settings);
  if (n === 5) return lvl(toScale(p, 5));
  const lab = n === 100 ? t('mastery.ariaPct', { n: Math.round(p) }) : t('mastery.ariaOf', { n: toScale(p, n), of: n });
  return '<span role="img" aria-label="' + esc(lab) + '">' + mRing(p, sz || 30, n) + '</span>';
}

function mCap(p, n) {
  const v = toScale(p, n), lab = masteryLabel(p);
  if (n === 5) return lab;
  return (n === 100 ? v + '%' : t('mastery.of', { n: v, of: n })) + ', ' + lab.toLowerCase();
}

export function mInput(p, settings) {
  const n = scaleOf(settings);
  const inner = n === 100
    ? '<div style="display:flex;align-items:center;gap:14px"><span data-mring>' + mRing(p, 44, n) + '</span><input type="range" class="range" data-mrange min="0" max="100" step="5" value="' + Math.round(p) +
      '" style="margin:0;flex:1" aria-label="' + esc(t('mastery.rangeAria')) + '"></div>'
    : seg('mpick', Array.from({ length: n }, (_, i) => [i + 1, i + 1]), toScale(p, n), t('mastery.title'));
  return '<div data-mwrap data-pct="' + p + '">' + inner + '<div class="segcap" data-mcap>' + esc(mCap(p, n)) + '</div></div>';
}

// Оживить mInput внутри root; возвращает функцию чтения процента
export function bindM(root, settings) {
  const n = scaleOf(settings), w = () => root.querySelector('[data-mwrap]');
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-seg="mpick"] [data-v]');
    if (!b) return;
    const p = fromScale(+b.dataset.v, n);
    w().dataset.pct = p;
    b.parentNode.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', x === b));
    w().querySelector('[data-mcap]').textContent = mCap(p, n);
  });
  root.addEventListener('input', (e) => {
    if (!e.target.matches('[data-mrange]')) return;
    const p = +e.target.value;
    w().dataset.pct = p;
    w().querySelector('[data-mring]').innerHTML = mRing(p, 44, n);
    w().querySelector('[data-mcap]').textContent = mCap(p, n);
  });
  return () => +w().dataset.pct;
}
