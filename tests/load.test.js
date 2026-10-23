import { describe, it, expect } from 'vitest';
import { foldLoad, loadLevel } from '../src/audio/load.js';

describe('измеритель нагрузки звука', () => {
  it('сглаживание, пик за последние секунды, счётчик перегрузки подряд', () => {
    let s = foldLoad(null, { load: 0.5 });
    expect([s.avg, s.peak, s.over]).toEqual([0.5, 0.5, 0]);
    s = foldLoad(s, { load: 1, peak: 1.4 });
    expect(s.avg).toBeCloseTo(0.7, 5);
    expect(s.peak).toBe(1.4);
    s = foldLoad(s, { load: 1 }); s = foldLoad(s, { load: 1 });
    expect(s.over).toBe(3);
    s = foldLoad(s, { load: 0.2 });
    expect(s.over).toBe(0);
    expect(s.hist.length).toBe(5);
    expect([loadLevel(0.3), loadLevel(0.75), loadLevel(0.95)]).toEqual(['ok', 'warn', 'high']);
  });
});

import { defaultVerb, weakPC } from '../src/audio/perf.js';
describe('слабый компьютер (отчёт 23.10.2026)', () => {
  it('не больше 4 ядер — лёгкая реверберация', () => {
    const win = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';
    expect(weakPC({ hardwareConcurrency: 4 })).toBe(true);
    expect(defaultVerb({ userAgent: win, hardwareConcurrency: 4 })).toBe('light');
    expect(defaultVerb({ userAgent: win, hardwareConcurrency: 12 })).toBe('conv');
    expect(defaultVerb({ userAgent: 'Linux; Android 14', hardwareConcurrency: 8 })).toBe('light');
  });
});
