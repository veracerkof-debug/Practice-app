import { describe, it, expect } from 'vitest';
import { plan, remindTimes, remindOf, DEFAULT_REMIND } from '../src/core/reminders.js';
import { quoteAt, notifyText, SCRIPTURE, MUSICIANS, SAYINGS, MEME, QSETS, setsOf } from '../src/core/quotes.js';
import { readFileSync } from 'node:fs';

const st = (r, days = [1, 1, 1, 1, 1, 0, 0]) => ({ days, remind: { ...DEFAULT_REMIND, on: true, ...r } });
const mon = new Date(2026, 9, 12, 9, 0).getTime(); // понедельник, 9:00

describe('напоминания', () => {
  it('выключены — ничего', () => { expect(plan({ days: [1, 1, 1, 1, 1, 1, 1], remind: { on: false } }, false, mon)).toEqual([]); });
  it('классика — одно в день практики, по выходным нет', () => {
    const ts = plan(st({ style: 'classic' }), false, mon);
    expect(ts.length).toBe(5);
    ts.forEach((x) => { expect(new Date(x).getHours()).toBe(19); expect([0, 6]).not.toContain(new Date(x).getDay()); });
  });
  const hours = (r) => remindTimes(remindOf(st(r)), new Date(2026, 9, 12).getTime()).map((x) => new Date(x).getHours() + new Date(x).getMinutes() / 60);
  it('классика — за 1, 2, 3 часа по выбору', () => {
    expect(hours({ style: 'classic', time: '19:00', leads: [180, 60, 0] })).toEqual([16, 18, 19]);
    expect(hours({ style: 'classic', time: '19:00', leads: [120] })).toEqual([17]);
  });
  it('настойчивая — много, до тихих часов, не больше 8', () => {
    expect(hours({ style: 'pushy', time: '18:00', leads: [60] })).toEqual([17, 17.5, 18, 19, 20, 21]);
    expect(hours({ style: 'pushy', time: '10:00', leads: [180, 120, 60, 0] }).length).toBe(8);
  });
  it('минимал — только своё время, одно-два', () => {
    expect(hours({ style: 'minimal', times: ['07:30', '23:00'] })).toEqual([]); // 7:30 и 23:00 — тихие часы
    expect(hours({ style: 'minimal', times: ['09:00', '20:00', '21:00'] })).toEqual([9, 20]);
  });
  it('прежние характеры переводятся', () => {
    expect(remindOf({ remind: { style: 'insistent' } }).style).toBe('pushy');
    expect(remindOf({ remind: { style: 'soft' } }).style).toBe('minimal');
    expect(remindOf({ remind: { style: 'normal' } }).style).toBe('classic');
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

import { moodOf } from '../src/core/mascot.js';
describe('настроение Мелеты', () => {
  const at = (h, d = 14) => new Date(2026, 9, d, h, 0).getTime(); // 14.10.2026 — среда
  const days = [1, 1, 1, 1, 1, 0, 0];
  it('по состоянию занятий', () => {
    expect(moodOf({ now: at(12), active: true })).toBe('focus');
    expect(moodOf({ now: at(12), active: true, pomoBreak: true })).toBe('rest');
    expect(moodOf({ now: at(2), sessions: [] })).toBe('sleep');
    expect(moodOf({ now: at(12), weekSec: 400, goalSec: 300 })).toBe('cool');
    expect(moodOf({ now: at(12), weekSec: 300, goalSec: 300 })).toBe('happy');
    expect(moodOf({ now: at(12), goalSec: 300, weekSec: 10, sessions: [{ start: at(9) }] })).toBe('glad');
    expect(moodOf({ now: at(12), goalSec: 300, weekSec: 0, sessions: [{ start: at(12, 1) }] })).toBe('sad');
    expect(moodOf({ now: at(19), goalSec: 300, weekSec: 0, days, sessions: [] })).toBe('wait');
    expect(moodOf({ now: at(12), goalSec: 300, weekSec: 0, days, sessions: [] })).toBe('calm');
  });
});

describe('наборы цитат', () => {
  it('по умолчанию и выбор', () => {
    expect(setsOf({})).toEqual(['classic', 'rock']);
    expect(setsOf({ church: true })).toContain('bible');
    expect(setsOf({ qsets: ['meme', 'xx'] })).toEqual(['meme']);
    expect(setsOf({ qsets: [] })).toEqual(['classic', 'rock']);
  });
  it('каждый набор не пуст и отдаёт только свои цитаты', () => {
    for (const k of QSETS) {
      const qs = Array.from({ length: 40 }, (_, i) => quoteAt(i, 'ru', [k]));
      expect(qs.every((q) => q.text)).toBe(true);
    }
    expect(quoteAt(0, 'ru', ['meme']).ref).toBe('Цитатник Мелеты');
    expect(Array.from({ length: 30 }, (_, i) => quoteAt(i, 'ru', ['rock'])).some((q) => /Лес Пол/.test(q.text))).toBe(true);
    [...MUSICIANS, ...SAYINGS].forEach((x) => expect(QSETS).toContain(x.set));
  });
  it('цитатник — без «ты/вы» и с переводом', () => {
    MEME.forEach(([ru, en]) => { expect(en).toBeTruthy(); expect(ru).not.toMatch(/(^|\s)(ты|вы|тебя|вас|тебе|вам)(\s|[,.!?»]|$)/i); });
  });
});

import { pushyLine, PUSHY } from '../src/core/quotes.js';
describe('характеры Мелеты', () => {
  const at = (h) => new Date(2026, 9, 14, h, 0).getTime(), days = [1, 1, 1, 1, 1, 0, 0];
  it('настойчивая давит в течение дня, минимал — спокоен', () => {
    expect(moodOf({ now: at(10), goalSec: 300, weekSec: 0, days, sessions: [], mode: 'pushy' })).toBe('wait');
    expect(moodOf({ now: at(15), goalSec: 300, weekSec: 0, days, sessions: [], mode: 'pushy' })).toBe('sad');
    expect(moodOf({ now: at(20), goalSec: 300, weekSec: 0, days, sessions: [], mode: 'pushy' })).toBe('upset');
    expect(moodOf({ now: at(20), goalSec: 300, weekSec: 0, days, sessions: [], mode: 'minimal' })).toBe('calm');
    expect(moodOf({ now: at(20), goalSec: 300, weekSec: 10, days, sessions: [{ start: at(9) }], mode: 'pushy' })).toBe('glad');
  });
  it('строки настойчивой — сильнее с каждым напоминанием, без «ты/вы»', () => {
    expect(PUSHY.ru[0]).toContain(pushyLine(0, 0));
    expect(PUSHY.ru[3]).toContain(pushyLine(9, 0));
    for (const l of ['ru', 'uz', 'en']) expect(PUSHY[l].flat().length).toBe(12);
    PUSHY.ru.flat().forEach((x) => expect(x).not.toMatch(/(^|\s)(ты|вы|тебя|вас|тебе|вам)(\s|[,.!?…]|$)/i));
    expect(notifyText(0, Date.now(), 'ru', ['classic'], [], 3, 'pushy').title).toMatch(/./);
  });
});
