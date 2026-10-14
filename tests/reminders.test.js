import { describe, it, expect } from 'vitest';
import { plan, remindTimes, remindOf, DEFAULT_REMIND } from '../src/core/reminders.js';
import { quoteAt, notifyText, SCRIPTURE, MUSICIANS, SAYINGS, MEME, QSETS, setsOf } from '../src/core/quotes.js';
import { readFileSync } from 'node:fs';

const st = (r, days = [1, 1, 1, 1, 1, 0, 0]) => ({ days, remind: { ...DEFAULT_REMIND, ...r } });
const mon = new Date(2026, 9, 12, 9, 0).getTime(); // понедельник, 9:00
const hours = (r) => remindTimes(remindOf(st(r)), new Date(2026, 9, 12).getTime()).map((x) => new Date(x.ts).getHours() + new Date(x.ts).getMinutes() / 60);

describe('напоминания', () => {
  it('без уведомлений — ничего', () => { expect(plan(st({ mode: 'quiet' }), false, mon)).toEqual([]); });
  it('классика по умолчанию: за час и за 5 минут, только в дни практики', () => {
    expect(hours({ mode: 'classic', time: '19:00' })).toEqual([18, 18 + 55 / 60]);
    const ts = plan(st({ mode: 'classic' }), false, mon);
    expect(ts.length).toBe(10);
    ts.forEach((x) => expect([0, 6]).not.toContain(new Date(x.ts).getDay()));
    expect(remindTimes(remindOf(st({ mode: 'classic' })), new Date(2026, 9, 12).getTime()).map((x) => x.slot)).toEqual(['lead:60', 'lead:5']);
  });
  it('классика — за 1, 2, 3 часа по выбору', () => {
    expect(hours({ mode: 'classic', time: '19:00', leads: [180, 60] })).toEqual([16, 18]);
  });
  it('навязчивая — весь день, 6–8 раз, тихие часы соблюдаются', () => {
    const h = hours({ mode: 'pushy', time: '19:00' });
    expect(h.length).toBeGreaterThanOrEqual(6); expect(h.length).toBeLessThanOrEqual(8);
    expect(h[0]).toBe(8.5);
    expect(h.every((x) => x >= 8 && x < 22)).toBe(true);
    const slots = remindTimes(remindOf(st({ mode: 'pushy', time: '19:00' })), new Date(2026, 9, 12).getTime()).map((x) => x.slot);
    expect(slots).toEqual(expect.arrayContaining(['morning', 'lunch', 'lead:60', 'lead:5', 'after']));
  });
  it('прежние настройки переводятся', () => {
    expect(remindOf({ remind: { on: true, style: 'insistent' } }).mode).toBe('pushy');
    expect(remindOf({ remind: { on: true, style: 'normal' } }).mode).toBe('classic');
    expect(remindOf({ remind: { on: false, style: 'normal' } }).mode).toBe('quiet');
    expect(remindOf({}).mode).toBe('quiet');
  });
  it('сегодня уже занимались — сегодня не напоминает', () => {
    const a = plan(st({}), false, mon), b = plan(st({}), true, mon);
    expect(b.length).toBe(a.length - 2);
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
describe('цитаты на трёх языках', () => {
  it('у каждой цитаты есть ru, en, uz', () => {
    expect(SCRIPTURE.every((s) => s.uz && s.refUz)).toBe(true);
    expect(SAYINGS.every((w) => w.ru && w.en && w.uz && w.whoUz)).toBe(true);
    expect(MUSICIANS.every((m) => m.ru && m.en && m.uz)).toBe(true);
    expect(MEME.every((x) => x.length === 3 && x.every(Boolean))).toBe(true);
  });
  it('узбекский — по-узбекски, не по-русски', () => {
    for (let i = 0; i < 60; i++) {
      const q = quoteAt(i, 'uz', QSETS);
      expect(q.text).not.toMatch(/[а-яё]/i);
      expect(q.text).toBe(quoteAt(i, 'uz', QSETS).text);
    }
  });
});

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

import { remindText, pleaLine, PUSHY_TEXTS } from '../src/core/remindtexts.js';
describe('характеры Мелеты', () => {
  const at = (h) => new Date(2026, 9, 14, h, 0).getTime(), days = [1, 1, 1, 1, 1, 0, 0];
  it('навязчивая давит в течение дня, без уведомлений — спокойна', () => {
    expect(moodOf({ now: at(10), goalSec: 300, weekSec: 0, days, sessions: [], mode: 'pushy' })).toBe('wait');
    expect(moodOf({ now: at(15), goalSec: 300, weekSec: 0, days, sessions: [], mode: 'pushy' })).toBe('sad');
    expect(moodOf({ now: at(20), goalSec: 300, weekSec: 0, days, sessions: [], mode: 'pushy' })).toBe('upset');
    expect(moodOf({ now: at(20), goalSec: 300, weekSec: 0, days, sessions: [], mode: 'quiet' })).toBe('calm');
    expect(moodOf({ now: at(20), goalSec: 300, weekSec: 10, days, sessions: [{ start: at(9) }], mode: 'pushy' })).toBe('glad');
  });
  it('тексты: классика за час и за 5 минут, имя, без «ты/вы»', () => {
    expect(remindText({ slot: 'lead:60', mode: 'classic' }, { lang: 'ru' }).title).toBe('Сегодня практика — через час');
    expect(remindText({ slot: 'lead:5', mode: 'classic' }, { lang: 'ru' }).title).toBe('Пора доставать инструмент');
    expect(remindText({ slot: 'lead:5', mode: 'classic' }, { lang: 'ru', name: 'Алекс' }).title).toBe('Алекс, пора доставать инструмент');
    expect(remindText({ slot: 'morning', mode: 'pushy' }, { lang: 'en' }).title).toMatch(/Good morning/);
    expect(pleaLine(13)).toBe(PUSHY_TEXTS.ru.pushy.lunch[0]);
    for (const l of ['ru', 'uz', 'en']) expect(Object.keys(PUSHY_TEXTS[l].pushy).length).toBe(8);
    Object.values(PUSHY_TEXTS.ru.pushy).flat().concat(PUSHY_TEXTS.ru.five).forEach((x) => expect(x).not.toMatch(/(^|\s)(ты|вы|тебя|вас|тебе|вам)(\s|[,.!?…]|$)/i));
  });
});

describe('своё расписание', () => {
  const day = new Date(2026, 9, 12).getTime();
  it('до, после и точное время, у каждого свой стиль', () => {
    const r = remindOf(st({ mode: 'custom', time: '19:00', custom: [{ min: -120, tone: 'classic' }, { min: -15, tone: 'pushy' }, { min: 60, tone: 'classic' }, { at: '09:00', tone: 'pushy' }, { at: '23:30', tone: 'classic' }, { bad: 1 }] }));
    const list = remindTimes(r, day);
    expect(list.map((x) => new Date(x.ts).getHours() + new Date(x.ts).getMinutes() / 60)).toEqual([9, 17, 18.75, 20]); // 23:30 — тихие часы
    expect(list.map((x) => x.tone)).toEqual(['pushy', 'classic', 'pushy', 'classic']);
    const tx = (x) => remindText({ ...x, mode: 'custom' }, { lang: 'ru' }).title;
    expect(tx(list[0])).toBe(PUSHY_TEXTS.ru.pushy.morning[0]);
    expect(tx(list[1])).toBe('Сегодня практика — через 2 часа');
    expect(tx({ slot: 'rel:-15', tone: 'classic' })).toBe('Через 15 минут — практика');
    expect(tx({ slot: 'rel:0', tone: 'classic' })).toBe('Время для практики');
    expect(tx(list[3])).toBe('Время занятий прошло');
  });
  it('не больше 10 и без мусора', () => {
    const r = remindOf(st({ mode: 'custom', custom: Array.from({ length: 15 }, (_, i) => ({ min: -i })) }));
    expect(r.custom.length).toBe(10);
  });
});
