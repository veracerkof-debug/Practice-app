import { describe, it, expect } from 'vitest';
import { quantBars, mixdown, MAX_SEC, SLOTS } from '../src/audio/looper.js';

describe('лупер', () => {
  it('длина петли по метроному — целые такты, не меньше одного', () => {
    expect(quantBars(1.9, 2)).toBe(1);
    expect(quantBars(3.2, 2)).toBe(2);
    expect(quantBars(0.3, 2)).toBe(1);
    expect(MAX_SEC).toBeGreaterThanOrEqual(60);
    expect(SLOTS).toBe(4);
  });
  it('сведение: громкости, тишина слоя, без клиппинга', () => {
    const a = new Float32Array([0.5, 0.5, -0.5]), b = new Float32Array([0.5, 0.8, -0.8]);
    const m = mixdown([{ buf: a, gain: 1 }, { buf: b, gain: 0.5, mute: false }], 3);
    expect(m[0]).toBeCloseTo(0.75);
    expect(Math.abs(mixdown([{ buf: a, gain: 1.5 }, { buf: b, gain: 1.5 }], 3)[1])).toBeLessThan(1);
    expect(mixdown([{ buf: a, gain: 1 }, { buf: b, gain: 1, mute: true }], 3)[2]).toBeCloseTo(-0.5);
  });
});
