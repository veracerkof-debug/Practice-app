import { describe, it, expect } from 'vitest';
import { dropTestMode } from '../src/core/cleanup.js';

const mem = (init) => {
  const m = new Map(Object.entries(init));
  return { get length() { return m.size; }, key: (i) => [...m.keys()][i], getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
};

describe('коды убраны: уборка при запуске', () => {
  it('шла проверка создателем — настоящие данные возвращаются из копии', () => {
    const real = JSON.stringify({ sessions: [{ id: 'r' }], settings: { vx: 'a' } });
    const ls = mem({ 'practice.v1': JSON.stringify({ sessions: [{ id: 'fake' }], settings: { vx: 'a', vt: 'b' } }), 'practice.v1.extra': 'x', 'practice.sandbox': JSON.stringify({ 'practice.v1': real }), 'practice.sandbox.hours': '9000' });
    expect(dropTestMode(ls).restored).toBe(true);
    const st = JSON.parse(ls.getItem('practice.v1'));
    expect(st.sessions).toEqual([{ id: 'r' }]);
    expect(st.settings.vx).toBeUndefined();
    expect(ls.getItem('practice.v1.extra')).toBe(null); // появилось во время проверки — убрано
    expect(ls.getItem('practice.sandbox')).toBe(null);
    expect(ls.getItem('practice.sandbox.hours')).toBe(null);
  });
  it('без проверки — данные не трогаются, только отметки доступа', () => {
    const ls = mem({ 'practice.v1': JSON.stringify({ sessions: [{ id: 'r' }], settings: { vy: 1, theme: 'dark' } }) });
    expect(dropTestMode(ls).restored).toBe(false);
    expect(JSON.parse(ls.getItem('practice.v1'))).toEqual({ sessions: [{ id: 'r' }], settings: { theme: 'dark' } });
  });
});

describe('свой план чтения', async () => {
  const { planOf, readingFor, BOOK_SETS } = await import('../src/core/reading.js');
  it('главы выбранных книг по порядку, поровну на дни', () => {
    const b = { plan: 'c1', start: '2026-01-01', custom: [{ id: 'c1', name: 'Е', books: BOOK_SETS.gospels, days: 10 }] };
    const p = planOf(b);
    expect(p.days).toBe(10);
    const all = Array.from({ length: 10 }, (_, i) => p.day(i)).flat();
    expect(all.length).toBe(28 + 16 + 24 + 21);
    expect(all[0]).toBe('MAT.1'); expect(all.at(-1)).toBe('JOH.21');
    expect(readingFor(b, new Date(2026, 0, 2)).day).toBe(2);
    // дней больше, чем глав, — по главе в день
    expect(planOf({ custom: [{ id: 'c2', books: ['JUD'], days: 30 }] }, 'c2').days).toBe(1);
    expect(planOf(b, 'nope')).toBe(null);
  });
});
