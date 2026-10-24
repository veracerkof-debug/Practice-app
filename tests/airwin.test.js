// Ревербы Airwindows (src/audio/wl/airwin.worklet.js): устойчивы (затухают, без NaN), уровни пространств подобраны;
// варианты: в pre — решение автора
import { describe, it, expect, vi } from 'vitest';
import { ALGOS } from '../src/audio/wl/airwin.worklet.js';
import { AIRWIN } from '../src/audio/spaces.js';
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false }, registerPlugin: () => ({}) }));

const tail = (k, o, sec = 6, sr = 48000) => {
  const v = new ALGOS[k](sr, o), n = 128, inp = new Float32Array(n), oL = new Float32Array(n), oR = new Float32Array(n), e = [];
  for (let i = 0; i < sr * sec; i += n) { inp.fill(0); if (i === 0) inp[0] = 1; v.run(inp, inp, oL, oR, n, o.lvl || 1); let s = 0; for (let j = 0; j < n; j++) s += oL[j] * oL[j] + oR[j] * oR[j]; e.push(s); }
  return e;
};
describe('ревербы Airwindows', () => {
  for (const k of Object.keys(AIRWIN)) for (const sp of Object.keys(AIRWIN[k])) {
    it(k + ' · ' + sp + ': звучит, затухает, без NaN', () => {
      const e = tail(k, AIRWIN[k][sp], 10), sec = (a, b) => e.slice(a * 375, b * 375).reduce((x, y) => x + y, 0);
      expect(e.every(Number.isFinite)).toBe(true);
      expect(sec(0, 1)).toBeGreaterThan(1e-6);
      expect(sec(9, 10)).toBeLessThan(sec(0, 1) * 1e-3);
    });
  }
  it('88,2 кГц и выше — те же сети с промежуточными отсчётами', () => {
    const e = tail('galactic', AIRWIN.galactic.hall, 2, 96000);
    expect(e.every(Number.isFinite) && e.some((x) => x > 0)).toBe(true);
  });
});

describe('варианты', () => {
  it('в pre — значение автора, переключатель не действует', async () => {
    vi.resetModules();
    vi.stubGlobal('__CHANNEL__', 'pre');
    const V = await import('../src/core/variants.js');
    expect(V.DEV).toBe(false);
    const app = { audio: { mixer: { setVerbAlgo: vi.fn() } } };
    V.setVariant(app, 'verb', 'galactic');
    expect(V.variant('verb')).toBe('melete');
    expect(app.audio.mixer.setVerbAlgo).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
