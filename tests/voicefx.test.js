import { describe, it, expect } from 'vitest';
import { trim, gain, normalize, highpass, gateFx, compress, denoise, reverb, process, encodeWav, decodeWav, peaks, peakOf, linToDb } from '../src/audio/voicefx.js';

const SR = 16000;
const tone = (f, sec, amp = 0.5) => Float32Array.from({ length: Math.round(SR * sec) }, (_, i) => amp * Math.sin((2 * Math.PI * f * i) / SR));
let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
const noise = (sec, amp) => Float32Array.from({ length: Math.round(SR * sec) }, () => rnd() * amp);
const rms = (x, a = 0, b = x.length) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / (b - a)); };

describe('обработка записи', () => {
  it('обрезка, усиление, нормализация', () => {
    const x = [tone(440, 1)];
    expect(trim(x, SR, 0.25, 0.75)[0].length).toBe(SR / 2);
    expect(peakOf(gain([tone(440, 0.1, 0.5)], 6))).toBeCloseTo(0.5 * 1.995, 2);
    expect(linToDb(peakOf(normalize([tone(440, 0.1, 0.1)], -1)))).toBeCloseTo(-1, 1);
  });
  it('срез низа убирает гул 30 Гц и оставляет голос', () => {
    const lo = highpass([tone(30, 1)], SR, 120)[0], hi = highpass([tone(1000, 1)], SR, 120)[0];
    expect(rms(lo, SR / 2)).toBeLessThan(0.05);
    expect(rms(hi, SR / 2)).toBeGreaterThan(0.3);
  });
  it('гейт глушит тихое, пропускает громкое', () => {
    const x = new Float32Array(SR * 2); x.set(noise(1, 0.003)); x.set(tone(440, 1, 0.5), SR);
    const y = gateFx([x], SR, -40)[0];
    expect(rms(y, SR * 0.3, SR * 0.9)).toBeLessThan(0.0005);
    expect(rms(y, SR * 1.3, SR * 1.9)).toBeGreaterThan(0.3);
  });
  it('компрессор уменьшает разницу громкостей', () => {
    const x = new Float32Array(SR * 2); x.set(tone(440, 1, 0.05)); x.set(tone(440, 1, 0.9), SR);
    const before = rms(x, SR * 1.2, SR * 1.9) / rms(x, SR * 0.2, SR * 0.9);
    const y = compress([x], SR, { threshold: -30, ratio: 4, makeup: false })[0];
    const after = rms(y, SR * 1.2, SR * 1.9) / rms(y, SR * 0.2, SR * 0.9);
    expect(after).toBeLessThan(before / 2);
  });
  it('шумоподавление снижает шум в паузах, голос остаётся', () => {
    const n = noise(3, 0.05), t = tone(600, 1, 0.5), x = Float32Array.from(n);
    for (let i = 0; i < t.length; i++) x[SR + i] += t[i];
    const y = denoise([x], SR, 0.9)[0];
    expect(rms(y, SR * 0.2, SR * 0.8)).toBeLessThan(rms(x, SR * 0.2, SR * 0.8) * 0.4);
    expect(rms(y, SR * 1.2, SR * 1.8)).toBeGreaterThan(0.25);
    expect(y.length).toBe(x.length);
  });
  it('реверберация даёт хвост после звука', () => {
    const x = new Float32Array(SR); x.set(tone(500, 0.2, 0.5));
    const y = reverb([x], SR, 0.5)[0];
    expect(rms(y, SR * 0.3, SR * 0.5)).toBeGreaterThan(0.005);
    expect(rms(x, SR * 0.3, SR * 0.5)).toBe(0);
  });
  it('цепочка и WAV туда-обратно', () => {
    const out = process([tone(440, 0.5, 0.3), tone(440, 0.5, 0.3)], SR, { trim: [0.1, 0.4], lowcut: true, denoise: 0.5, gate: -60, comp: 'light', gain: 2, reverb: 0.1, normalize: true });
    expect(out.length).toBe(2); expect(out[0].length).toBe(Math.round(SR * 0.3));
    expect(peakOf(out)).toBeLessThanOrEqual(1);
    const w = decodeWav(encodeWav(out, SR));
    expect(w.sr).toBe(SR); expect(w.ch.length).toBe(2); expect(w.ch[0].length).toBe(out[0].length);
    expect(w.ch[0][100]).toBeCloseTo(out[0][100], 3);
    expect(peaks(out, 50).length).toBeGreaterThan(40);
  });
});
