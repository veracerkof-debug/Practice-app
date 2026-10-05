// Реестр модулей. Контракт — MODULE_SPEC.md.
// Модули подключаются сами: любая папка с index.js в src/modules/ (встроенные) и src/modules-local/ (личные модули,
// в репозиторий не попадают — см. .gitignore). Новый модуль = новая папка; правок в ядре не нужно.
// id встроенных совпадают с прототипом (metro, tuner, timer, audio, piano, drone, theory, ear, notes),
// чтобы сохранённые раскладки окон и настройки переносились без миграции.

const found = {
  ...import.meta.glob('./*/index.js', { eager: true }),
  ...import.meta.glob('../modules-local/*/index.js', { eager: true }),
};

// Обязательные поля описания модуля; модуль без них не подключается (и не ломает приложение)
const REQUIRED = { id: 'string', name: 'object', icon: 'string', sizes: 'object', mount: 'function', resize: 'function', unmount: 'function' };

export function validate(m) {
  if (!m || typeof m !== 'object') return 'no default export';
  for (const [k, type] of Object.entries(REQUIRED)) if (typeof m[k] !== type) return 'field "' + k + '" must be ' + type;
  if (!/^[a-z][a-z0-9-]*$/.test(m.id)) return 'id must be latin lowercase';
  if (!m.name.ru && !m.name.en) return 'name needs ru or en';
  return null;
}

const list = [], skipped = [];
Object.entries(found).forEach(([path, mod]) => {
  const m = mod.default, err = validate(m);
  if (err) { skipped.push({ path, err }); return; }
  if (list.some((x) => x.id === m.id)) { skipped.push({ path, err: 'duplicate id "' + m.id + '"' }); return; }
  m.local = path.includes('modules-local');
  list.push(m);
});
skipped.forEach((s) => console.warn('[modules] пропущен ' + s.path + ': ' + s.err));

// Порядок — по полю order (встроенные — как на экране «Инструменты» прототипа), затем по id
list.sort((a, b) => (a.order ?? 1000) - (b.order ?? 1000) || a.id.localeCompare(b.id));

export const modules = list;
export const skippedModules = skipped;
export const moduleById = (id) => modules.find((m) => m.id === id);
