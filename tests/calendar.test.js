import { describe, it, expect } from 'vitest';
import { occurrences, onDay, layoutDay, upcoming, newEvent, toICS, ensureCal, colorOf, saveEvent, deleteEvent, skipOccurrence, toggleDone, isDone } from '../src/core/calendar.js';
import { createStore, merge, blank } from '../src/core/store.js';
import { DAY, dayKey } from '../src/core/time.js';

const at = (y, m, d, h = 0, min = 0) => new Date(y, m - 1, d, h, min).getTime();
const ev = (p) => ({ id: p.id || 'e' + Math.random(), title: 'x', kind: 'rehearsal', allDay: false, repeat: 'none', skip: [], done: [], ...p });
const keys = (occ) => occ.map((o) => dayKey(o.start));

describe('повторы', () => {
  it('разовое событие попадает только в свой день', () => {
    const e = ev({ start: at(2026, 10, 7, 18), end: at(2026, 10, 7, 20) });
    expect(onDay([e], at(2026, 10, 7))).toHaveLength(1);
    expect(onDay([e], at(2026, 10, 8))).toHaveLength(0);
  });
  it('событие через полночь видно в обоих днях', () => {
    const e = ev({ start: at(2026, 10, 7, 23), end: at(2026, 10, 8, 1) });
    expect(onDay([e], at(2026, 10, 8))).toHaveLength(1);
  });
  it('событие на весь день на несколько дней', () => {
    const e = ev({ allDay: true, start: at(2026, 10, 7), end: at(2026, 10, 9) });
    expect([7, 8, 9, 10].map((d) => onDay([e], at(2026, 10, d)).length)).toEqual([1, 1, 1, 0]);
  });
  it('ежедневно, еженедельно, с датой окончания и пропуском', () => {
    const d = ev({ start: at(2026, 10, 1, 9), end: at(2026, 10, 1, 10), repeat: 'daily', until: at(2026, 10, 5), skip: ['2026-10-03'] });
    expect(keys(occurrences([d], at(2026, 9, 1), at(2026, 11, 1)))).toEqual(['2026-10-01', '2026-10-02', '2026-10-04', '2026-10-05']);
    const w = ev({ start: at(2026, 10, 6, 18), end: at(2026, 10, 6, 19), repeat: 'weekly' });
    expect(keys(occurrences([w], at(2026, 10, 1), at(2026, 11, 1)))).toEqual(['2026-10-06', '2026-10-13', '2026-10-20', '2026-10-27']);
  });
  it('еженедельно по нескольким дням недели', () => {
    // вт и чт, начало — во вторник 6 октября 2026
    const w = ev({ start: at(2026, 10, 6, 18), end: at(2026, 10, 6, 20), repeat: 'weekly', days: [1, 3] });
    expect(keys(occurrences([w], at(2026, 10, 1), at(2026, 10, 16)))).toEqual(['2026-10-06', '2026-10-08', '2026-10-13', '2026-10-15']);
    expect(new Date(occurrences([w], at(2026, 10, 8), at(2026, 10, 9))[0].start).getHours()).toBe(18);
  });
  it('ежемесячно 31-го — только в месяцах, где оно есть; далеко в будущем считается быстро и точно', () => {
    const m = ev({ start: at(2026, 1, 31, 12), end: at(2026, 1, 31, 13), repeat: 'monthly' });
    expect(keys(occurrences([m], at(2026, 1, 1), at(2026, 6, 1)))).toEqual(['2026-01-31', '2026-03-31', '2026-05-31']);
    expect(keys(occurrences([m], at(2036, 1, 1), at(2036, 4, 1)))).toEqual(['2036-01-31', '2036-03-31']);
    const y = ev({ start: at(2024, 2, 29, 12), end: at(2024, 2, 29, 13), repeat: 'yearly' });
    expect(keys(occurrences([y], at(2025, 1, 1), at(2029, 1, 1)))).toEqual(['2028-02-29']);
  });
  it('время суток сохраняется при переходе на летнее время', () => {
    const d = ev({ start: at(2026, 3, 20, 9), end: at(2026, 3, 20, 10), repeat: 'daily' });
    expect(occurrences([d], at(2026, 4, 10), at(2026, 4, 11)).map((o) => new Date(o.start).getHours())).toEqual([9]);
  });
  it('удалённые не показываются', () => {
    expect(onDay([ev({ start: at(2026, 10, 7, 9), deleted: true })], at(2026, 10, 7))).toHaveLength(0);
  });
});

describe('раскладка дня', () => {
  it('пересекающиеся — в соседних колонках, отдельные — во всю ширину', () => {
    const a = ev({ id: 'a', start: at(2026, 10, 7, 10), end: at(2026, 10, 7, 12) });
    const b = ev({ id: 'b', start: at(2026, 10, 7, 11), end: at(2026, 10, 7, 13) });
    const c = ev({ id: 'c', start: at(2026, 10, 7, 15), end: at(2026, 10, 7, 16) });
    const L = layoutDay(onDay([a, b, c], at(2026, 10, 7)));
    const m = Object.fromEntries(L.map((x) => [x.o.ev.id, [x.col, x.cols]]));
    expect(m).toEqual({ a: [0, 2], b: [1, 2], c: [0, 1] });
  });
});

describe('ближайшие и новое событие', () => {
  it('идущее сейчас — среди ближайших, прошедшее — нет', () => {
    const now = at(2026, 10, 7, 12);
    const past = ev({ id: 'p', start: at(2026, 10, 7, 9), end: at(2026, 10, 7, 10) });
    const cur = ev({ id: 'c', start: at(2026, 10, 7, 11), end: at(2026, 10, 7, 13) });
    const far = ev({ id: 'f', start: at(2026, 10, 30, 11), end: at(2026, 10, 30, 13) });
    expect(upcoming([past, cur, far], now).map((o) => o.ev.id)).toEqual(['c']);
  });
  it('новое на сегодня — со следующего часа, на другой день — в 18:00', () => {
    expect(new Date(newEvent(at(2026, 10, 7), at(2026, 10, 7, 14, 20)).start).getHours()).toBe(15);
    expect(new Date(newEvent(at(2026, 10, 9), at(2026, 10, 7, 14, 20)).start).getHours()).toBe(18);
  });
});

describe('хранение', () => {
  const mem = () => { const m = {}; return { getItem: (k) => m[k] ?? null, setItem: (k, v) => { m[k] = v; } }; };
  it('сохраняется, удаляется с флагом, сливается по updatedAt', () => {
    let t = 1000;
    const store = createStore({ storage: mem(), now: () => t });
    const e = newEvent(at(2026, 10, 7), 0, { title: 'Репетиция' });
    saveEvent(store, e);
    expect(store.state.events).toHaveLength(1);
    t = 2000;
    skipOccurrence(store, e, e.start);
    toggleDone(store, e, e.start);
    expect(isDone(e, e.start)).toBe(true);
    t = 3000;
    deleteEvent(store, e.id);
    const old = { ...blank(), events: [{ ...e, deleted: false, updatedAt: 1500 }] };
    expect(merge(old, store.state).events[0].deleted).toBe(true);
    expect(merge(store.state, old).events[0].deleted).toBe(true);
  });
  it('типы событий создаются один раз', () => {
    const s = blank(), cal = ensureCal(s, (k) => k.toUpperCase());
    expect(cal.kinds.map((k) => k.id)).toEqual(['rehearsal', 'lesson', 'concert', 'recording', 'deadline', 'goal']);
    expect(cal.kinds[0].name).toBe('CAL.KIND.REHEARSAL');
    cal.kinds[0].name = 'Своя';
    expect(ensureCal(s).kinds[0].name).toBe('Своя');
    expect(colorOf(cal, { kind: 'concert' })).toBe('#A75750');
    expect(colorOf(cal, { kind: 'concert', color: '#000000' })).toBe('#000000');
  });
});

describe('экспорт .ics', () => {
  it('события, повторы, исключения, экранирование и перенос строк', () => {
    const cal = ensureCal(blank());
    const a = ev({ id: 'a', title: 'Репетиция; группа, полный состав', start: at(2026, 10, 6, 18), end: at(2026, 10, 6, 20), repeat: 'weekly', days: [3, 1], until: at(2026, 12, 31), skip: ['2026-10-08'], place: 'Студия', note: 'Взять\nкаподастр', songs: ['s1'] });
    const b = ev({ id: 'b', kind: 'concert', title: '', allDay: true, start: at(2026, 11, 1), end: at(2026, 11, 1) });
    const ics = toICS([a, b, ev({ id: 'c', start: 1, deleted: true })], { cal, songs: [{ id: 's1', title: 'Caprice 24' }], now: Date.UTC(2026, 9, 5) });
    const lines = ics.split('\r\n');
    expect(lines[0]).toBe('BEGIN:VCALENDAR');
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain('DTSTART:20261006T180000');
    expect(ics).toContain('RRULE:FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20261231T235959');
    expect(ics).toContain('EXDATE:20261008T180000');
    expect(ics).toContain('SUMMARY:Репетиция\\; группа\\, полный состав');
    expect(ics.replace(/\r\n /g, '')).toContain('DESCRIPTION:Взять\\nкаподастр\\nCaprice 24');
    expect(ics).toContain('DTSTART;VALUE=DATE:20261101');
    expect(ics).toContain('DTEND;VALUE=DATE:20261102');
    expect(ics).toContain('SUMMARY:cal.kind.concert');
    lines.forEach((l) => expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75));
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });
});

it('DAY — сутки', () => expect(DAY).toBe(86400000));

describe('напоминания о событиях', async () => {
  const { eventReminders, remindAt, newEvent } = await import('../src/core/calendar.js');
  const H = 3600000, D = 24 * H;
  const now = new Date(2026, 9, 15, 12, 0).getTime();
  it('за полчаса до начала; без напоминания — нет; прошедшее — нет', () => {
    const a = newEvent(now, now, { start: now + 3 * H, end: now + 4 * H, remind: 30 });
    const b = newEvent(now, now, { start: now + 5 * H, end: now + 6 * H, remind: null });
    const c = newEvent(now, now, { start: now + 10 * 60000, end: now + H, remind: 30 });
    const r = eventReminders([a, b, c], now);
    expect(r).toHaveLength(1);
    expect(r[0].ts).toBe(now + 3 * H - 30 * 60000);
  });
  it('повторяющееся — каждое повторение в окне двух недель', () => {
    const w = newEvent(now, now, { start: now + D, end: now + D + H, repeat: 'weekly', remind: 60 });
    expect(eventReminders([w], now)).toHaveLength(2);
  });
  it('на весь день: утром в 9:00 или накануне', () => {
    const d0 = new Date(2026, 9, 17).getTime(), ev = newEvent(d0, now, { allDay: true, start: d0, end: d0, remind: 0 });
    expect(new Date(remindAt(ev, d0)).getHours()).toBe(9);
    expect(remindAt({ ...ev, remind: 1440 }, d0)).toBe(d0 + 9 * H - D);
  });
});
