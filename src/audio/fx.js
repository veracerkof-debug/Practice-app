// Общие эффекты для всех инструментов: эквалайзер, сжатие, реверберация, задержка, хор — одна цепочка на каждой
// шине микшера (клик, пианино, глайдер, пэды, медиа, теория), та же — для слоёв и модулей по запросу.
// Два вида эквалайзера: простой (три полосы на фиксированных частотах — низ, середина, верх; только усиление) и
// продвинутый (до 8 полос: срез низа и верха, полки, пики; частота, усиление и ширина у каждой; полосы можно
// добавлять и убирать). Хранится и то и другое: переключение вида не теряет настроек.
// Звук — только родные узлы Web Audio (BiquadFilterNode, DynamicsCompressorNode, DelayNode, OscillatorNode):
// готовых библиотек с таким набором под GPL-совместимой лицензией и без лишнего веса нет (tuna.js — без эквалайзера,
// Tone.js — целый фреймворк, weq8 — только эквалайзер), а сами фильтры в браузере те же, что в этих библиотеках.
// Кривая эквалайзера считается здесь же по формулам RBJ Audio EQ Cookbook — по ним же работает BiquadFilterNode, —
// чистой функцией, чтобы рисовать и проверять без звука.
import { sendToReverb } from './context.js';

export const EQ_TYPES = ['highpass', 'lowshelf', 'peaking', 'highshelf', 'lowpass'];
export const F_MIN = 20, F_MAX = 20000, G_MAX = 15, Q_MIN = 0.2, Q_MAX = 8, BANDS_MAX = 8;

const band = (type, f, q = 0.7, on = true) => ({ type, f, g: 0, q, on });
// Простой: три полосы, частоты закреплены (двигается только усиление)
export const simpleBands = () => [band('lowshelf', 200), band('peaking', 1000, 0.8), band('highshelf', 4000)];
// Продвинутый: срезы выключены, две полки и три пика по умолчанию
export const advancedBands = () => [band('highpass', 40, 0.7, false), band('lowshelf', 120), band('peaking', 400, 1), band('peaking', 1200, 1), band('peaking', 3500, 1), band('highshelf', 8000), band('lowpass', 16000, 0.7, false)];

export const FX_DEF = () => ({ mode: null, simple: simpleBands(), adv: advancedBands(), comp: 0, rev: 0, delay: 0, delayTime: 0.3, delayFb: 0.35, chorus: 0 });

const clamp = (v, a, b) => Math.min(b, Math.max(a, +v || 0));
export function normalizeBand(b) {
  const o = { ...band('peaking', 1000, 1), ...(b || {}) };
  if (!EQ_TYPES.includes(o.type)) o.type = 'peaking';
  o.f = Math.round(clamp(o.f, F_MIN, F_MAX));
  o.g = Math.round(clamp(o.g, -G_MAX, G_MAX) * 2) / 2;
  o.q = Math.round(clamp(o.q, Q_MIN, Q_MAX) * 100) / 100;
  o.on = o.on !== false;
  return o;
}
// Привести сохранённое к полному виду (старые версии, мусор)
export function normalizeFx(fx) {
  const d = FX_DEF(), o = { ...d, ...(fx || {}) };
  o.mode = o.mode === 'simple' || o.mode === 'adv' ? o.mode : null;
  o.simple = (Array.isArray(o.simple) && o.simple.length === 3 ? o.simple : d.simple).map((b, i) => ({ ...normalizeBand(b), type: d.simple[i].type, f: d.simple[i].f, q: d.simple[i].q, on: true }));
  o.adv = (Array.isArray(o.adv) && o.adv.length ? o.adv.slice(0, BANDS_MAX) : d.adv).map(normalizeBand);
  ['comp', 'rev', 'delay', 'chorus'].forEach((k) => { o[k] = Math.round(clamp(o[k], 0, 1) * 100) / 100; });
  o.delayTime = Math.round(clamp(o.delayTime, 0.05, 1.5) * 1000) / 1000;
  o.delayFb = Math.round(clamp(o.delayFb, 0, 0.9) * 100) / 100;
  return o;
}
// Какие полосы звучат сейчас (по виду)
export const activeBands = (fx, mode = fx.mode || 'simple') => (mode === 'adv' ? fx.adv : fx.simple);
// Всё ли по умолчанию (для подсветки кнопки в микшере)
export function fxIsFlat(fx) {
  const f = normalizeFx(fx);
  return activeBands(f).every((b) => !b.on || ((b.type === 'highpass' || b.type === 'lowpass') ? false : b.g === 0)) && !f.comp && !f.rev && !f.delay && !f.chorus;
}

/* ---------- кривая: коэффициенты биквада (RBJ) и амплитуда ---------- */

// Коэффициенты как у BiquadFilterNode (Web Audio): у полок наклон закреплён (S = 1), у срезов Q — линейный
export function biquadCoefs(b, sr) {
  const w0 = (2 * Math.PI * Math.min(b.f, sr / 2 - 1)) / sr, cs = Math.cos(w0), sn = Math.sin(w0), A = Math.pow(10, b.g / 40);
  switch (b.type) {
    case 'lowpass': { const al = sn / (2 * b.q); return [(1 - cs) / 2, 1 - cs, (1 - cs) / 2, 1 + al, -2 * cs, 1 - al]; }
    case 'highpass': { const al = sn / (2 * b.q); return [(1 + cs) / 2, -(1 + cs), (1 + cs) / 2, 1 + al, -2 * cs, 1 - al]; }
    case 'lowshelf': {
      const al = (sn / 2) * Math.SQRT2, k = 2 * Math.sqrt(A) * al;
      return [A * ((A + 1) - (A - 1) * cs + k), 2 * A * ((A - 1) - (A + 1) * cs), A * ((A + 1) - (A - 1) * cs - k), (A + 1) + (A - 1) * cs + k, -2 * ((A - 1) + (A + 1) * cs), (A + 1) + (A - 1) * cs - k];
    }
    case 'highshelf': {
      const al = (sn / 2) * Math.SQRT2, k = 2 * Math.sqrt(A) * al;
      return [A * ((A + 1) + (A - 1) * cs + k), -2 * A * ((A - 1) + (A + 1) * cs), A * ((A + 1) + (A - 1) * cs - k), (A + 1) - (A - 1) * cs + k, 2 * ((A - 1) - (A + 1) * cs), (A + 1) - (A - 1) * cs - k];
    }
    default: { const al = sn / (2 * b.q); return [1 + al * A, -2 * cs, 1 - al * A, 1 + al / A, -2 * cs, 1 - al / A]; }
  }
}

// Амплитуда (дБ) одного биквада на частоте f
export function biquadDb([b0, b1, b2, a0, a1, a2], f, sr) {
  const w = (2 * Math.PI * f) / sr, c1 = Math.cos(w), s1 = Math.sin(w), c2 = Math.cos(2 * w), s2 = Math.sin(2 * w);
  const nr = b0 + b1 * c1 + b2 * c2, ni = b1 * s1 + b2 * s2, dr = a0 + a1 * c1 + a2 * c2, di = a1 * s1 + a2 * s2;
  return 10 * Math.log10(Math.max(1e-12, (nr * nr + ni * ni) / Math.max(1e-24, dr * dr + di * di)));
}

// Суммарная кривая включённых полос: массив дБ по частотам freqs
export function eqResponse(bands, freqs, sr = 48000) {
  const cf = bands.filter((b) => b.on !== false).map((b) => biquadCoefs(b, sr));
  return freqs.map((f) => cf.reduce((s, c) => s + biquadDb(c, f, sr), 0));
}
// n частот по логарифмической шкале 20 Гц … 20 кГц
export const logFreqs = (n, lo = F_MIN, hi = F_MAX) => Array.from({ length: n }, (_, i) => lo * Math.pow(hi / lo, i / (n - 1)));
export const freqAt = (x, lo = F_MIN, hi = F_MAX) => lo * Math.pow(hi / lo, Math.min(1, Math.max(0, x))); // доля 0…1 → Гц
export const posOf = (f, lo = F_MIN, hi = F_MAX) => Math.log(Math.max(lo, Math.min(hi, f)) / lo) / Math.log(hi / lo);     // Гц → доля

/* ---------- цепочка узлов ---------- */

// Сжатие: порог и степень по силе 0…1. У компрессора Web Audio скрытое усиление (makeup ≈ 0,6 от сжатия на 0 dBFS),
// которое поднимает тихое — после него запас на половину этого усиления: обычный уровень инструментов (−15…−10 dBFS)
// остаётся примерно той же громкости, тихое чуть громче, пики — ниже; к клиппингу не подходит
export function compParams(amount) {
  if (amount <= 0) return { threshold: 0, ratio: 1, knee: 0, trim: 1 };
  const threshold = -4 - amount * 20, ratio = 1 + amount * 5, makeupDb = 0.6 * -threshold * (1 - 1 / ratio);
  return { threshold, ratio, knee: 6, trim: Math.pow(10, (-makeupDb * 0.5) / 20) };
}

// Цепочка на контексте c: { input, output, set(fx), fx, dispose() }. Вход → эквалайзер → компрессор → выход;
// задержка и хор — параллельно (сухой сигнал всегда прямой), реверберация — посыл в общую
export function createFxChain(c, fx) {
  const input = c.createGain(), output = c.createGain(), comp = c.createDynamicsCompressor(), trim = c.createGain();
  comp.attack.value = 0.005; comp.release.value = 0.2;
  let filters = [], cur = normalizeFx(fx), shape = '';
  const T = () => c.currentTime, SM = 0.02;
  const ramp = (p, v) => { try { p.setTargetAtTime(v, T(), SM); } catch { p.value = v; } };

  // задержка с петлёй и приглушением верха в ней
  const dl = c.createDelay(2), fb = c.createGain(), damp = c.createBiquadFilter(), dwet = c.createGain();
  damp.type = 'lowpass'; damp.frequency.value = 3800; fb.gain.value = 0; dwet.gain.value = 0;
  trim.connect(dl); dl.connect(damp).connect(fb).connect(dl); dl.connect(dwet).connect(output);
  // хор: короткая задержка, колеблемая генератором
  const ch = c.createDelay(0.1), lfo = c.createOscillator(), depth = c.createGain(), cwet = c.createGain();
  ch.delayTime.value = 0.022; lfo.type = 'sine'; lfo.frequency.value = 0.8; depth.gain.value = 0.004; cwet.gain.value = 0;
  lfo.connect(depth).connect(ch.delayTime); trim.connect(ch).connect(cwet).connect(output);
  try { lfo.start(); } catch { /* */ }
  const rev = sendToReverb(output, 0);

  function wire() {
    const bands = activeBands(cur).filter((b) => b.on);
    const key = bands.map((b) => b.type).join(',');
    if (key === shape) return;
    shape = key;
    input.disconnect(); filters.forEach((f) => f.disconnect()); comp.disconnect();
    filters = bands.map((b) => { const f = c.createBiquadFilter(); f.type = b.type; return f; });
    let n = input;
    filters.forEach((f) => { n.connect(f); n = f; });
    n.connect(comp).connect(trim).connect(output);
  }
  function apply() {
    const bands = activeBands(cur).filter((b) => b.on);
    bands.forEach((b, i) => {
      const f = filters[i];
      ramp(f.frequency, b.f);
      ramp(f.gain, b.type === 'highpass' || b.type === 'lowpass' ? 0 : b.g);
      ramp(f.Q, b.type === 'highpass' || b.type === 'lowpass' ? 20 * Math.log10(b.q) : b.q); // у срезов Q в дБ (Web Audio)
    });
    const cp = compParams(cur.comp);
    ramp(comp.threshold, cp.threshold); ramp(comp.ratio, cp.ratio); ramp(comp.knee, cp.knee); ramp(trim.gain, cp.trim);
    ramp(dl.delayTime, cur.delayTime); ramp(fb.gain, cur.delay ? cur.delayFb : 0); ramp(dwet.gain, cur.delay * 0.7);
    ramp(cwet.gain, cur.chorus * 0.6); ramp(depth.gain, 0.002 + cur.chorus * 0.004);
    if (rev) ramp(rev.gain, cur.rev * 0.9);
  }
  wire(); apply();
  return {
    input, output,
    get fx() { return cur; },
    set(next) { cur = normalizeFx(next); wire(); apply(); },
    dispose() { try { lfo.stop(); } catch { /* */ } [input, output, comp, trim, dl, fb, damp, dwet, ch, depth, cwet, ...filters].forEach((n) => { try { n.disconnect(); } catch { /* */ } }); },
  };
}
