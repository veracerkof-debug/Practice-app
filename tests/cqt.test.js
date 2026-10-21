import { describe, it, expect } from 'vitest';
import { cqt, halve } from '../src/music/cqt.js';

const SR = 22050;
const tone = (f, sec, amp = 0.5) => { const n = Math.round(SR * sec), x = new Float32Array(n); for (let i = 0; i < n; i++) x[i] = amp * Math.sin((2 * Math.PI * f * i) / SR); return x; };

describe('cqt', () => {
  it('тон 440 Гц — максимум в бине A4 (24 бина на октаву от C1)', () => {
    const { mag, frames, nBins } = cqt(tone(440, 3));
    expect(nBins).toBe(144);
    expect(frames).toBeGreaterThan(25);
    const t = frames >> 1;
    let best = 0;
    for (let b = 0; b < nBins; b++) if (mag[t * nBins + b] > mag[t * nBins + best]) best = b;
    expect(best).toBe(Math.round(24 * Math.log2(440 / 32.70319566257483)));
  });
  it('низкий тон (C2, 65 Гц) попадает в нижнюю октаву', () => {
    const { mag, frames, nBins } = cqt(tone(65.41, 4));
    const t = frames >> 1;
    let best = 0;
    for (let b = 0; b < nBins; b++) if (mag[t * nBins + b] > mag[t * nBins + best]) best = b;
    expect(best).toBe(24);
  });
  it('число кадров — как у librosa: 1 + floor(n / hop)', () => {
    const n = SR * 2, { frames } = cqt(new Float32Array(n));
    expect(frames).toBe(1 + Math.floor(n / 2048));
  });
  it('прореживание вдвое: постоянный сигнал → √2 (масштаб librosa), длина ceil(n/2)', () => {
    const x = new Float32Array(1001).fill(1), y = halve(x);
    expect(y.length).toBe(501);
    expect(y[250]).toBeCloseTo(Math.SQRT2, 3);
  });
});
