import { describe, it, expect } from 'vitest';
import { chirp, findChirp, locate, trackPlan, alignChannels, resample, clockFit, OUT_SR } from '../src/audio/align.js';

// Детерминированный шум
const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32 - 0.5; };

// «Комната»: хост дал сигнал в 0 и в gap секунд по своим часам; запись телефона начинается раньше на lead секунд,
// идёт на частоте sr с кварцем ppm, с шумом, музыкой (синус) и эхом
function room({ sr = 48000, lead = 1.37, gap = 30, ppm = 0, noise = 0.05, echo = 0.4, music = 0.3 } = {}) {
  const r = rng(7), k = 1 + ppm * 1e-6, len = Math.round((lead + gap + 2) * sr * k), x = new Float32Array(len), c = chirp(sr);
  for (let i = 0; i < len; i++) x[i] = noise * r() * 2 + music * Math.sin((2 * Math.PI * 220 * i) / sr) * Math.sin((2 * Math.PI * 0.5 * i) / sr);
  const put = (at, amp) => { const p = Math.round(at); for (let i = 0; i < c.length && p + i < len; i++) x[p + i] += amp * c[i]; };
  for (const t of [0, gap]) { const at = (lead + t) * sr * k; put(at, 0.5); put(at + 0.023 * sr, 0.5 * echo); }
  return { x, sr, starts: [lead * sr * k, (lead + gap) * sr * k] };
}

describe('сигнал и его поиск', () => {
  it('находит сигнал с точностью лучше 0,1 мс в шуме, с музыкой и эхом', () => {
    const { x, sr, starts } = room({ noise: 0.15, music: 0.5 });
    const f = findChirp(x, sr, 0, 10 * sr);
    expect(f.snr).toBeGreaterThan(8);
    expect(Math.abs(f.pos - starts[0]) / sr * 1000).toBeLessThan(0.1);
  });
  it('нет сигнала — низкий snr', () => {
    const r = rng(3), x = new Float32Array(48000 * 5).map(() => r() * 0.3);
    expect(findChirp(x, 48000).snr).toBeLessThan(8);
  });
  it('оба сигнала и скорость: кварц +80 миллионных', () => {
    const { x, sr, starts } = room({ ppm: 80 });
    const L = locate(x, sr, 30);
    expect(L.drift).toBe(true);
    expect(Math.abs(L.s - starts[0])).toBeLessThan(3);
    expect(Math.abs(L.e - starts[1])).toBeLessThan(3);
    expect(Math.abs(L.rate / sr - 1 - 80e-6)).toBeLessThan(3e-6);
  });
  it('короткий дубль: оба сигнала в первых 20 с — начальный не путается с конечным', () => {
    const { x, sr, starts } = room({ gap: 6, lead: 0.4 });
    const L = locate(x, sr, 6);
    expect(Math.abs(L.s - starts[0])).toBeLessThan(3);
    expect(L.drift).toBe(true);
  });
  it('другая частота записи (44,1 кГц) — скорость в отсчётах записи', () => {
    const { x, sr } = room({ sr: 44100, gap: 12 });
    const L = locate(x, sr, 12);
    expect(Math.abs(L.rate - 44100)).toBeLessThan(1);
  });
});

describe('общая шкала', () => {
  it('без расхождения — только сдвиг, без пересчёта', () => {
    const { x, sr } = room({ gap: 10 });
    const p = trackPlan(locate(x, sr, 10), sr, 0.5, 9.9);
    expect(p.shift).toBe(true);
  });
  it('после выравнивания сигнал конца — на месте у дорожек с разными кварцами и стартами', async () => {
    const gap = 20, a = 0, b = gap + 0.5;
    const tr = [room({ lead: 0.8, ppm: 0, gap }), room({ lead: 2.3, ppm: 95, gap }), room({ lead: 1.1, ppm: -60, gap, sr: 44100 })];
    const pos = [];
    for (const t of tr) {
      const L = locate(t.x, t.sr, gap), p = trackPlan(L, t.sr, a, b), [y] = await alignChannels([t.x], p);
      pos.push([findChirp(y, OUT_SR, 0, OUT_SR).pos, findChirp(y, OUT_SR, (gap - 1) * OUT_SR, (gap + 0.4) * OUT_SR).pos]);
    }
    for (const [s, e] of pos) { expect(Math.abs(s)).toBeLessThan(2); expect(Math.abs(e - gap * OUT_SR)).toBeLessThan(2); }
  });
  it('пересчёт синуса без искажений (лучше −60 дБ)', () => {
    const sr = 48000, x = new Float32Array(sr).map((_, i) => Math.sin((2 * Math.PI * 1000 * i) / sr));
    const step = 1 + 1e-4, y = resample(x, 100.3, step, 20000);
    let err = 0, pw = 0;
    for (let i = 0; i < y.length; i++) { const want = Math.sin((2 * Math.PI * 1000 * (100.3 + i * step)) / sr); err += (y[i] - want) ** 2; pw += want ** 2; }
    expect(10 * Math.log10(err / pw)).toBeLessThan(-60);
  });
});

describe('часы', () => {
  it('смещение по быстрым ответам, медленные не мешают', () => {
    const off = 12345, s = [];
    for (let i = 0; i < 20; i++) { const t0 = i * 300, up = 3 + (i % 5 === 0 ? 80 : 0), down = 3 + (i % 7 === 0 ? 120 : 0); s.push({ t0, th: t0 + up + off, t1: t0 + up + down }); }
    const r = clockFit(s);
    expect(Math.abs(r.off - off)).toBeLessThan(2);
    expect(r.rtt).toBe(6);
  });
});
