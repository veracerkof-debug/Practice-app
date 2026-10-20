import { describe, it, expect } from 'vitest';
import { eqResponse, biquadCoefs, biquadDb, normalizeFx, fxIsFlat, simpleBands, advancedBands, compParams, driveCurve, freqAt, posOf, logFreqs, activeBands, REV_TYPES } from '../src/audio/fx.js';

const db = (bands, f, sr = 48000) => eqResponse(bands, [f], sr)[0];

describe('эффекты: кривая эквалайзера', () => {
  it('всё в нуле — ровная линия', () => {
    logFreqs(40).forEach((f) => expect(Math.abs(db(simpleBands(), f))).toBeLessThan(0.01));
    logFreqs(40).forEach((f) => expect(Math.abs(db(advancedBands(), f))).toBeLessThan(0.01));
  });
  it('пик +6 дБ на 1 кГц: столько на 1 кГц, почти ничего вдали', () => {
    const b = [{ type: 'peaking', f: 1000, g: 6, q: 1, on: true }];
    expect(db(b, 1000)).toBeCloseTo(6, 1);
    expect(Math.abs(db(b, 30))).toBeLessThan(0.1);
    expect(Math.abs(db(b, 18000))).toBeLessThan(0.2);
  });
  it('полки: низкая поднимает низ, высокая — верх', () => {
    expect(db([{ type: 'lowshelf', f: 200, g: 6, q: 0.7, on: true }], 25)).toBeCloseTo(6, 0);
    expect(Math.abs(db([{ type: 'lowshelf', f: 200, g: 6, q: 0.7, on: true }], 15000))).toBeLessThan(0.1);
    expect(db([{ type: 'highshelf', f: 4000, g: -6, q: 0.7, on: true }], 18000)).toBeCloseTo(-6, 0);
  });
  it('срезы: −3 дБ на частоте среза при Q 0,707, глубоко вдали', () => {
    const hp = [{ type: 'highpass', f: 100, g: 0, q: 0.7071, on: true }], lp = [{ type: 'lowpass', f: 5000, g: 0, q: 0.7071, on: true }];
    expect(db(hp, 100)).toBeCloseTo(-3, 0);
    expect(db(hp, 20)).toBeLessThan(-20);
    expect(db(lp, 5000)).toBeCloseTo(-3, 0);
    expect(db(lp, 19000)).toBeLessThan(-18);
  });
  it('выключенная полоса не считается; полосы складываются', () => {
    const b = [{ type: 'peaking', f: 1000, g: 6, q: 1, on: false }, { type: 'peaking', f: 1000, g: 2, q: 1, on: true }];
    expect(db(b, 1000)).toBeCloseTo(2, 1);
    expect(db([b[1], b[1]], 1000)).toBeCloseTo(4, 1);
  });
  it('коэффициенты пика без усиления — единица', () => {
    const c = biquadCoefs({ type: 'peaking', f: 500, g: 0, q: 1 }, 44100);
    expect(biquadDb(c, 500, 44100)).toBeCloseTo(0, 6);
  });
  it('шкала: доля ↔ частота по логарифму', () => {
    expect(freqAt(0)).toBe(20); expect(freqAt(1)).toBe(20000);
    expect(freqAt(0.5)).toBeCloseTo(632.5, 0);
    expect(posOf(freqAt(0.3))).toBeCloseTo(0.3, 6);
  });
});

describe('эффекты: настройки', () => {
  it('нормализация: мусор → умолчания, простой вид с закреплёнными частотами, не больше 8 полос', () => {
    const f = normalizeFx({ mode: 'x', simple: [{ g: 40 }], adv: Array(12).fill({ type: 'zzz', f: 5, g: 'a', q: 99 }), comp: 7, rev: -1, delayTime: 9 });
    expect(f.mode).toBe(null);
    expect(f.simple.map((b) => b.f)).toEqual([200, 1000, 4000]);
    expect(f.adv.length).toBe(8);
    expect(f.adv[0]).toEqual({ type: 'peaking', f: 20, g: 0, q: 8, on: true });
    expect(f.comp).toBe(1); expect(f.rev).toBe(0); expect(f.delayTime).toBe(1.5);
    expect(normalizeFx({ simple: [{ g: 3 }, { g: -2 }, { g: 0 }] }).simple.map((b) => b.g)).toEqual([3, -2, 0]);
  });
  it('по умолчанию — всё ровно; включённый срез или усиление — нет', () => {
    expect(fxIsFlat(normalizeFx())).toBe(true);
    expect(fxIsFlat(normalizeFx({ comp: 0.2 }))).toBe(false);
    expect(fxIsFlat(normalizeFx({ simple: [{ g: 2 }, {}, {}] }))).toBe(false);
    const adv = normalizeFx({ mode: 'adv' }); adv.adv[0].on = true;
    expect(fxIsFlat(adv)).toBe(false);
    expect(activeBands(normalizeFx({ mode: 'adv' })).length).toBe(7);
  });
  it('старый набор слоя лупера {lo, mid, hi} — в простые полосы; пространство и новые эффекты — по умолчанию', () => {
    const f = normalizeFx({ lo: 3, mid: -2, hi: 1, comp: 0.4, rev: 0.2 });
    expect(f.simple.map((b) => b.g)).toEqual([3, -2, 1]);
    expect(f.lo).toBeUndefined(); expect(f.comp).toBe(0.4); expect(f.rev).toBe(0.2);
    expect(f.revType).toBe('hall'); expect(f.drive).toBe(0); expect(f.trem).toBe(0); expect(f.tremRate).toBe(5);
    expect(normalizeFx({ revType: 'xx' }).revType).toBe('hall');
    expect(REV_TYPES).toEqual(['room', 'hall', 'plate', 'cathedral']);
    expect(fxIsFlat(normalizeFx({ drive: 0.1 }))).toBe(false);
  });
  it('драйв: ноль — прямая, сильнее — насыщение, середина без изменения громкости', () => {
    const z = driveCurve(0, 1025), h = driveCurve(1, 1025);
    expect(z[768]).toBeCloseTo(0.5, 1); expect(z[1024]).toBeCloseTo(1, 1);
    expect(h[768]).toBeCloseTo(0.5, 1); expect(h[1024]).toBeLessThan(0.6); expect(Math.abs(h[512])).toBeLessThan(0.01);
  });
  it('сжатие: ноль — прозрачно; сильнее — ниже порог, выше степень, запас против скрытого усиления', () => {
    expect(compParams(0)).toEqual({ threshold: 0, ratio: 1, knee: 0, trim: 1 });
    const h = compParams(1);
    expect(h.threshold).toBe(-24); expect(h.ratio).toBe(6);
    expect(h.trim).toBeCloseTo(0.5, 1);
    expect(compParams(0.5).threshold).toBe(-14);
  });
});
