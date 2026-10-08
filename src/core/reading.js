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

// День плана для даты (0 — день начала); null — план ещё не начался или уже закончился
const dayNum = (key) => { const [y, m, d] = key.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 864e5); };
export const dayKeyOf = (date) => { const d = new Date(date); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
export function planDay(b, date = Date.now()) {
  const p = b && PLANS[b.plan];
  if (!p || !b.start) return null;
  const i = dayNum(dayKeyOf(date)) - dayNum(b.start);
  return i >= 0 && i < p.days ? i : null;
}

// Чтение на дату: { day, keys, done } или null
export function readingFor(b, date = Date.now()) {
  const i = planDay(b, date);
  if (i == null) return null;
  const keys = PLANS[b.plan].day(i), read = (b && b.read) || {};
  return { day: i + 1, days: PLANS[b.plan].days, keys, done: keys.filter((k) => read[k]).length };
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
    setPlan(id, startKey) { const b = st(); b.plan = PLANS[id] ? id : null; b.start = b.plan ? startKey : null; store.settingsChanged(); },
  };
}
