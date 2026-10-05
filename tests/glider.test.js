import { describe, it, expect } from 'vitest';
import { allowedPcs, posToMidi, midiToPos, notesIn, neighbors, snapPitch, nearest, clampLo } from '../src/modules/glider/scale.js';

describe('глайдер: положение и ноты', () => {
  it('крайние ноты — в середине своих полос, обратное преобразование точное', () => {
    expect(posToMidi(0, 48, 24)).toBe(47.5);
    expect(posToMidi(1, 48, 24)).toBe(72.5);
    expect(midiToPos(48, 48, 24)).toBeCloseTo(0.5 / 25);
    expect(posToMidi(midiToPos(60.3, 48, 24), 48, 24)).toBeCloseTo(60.3);
  });
  it('лад: пентатоника ля минор, до мажор, хроматика', () => {
    expect(allowedPcs({ scale: 'chrom' })).toBe(null);
    expect(allowedPcs({ scale: 'pmin', root: 9 }).slice().sort((a, b) => a - b)).toEqual([0, 2, 4, 7, 9]);
    expect(notesIn(57, 12, allowedPcs({ scale: 'pmin', root: 9 }))).toEqual([57, 60, 62, 64, 67, 69]);
    expect(notesIn(60, 3, null)).toEqual([60, 61, 62, 63]);
  });
  it('соседи и привязка к ноте', () => {
    const cmaj = allowedPcs({ scale: 'major', root: 0 });
    expect(neighbors(61.2, cmaj)).toEqual([60, 62]);
    expect(snapPitch(60.9, 'note', cmaj)).toBe(60);
    expect(snapPitch(61.1, 'note', cmaj)).toBe(62);
    expect(snapPitch(60.4, 'note', null)).toBe(60);
    expect(snapPitch(60.37, 'free', cmaj)).toBe(60.37);
  });
  it('магнит: у нот залипает, середина — без скачка, всё непрерывно', () => {
    expect(snapPitch(60.1, 'magnet', null)).toBeCloseTo(60.004, 3);
    expect(snapPitch(60.5, 'magnet', null)).toBeCloseTo(60.5);
    expect(snapPitch(60.9, 'magnet', null)).toBeCloseTo(60.996, 3);
    let prev = snapPitch(59, 'magnet', null);
    for (let m = 59.001; m < 63; m += 0.001) {
      const v = snapPitch(m, 'magnet', null);
      expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
      expect(v - prev).toBeLessThan(0.01);
      prev = v;
    }
  });
  it('центы и границы диапазона', () => {
    expect(nearest(60.26)).toEqual({ n: 60, cents: 26 });
    expect(nearest(60.74)).toEqual({ n: 61, cents: -26 });
    expect(clampLo(10, 24)).toBe(24);
    expect(clampLo(100, 24)).toBe(84);
  });
});
