// Инструкция к инструменту (решение автора): при первом открытии — карточка поверх всего, закрывается только
// кнопкой «Понятно», и та становится активной через секунду — чтобы карточку прочитали, а не смахнули не глядя.
// Потом — по значку «?» в окне инструмента, из «Модулей и функций» или все заново («Показать подсказки заново»).
// Тексты — в i18n модуля: help.what (зачем), help.1…help.4 (как), help.tip (совет).
import { t, getLang } from '../i18n/index.js';
import { esc, leave } from '../ui/index.js';
import { moduleName } from './modules.js';

const WAIT_MS = 1000;
const queue = [];
let showing = false;

// Текст инструкции модуля на текущем языке (греческий и латынь — по-английски, как и остальное, чего нет)
export function helpOf(mod) {
  const l = getLang(), d = mod.i18n || {};
  const pick = (k) => d[l]?.[k] ?? (l === 'el' ? d.en?.[k] : null) ?? d.ru?.[k] ?? null;
  const what = pick('help.what');
  if (!what) return null;
  const items = [1, 2, 3, 4, 5].map((i) => pick('help.' + i)).filter(Boolean);
  return { what, items, tip: pick('help.tip') };
}

const seen = (st) => st.helpSeen || (st.helpSeen = {});

// Первое открытие инструмента: карточка в очередь (если в сессии открылось сразу несколько — по одной)
export function firstHelp(app, mod) {
  const st = app.store.state.settings;
  if (!st.configured || seen(st)[mod.id] || !helpOf(mod) || queue.some((q) => q.mod.id === mod.id)) return;
  queue.push({ app, mod, first: true });
  next();
}

// Открыть по просьбе (значок «?»): закрывается сразу и касанием мимо
export function showHelp(app, mod) {
  if (!helpOf(mod)) return;
  queue.unshift({ app, mod, first: false });
  next();
}

export function resetHelp(app) {
  app.store.state.settings.helpSeen = {};
  app.store.settingsChanged();
}

function next() {
  if (showing || !queue.length) return;
  showing = true;
  const { app, mod, first } = queue.shift(), h = helpOf(mod), name = moduleName(mod);
  const d = document.createElement('div');
  d.className = 'ask helpask';
  d.innerHTML = '<div class="alert helpcard" role="alertdialog" aria-label="' + esc(name) + '"><div class="ab">' +
    '<div class="hchead"><span class="hcic" style="background:' + (mod.color || '#8E8E93') + '">' + (mod.icon || '') + '</span><h3>' + esc(name) + '</h3></div>' +
    '<p class="hcwhat">' + esc(h.what) + '</p><ul class="hclist">' + h.items.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>' +
    (h.tip ? '<p class="hctip"><b>' + t('help.tip') + '</b> ' + esc(h.tip) + '</p>' : '') + '</div>' +
    '<div class="abtns"><button data-k="ok"' + (first ? ' disabled' : '') + '>' + t('help.ok') + '</button></div></div>';
  document.body.appendChild(d);
  const ok = d.querySelector('[data-k="ok"]');
  if (first) setTimeout(() => { ok.disabled = false; ok.focus(); }, WAIT_MS);
  const close = () => {
    if (first) { seen(app.store.state.settings)[mod.id] = true; app.store.settingsChanged(); }
    leave(d, 160);
    showing = false;
    setTimeout(next, 200);
  };
  d.addEventListener('click', (e) => {
    if (e.target.closest('[data-k="ok"]') && !ok.disabled) close();
    else if (!first && e.target === d) close(); // по просьбе — можно закрыть касанием мимо
  });
  d.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !first) close(); });
}
