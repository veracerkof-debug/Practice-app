import { describe, it, expect } from 'vitest';
import { fft, detectTempo, detectKey, SR } from '../src/music/analyze.js';

// Щелчки (короткий шум с затуханием) с заданным темпом, при желании — с долями
function clicks(bpm, sec, { sub = 1, seed = 1 } = {}) {
  const x = new Float32Array(Math.floor(sec * SR)), step = (60 / bpm / sub) * SR;
  let r = seed;
  const rnd = () => ((r = (r * 1103515245 + 12345) % 2147483648) / 2147483648) * 2 - 1;
  for (let k = 0, t = 0; t < x.length; k++, t = Math.round(k * step)) {
    const amp = k % sub === 0 ? 1 : 0.4;
    for (let i = 0; i < 400 && t + i < x.length; i++) x[t + i] += amp * rnd() * Math.exp(-i / 80);
  }
  return x;
}

// Аккорды синусами (частоты нот по MIDI), каждый — sec секунд
function chords(list, sec) {
  const n = Math.floor(sec * SR), x = new Float32Array(n * list.length);
  list.forEach((ch, j) => ch.forEach((m) => {
    const f = 440 * 2 ** ((m - 69) / 12);
    for (let i = 0; i < n; i++) x[j * n + i] += 0.2 * Math.sin((2 * Math.PI * f * i) / SR);
  }));
  return x;
}

describe('анализ записи', () => {
  it('FFT: синус попадает в свой бин', () => {
    const n = 64, re = new Float32Array(n), im = new Float32Array(n);
    for (let i = 0; i < n; i++) re[i] = Math.cos((2 * Math.PI * 5 * i) / n);
    fft(re, im);
    expect(Math.hypot(re[5], im[5])).toBeCloseTo(32, 3);
    expect(Math.hypot(re[6], im[6])).toBeLessThan(1e-3);
  });
  it.each([[72], [100], [128], [174]])('темп %i bpm по щелчкам', (bpm) => {
    const r = detectTempo(clicks(bpm, 20));
    expect(Math.abs(r.bpm - bpm)).toBeLessThan(1.5);
  });
  it('доли между ударами не удваивают темп', () => {
    const r = detectTempo(clicks(96, 20, { sub: 2 }));
    expect(Math.abs(r.bpm - 96)).toBeLessThan(1.5);
  });
  it('тишина — темпа нет', () => {
    expect(detectTempo(new Float32Array(SR * 10))).toBe(null);
  });
  it('тональность: до мажор (C F G C) и ля минор (Am Dm E Am)', () => {
    const C = [48, 60, 64, 67], F = [53, 65, 69, 72], G = [55, 62, 67, 71];
    expect(detectKey(chords([C, F, G, C], 2))).toMatchObject({ pc: 0, minor: false });
    const Am = [45, 57, 60, 64], Dm = [50, 62, 65, 69], E = [52, 59, 64, 68];
    expect(detectKey(chords([Am, Dm, E, Am], 2))).toMatchObject({ pc: 9, minor: true });
  });
});
