import { describe, it, expect, beforeAll } from 'vitest';
import { runLegacy } from './legacy.js';
import { initI18n } from '../src/i18n/index.js';

// common.js тянет интерфейс (ui), которому нужен document только при вызове — для строковых функций хватает заглушки
globalThis.document ??= { documentElement: {} };
globalThis.navigator ??= { language: 'ru' };
const { mRing, relDay } = await import('../src/core/screens/common.js');

describe('экраны ядра — как в прототипе', () => {
  beforeAll(() => initI18n('ru'));
  it.each([5, 10, 100])('кольцо выученности, шкала %i', (n) => {
    const L = runLegacy([/^const getPct=/, /^const SCN=/, /^const toScale=/, /^function mRing\(/], '{mRing}', { __S0: { settings: { scale: String(n) } } });
    for (const p of [0, 5, 20, 37, 60, 99, 100]) for (const sz of [30, 44, 72]) expect(mRing(p, sz, n)).toBe(L.mRing(p, sz));
  });
  it('сегодня, вчера, N дней назад', () => {
    const now = new Date(2026, 9, 5, 12).getTime(), D = 864e5;
    expect([0, 1, 2, 5, 11, 21].map((d) => relDay(now - d * D, now))).toEqual(['сегодня', 'вчера', '2 дня назад', '5 дней назад', '11 дней назад', '21 день назад']);
  });
});
