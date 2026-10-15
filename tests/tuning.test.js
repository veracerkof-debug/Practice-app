import { describe, it, expect } from 'vitest';
import { detectTuning, detectKey, SR } from '../src/music/analyze.js';

// Аккорд ля минор (A3, C4, E4) с обертонами, сдвинутый на cents
function chord(cents, sec = 3) {
  const n = SR * sec, x = new Float32Array(n), k = Math.pow(2, cents / 1200);
  [57, 60, 64, 69].forEach((m) => { const f = 440 * Math.pow(2, (m - 69) / 12) * k;
    for (let h = 1; h <= 4; h++) for (let i = 0; i < n; i++) x[i] += (0.25 / h) * Math.sin(2 * Math.PI * f * h * i / SR); });
  return x;
}

describe('строй записи', () => {
  it('отклонение от 440 в центах', () => {
    for (const c of [0, 18, -27, 45]) {
      const r = detectTuning(chord(c));
      expect(Math.abs(r.cents - c)).toBeLessThanOrEqual(3);
      expect(r.conf).toBeGreaterThan(0.5);
    }
  });
  it('тональность не сбивается небольшим отклонением строя', () => {
    const k = detectKey(chord(20));
    expect(k.pc).toBe(9);
  });
});
