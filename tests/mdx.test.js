// Вокал и инструментал на телефоне (src/audio/mdx.js): БПФ любого размера, спектр туда и обратно, склейка кусков.
// Сама модель здесь подменена: сверка с эталоном на настоящей модели — в DECISIONS («Телефон лёгкий, тяжёлое — компьютер»): 87 дБ.
import { describe, it, expect } from 'vitest';
import { makeFFT, createMdx, MDX } from '../src/audio/mdx.js';
import { viterbiLabels, segmentsFromLabels, CHORD_LABELS } from '../src/audio/mirpost.js';

const snr = (a, b) => { let e = 0, s = 0; for (let i = 0; i < a.length; i++) { e += (a[i] - b[i]) ** 2; s += b[i] ** 2; } return 10 * Math.log10(s / Math.max(e, 1e-30)); };

describe('mdx: БПФ и спектр', () => {
  it('БПФ размера 30 и 7680 совпадает с прямым ДПФ', () => {
    for (const n of [30, 7680]) {
      const f = makeFFT(n), re = new Float64Array(n), im = new Float64Array(n);
      for (let i = 0; i < n; i++) { re[i] = Math.sin(i * 0.37) + (i % 7) / 7; im[i] = Math.cos(i * 0.11); }
      const r0 = Float64Array.from(re), i0 = Float64Array.from(im);
      f(re, im, false);
      for (const k of [0, 1, 5, n >> 1, n - 3]) {
        let sr = 0, si = 0;
        for (let t = 0; t < n; t++) { const a = (-2 * Math.PI * k * t) / n; sr += r0[t] * Math.cos(a) - i0[t] * Math.sin(a); si += r0[t] * Math.sin(a) + i0[t] * Math.cos(a); }
        expect(re[k]).toBeCloseTo(sr, 6); expect(im[k]).toBeCloseTo(si, 6);
      }
      f(re, im, true); // обратно — исходный сигнал
      expect(snr(re, r0)).toBeGreaterThan(200);
    }
  });
  it('спектр куска и обратно — тот же звук (ниже 17 кГц)', () => {
    const M = createMdx(), L = new Float32Array(M.chunk), R = new Float32Array(M.chunk);
    for (let i = 0; i < M.chunk; i++) { L[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / 44100); R[i] = 0.3 * Math.sin((2 * Math.PI * 1234 * i) / 44100); }
    const [l2, r2] = M.wave(M.spec(L, R));
    const mid = (x) => x.subarray(20000, M.chunk - 20000);
    expect(snr(mid(l2), mid(L))).toBeGreaterThan(60);
    expect(snr(mid(r2), mid(R))).toBeGreaterThan(60);
  });
  it('разделение: вокал + инструментал = запись ровно; «модель-зеркало» отдаёт запись в вокал', async () => {
    const M = createMdx(), n = 44100 * 9, L = new Float32Array(n), R = new Float32Array(n);
    for (let i = 0; i < n; i++) { L[i] = 0.95 * Math.sin((2 * Math.PI * 330 * i) / 44100); R[i] = 0.6 * Math.sin((2 * Math.PI * 660 * i) / 44100); }
    let calls = 0;
    const r = await M.separate(L, R, async (x) => { calls++; return x; });
    expect(calls).toBe(Math.ceil((n + M.trim + (M.chunk - 2 * M.trim) + M.trim - (n % (M.chunk - 2 * M.trim))) / Math.floor(0.75 * M.chunk)));
    let worst = 0; for (let i = 0; i < n; i++) worst = Math.max(worst, Math.abs(r.vocals.left[i] + r.inst.left[i] - L[i]));
    expect(worst).toBeLessThan(1e-6);
    const v = r.vocals.left.subarray(44100, n - 44100), want = L.subarray(44100, n - 44100).map((x) => x * MDX.comp);
    expect(snr(v, want)).toBeGreaterThan(40); // громкий вход (пик 0,95) приведён к 0,9 и обратно
  });
});

describe('аккорды: сглаживание Витерби', () => {
  it('одиночный выброс не рвёт аккорд, настоящая смена — проходит', () => {
    const NL = CHORD_LABELS.length, T = 40, C = CHORD_LABELS.indexOf('C'), G = CHORD_LABELS.indexOf('G'), A = CHORD_LABELS.indexOf('A:min');
    const lp = new Float32Array(T * NL).fill(Math.log(0.002));
    for (let t = 0; t < T; t++) { const k = t < 20 ? C : G; lp[t * NL + k] = Math.log(0.7); }
    lp[10 * NL + A] = Math.log(0.9); lp[10 * NL + C] = Math.log(0.05); // один кадр «Am» посреди C
    const lab = viterbiLabels(lp, T, NL, 4);
    expect(lab[10]).toBe(C);
    const segs = segmentsFromLabels(lab, 0.1);
    expect(segs.map((s) => s.c)).toEqual(['C', 'G']);
    expect(segs[1].t).toBeCloseTo(2.0, 5);
  });
});
