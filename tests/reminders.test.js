import { describe, it, expect } from 'vitest';
import { plan, remindTimes, DEFAULT_REMIND } from '../src/core/reminders.js';
import { quoteAt, notifyText, SCRIPTURE, MUSICIANS, SAYINGS } from '../src/core/quotes.js';
import { readFileSync } from 'node:fs';

const st = (r, days = [1, 1, 1, 1, 1, 0, 0]) => ({ days, remind: { ...DEFAULT_REMIND, on: true, ...r } });
const mon = new Date(2026, 9, 12, 9, 0).getTime(); // понедельник, 9:00

describe('напоминания', () => {
  it('выключены — ничего', () => { expect(plan({ days: [1, 1, 1, 1, 1, 1, 1], remind: { on: false } }, false, mon)).toEqual([]); });
  it('обычно — одно в день практики, по выходным нет', () => {
    const ts = plan(st({ style: 'normal' }), false, mon);
    expect(ts.length).toBe(5);
    ts.forEach((x) => { expect(new Date(x).getHours()).toBe(19); expect([0, 6]).not.toContain(new Date(x).getDay()); });
  });
  it('настойчиво — до трёх, тихие часы соблюдаются', () => {
    expect(remindTimes(st({ style: 'insistent', time: '18:00' }).remind, new Date(2026, 9, 12).getTime()).map((x) => new Date(x).getHours())).toEqual([18, 20]);
    expect(remindTimes(st({ style: 'insistent', time: '12:00' }).remind, new Date(2026, 9, 12).getTime()).length).toBe(3);
  });
  it('сегодня уже занимались — сегодня не напоминает', () => {
    const a = plan(st({}), false, mon), b = plan(st({}), true, mon);
    expect(b.length).toBe(a.length - 1);
  });
});

describe('цитаты', () => {
  it('стихи и истории по очереди, у историй есть источник', () => {
    MUSICIANS.forEach((m) => expect(m.src.length).toBeGreaterThan(5));
    expect(SCRIPTURE.every((s) => s.ref && s.ru && s.en)).toBe(true);
    expect(quoteAt(0).ref).toBeTruthy();
    expect(quoteAt(1).ref).toBeFalsy();
  });
  it('вне церковного режима — без стихов', () => {
    const refs = new Set(SCRIPTURE.map((s) => s.ref));
    for (let i = 0; i < 60; i++) expect(refs.has(quoteAt(i, 'ru', false).ref)).toBe(false);
  });
  // стихи цитируются дословно (в них «ты» допустимо) — проверяются зовы и истории
  it('текст уведомления без «ты» и «вы»', () => {
    for (let i = 0; i < 30; i++) {
      const n = notifyText(i, Date.now() + i * 86400000, 'ru', false);
      expect(n.title + ' ' + n.body).not.toMatch(/(^|\s)(ты|вы|тебя|вас)(\s|[,.!?]|$)/i);
    }
  });
  // стихи — дословно из Синодального перевода в приложении (без учёта знаков препинания и регистра)
  it('стихи совпадают с Синодальным переводом', () => {
    const norm = (x) => x.toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    for (const q of SCRIPTURE) {
      const [b, c, v] = q.at.split(' ');
      const book = JSON.parse(readFileSync('public/bible/synodal/' + b + '.json', 'utf8'));
      const verse = book[c - 1][v - 1] + (q.ref.includes('–') ? ' ' + book[c - 1][v] : '');
      expect(norm(verse), q.ref).toContain(norm(q.ru));
    }
  });
  it('у слов людей есть автор и источник, вне церковного режима — без христианских', () => {
    SAYINGS.forEach((x) => { expect(x.who && x.whoEn && x.src.length > 10 && x.ru && x.en).toBeTruthy(); });
    const all = Array.from({ length: 60 }, (_, i) => quoteAt(i, 'ru', false));
    expect(all.some((q) => q.ref === 'Чайковский')).toBe(true);
    expect(all.some((q) => q.ref === 'Брат Лаврентий')).toBe(false);
  });
});
