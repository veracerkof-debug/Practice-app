// Календарь практики: репетиции, уроки, концерты, дедлайны, цели по песням. Без DOM.
// События — state.events (попадают в резервную копию, сливаются по id и updatedAt, удалённые — с флагом deleted).
// Типы событий — settings.cal.kinds: названия и цвета свободные, можно добавлять свои.
import { uid, dayStart, dayKey, pad2, DAY } from './time.js';

// Типы по умолчанию; названия — ключи i18n (cal.kind.<key>), создаются один раз на языке пользователя.
// task — событие-задача: его можно отметить выполненным (дедлайн, цель)
export const KINDDEF = [
  ['rehearsal', '#007AFF'], ['lesson', '#AF52DE'], ['concert', '#FF3B30'],
  ['recording', '#00C7BE'], ['deadline', '#FF9500', true], ['goal', '#34C759', true],
];

export const REPEATS = ['none', 'daily', 'weekly', 'monthly', 'yearly'];

export function ensureCal(state, t = (k) => k) {
  const st = state.settings;
  if (!st.cal) st.cal = {};
  if (!st.cal.kinds) st.cal.kinds = KINDDEF.map(([key, color, task]) => ({ id: key, name: t('cal.kind.' + key), color, ...(task ? { task: true } : {}) }));
  return st.cal;
}

export const liveEvents = (state) => (state.events || []).filter((e) => !e.deleted);
export const kindOf = (cal, id) => cal.kinds.find((k) => k.id === id) || null;
export const colorOf = (cal, ev) => ev.color || (kindOf(cal, ev.kind) || {}).color || '#8E8E93';

// Новое событие: на выбранный день, ближайший целый час после «сейчас» (или 18:00 для другого дня), на час
export function newEvent(day, now = Date.now(), patch = {}) {
  const d0 = dayStart(day);
  let start = d0 + 18 * 3600000;
  if (d0 === dayStart(now)) { const h = new Date(now).getHours() + 1; start = d0 + Math.min(23, h) * 3600000; }
  return { id: 'e' + uid(), title: '', kind: 'rehearsal', start, end: start + 3600000, allDay: false, repeat: 'none', days: null, until: null,
    songs: [], place: '', note: '', color: null, skip: [], done: [], ...patch };
}

export function saveEvent(store, ev) {
  const list = store.state.events || (store.state.events = []);
  ev.updatedAt = store.now();
  const i = list.findIndex((e) => e.id === ev.id);
  if (i >= 0) list[i] = ev; else list.push(ev);
  store.save();
}

export function deleteEvent(store, id) {
  const ev = (store.state.events || []).find((e) => e.id === id);
  if (!ev) return;
  ev.deleted = true;
  ev.updatedAt = store.now();
  store.save();
}

// Убрать одно повторение (по дню начала) — остальные остаются
export function skipOccurrence(store, ev, start) {
  ev.skip = [...new Set([...(ev.skip || []), dayKey(start)])];
  saveEvent(store, ev);
}

// Отметка «выполнено» для события-задачи; у повторяющихся — для конкретного дня
export const isDone = (ev, start) => (ev.done || []).includes(dayKey(start));
export function toggleDone(store, ev, start) {
  const k = dayKey(start), s = new Set(ev.done || []);
  s.has(k) ? s.delete(k) : s.add(k);
  ev.done = [...s];
  saveEvent(store, ev);
}

const len = (ev) => Math.max(0, (ev.end || ev.start) - ev.start);

// Сдвиг даты на n единиц повтора с сохранением времени суток (переход на летнее время не ломает часы)
function shift(ts, unit, n) {
  const d = new Date(ts);
  if (unit === 'daily') d.setDate(d.getDate() + n);
  else if (unit === 'weekly') d.setDate(d.getDate() + 7 * n);
  else if (unit === 'monthly') {
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + n);
    // в месяце нет такого числа (31-е) — повтора в этом месяце нет
    if (day > new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()) return null;
    d.setDate(day);
  } else if (unit === 'yearly') {
    const m = d.getMonth(), day = d.getDate();
    d.setFullYear(d.getFullYear() + n, m, 1);
    if (day > new Date(d.getFullYear(), m + 1, 0).getDate()) return null;
    d.setDate(day);
  }
  return d.getTime();
}

// Повторения событий, пересекающие [from, to): [{ ev, start, end }] по времени начала.
// Еженедельный повтор может идти по нескольким дням недели (ev.days — 0 пн … 6 вс)
export function occurrences(events, from, to) {
  const out = [];
  const push = (ev, s) => {
    const e = s + len(ev), endEx = ev.allDay ? dayStart(e) + DAY : Math.max(e, s + 1);
    if (endEx <= from || s >= to) return;
    if ((ev.skip || []).includes(dayKey(s))) return;
    if (ev.until != null && dayStart(s) > dayStart(ev.until)) return;
    out.push({ ev, start: s, end: e });
  };
  events.forEach((ev) => {
    if (ev.deleted) return;
    const r = ev.repeat || 'none';
    if (r === 'none') { push(ev, ev.start); return; }
    const stop = ev.until != null ? Math.min(to, dayStart(ev.until) + DAY) : to;
    if (r === 'weekly' && ev.days && ev.days.length) {
      // по дням недели: идём по неделям от недели начала
      const wd0 = (new Date(ev.start).getDay() + 6) % 7, tod = ev.start - dayStart(ev.start);
      const wk0 = dayStart(ev.start) - wd0 * DAY;
      const first = Math.max(0, Math.floor((from - len(ev) - DAY - wk0) / (7 * DAY)));
      for (let w = first; ; w++) {
        const ws = shift(wk0, 'weekly', w);
        if (ws >= stop) break;
        ev.days.slice().sort().forEach((d) => {
          const s = dayStart(shift(ws, 'daily', d) + 3 * 3600000) + tod;
          if (s >= ev.start) push(ev, s);
        });
        if (w - first > 600) break;
      }
      return;
    }
    // примерное число шагов до from, чтобы не идти от начала годами
    const step = { daily: DAY, weekly: 7 * DAY, monthly: 28 * DAY, yearly: 365 * DAY }[r];
    let n = Math.max(0, Math.floor((from - len(ev) - ev.start) / step) - 2);
    if (r === 'monthly') n = Math.max(0, n - Math.ceil(n / 10));
    for (let k = 0; k < 2000; k++, n++) {
      const s = shift(ev.start, r, n);
      if (s == null) continue;
      if (s >= stop) break;
      push(ev, s);
    }
  });
  return out.sort((a, b) => a.start - b.start || (b.ev.allDay ? 1 : 0) - (a.ev.allDay ? 1 : 0));
}

export const onDay = (events, day) => occurrences(events, dayStart(day), dayStart(day) + DAY);

// Раскладка событий дня по колонкам (пересекающиеся — рядом): [{ o, col, cols }]
export function layoutDay(occ) {
  const items = occ.filter((o) => !o.ev.allDay).map((o) => ({ o, s: o.start, e: Math.max(o.end, o.start + 15 * 60000) })).sort((a, b) => a.s - b.s || b.e - a.e);
  const out = [];
  let group = [], groupEnd = -Infinity;
  const flush = () => {
    const cols = [];
    group.forEach((it) => {
      let c = cols.findIndex((end) => end <= it.s);
      if (c < 0) { c = cols.length; cols.push(0); }
      cols[c] = it.e;
      it.col = c;
    });
    group.forEach((it) => out.push({ o: it.o, col: it.col, cols: cols.length }));
    group = [];
  };
  items.forEach((it) => {
    if (it.s >= groupEnd && group.length) flush();
    group.push(it);
    groupEnd = Math.max(groupEnd, it.e);
  });
  if (group.length) flush();
  return out;
}

// Ближайшие события с now (идущие сейчас — тоже), не дальше days дней
export const upcoming = (events, now, days = 7) => occurrences(events, now, dayStart(now) + (days + 1) * DAY).filter((o) => (o.ev.allDay ? dayStart(o.start) + DAY : o.end) > now);

/* ---------- экспорт .ics (RFC 5545) ---------- */

const icsEsc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const dt = (ts) => { const d = new Date(ts); return d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + 'T' + pad2(d.getHours()) + pad2(d.getMinutes()) + '00'; };
const dOnly = (ts) => { const d = new Date(ts); return '' + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()); };
const utc = (ts) => new Date(ts).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
// Строки длиннее 75 байт переносятся (продолжение начинается с пробела)
function fold(line) {
  const out = [];
  let cur = '', bytes = 0;
  for (const ch of line) {
    const b = new TextEncoder().encode(ch).length;
    if (bytes + b > 74) { out.push(cur); cur = ' '; bytes = 1; }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join('\r\n');
}
const BYDAY = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

// Время — «плавающее» местное (без часового пояса), как его видит пользователь
export function toICS(events, { cal, songs = [], now = Date.now(), name = 'Melete' } = {}) {
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Practice//Calendar//RU', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:' + icsEsc(name)];
  events.filter((e) => !e.deleted).forEach((ev) => {
    const k = cal ? kindOf(cal, ev.kind) : null, sn = (ev.songs || []).map((id) => (songs.find((s) => s.id === id) || {}).title).filter(Boolean);
    L.push('BEGIN:VEVENT', 'UID:' + ev.id + '@practice', 'DTSTAMP:' + utc(ev.updatedAt || now));
    if (ev.allDay) L.push('DTSTART;VALUE=DATE:' + dOnly(ev.start), 'DTEND;VALUE=DATE:' + dOnly(dayStart(ev.end || ev.start) + DAY + 3 * 3600000));
    else L.push('DTSTART:' + dt(ev.start), 'DTEND:' + dt(ev.end || ev.start + 3600000));
    L.push('SUMMARY:' + icsEsc(ev.title || (k && k.name) || ''));
    if (k) L.push('CATEGORIES:' + icsEsc(k.name));
    if (ev.place) L.push('LOCATION:' + icsEsc(ev.place));
    const desc = [ev.note, sn.length ? sn.join(', ') : ''].filter(Boolean).join('\n');
    if (desc) L.push('DESCRIPTION:' + icsEsc(desc));
    if (ev.repeat && ev.repeat !== 'none') {
      let rule = 'FREQ=' + ev.repeat.toUpperCase();
      if (ev.repeat === 'weekly' && ev.days && ev.days.length) rule += ';BYDAY=' + ev.days.slice().sort().map((d) => BYDAY[d]).join(',');
      if (ev.until != null) rule += ';UNTIL=' + dOnly(ev.until) + (ev.allDay ? '' : 'T235959');
      L.push('RRULE:' + rule);
      (ev.skip || []).forEach((key) => {
        const [y, m, d] = key.split('-').map(Number), s = new Date(y, m - 1, d).getTime() + (ev.start - dayStart(ev.start));
        L.push(ev.allDay ? 'EXDATE;VALUE=DATE:' + dOnly(s) : 'EXDATE:' + dt(s));
      });
    }
    L.push('END:VEVENT');
  });
  L.push('END:VCALENDAR');
  return L.map(fold).join('\r\n') + '\r\n';
}
