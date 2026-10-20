// Общие эффекты для всего приложения: эквалайзер, сжатие, драйв, тремоло, задержка, хор, реверберация (четыре
// пространства). Одна и та же цепочка — на каждой шине микшера (клик, пианино, глайдер, пэды, медиа, теория),
// на каждом слое лупера, на каждой дорожке студии и в диктофоне (вживую и при обработке записи — renderFx);
// настраивается каждая отдельно.
// Два вида эквалайзера: простой (три полосы на фиксированных частотах — низ, середина, верх; только усиление) и
// продвинутый (до 8 полос: срез низа и верха, полки, пики; частота, усиление и ширина у каждой; полосы можно
// добавлять и убирать). Хранится и то и другое: переключение вида не теряет настроек.
// Надёжность и экономия: правка ручек только меняет параметры (плавно, setTargetAtTime) — без переподключений, пока
// звучат все инструменты сразу. Тяжёлые узлы (компрессор, вейвшейпер, задержки, генераторы) создаются только когда
// эффект включён, и убираются, когда он в нуле: на телефоне десяток цепочек в нуле не стоит ничего. Перестройка
// (включили эффект, сменили вид эквалайзера) — под коротким затуханием выхода, без щелчка. Пространства
// реверберации общие на всё приложение (context.js) — лишних свёрток нет.
// Звук — только родные узлы Web Audio (Biquad, DynamicsCompressor, WaveShaper, Delay, Oscillator, Convolver):
// готовых библиотек с таким набором под GPL-совместимой лицензией и без лишнего веса нет (tuna.js — без эквалайзера,
// Tone.js — целый фреймворк, weq8 — только эквалайзер), а сами фильтры в браузере те же, что в этих библиотеках.
// Кривая эквалайзера считается здесь же по формулам RBJ Audio EQ Cookbook — по ним же работает BiquadFilterNode, —
// чистой функцией, чтобы рисовать и проверять без звука.
import { sendToSpace, SPACES, SPACE_DEF } from './context.js';
import { makeIR } from './waves.js';
import { eco } from './perf.js';
import { after, cancel } from './clock.js';

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
  comp: 0, drive: 0, trem: 0, tremRate: 5, delay: 0, delayTime: 0.3, delayFb: 0.35, chorus: 0, chorusType: 'chorus', rev: 0, revType: 'hall',
});
export const FX_KEYS = ['comp', 'drive', 'trem', 'delay', 'chorus', 'rev']; // силы 0…1
export const CHORUS_TYPES = ['chorus', 'flanger', 'phaser']; // вид модуляции: хор (задержка ~20 мс), фленджер (короткая с обратной связью), фейзер (всепропускающие)

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
  if (!CHORUS_TYPES.includes(o.chorusType)) o.chorusType = 'chorus';
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
// контексте (по умолчанию — общие пространства приложения, context.js).
// Экономия процессора (телефон): в цепочке живут только нужные узлы. Полосы эквалайзера — только включённые полосы
// текущего вида; компрессор, драйв, тремоло, задержка и хор создаются и подключаются при первом ненулевом значении
// и отключаются, когда возвращаются в ноль. Цепочка в нуле — один фильтр-пустышка, почти даром. Перестройка
// (включили эффект, переключили вид, добавили полосу) — под коротким затуханием выхода (15 мс), без щелчка; правка
// ручек (усиление, частота, сила эффекта) — только параметры, плавно, без переподключений.
export function createFxChain(c, fx, { space = null } = {}) {
  const input = c.createGain(), output = c.createGain(), fade = c.createGain();
  // точка раздачи параллельных эффектов (задержка, хор) и посылов — после последовательной части
  const tap = c.createGain();
  tap.connect(fade).connect(output);
  let cur = normalizeFx(fx), shape = '', filters = [], driveLevel = -1, rewireTm = 0;
  const T = () => c.currentTime, SM = 0.02, isCut = (b) => b.type === 'highpass' || b.type === 'lowpass';
  const ramp = (p, v) => { try { p.setTargetAtTime(v, T(), SM); } catch { p.value = v; } };
  const S = {}; // ленивые стадии: comp, drive, trem, delay, chorus
  const stage = {
    comp() {
      const comp = c.createDynamicsCompressor(), trim = c.createGain();
      comp.attack.value = 0.005; comp.release.value = 0.2; comp.connect(trim);
      return { i: comp, o: trim, comp, trim };
    },
    drive() { // сухой и насыщенный параллельно, перекрёстным затуханием
      const i = c.createGain(), o = c.createGain(), ws = c.createWaveShaper(), dry = c.createGain(), wet = c.createGain();
      try { ws.oversample = eco() ? 'none' : '2x'; } catch { /* */ }
      ws.curve = driveCurve(0.05); dry.gain.value = 1; wet.gain.value = 0;
      i.connect(dry).connect(o); i.connect(ws).connect(wet).connect(o);
      return { i, o, ws, dry, wet };
    },
    trem() { // генератор качает громкость вокруг единицы
      const g = c.createGain(), lfo = c.createOscillator(), depth = c.createGain();
      lfo.type = 'sine'; lfo.frequency.value = 5; depth.gain.value = 0; g.gain.value = 1;
      lfo.connect(depth).connect(g.gain); try { lfo.start(); } catch { /* */ }
      return { i: g, o: g, g, lfo, depth };
    },
    delay() { // параллельно от tap к выходу: петля с приглушением верха
      const dl = c.createDelay(2), fb = c.createGain(), damp = c.createBiquadFilter(), wet = c.createGain();
      damp.type = 'lowpass'; damp.frequency.value = 3800; fb.gain.value = 0; wet.gain.value = 0;
      dl.connect(damp).connect(fb).connect(dl); dl.connect(wet);
      return { i: dl, on: false, dl, fb, wet, damp };
    },
    chorus() { // параллельно, по виду: хор — задержка ~20 мс, колеблемая генератором; фленджер — ~3 мс с обратной
      // связью; фейзер — четыре всепропускающих фильтра, частоты которых качает генератор
      const type = cur.chorusType, lfo = c.createOscillator(), depth = c.createGain(), wet = c.createGain();
      lfo.type = 'sine'; wet.gain.value = 0; try { lfo.start(); } catch { /* */ }
      if (type === 'phaser') {
        const aps = [400, 800, 1600, 3200].map((f) => { const ap = c.createBiquadFilter(); ap.type = 'allpass'; ap.frequency.value = f; ap.Q.value = 0.7; return ap; });
        const inp = c.createGain(), fb = c.createGain();
        fb.gain.value = 0.3; lfo.frequency.value = 0.5; depth.gain.value = 600;
        aps.forEach((ap) => lfo.connect(depth).connect(ap.frequency));
        let n = inp; aps.forEach((ap) => { n.connect(ap); n = ap; });
        n.connect(wet); n.connect(fb).connect(inp);
        return { i: inp, on: false, type, lfo, depth, wet, fb, aps };
      }
      const ch = c.createDelay(0.1);
      ch.delayTime.value = type === 'flanger' ? 0.003 : 0.022; lfo.frequency.value = type === 'flanger' ? 0.25 : 0.8; depth.gain.value = 0.004;
      lfo.connect(depth).connect(ch.delayTime); ch.connect(wet);
      const fb = c.createGain(); fb.gain.value = 0;
      if (type === 'flanger') ch.connect(fb).connect(ch);
      return { i: ch, on: false, type, ch, lfo, depth, wet, fb };
    },
  };
  const kill = (st) => Object.values(st).forEach((n) => { if (n && typeof n === 'object' && n.disconnect) { try { if (n.stop) n.stop(); } catch { /* */ } try { n.disconnect(); } catch { /* */ } } });
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

  // Какие узлы нужны при текущих настройках
  const want = () => {
    const bands = activeBands(cur).filter((b) => b.on);
    return { bands, comp: cur.comp > 0, drive: cur.drive > 0, trem: cur.trem > 0, delay: cur.delay > 0, chorus: cur.chorus > 0 };
  };
  // Собрать последовательную часть: вход → полосы → [компрессор] → [драйв] → [тремоло] → tap; параллельные (задержка,
  // хор) — от tap к выходу. Выключенная стадия отключается, но остаётся в запасе (узлы создаются один раз — повторное
  // включение дёшево, а отключённый узел процессор не ест)
  function wire(w) {
    try { input.disconnect(); } catch { /* */ }
    filters.forEach((f) => { try { f.disconnect(); } catch { /* */ } });
    ['comp', 'drive', 'trem'].forEach((k) => { if (S[k]) { try { S[k].o.disconnect(); } catch { /* */ } } });
    ['delay', 'chorus'].forEach((k) => { if (S[k] && S[k].on && !w[k]) { S[k].on = false; try { tap.disconnect(S[k].i); } catch { /* */ } try { S[k].wet.disconnect(); } catch { /* */ } } });
    if (S.chorus && S.chorus.type !== cur.chorusType) { if (S.chorus.on) { try { tap.disconnect(S.chorus.i); } catch { /* */ } try { S.chorus.wet.disconnect(); } catch { /* */ } } kill(S.chorus); delete S.chorus; } // другой вид — заново
    filters = w.bands.map((b, i) => { const f = filters[i] && filters[i].type === b.type ? filters[i] : c.createBiquadFilter(); f.type = b.type; return f; });
    let n = input;
    filters.forEach((f) => { n.connect(f); n = f; });
    ['comp', 'drive', 'trem', 'delay', 'chorus'].forEach((k) => { if (w[k] && !S[k]) S[k] = stage[k](); });
    ['comp', 'drive', 'trem'].forEach((k) => { if (w[k]) { n.connect(S[k].i); n = S[k].o; } });
    n.connect(tap);
    ['delay', 'chorus'].forEach((k) => { if (w[k] && !S[k].on) { S[k].on = true; tap.connect(S[k].i); S[k].wet.connect(fade); } });
  }
  function apply(first = false) {
    const w = want(), key = [w.bands.map((b) => b.type).join(','), w.comp, w.drive, w.trem, w.delay, w.chorus, w.chorus && cur.chorusType].join('|');
    if (key !== shape) { // перестройка — под затуханием выхода, чтобы не щёлкнуло
      shape = key;
      cancel(rewireTm);
      if (first) wire(w);
      else { fade.gain.setTargetAtTime(0, T(), 0.004); rewireTm = after(18, () => { wire(w); fade.gain.setTargetAtTime(1, T(), 0.006); }); }
    }
    w.bands.forEach((b, i) => {
      const f = filters[i]; if (!f) return;
      ramp(f.frequency, b.f);
      ramp(f.gain, isCut(b) ? 0 : b.g);
      ramp(f.Q, isCut(b) ? 20 * Math.log10(b.q) : b.q); // у срезов Q в дБ (Web Audio)
    });
    if (S.comp) { const cp = compParams(cur.comp); ramp(S.comp.comp.threshold, cp.threshold); ramp(S.comp.comp.ratio, cp.ratio); ramp(S.comp.comp.knee, cp.knee); ramp(S.comp.trim.gain, cp.trim); }
    if (S.drive) {
      const dv = Math.max(0.05, Math.round(cur.drive * 20) / 20);
      if (dv !== driveLevel) { driveLevel = dv; S.drive.ws.curve = driveCurve(dv); }
      ramp(S.drive.wet.gain, Math.min(1, 0.3 + cur.drive)); ramp(S.drive.dry.gain, Math.max(0, 0.7 - cur.drive));
    }
    if (S.trem) { ramp(S.trem.lfo.frequency, cur.tremRate); ramp(S.trem.depth.gain, cur.trem * 0.5); ramp(S.trem.g.gain, 1 - cur.trem * 0.5); }
    if (S.delay) { ramp(S.delay.dl.delayTime, cur.delayTime); ramp(S.delay.fb.gain, cur.delayFb); ramp(S.delay.wet.gain, cur.delay * 0.7); }
    if (S.chorus) {
      const ty = S.chorus.type;
      ramp(S.chorus.wet.gain, cur.chorus * (ty === 'phaser' ? 0.8 : 0.6));
      if (ty === 'phaser') ramp(S.chorus.depth.gain, 300 + cur.chorus * 900);
      else { ramp(S.chorus.depth.gain, ty === 'flanger' ? 0.0005 + cur.chorus * 0.002 : 0.002 + cur.chorus * 0.004); if (ty === 'flanger') ramp(S.chorus.fb.gain, 0.2 + cur.chorus * 0.5); }
    }
    REV_TYPES.forEach((ty) => {
      const lvl = ty === cur.revType ? cur.rev * 0.9 : 0;
      if (!lvl && !sends[ty]) return;
      const s = send(ty);
      if (s) ramp(s.gain, lvl);
    });
  }
  apply(true);
  return {
    input, output,
    get fx() { return cur; },
    set(next) { cur = normalizeFx(next); apply(); },
    // сколько узлов живёт сейчас (для проверки экономии)
    get nodes() { const w = want(); return 4 + filters.length + ['comp', 'drive', 'trem', 'delay', 'chorus'].filter((k) => w[k]).reduce((n, k) => n + Object.values(S[k]).filter((x) => x && x.disconnect).length, 0) + Object.values(sends).filter(Boolean).length; },
    dispose() {
      cancel(rewireTm);
      Object.values(S).forEach(kill);
      [input, output, fade, tap, ...filters, ...Object.values(sends)].forEach((x) => { try { x && x.disconnect(); } catch { /* */ } });
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
