import { describe, it, expect } from 'vitest';
import { allowedPcs, posToMidi, midiToPos, notesIn, neighbors, snapPitch, nearest, clampLo } from '../src/modules/glider/scale.js';
import { defaultFx, normalizeFx, voiceFx, busFx, applyPreset, axisFx } from '../src/modules/glider/fx.js';
import { fxValue } from '../src/modules/glider/voice.js';

describe('глайдер: положение и ноты', () => {
  it('крайние ноты — в середине своих полос, обратное преобразование точное', () => {
    expect(posToMidi(0, 48, 24)).toBe(47.5);
    expect(posToMidi(1, 48, 24)).toBe(72.5);
    expect(midiToPos(48, 48, 24)).toBeCloseTo(0.5 / 25);
    expect(posToMidi(midiToPos(60.3, 48, 24), 48, 24)).toBeCloseTo(60.3);
  });
  it('лад: пентатоника ля минор, до мажор, хроматика', () => {
    expect(allowedPcs({ scale: 'chrom' })).toBe(null);
    expect(allowedPcs({ scale: 'pmin', root: 9 }).slice().sort((a, b) => a - b)).toEqual([0, 2, 4, 7, 9]);
    expect(notesIn(57, 12, allowedPcs({ scale: 'pmin', root: 9 }))).toEqual([57, 60, 62, 64, 67, 69]);
    expect(notesIn(60, 3, null)).toEqual([60, 61, 62, 63]);
  });
  it('соседи и привязка к ноте', () => {
    const cmaj = allowedPcs({ scale: 'major', root: 0 });
    expect(neighbors(61.2, cmaj)).toEqual([60, 62]);
    expect(snapPitch(60.9, 'note', cmaj)).toBe(60);
    expect(snapPitch(61.1, 'note', cmaj)).toBe(62);
    expect(snapPitch(60.4, 'note', null)).toBe(60);
    expect(snapPitch(60.37, 'free', cmaj)).toBe(60.37);
  });
  it('магнит: у нот залипает, середина — без скачка, всё непрерывно', () => {
    expect(snapPitch(60.1, 'magnet', null)).toBeCloseTo(60.004, 3);
    expect(snapPitch(60.5, 'magnet', null)).toBeCloseTo(60.5);
    expect(snapPitch(60.9, 'magnet', null)).toBeCloseTo(60.996, 3);
    let prev = snapPitch(59, 'magnet', null);
    for (let m = 59.001; m < 63; m += 0.001) {
      const v = snapPitch(m, 'magnet', null);
      expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
      expect(v - prev).toBeLessThan(0.01);
      prev = v;
    }
  });
  it('центы и границы диапазона', () => {
    expect(nearest(60.26)).toEqual({ n: 60, cents: 26 });
    expect(nearest(60.74)).toEqual({ n: 61, cents: -26 });
    expect(clampLo(10, 24)).toBe(24);
    expect(clampLo(100, 24)).toBe(84);
  });
});

describe('глайдер: эффекты', () => {
  it('внизу эффекта нет совсем, вверху — сила, кривая задаёт чувствительность', () => {
    const e = { on: true, amt: 0.8, curve: 'even', mode: 'axis' };
    expect(fxValue(e, 0)).toBe(0);
    expect(fxValue(e, 1)).toBeCloseTo(0.8);
    expect(fxValue({ ...e, curve: 'soft' }, 0.5)).toBeCloseTo(0.2);
    expect(fxValue({ ...e, curve: 'sharp' }, 0.25)).toBeCloseTo(0.4);
    expect(fxValue({ ...e, mode: 'fixed' }, 0)).toBeCloseTo(0.8);
    expect(fxValue({ ...e, on: false }, 1)).toBe(0);
  });
  it('старая настройка (одна строка) переносится', () => {
    const s = { fx: 'vib' }, fx = normalizeFx(s);
    expect(fx.vib.on).toBe(true);
    expect(fx.bright.on).toBe(false);
    expect(s.fx).toBe(fx);
    expect(normalizeFx({}).bright.on).toBe(true);
  });
  it('громкость: внизу тише, вверху полная; без эффекта — 1', () => {
    const fx = defaultFx();
    expect(voiceFx(fx, 0).volGain).toBe(1);
    fx.vol.on = true;
    expect(voiceFx(fx, 0).volGain).toBeCloseTo(0.1);
    expect(voiceFx(fx, 1).volGain).toBeCloseTo(1);
  });
  it('шина — по самому высокому пальцу; наборы включают свои эффекты', () => {
    const fx = applyPreset('ambient');
    expect(busFx(fx, [0.1, 0.9])).toMatchObject({ echo: 0.6, time: 500 });
    expect(busFx(fx, []).verb).toBeCloseTo(0.8);
    expect(axisFx(fx)).toEqual(['bright']);
    expect(Object.values(applyPreset('clean')).some((e) => e.on)).toBe(false);
  });
});
