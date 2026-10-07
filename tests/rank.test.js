import { describe, it, expect } from 'vitest';
import { rankOf, RANK_STEPS } from '../src/core/rank.js';

describe('звание', () => {
  it('ступени по часам всего опыта', () => {
    expect(rankOf(0)).toMatchObject({ id: 'student', level: 1, next: { id: 'student', level: 2, from: 50 } });
    expect(rankOf(2037)).toMatchObject({ id: 'musician', level: 1, left: 163 });
    expect(rankOf(2200)).toMatchObject({ id: 'musician', level: 2 });
    expect(rankOf(1e6)).toMatchObject({ id: 'virtuoso', level: 3, next: null, frac: 1, left: 0 });
    expect(rankOf(25).frac).toBeCloseTo(0.5);
  });
  it('пороги растут, у каждого звания три ступени', () => {
    RANK_STEPS.forEach((s, i) => { if (i) expect(s[2]).toBeGreaterThan(RANK_STEPS[i - 1][2]); });
    expect(RANK_STEPS.length).toBe(15);
  });
});
