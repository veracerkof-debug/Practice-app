// Общие эффекты для всего приложения: эквалайзер, сжатие, драйв, тремоло, задержка, хор, реверберация (четыре
// пространства). Одна и та же цепочка — на каждой шине микшера (клик, пианино, глайдер, пэды, медиа, теория),
// на каждом слое лупера, на каждой дорожке студии и в диктофоне (вживую и при обработке записи — renderFx);
// настраивается каждая отдельно.
// Два вида эквалайзера: простой (три полосы на фиксированных частотах — низ, середина, верх; только усиление) и
// продвинутый (до 8 полос: срез низа и верха, полки, пики; частота, усиление и ширина у каждой; полосы можно
// добавлять и убирать). Хранится и то и другое: переключение вида не теряет настроек.
// Надёжность: все узлы цепочки созданы один раз и соединены навсегда — правка настроек только меняет параметры
// (плавно, setTargetAtTime), никаких переподключений во время звучания. Поэтому можно крутить ручки, пока звучат
// все инструменты сразу: ни щелчков, ни провалов. Неиспользуемая полоса — пик с нулевым усилением (прозрачна),
// выключенный эффект — нулевой посыл. Пространства реверберации общие на всё приложение (context.js) — лишних
// свёрток нет.
// Звук — только родные узлы Web Audio (Biquad, DynamicsCompressor, WaveShaper, Delay, Oscillator, Convolver):
// готовых библиотек с таким набором под GPL-совместимой лицензией и без лишнего веса нет (tuna.js — без эквалайзера,
// Tone.js — целый фреймворк, weq8 — только эквалайзер), а сами фильтры в браузере те же, что в этих библиотеках.
// Кривая эквалайзера считается здесь же по формулам RBJ Audio EQ Cookbook — по ним же работает BiquadFilterNode, —
// чистой функцией, чтобы рисовать и проверять без звука.
import { sendToSpace, SPACES, SPACE_DEF } from './context.js';
import { makeIR } from './waves.js';

export const EQ_TYPES = ['highpass', 'lowshelf', 'peaking', 'highshelf', 'lowpass'];
export const F_MIN = 20, F_MAX = 20000, G_MAX = 15, Q_MIN = 0.2, Q_MAX = 8, BANDS_MAX = 8;
export const REV_TYPES = SPACES; // ['room', 'hall', 'plate', 'cathedral']

const band = (type, f, q = 0.7, on = true) => ({ type, f, g: 0, q, on });
// Простой: три полосы, частоты закреплены (двигается только усиление)
export const simpleBands = () => [band('lowshelf', 200), band('peaking', 1000, 0.8), band('highshelf', 4000)];
// Продвинутый: срезы выключены, две полки и три пика по умолчанию
export const advancedBands = () => [band('highpass', 40, 0.7, false), band('lowshelf', 120), band('peaking', 400, 1), band('peaking', 1200, 1), band('peaking', 3500, 1), band('highshelf', 8000), band('lowpass', 16000, 0.7, false)];

// Полный набор настроек (всё в нуле — прозрачно)
export const FX_DEF = () => ({
  mode: null, simple: simpleBands(), adv: advancedBands(),
  comp: 0, drive: 0, trem: 0, tremRate: 5, delay: 0, delayTime: 0.3, delayFb: 0.35, chorus: 0, rev: 0, revType: 'hall',
});
export const FX_KEYS = ['comp', 'drive', 'trem', 'delay', 'chorus', 'rev']; // силы 0…1

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
// Привести сохранённое к полному виду (старые версии, мусор). Старый набор слоя лупера {lo, mid, hi, comp, rev} —
// в простые полосы
export function normalizeFx(fx) {
  const d = FX_DEF(), src = fx && typeof fx === 'object' ? fx : {};
  const o = { ...d, ...src };
  if (src.lo != null || src.mid != null || src.hi != null) { // старый формат (лупер до 2026-10)
    o.simple = [{ g: src.lo }, { g: src.mid }, { g: src.hi }];
    delete o.lo; delete o.mid; delete o.hi;
  }
  o.mode = o.mode === 'simple' || o.mode === 'adv' ? o.mode : null;
  o.simple = (Array.isArray(o.simple) && o.simple.length === 3 ? o.simple : d.simple).map((b, i) => ({ ...normalizeBand(b), type: d.simple[i].type, f: d.simple[i].f, q: d.simple[i].q, on: true }));
  o.adv = (Array.isArray(o.adv) && o.adv.length ? o.adv.slice(0, BANDS_MAX) : d.adv).map(normalizeBand);
  FX_KEYS.forEach((k) => { o[k] = Math.round(clamp(o[k], 0, 1) * 100) / 100; });
  o.tremRate = Math.round(clamp(o.tremRate, 0.5, 12) * 10) / 10;
  o.delayTime = Math.round(clamp(o.delayTime, 0.05, 1.5) * 1000) / 1000;
  o.delayFb = Math.round(clamp(o.delayFb, 0, 0.9) * 100) / 100;
  if (!REV_TYPES.includes(o.revType)) o.revType = 'hall';
  return o;
}
// Какие полосы звучат сейчас (по виду)
export const activeBands = (fx, mode = fx.mode || 'simple') => (mode === 'adv' ? fx.adv : fx.simple);
// Всё ли по умолчанию (для подсветки кнопки в микшере)
export function fxIsFlat(fx) {
  const f = normalizeFx(fx);
  return activeBands(f).every((b) => !b.on || ((b.type === 'highpass' || b.type === 'lowpass') ? false : b.g === 0)) && FX_KEYS.every((k) => !f[k]);
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

/* ---------- параметры эффектов по силе 0…1 (чистые функции, с тестами) ---------- */

// Сжатие: порог и степень по силе. У компрессора Web Audio скрытое усиление (makeup ≈ 0,6 от сжатия на 0 dBFS),
// которое поднимает тихое — после него запас на половину этого усиления: обычный уровень инструментов (−15…−10 dBFS)
// остаётся примерно той же громкости, тихое чуть громче, пики — ниже; к клиппингу не подходит
export function compParams(amount) {
  if (amount <= 0) return { threshold: 0, ratio: 1, knee: 0, trim: 1 };
  const threshold = -4 - amount * 20, ratio = 1 + amount * 5, makeupDb = 0.6 * -threshold * (1 - 1 / ratio);
  return { threshold, ratio, knee: 6, trim: Math.pow(10, (-makeupDb * 0.5) / 20) };
}
// Драйв: мягкое насыщение tanh; k — крутизна по силе; кривая нормирована так, что сигнал средней силы (0,5)
// проходит с той же громкостью — драйв меняет окраску, а не громкость
export function driveCurve(amount, n = 2048) {
  const k = 1 + amount * amount * 24, out = new Float32Array(n), norm = Math.tanh(k * 0.5) / 0.5;
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; out[i] = amount > 0 ? Math.tanh(k * x) / norm : x; }
  return out;
}

/* ---------- цепочка узлов ---------- */

// Пространства реверберации в своём контексте (диктофон — отдельный контекст с малой задержкой; офлайн-рендер):
// space(type) → вход пространства, выход — в dest; создаются при первом посыле
export function localSpaces(c, dest) {
  const made = {};
  return (type) => {
    if (made[type] !== undefined) return made[type];
    try {
      const d = SPACE_DEF[type] || SPACE_DEF.hall, cv = c.createConvolver(), hp = c.createBiquadFilter(), lp = c.createBiquadFilter(), g = c.createGain(), inp = c.createGain();
      cv.buffer = makeIR(c, d.sec, { damp: d.damp, pre: d.pre });
      hp.type = 'highpass'; hp.frequency.value = d.hp;
      lp.type = 'lowpass'; lp.frequency.value = Math.min(d.lp, c.sampleRate / 2 - 100);
      g.gain.value = d.gain;
      inp.connect(hp).connect(cv).connect(lp).connect(g).connect(dest);
      made[type] = inp;
    } catch { made[type] = null; }
    return made[type];
  };
}

// Цепочка на контексте c: { input, output, set(fx), fx, dispose() }. opts.space(type) → узел пространства в этом
// контексте (по умолчанию — общие пространства приложения, context.js)
// Вход → 8 фильтров → компрессор → запас → драйв (сухой и насыщенный параллельно) → тремоло → выход; задержка и
// хор — параллельно от тремоло к выходу (сухой сигнал всегда прямой), реверберация — посылы в общие пространства
export function createFxChain(c, fx, { space = null } = {}) {
  const input = c.createGain(), output = c.createGain(), comp = c.createDynamicsCompressor(), trim = c.createGain();
  comp.attack.value = 0.005; comp.release.value = 0.2;
  let cur = normalizeFx(fx), driveLevel = -1;
  const T = () => c.currentTime, SM = 0.02;
  const ramp = (p, v) => { try { p.setTargetAtTime(v, T(), SM); } catch { p.value = v; } };

  // фильтры: всегда все, неиспользуемые — прозрачный пик
  const filters = Array.from({ length: BANDS_MAX }, () => { const f = c.createBiquadFilter(); f.type = 'peaking'; f.gain.value = 0; f.Q.value = 1; f.frequency.value = 1000; return f; });
  let n = input;
  filters.forEach((f) => { n.connect(f); n = f; });
  n.connect(comp).connect(trim);
  // драйв: сухой и насыщенный параллельно, перекрёстным затуханием (без переключений)
  const ws = c.createWaveShaper(), dry = c.createGain(), wet = c.createGain(), trem = c.createGain();
  try { ws.oversample = '2x'; } catch { /* */ }
  ws.curve = driveCurve(0); dry.gain.value = 1; wet.gain.value = 0;
  trim.connect(dry).connect(trem); trim.connect(ws).connect(wet).connect(trem);
  // тремоло: генератор качает громкость вокруг единицы
  const tlfo = c.createOscillator(), tdepth = c.createGain();
  tlfo.type = 'sine'; tlfo.frequency.value = 5; tdepth.gain.value = 0; trem.gain.value = 1;
  tlfo.connect(tdepth).connect(trem.gain);
  trem.connect(output);
  // задержка с петлёй и приглушением верха в ней
  const dl = c.createDelay(2), fb = c.createGain(), damp = c.createBiquadFilter(), dwet = c.createGain();
  damp.type = 'lowpass'; damp.frequency.value = 3800; fb.gain.value = 0; dwet.gain.value = 0;
  trem.connect(dl); dl.connect(damp).connect(fb).connect(dl); dl.connect(dwet).connect(output);
  // хор: короткая задержка, колеблемая генератором
  const ch = c.createDelay(0.1), lfo = c.createOscillator(), depth = c.createGain(), cwet = c.createGain();
  ch.delayTime.value = 0.022; lfo.type = 'sine'; lfo.frequency.value = 0.8; depth.gain.value = 0.004; cwet.gain.value = 0;
  lfo.connect(depth).connect(ch.delayTime); trem.connect(ch).connect(cwet).connect(output);
  try { lfo.start(); tlfo.start(); } catch { /* */ }
  // реверберация: посыл на каждое пространство (создаётся при первом ненулевом уровне, дальше живёт)
  const sends = {};
  const send = (type) => {
    if (sends[type] !== undefined) return sends[type];
    if (!space) return (sends[type] = sendToSpace(output, type, 0));
    const sp = space(type);
    if (!sp) return (sends[type] = null);
    const s = c.createGain();
    s.gain.value = 0;
    output.connect(s).connect(sp);
    return (sends[type] = s);
  };

  function apply() {
    const bands = activeBands(cur), isCut = (b) => b.type === 'highpass' || b.type === 'lowpass';
    filters.forEach((f, i) => {
      const b = bands[i];
      if (!b || !b.on) { if (f.type !== 'peaking') f.type = 'peaking'; ramp(f.gain, 0); return; }
      if (f.type !== b.type) f.type = b.type;
      ramp(f.frequency, b.f);
      ramp(f.gain, isCut(b) ? 0 : b.g);
      ramp(f.Q, isCut(b) ? 20 * Math.log10(b.q) : b.q); // у срезов Q в дБ (Web Audio)
    });
    const cp = compParams(cur.comp);
    ramp(comp.threshold, cp.threshold); ramp(comp.ratio, cp.ratio); ramp(comp.knee, cp.knee); ramp(trim.gain, cp.trim);
    const dv = Math.round(cur.drive * 20) / 20;
    if (dv !== driveLevel) { driveLevel = dv; ws.curve = driveCurve(dv); }
    ramp(wet.gain, cur.drive > 0 ? Math.min(1, 0.3 + cur.drive) : 0); ramp(dry.gain, cur.drive > 0 ? Math.max(0, 0.7 - cur.drive) : 1);
    ramp(tlfo.frequency, cur.tremRate); ramp(tdepth.gain, cur.trem * 0.5); ramp(trem.gain, 1 - cur.trem * 0.5);
    ramp(dl.delayTime, cur.delayTime); ramp(fb.gain, cur.delay ? cur.delayFb : 0); ramp(dwet.gain, cur.delay * 0.7);
    ramp(cwet.gain, cur.chorus * 0.6); ramp(depth.gain, 0.002 + cur.chorus * 0.004);
    REV_TYPES.forEach((ty) => {
      const lvl = ty === cur.revType ? cur.rev * 0.9 : 0;
      if (!lvl && !sends[ty]) return;
      const s = send(ty);
      if (s) ramp(s.gain, lvl);
    });
  }
  apply();
  return {
    input, output,
    get fx() { return cur; },
    set(next) { cur = normalizeFx(next); apply(); },
    dispose() {
      try { lfo.stop(); tlfo.stop(); } catch { /* */ }
      [input, output, comp, trim, ws, dry, wet, trem, tlfo, tdepth, dl, fb, damp, dwet, ch, lfo, depth, cwet, ...filters, ...Object.values(sends)].forEach((x) => { try { x && x.disconnect(); } catch { /* */ } });
    },
  };
}

// Хвост после сигнала, с — чтобы реверберация и задержка дозвучали при офлайн-рендере
export const fxTailSec = (fx) => {
  const f = normalizeFx(fx), rev = f.rev > 0 ? { room: 1, hall: 3, plate: 2, cathedral: 7 }[f.revType] : 0, dl = f.delay > 0 ? Math.min(6, f.delayTime * (1 + 4 * f.delayFb) + 1) : 0;
  return Math.max(rev, dl, 0.05);
};

// Прогнать каналы (Float32Array[]) через цепочку офлайн — тот же звук, что вживую: OfflineAudioContext с теми же узлами.
// gainDb — усиление после цепочки. Возвращает каналы той же длины плюс хвост (без тишины в конце). null — нет OfflineAudioContext
export async function renderFx(ch, sr, fx, gainDb = 0) {
  const OAC = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  if (!OAC || !ch.length) return null;
  const n = ch[0].length, tail = Math.ceil(fxTailSec(fx) * sr), c = new OAC(ch.length, n + tail, sr);
  const buf = c.createBuffer(ch.length, n, sr);
  ch.forEach((x, i) => buf.copyToChannel(x, i));
  const src = c.createBufferSource(), g = c.createGain();
  src.buffer = buf;
  g.gain.value = Math.pow(10, gainDb / 20);
  const chain = createFxChain(c, fx, { space: localSpaces(c, g) });
  src.connect(chain.input); chain.output.connect(g).connect(c.destination);
  src.start(0);
  const out = await c.startRendering();
  const res = Array.from({ length: out.numberOfChannels }, (_, i) => out.getChannelData(i));
  // хвост: оставить, пока слышно (−60 дБ), остальное отрезать
  let end = n;
  for (let i = n + tail - 1; i >= n; i -= 64) { if (res.some((x) => Math.abs(x[i]) > 0.001)) { end = Math.min(n + tail, i + 64); break; } }
  return res.map((x) => x.slice(0, end));
}
