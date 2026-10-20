import { describe, it, expect } from 'vitest';
import { polyTimes } from '../src/audio/metronome.js';
describe('polyrhythm', () => {
  it('spreads N hits evenly over the bar, none when off', () => {
    const cfg = { bpm: 120, num: 4, poly: 3 }; // такт 2 с
    expect(polyTimes(cfg, 10).map((x) => +x.toFixed(4))).toEqual([10, 10.6667, 11.3333]);
    expect(polyTimes({ ...cfg, poly: 0 }, 10)).toEqual([]);
    expect(polyTimes({ ...cfg, poly: 1 }, 10)).toEqual([]);
    expect(polyTimes({ bpm: 60, num: 3, poly: 2 }, 0)).toEqual([0, 1.5]);
  });
});
