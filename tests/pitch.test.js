// Уточнение частоты по фазе после YIN: низкие струны — в пределах полуцента, без ложных перескоков (ночь 22.10.2026)
import { describe, it, expect } from 'vitest';
import { yin, refinePitch } from '../src/audio/pitch.js';

const sr = 48000, N = 4096;
const cents = (a, b) => 1200 * Math.log2(a / b);
// звук струны: основная + 4 гармоники с убыванием, лёгкий шум; фаза — чтобы не начиналось ровно с нуля
function tone(f, noise = 0.003, seed = 1) {
  let r = seed; const rnd = () => ((r = (r * 1664525 + 1013904223) >>> 0) / 2 ** 32 - 0.5);
  const b = new Float32Array(N);
  for (let i = 0; i < N; i++) { let v = 0; for (let h = 1; h <= 5; h++) v += Math.sin(2 * Math.PI * f * h * i / sr + 0.7 * h) / h; b[i] = 0.3 * v + noise * rnd(); }
  return b;
}

describe('тюнер: уточнение по фазе', () => {
  it('E2 с расстройкой: YIN — целый шаг отсчёта, после уточнения — меньше полуцента', () => {
    for (const f of [55.2, 82.41, 82.9, 81.6, 110.3, 146.83, 329.63, 440, 1046.5]) {
      const b = tone(f), f0 = yin(b, sr), f1 = refinePitch(b, f0, sr);
      expect(f0).toBeGreaterThan(0);
      expect(Math.abs(cents(f1, f))).toBeLessThan(0.1);
      expect(Math.abs(cents(f1, f))).toBeLessThanOrEqual(Math.abs(cents(f0, f)) + 0.05);
    }
    // с заметным шумом микрофона: уточнение держится в пределах цента
    for (const f of [82.41, 110.3]) { const b = tone(f, 0.05, 7), f0 = yin(b, sr); expect(Math.abs(cents(refinePitch(b, f0, sr), f))).toBeLessThan(1); }
  });
  it('грубая оценка не той гармоники не «уточняется» в чужую частоту', () => {
    const b = tone(110), f = refinePitch(b, 130, sr); // 130 Гц не рядом ни с одной гармоникой — остаётся как есть
    expect(f).toBe(130);
    expect(refinePitch(b, 0, sr)).toBe(0);
    expect(refinePitch(new Float32Array(100), 110, sr)).toBe(110);
  });
  it('тишина и шум: YIN даёт 0, уточнение не вмешивается', () => {
    expect(refinePitch(new Float32Array(N), 0, sr)).toBe(0);
  });
});
