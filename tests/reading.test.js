// Библия и планы чтения
import { describe, it, expect } from 'vitest';
import { BOOKS, ALL, TOTAL_CHAPTERS, refText } from '../src/core/bible.js';
import { PLANS, spread, readingFor, weekReading, planDay, nextOf } from '../src/core/reading.js';

describe('Библия', () => {
  it('66 книг, 1189 глав, синодальный порядок: соборные послания после Деяний', () => {
    expect(BOOKS.length).toBe(66);
    expect(TOTAL_CHAPTERS).toBe(1189);
    expect(ALL.length).toBe(1189);
    const i = BOOKS.findIndex((b) => b.code === 'ACT');
    expect(BOOKS[i + 1].code).toBe('JAM');
    expect(BOOKS.filter((b) => b.nt).length).toBe(27);
  });
  it('ссылки одной строкой', () => {
    expect(refText(['GEN.1', 'GEN.2', 'GEN.3'])).toBe('Быт 1–3');
    expect(refText(['PSA.1', 'PRO.1'])).toBe('Пс 1; Притч 1');
  });
});

describe('планы чтения', () => {
  it('каждый план покрывает свои главы ровно один раз', () => {
    const all = (p) => Array.from({ length: p.days }, (_, i) => p.day(i)).flat();
    expect(all(PLANS.year)).toEqual(ALL);
    expect(new Set(all(PLANS.yearpar)).size).toBe(1189);
    expect(all(PLANS.nt90).length).toBe(260);
    expect(all(PLANS.psprov).length).toBe(181);
    expect(spread([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4, 5]]);
  });
  it('чтение дня по дате начала; до начала и после конца — нет', () => {
    const b = { plan: 'psprov', start: '2026-10-01', read: { 'PSA.1': 1 } };
    expect(planDay(b, new Date(2026, 8, 30))).toBe(null);
    const r = readingFor(b, new Date(2026, 9, 1, 15));
    expect(r.day).toBe(1);
    expect(r.keys[0]).toBe('PSA.1');
    expect(r.keys.at(-1)).toBe('PRO.1');
    expect(r.done).toBe(1);
    expect(nextOf(b, r)).toBe('PSA.2');
    expect(readingFor(b, new Date(2026, 10, 1))).toBe(null);
  });
  it('неделя — сумма чтений по дням', () => {
    const b = { plan: 'nt90', start: '2026-10-05', read: {} };
    const w = weekReading(b, new Date(2026, 9, 8));
    expect(w.planned).toBeGreaterThan(15);
    expect(w.done).toBe(0);
  });
});
