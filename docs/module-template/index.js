// Шаблон модуля: счётчик повторов. Скопируй папку в src/modules-local/<твой-id>/, поменяй id и название —
// после `npm run dev` или `npm run build` модуль появится во «Инструментах», в сессии и в «Модулях и функциях».
// Контракт — MODULE_SPEC.md. Ядро не знает внутренностей модуля: всё общение — через ctx.
import ru from './i18n/ru.json';
import uz from './i18n/uz.json';
import en from './i18n/en.json';

let host = null, ctx = null, size = 'full';

// Настройки на этом устройстве: ctx.store (пространство имён модуля)
const st = () => ctx.store.all();

function render() {
  const { t } = ctx, n = st().count || 0, big = size === 'full' || size === 'half';
  host.innerHTML = '<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px">' +
    (big ? '<div class="l2">' + t('hint') + '</div>' : '') +
    '<button class="bigplay" data-x="add" aria-label="' + t('add') + '" style="font-size:' + (big ? 40 : 22) + 'px;font-weight:700">' + n + '</button>' +
    ctx.ui.icb('data-x="reset"', ctx.ui.icons.stop, t('reset'), 'sm') + '</div>';
}

function onClick(e) {
  const b = e.target.closest('[data-x]');
  if (!b) return;
  if (b.dataset.x === 'add') st().count = (st().count || 0) + 1;
  else st().count = 0;
  ctx.store.save();
  render();
}

export default {
  id: 'counter',                       // латиница, уникально; совпадает с именем папки — удобнее
  order: 500,                          // место среди инструментов (встроенные — 10…90)
  name: { ru: ru.name, uz: uz.name, en: en.name },
  i18n: { ru, uz, en },                // ключ about — описание в «Модулях и функциях»
  icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 8v8M8 12h8"/></svg>',
  color: '#00C7BE',
  sizes: ['full', 'half', 'quarter', 'strip'],
  status: (c) => c.tn('count', c.store.get('count', 0)),
  mount(el, c, sz) { host = el; ctx = c; size = sz; host.addEventListener('click', onClick); render(); },
  resize(sz) { size = sz; render(); },
  unmount() { if (host) host.removeEventListener('click', onClick); host = null; },
};
