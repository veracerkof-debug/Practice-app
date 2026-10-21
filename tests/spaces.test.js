// Пространства реверберации и выбор движка (src/audio/spaces.js, perf.js, mixer.js)
import { describe, it, expect } from 'vitest';
import { SPACES, SPACE_DEF } from '../src/audio/spaces.js';
import { defaultVerb, setVerb, verbLight, VERBS, PERF } from '../src/audio/perf.js';
import { normalizeMix } from '../src/audio/mixer.js';

describe('spaces', () => {
  it('четыре пространства с полным описанием для обоих движков', () => {
    expect(SPACES).toEqual(['room', 'hall', 'plate', 'cathedral']);
    for (const k of SPACES) {
      const d = SPACE_DEF[k];
      expect(d.sec).toBeGreaterThan(0);
      expect(d.damp).toBeGreaterThanOrEqual(0);
      expect(d.damp).toBeLessThanOrEqual(1);
      expect(d.size).toBeGreaterThan(0);
      expect(d.decay).toBeGreaterThan(1);
      expect(d.lvl).toBeGreaterThan(0);
      expect(d.hp).toBeLessThan(d.lp);
    }
    expect(SPACE_DEF.cathedral.sec).toBeGreaterThan(SPACE_DEF.hall.sec);
  });
  it('движок по умолчанию: телефон — лёгкий, компьютер — свёртка', () => {
    expect(defaultVerb({ userAgent: 'Mozilla/5.0 (Linux; Android 16; MTN-NX1) Chrome/155 Mobile Safari/537.36' })).toBe('light');
    expect(defaultVerb({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' })).toBe('light');
    expect(defaultVerb({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/155' })).toBe('conv');
    expect(defaultVerb({})).toBe('conv');
  });
  it('setVerb принимает только известные движки', () => {
    setVerb('light'); expect(verbLight()).toBe(true);
    setVerb('x'); expect(verbLight()).toBe(false);
    expect(VERBS).toEqual(['conv', 'light']);
    expect(PERF.verb).toBe('conv');
  });
  it('normalizeMix подставляет движок реверберации', () => {
    const mx = normalizeMix({});
    expect(VERBS).toContain(mx.verb);
    expect(normalizeMix({ verb: 'light' }).verb).toBe('light');
    expect(normalizeMix({ verb: 'nope' }).verb).toBe(defaultVerb());
  });
});
