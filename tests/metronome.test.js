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

// Полиритм на долю и группы долей (ночь 22.10.2026)
import { GROUPINGS, accentsOfGroups, groupsLabel } from '../src/audio/metronome.js';
describe('polyrhythm per beat, beat groups', () => {
  it('N hits on every beat; accent index is a multiple of N', () => {
    const cfg = { bpm: 120, num: 2, poly: 3, polyPer: 'beat' }; // доля 0,5 с
    expect(polyTimes(cfg, 0).map((x) => +x.toFixed(4))).toEqual([0, 0.1667, 0.3333, 0.5, 0.6667, 0.8333]);
    expect(polyTimes({ ...cfg, polyPer: 'bar' }, 0).map((x) => +x.toFixed(4))).toEqual([0, 0.3333, 0.6667]);
  });
  it('groups → accents and back', () => {
    expect(accentsOfGroups('3+2+2')).toEqual([3, 1, 1, 2, 1, 2, 1]);
    expect(accentsOfGroups('2+3')).toEqual([3, 1, 2, 1, 1]);
    expect(groupsLabel([3, 1, 1, 2, 1, 2, 1])).toBe('3+2+2');
    expect(groupsLabel([3, 1, 1, 1])).toBe(''); // до 4 долей — не подписывается
    expect(groupsLabel([3, 1, 1, 1, 1, 1, 1])).toBe(''); // ровные семь
    expect(GROUPINGS[7]).toContain('3+2+2');
    GROUPINGS[7].forEach((g) => expect(accentsOfGroups(g).length).toBe(7));
  });
});
