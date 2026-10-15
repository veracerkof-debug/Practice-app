// Чтение Библии (церковный режим): планы, чтения дня, прочитанные главы. Без DOM.
// Состояние — settings.bible: { plan, start ('YYYY-MM-DD'), read: { 'GEN.1': ts }, pos: { code, ch } } —
// в общих данных, поэтому попадает в резервную копию. Ритм, как у практики, недельный: пропущенный день
// не «сгорает», чтения просто ждут.
import { BOOKS, ALL } from './bible.js';

const chaptersOf = (codes) => BOOKS.filter((b) => codes.includes(b.code)).flatMap((b) => Array.from({ length: b.chapters }, (_, k) => b.code + '.' + (k + 1)));
const OT = ALL.filter((k) => !BOOKS.find((b) => b.code === k.split('.')[0]).nt);
const NT = ALL.filter((k) => BOOKS.find((b) => b.code === k.split('.')[0]).nt);

// Поровну на дни: день i — главы с floor(i·N/D) по floor((i+1)·N/D)
export function spread(list, days) {
  return Array.from({ length: days }, (_, i) => list.slice(Math.floor((i * list.length) / days), Math.floor(((i + 1) * list.length) / days)));
}

// Планы: id → { days, day(i) → ключи глав }
const join = (...parts) => (i) => parts.flatMap((p) => p[i] || []);
export const PLANS = {
  year: { days: 365, day: join(spread(ALL, 365)) },                                   // вся Библия по порядку за год
  yearpar: { days: 365, day: join(spread(OT, 365), spread(NT, 365)) },               // Ветхий и Новый Завет параллельно
  nt90: { days: 90, day: join(spread(NT, 90)) },                                      // Новый Завет за 90 дней
  psprov: { days: 31, day: join(spread(chaptersOf(['PSA']), 31), spread(chaptersOf(['PRO']), 31)) }, // Псалтирь и Притчи за месяц
};
export const PLAN_IDS = Object.keys(PLANS);

// Свои планы (settings.bible.custom): { id: 'c…', name, books: [коды книг], days } — главы выбранных книг по порядку,
// поровну на дни. Готовые наборы книг для быстрого выбора
export const BOOK_SETS = {
  all: BOOKS.map((b) => b.code), ot: BOOKS.filter((b) => !b.nt).map((b) => b.code), nt: BOOKS.filter((b) => b.nt).map((b) => b.code),
  torah: ['GEN', 'EXO', 'LEV', 'NUM', 'DEU'], gospels: ['MAT', 'MAR', 'LUK', 'JOH'], psa: ['PSA'], pro: ['PRO'],
  epistles: BOOKS.filter((b) => b.nt && b.i >= 44 && b.code !== 'REV').map((b) => b.code),
};
export const chaptersIn = (codes) => chaptersOf(codes).length;
const CACHE = new Map();
// План по id: готовый или свой (null — нет такого)
export function planOf(b, id = b && b.plan) {
  if (PLANS[id]) return PLANS[id];
  const c = ((b && b.custom) || []).find((x) => x.id === id);
  if (!c) return null;
  const key = id + '|' + (c.books || []).join(',') + '|' + c.days;
  if (!CACHE.has(key)) {
    const list = chaptersOf(c.books || []), days = Math.max(1, Math.min(Math.round(+c.days) || 1, list.length || 1));
    CACHE.set(key, list.length ? { days, day: join(spread(list, days)), name: c.name, custom: true } : null);
  }
  return CACHE.get(key);
}

// День плана для даты (0 — день начала); null — план ещё не начался или уже закончился
const dayNum = (key) => { const [y, m, d] = key.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 864e5); };
export const dayKeyOf = (date) => { const d = new Date(date); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
export function planDay(b, date = Date.now()) {
  const p = b && planOf(b);
  if (!p || !b.start) return null;
  const i = dayNum(dayKeyOf(date)) - dayNum(b.start);
  return i >= 0 && i < p.days ? i : null;
}

// Чтение на дату: { day, keys, done } или null
export function readingFor(b, date = Date.now()) {
  const i = planDay(b, date);
  if (i == null) return null;
  const p = planOf(b), keys = p.day(i), read = (b && b.read) || {};
  return { day: i + 1, days: p.days, keys, done: keys.filter((k) => read[k]).length };
}

// Неделя (понедельник — воскресенье): сколько глав по плану и сколько из них прочитано
export function weekReading(b, now = Date.now()) {
  const d = new Date(now), wd = (d.getDay() + 6) % 7, mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() - wd);
  let planned = 0, done = 0;
  for (let k = 0; k < 7; k++) {
    const r = readingFor(b, new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + k));
    if (r) { planned += r.keys.length; done += r.done; }
  }
  return { planned, done };
}

// Прочитано по книге и всего
export const readCount = (b, code) => Object.keys((b && b.read) || {}).filter((k) => !code || k.split('.')[0] === code).length;

// Первая непрочитанная глава чтения дня (или первая глава дня, если всё прочитано)
export const nextOf = (b, r) => (r ? r.keys.find((k) => !((b && b.read) || {})[k]) || r.keys[0] : null);

// Состояние чтения в общих данных и действия с ним (ядро: app.bible, модулю — ctx.bible)
export function createBible(store) {
  const st = () => (store.state.settings.bible ??= { plan: null, start: null, read: {}, pos: null });
  return {
    st,
    isRead: (k) => !!(st().read || {})[k],
    readIn: (code) => readCount(st(), code),
    mark(k, on) { const r = (st().read ??= {}); if (on) r[k] = Date.now(); else delete r[k]; store.settingsChanged(); },
    pos: () => st().pos,
    setPos(p) { st().pos = p; store.persist(); }, // место чтения — без перерисовки приложения
    today: (date) => readingFor(st(), date),
    week: () => weekReading(st()),
    setPlan(id, startKey) { const b = st(); b.plan = planOf(b, id) ? id : null; b.start = b.plan ? startKey : null; store.settingsChanged(); },
    plan: () => planOf(st()),
    customs: () => st().custom || [],
    // свой план: сохранить (новый или изменённый) и сделать текущим с сегодняшнего дня → id
    saveCustom({ id, name, books, days }, startKey) {
      const b = st(), list = (b.custom ??= []), codes = BOOKS.map((x) => x.code).filter((c) => (books || []).includes(c));
      const p = { id: id || 'c' + Date.now().toString(36), name: String(name || '').trim().slice(0, 60) || '—', books: codes, days: Math.max(1, Math.round(+days) || 1) };
      const i = list.findIndex((x) => x.id === p.id);
      if (i >= 0) list[i] = p; else list.push(p);
      b.plan = p.id; b.start = startKey;
      store.settingsChanged();
      return p.id;
    },
    removeCustom(id) { const b = st(); b.custom = (b.custom || []).filter((x) => x.id !== id); if (b.plan === id) { b.plan = null; b.start = null; } store.settingsChanged(); },
  };
}
