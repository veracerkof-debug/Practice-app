// Инструкции (решение автора): к каждому инструменту и к каждому механизму приложения (песни, сессия, календарь,
// папка Melete, команда, Мелета, свои данные) — карточка на языке интерфейса (ru, uz, en).
// При открытии инструмента или раздела карточка показывается, пока в ней не отмечено «Больше не показывать»
// (не чаще раза за запуск приложения); в самый первый раз кнопка «Понятно» оживает через секунду — чтобы карточку
// прочитали, а не смахнули не глядя. Все инструкции — в «Профиль → Инструкции», у инструмента — значок «?».
// Тексты: у модуля — в его i18n (help.what, help.1…help.6, help.tip); у механизмов — в i18n ядра (hc.<id>.*).
import { t, getLang, isBare, hasMascot } from '../i18n/index.js';
import { mascotSVG } from '../ui/mascot.js';
import { esc, leave } from '../ui/index.js';
import { moduleName } from './modules.js';

const WAIT_MS = 1000;
const queue = [];
const thisRun = new Set(); // показанные за этот запуск
let showing = false;

// Механизмы приложения: id → значок и цвет
const IC = {
  start: '<svg viewBox="0 0 24 24"><path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/></svg>',
  songs: '<svg viewBox="0 0 24 24"><path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></svg>',
  session: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M10 8.5v7l5.5-3.5z"/></svg>',
  calendar: '<svg viewBox="0 0 24 24"><rect x="4" y="5.5" width="16" height="14" rx="2.5"/><path d="M4 10h16M9 3.5v4M15 3.5v4"/></svg>',
  folder: '<svg viewBox="0 0 24 24"><path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/></svg>',
  share: '<svg viewBox="0 0 24 24"><path d="M12 15V4M8 7.5 12 3.5l4 4M6 11H5v9h14v-9h-1"/></svg>',
  melete: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M7 10q2.5-3 5 0q2.5-3 5 0M10.8 12v3q1.2 1 2.4 0v-3M12 16v2"/></svg>',
  owndata: '<svg viewBox="0 0 24 24"><path d="M6 3.5h8l4 4v13H6z"/><path d="M14 3.5v4h4M9 13h6M9 16.5h6"/></svg>',
};
const COLOR = { start: '#9C7242', songs: '#A75750', session: '#5F8568', calendar: '#567198', folder: '#AE934D', share: '#4A8681', melete: '#646493', owndata: '#866B9D' };
export const CORE_TOPICS = Object.keys(IC);

// Тема-инструмент из модуля
export const modTopic = (mod) => ({ id: mod.id, name: moduleName(mod), icon: mod.icon || '', color: mod.color || '#8E8E93', on: mod.on, i18n: mod.i18n || {}, pre: 'help.' });
// Тема-механизм ядра
export const coreTopic = (id) => ({ id: 'core:' + id, name: t('hc.' + id + '.name'), icon: IC[id], color: COLOR[id], core: id });

// Текст инструкции на текущем языке (чего нет — по-русски)
export function helpOf(x) {
  if (!x) return null;
  const tp = x.core ? x : x.mount ? modTopic(x) : x;
  if (tp.core) {
    const k = (s) => { const v = t('hc.' + tp.core + '.' + s); return v === 'hc.' + tp.core + '.' + s ? null : v; };
    const what = k('what');
    return what ? { what, items: [1, 2, 3, 4, 5, 6].map((i) => k(String(i))).filter(Boolean), tip: k('tip') } : null;
  }
  const l = getLang(), d = tp.i18n || {}, pick = (k) => d[l]?.[k] ?? d.ru?.[k] ?? null;
  const what = pick('help.what');
  return what ? { what, items: [1, 2, 3, 4, 5, 6].map((i) => pick('help.' + i)).filter(Boolean), tip: pick('help.tip') } : null;
}

const never = (st) => st.helpSeen || (st.helpSeen = {}); // отмечено «больше не показывать» (и прежние «уже видел»)
const once = (st) => st.helpOnce || (st.helpOnce = {}); // хоть раз показывалась (первый раз — «Понятно» через секунду)

// Инструмент или механизм открыт: карточка, если её не просили больше не показывать (раз за запуск)
export function firstHelp(app, x) {
  const st = app.store.state.settings, tp = x.core ? x : modTopic(x);
  if (isBare()) return; // «Минимал» без текста: инструкции — только по «?» и из профиля
  if (!st.configured || never(st)[tp.id] || thisRun.has(tp.id) || !helpOf(tp) || queue.some((q) => q.tp.id === tp.id)) return;
  thisRun.add(tp.id);
  queue.push({ app, tp, auto: true });
  setTimeout(next, 600); // сначала — сам экран (и окна, которые появляются вместе с ним: соглашение и т. п.)
}
// Механизм ядра открыт (песни, сессия, календарь, папка, команда, Мелета, свои данные)
export const coreHelp = (app, id) => firstHelp(app, coreTopic(id));

// Открыть по просьбе (значок «?», список инструкций): закрывается сразу и касанием мимо
export function showHelp(app, x) {
  const tp = x.core ? x : x.mount ? modTopic(x) : x;
  if (!helpOf(tp)) return;
  queue.unshift({ app, tp, auto: false });
  next();
}

export function resetHelp(app) {
  const st = app.store.state.settings;
  st.helpSeen = {}; st.helpOnce = {};
  thisRun.clear();
  app.store.settingsChanged();
}

// Другое окно поверх (условия, подтверждение, регистрация) — инструкция ждёт, пока его закроют
let waitT = 0;
const busy = () => !!document.querySelector('.ask:not(.helpask), .onb');
function next() {
  if (showing || !queue.length) return;
  if (busy()) { clearTimeout(waitT); waitT = setTimeout(next, 400); return; }
  showing = true;
  const { app, tp, auto } = queue.shift(), h = helpOf(tp), st = app.store.state.settings;
  const wait = auto && !once(st)[tp.id], off = !!never(st)[tp.id];
  const d = document.createElement('div');
  d.className = 'ask helpask';
  d.innerHTML = '<div class="alert helpcard" role="alertdialog" aria-label="' + esc(tp.name) + '"><div class="ab">' +
    '<div class="hchead"><span class="hcic" style="background:' + tp.color + ';color:' + (tp.on || '#fff') + '">' + tp.icon + '</span><h3>' + esc(tp.name) + '</h3></div>' +
    '<p class="hcwhat">' + esc(h.what) + '</p><ul class="hclist">' + h.items.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>' +
    // совет — от лица маскота (лицо и имя); без маскота — просто «Совет»
    (h.tip ? '<p class="hctip">' + (hasMascot() ? '<span class="hcm">' + mascotSVG('wink', { size: 28 }) + '<b>' + esc(t('mascot.says')) + '</b></span>' : '<b>' + t('help.tip') + '</b> ') + esc(h.tip) + '</p>' : '') +
    '<label class="hcnever"><input type="checkbox" data-k="never"' + (off ? ' checked' : '') + '><span>' + t('help.never') + '</span></label></div>' +
    '<div class="abtns"><button data-k="ok"' + (wait ? ' disabled' : '') + '>' + t('help.ok') + '</button></div></div>';
  document.body.appendChild(d);
  const ok = d.querySelector('[data-k="ok"]');
  if (wait) setTimeout(() => { ok.disabled = false; ok.focus(); }, WAIT_MS);
  const close = () => {
    const nv = d.querySelector('[data-k="never"]').checked;
    if (nv) never(st)[tp.id] = true; else delete never(st)[tp.id];
    once(st)[tp.id] = true;
    app.store.settingsChanged();
    leave(d, 160);
    showing = false;
    setTimeout(next, 200);
  };
  d.addEventListener('click', (e) => {
    if (e.target.closest('[data-k="ok"]') && !ok.disabled) close();
    else if (!wait && e.target === d) close(); // можно закрыть касанием мимо (кроме самого первого раза)
  });
  d.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !wait) close(); });
}
