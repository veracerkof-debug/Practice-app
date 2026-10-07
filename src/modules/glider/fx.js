// Настройки эффектов глайдера — без звука и DOM. У каждого эффекта: on, amt (сила 0…1), curve (чувствительность:
// soft — плавно, even — ровно, sharp — резко), mode ('axis' — по вертикали, 'fixed' — всегда с силой amt).
// Внизу поверхности эффекты по вертикали равны нулю, вверху — силе amt. Эхо дополнительно хранит time (мс).
import { FX, BUS_FX, fxValue } from './voice.js';

const off = (extra = {}) => ({ on: false, amt: 1, curve: 'even', mode: 'axis', ...extra });

export function defaultFx() {
  const fx = Object.fromEntries(FX.map((k) => [k, off()]));
  fx.bright.on = true;
  fx.echo.time = 320;
  fx.vol.amt = 0.9;
  return fx;
}

// Готовые сочетания; названия — ключи i18n preset.<id>
export const PRESETS = {
  clean: {},
  violin: { vib: { on: true, amt: 0.8, curve: 'soft' }, bright: { on: true, amt: 0.4 }, verb: { on: true, amt: 0.35, mode: 'fixed' } },
  wah: { bright: { on: true, amt: 1, curve: 'sharp' }, drive: { on: true, amt: 0.35, mode: 'fixed' } },
  ambient: { echo: { on: true, amt: 0.6, mode: 'fixed', time: 500 }, verb: { on: true, amt: 0.8, mode: 'fixed' }, bright: { on: true, amt: 0.6, curve: 'soft' } },
  rock: { drive: { on: true, amt: 1, curve: 'sharp' }, bright: { on: true, amt: 0.35, mode: 'fixed' }, verb: { on: true, amt: 0.3, mode: 'fixed' } },
  fuzz: { fuzz: { on: true, amt: 1 }, bright: { on: true, amt: 0.8, curve: 'soft' } },
  pulse: { trem: { on: true, amt: 1 }, echo: { on: true, amt: 0.35, mode: 'fixed', time: 180 }, verb: { on: true, amt: 0.4, mode: 'fixed' } },
};

export function applyPreset(id) {
  const fx = defaultFx();
  fx.bright.on = false;
  Object.entries(PRESETS[id] || {}).forEach(([k, v]) => Object.assign(fx[k], v));
  return fx;
}

// Старый формат: fx — строка с одним эффектом ('bright' | 'vib' | 'vol' | 'trem')
export function normalizeFx(s) {
  if (s.fx && typeof s.fx === 'object') {
    const d = defaultFx();
    FX.forEach((k) => { s.fx[k] = { ...d[k], ...(s.fx[k] || {}) }; });
    return s.fx;
  }
  const fx = defaultFx();
  if (typeof s.fx === 'string' && fx[s.fx]) { fx.bright.on = false; fx[s.fx].on = true; }
  return (s.fx = fx);
}

// Значения для голоса по положению пальца y. Громкость — особый случай: внизу тише на amt, вверху полная
export function voiceFx(fx, y) {
  const o = {};
  FX.forEach((k) => { if (!BUS_FX.includes(k) && k !== 'vol') o[k] = fxValue(fx[k], y); });
  const v = fx.vol;
  o.volGain = v && v.on ? (v.mode === 'fixed' ? 1 - (v.amt ?? 1) * 0.9 : 1 - (v.amt ?? 1) * (1 - fxValue({ ...v, amt: 1 }, y))) : 1;
  return o;
}

// Значения для общей шины: по самому высокому из пальцев (ys — их положения; пусто — пальцев нет, хвосты звучат)
export function busFx(fx, ys) {
  const y = ys.length ? Math.max(...ys) : 0;
  return { echo: fxValue(fx.echo, y), verb: fxValue(fx.verb, y), time: fx.echo.time || 320 };
}

// Что подписать у края поверхности: эффекты по вертикали
export const axisFx = (fx) => FX.filter((k) => fx[k].on && fx[k].mode !== 'fixed');
