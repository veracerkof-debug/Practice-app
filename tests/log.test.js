// Технический журнал: хранится не дольше 3 часов и не больше заданного объёма; текст — «время [раздел] сообщение»
import { describe, it, expect } from 'vitest';
import { trim, logText, errText, KEEP_MS } from '../src/core/log.js';

describe('журнал', () => {
  it('старое уходит по времени', () => {
    const now = 10 * 3600e3, arr = [[now - KEEP_MS - 1, 'i', 'a', 'old'], [now - 1000, 'i', 'a', 'new']];
    expect(trim(arr, now).map((l) => l[3])).toEqual(['new']);
  });
  it('лишнее уходит по объёму — с начала', () => {
    const now = Date.now(), arr = Array.from({ length: 10 }, (_, i) => [now, 'i', 'a', 'x'.repeat(76) + i]);
    const out = trim(arr, now, KEEP_MS, 400);
    expect(out.length).toBe(3); // строка — 77 знаков + 24 на время и раздел: в 400 помещаются три
    expect(out.at(-1)[3].endsWith('9')).toBe(true);
  });
  it('текст: время, уровень, раздел', () => {
    const t = new Date(2026, 9, 7, 14, 2, 11).getTime();
    expect(logText([[t, 'i', 'pdf', 'открыт'], [t, 'e', 'js', 'сбой']])).toBe('14:02:11 [pdf] открыт\n14:02:11 !! [js] сбой');
  });
  it('ошибка словами: имя, сообщение, стек без адреса', () => {
    const e = new TypeError('x is undefined');
    e.stack = 'TypeError: x is undefined\n    at f (https://localhost/assets/index-1.js:10:5)';
    expect(errText(e)).toBe('TypeError: x is undefined @ at f (/assets/index-1.js:10:5)');
    expect(errText(null)).toBe('unknown');
  });
});
