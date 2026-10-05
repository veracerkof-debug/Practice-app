import { describe, it, expect } from 'vitest';
import { weightDb, levelDb, dominant } from '../src/modules/spectrum/dsp.js';

describe('шумомер: весовые кривые (МЭК 61672-1)', () => {
  // табличные значения стандарта, дБ
  const A = [[31.5, -39.4], [63, -26.2], [100, -19.1], [250, -8.6], [500, -3.2], [1000, 0], [2000, 1.2], [4000, 1.0], [8000, -1.1], [10000, -2.5], [16000, -6.6]];
  const C = [[31.5, -3.0], [63, -0.8], [100, -0.3], [1000, 0], [4000, -0.8], [8000, -3.0], [10000, -4.4], [16000, -8.5]];
  it('A', () => A.forEach(([f, v]) => expect(weightDb('A', f), f + ' Гц').toBeCloseTo(v, 0)));
  it('C', () => C.forEach(([f, v]) => expect(weightDb('C', f), f + ' Гц').toBeCloseTo(v, 0)));
  it('Z и нулевая частота', () => {
    expect(weightDb('Z', 50)).toBe(0);
    expect(weightDb('A', 0)).toBe(-Infinity);
  });
});

describe('шумомер: уровень и основная частота', () => {
  const sr = 48000, N = 4096;
  const sine = (f, a = 1) => Float32Array.from({ length: N }, (_, i) => a * Math.sin((2 * Math.PI * f * i) / sr));
  it('синус с амплитудой 1 — −3 дБ полной шкалы; вдвое тише — минус 6 дБ', () => {
    expect(levelDb(sine(1000), null, null)).toBeCloseTo(-3.01, 1);
    expect(levelDb(sine(1000, 0.5), null, null)).toBeCloseTo(-9.03, 1);
    expect(levelDb(new Float32Array(N), null, null)).toBeLessThan(-150);
  });
  it('взвешивание по спектру: тон 100 Гц с весом A тише на ~19 дБ', () => {
    const bins = N / 2, freq = new Float32Array(bins).fill(-Infinity), k = Math.round((100 * N) / sr);
    freq[k] = -10;
    const wA = Float32Array.from(freq, (_, i) => weightDb('A', (i * sr) / N));
    expect(levelDb(sine(100), freq, wA) - levelDb(sine(100), null, null)).toBeCloseTo(weightDb('A', (k * sr) / N), 5);
    // тишина в спектре — уровень без поправки
    expect(levelDb(sine(100), new Float32Array(bins).fill(-Infinity), wA)).toBeCloseTo(-3.01, 1);
  });
  it('основная частота — с уточнением между полосами', () => {
    const bins = N / 2, freq = new Float32Array(bins).fill(-100), k = 37;
    freq[k - 1] = -40; freq[k] = -30; freq[k + 1] = -35;
    const d = dominant(freq, sr, N);
    expect(d.f).toBeGreaterThan((k * sr) / N);
    expect(d.f).toBeLessThan(((k + 0.5) * sr) / N);
    expect(dominant(new Float32Array(bins).fill(-100), sr, N)).toBe(null);
  });
});
