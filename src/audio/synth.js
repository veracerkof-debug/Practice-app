// Синтезатор пианино: рояль по записям настоящего инструмента (grand.js), воздушные звуки для поклонения
// (airsound.js), орган, синус, колокол, FM-электропиано, аналоговый бас. До 22 голосов.
// Второй слой: тот же аккорд звучит ещё одним звуком (рояль + пэд); у каждого слоя — громкость и простой
// эквалайзер (низ, середина, верх). У каждого звука — свои ручки: то, что у него действительно меняется
// (у рояля — крышка, удар, демпферы; у пэда — дыхание, мерцание, плавание; у баса — фильтр и резонанс).
// Параметры звука (patch) — как в прототипе (device.piano.syn), слой — device.piano.layer.
import { getContext, midiFreq, sendToHall } from './context.js';
import { synWave, noiseBuf } from './waves.js';
import { airVoice } from './airsound.js';
import { grandBuffer, grandPreload } from './grand.js';

// Встроенные пресеты; имена — ключи i18n synth.preset.<id>
export const PRESETS = {
  // рояль — записи настоящего инструмента; пока запись не загрузилась — синтезированное пианино (kind: piano)
  piano: { kind: 'grand', tone: 0.7, bright: 0.65, touch: 0.6, att: 3, dec: 0.75, sus: 0, rel: 0.3, cho: 0, rev: 0.28, ham: 1 },
  // Для поклонения — воздушные, без «электронного» звучания (airsound.js): мягкое пиано, клавиши с пэдом под ними,
  // воздушный, светлый, тёплый пэд, хор, флейта-дыхание. hall — посыл в длинный зал
  wfelt: { kind: 'soft', air: 'felt', tone: 0.3, bright: 0.5, att: 3, dec: 1.5, sus: 0, rel: 1.8, cho: 0.35, rev: 0.45, hall: 0.4, gain: 1.15 },
  wkpad: { kind: 'soft', air: 'felt', layer: 'air', lay: 0.5, tone: 0.3, bright: 0.5, att: 3, dec: 1.4, sus: 1, rel: 2.8, cho: 0.45, rev: 0.5, hall: 0.6, gain: 1.05 },
  wair: { kind: 'soft', air: 'air', tone: 0.5, bright: 0.5, att: 1300, dec: 1, sus: 1, rel: 3, cho: 0.6, rev: 0.6, hall: 0.75 },
  wlight: { kind: 'soft', air: 'light', tone: 0.5, bright: 0.5, att: 1500, dec: 1, sus: 1, rel: 3, cho: 0.6, rev: 0.6, hall: 0.85 },
  wwarm: { kind: 'soft', air: 'warm', tone: 0.5, bright: 0.5, att: 900, dec: 1, sus: 1, rel: 2.6, cho: 0.5, rev: 0.5, hall: 0.6 },
  wchoir: { kind: 'soft', air: 'choir', tone: 0.5, bright: 0.5, att: 700, dec: 1, sus: 1, rel: 2.4, cho: 0.55, rev: 0.6, hall: 0.7 },
  wflute: { kind: 'soft', air: 'flute', tone: 0.5, bright: 0.5, att: 70, dec: 1, sus: 1, rel: 1.1, cho: 0.2, rev: 0.5, hall: 0.6 },
  organ: { kind: 'organ', tone: 0.65, bright: 0.75, att: 12, dec: 0.5, sus: 1, rel: 0.1, cho: 0.5, rev: 0.35 },
  sine: { kind: 'soft', tone: 0, bright: 1, att: 8, dec: 0.5, sus: 0.85, rel: 0.25, cho: 0, rev: 0.2 },
  // колокол: негармонические обертоны литого колокола (гул на октаву ниже, малая терция, квинта, октава…),
  // верхние гаснут быстрее; удар — короткий звон
  bell: { kind: 'soft', tone: 0.1, bright: 0.9, att: 1, dec: 1.4, sus: 0, rel: 1.8, cho: 0.05, rev: 0.55, gain: 1.35,
    partials: [[0.5, 0.55, 1.5], [1.2, 0.5, 0.75], [1.5, 0.35, 0.6], [2, 0.5, 0.85], [2.5, 0.3, 0.45], [3, 0.28, 0.35], [4.2, 0.2, 0.22], [5.4, 0.12, 0.15]] },
  // FM-электропиано: синус, модулируемый синусом той же частоты (индекс быстро спадает — мягкий «колокольчик» в атаке),
  // и короткий звон высокого обертона
  fmep: { kind: 'soft', tone: 0, bright: 0.8, att: 2, dec: 0.95, sus: 0.12, rel: 0.55, cho: 0.35, rev: 0.32, tine: 14, tineAmp: 0.12,
    fm: { ratio: 1, index: 2.2, sus: 0.18, dec: 0.22 } },
  // аналоговый бас: пила и квадрат октавой ниже через резонансный фильтр, который открывается ударом и закрывается
  abass: { kind: 'saw', tone: 0.6, bright: 0.1, att: 3, dec: 0.4, sus: 0.6, rel: 0.12, cho: 0, rev: 0.04, gain: 1.5, res: 7, fenv: 0.9, sub: 0.55 },
};
// Убранные звуки (10.2026: струнный ансамбль, шиммер- и свелл-пэд, тёплые клавиши, пэд, электропиано, прежнее
// пианино) — сохранённый выбор и звуки тренажёра слуха ведут к ближайшему из оставшихся
export const PRESET_ALIAS = { epiano: 'fmep', pad: 'wair', strings: 'wwarm', wshimmer: 'wlight', wswell: 'wair', wkeys: 'wkpad' };
export const presetOf = (id) => PRESETS[id] || PRESETS[PRESET_ALIAS[id]] || null;
// Пресеты набора для поклонения (в глайдере и терменвоксе — отдельной группой, первыми)
export const WORSHIP = ['wfelt', 'wkpad', 'wair', 'wlight', 'wwarm', 'wchoir', 'wflute'];
// Поля звука, которые не ручки, но входят в пресет (свои пресеты сохраняют их тоже)
export const PATCH_EXTRA = ['kind', 'tine', 'ham', 'gain', 'partials', 'fm', 'vib', 'shimmer', 'swell', 'air', 'layer'];
const sigOf = (s) => JSON.stringify([s.kind || 'soft', s.tine || 0, s.partials || 0, s.fm || 0, !!s.sub, s.vib || 0, s.shimmer || 0, s.swell || 0, s.air || 0, s.layer || 0]);
// Все ручки и их диапазоны. Множители рецепта воздушных звуков: 1 — как задумано
export const PATCH_RANGE = { tone: [0, 1], bright: [0, 1], cho: [0, 1], att: [1, 1500], dec: [0.05, 2], sus: [0, 1], rel: [0.03, 3], rev: [0, 1],
  touch: [0, 1], hall: [0, 1], ab: [0, 3], ash: [0, 3], adr: [0, 3], avib: [0, 2.5], ath: [0, 2.5], lay: [0, 1],
  fmi: [0, 6], tineAmp: [0, 0.5], res: [0.3, 15], fenv: [0, 1], sub: [0, 1],
  vol: [0, 1.5], eqlo: [-12, 12], eqmid: [-12, 12], eqhi: [-12, 12] };
// Значения ручек, которых нет в пресете
export const KNOB_DEF = { touch: 0.6, hall: 0, ab: 1, ash: 1, adr: 1, avib: 1, ath: 1, lay: 0.5, tineAmp: 0.35, res: 1, fenv: 0, sub: 0, vol: 1, eqlo: 0, eqmid: 0, eqhi: 0 };
export const knobVal = (s, k) => (s[k] != null ? s[k] : k === 'fmi' ? (s.fm ? s.fm.index : 0) : KNOB_DEF[k] ?? 0);
// Старое имя: ручки панели общего синтезатора (свои пресеты прежних версий)
export const PATCH_KEYS = ['tone', 'bright', 'att', 'dec', 'sus', 'rel', 'cho', 'rev', 'touch', 'hall', 'ab', 'ash', 'adr', 'avib', 'ath', 'lay', 'fmi', 'tineAmp', 'res', 'fenv', 'sub'];
// Ручки звука — у каждого свои; громкость и эквалайзер слоя — MIX_KNOBS
export function knobsOf(s) {
  if (s.kind === 'grand') return ['bright', 'touch', 'rel', 'rev'];
  if (s.air === 'felt') return ['bright', 'ath', 'dec', 'rel', 'cho', 'hall', ...(s.layer ? ['lay'] : [])];
  if (s.air === 'air' || s.air === 'light') return ['att', 'rel', 'bright', 'cho', 'ab', 'ash', 'adr', 'hall'];
  if (s.air === 'warm') return ['att', 'rel', 'bright', 'cho', 'ab', 'adr', 'hall'];
  if (s.air === 'choir') return ['att', 'rel', 'bright', 'cho', 'ab', 'avib', 'hall'];
  if (s.air === 'flute') return ['att', 'rel', 'bright', 'ab', 'avib', 'hall'];
  if (s.kind === 'organ') return ['tone', 'cho', 'bright', 'att', 'rel', 'rev'];
  if (s.partials) return ['bright', 'dec', 'rel', 'rev'];
  if (s.fm) return ['fmi', 'tineAmp', 'dec', 'sus', 'rel', 'cho', 'rev'];
  if (s.fenv != null || s.sub != null) return ['bright', 'res', 'fenv', 'sub', 'dec', 'sus', 'rel'];
  return ['tone', 'bright', 'att', 'dec', 'sus', 'rel', 'cho', 'rev'];
}
export const MIX_KNOBS = ['vol', 'eqlo', 'eqmid', 'eqhi'];
const AIR_MUL = (s) => ({ breath: knobVal(s, 'ab'), shim: knobVal(s, 'ash'), drift: knobVal(s, 'adr'), vib: knobVal(s, 'avib'), hammer: knobVal(s, 'ath') });

export const MAX_VOICES = 22;

// Патч пианино из настроек устройства (создаётся при первом обращении); убранный звук — ближайший из оставшихся,
// прежнее синтезированное «Пианино» — рояль
export function pianoPatch(piano) {
  if (!piano.syn) {
    const pre = piano.sound === 'pad' ? 'wair' : 'piano';
    piano.syn = Object.assign({ preset: pre }, PRESETS[pre]);
  } else if (!piano.syn.name && (PRESET_ALIAS[piano.syn.preset] || (piano.syn.preset === 'piano' && piano.syn.kind !== 'grand'))) {
    applyPreset(piano.syn, PRESET_ALIAS[piano.syn.preset] || 'piano');
  }
  return piano.syn;
}
// Второй слой (или null); тот же переход для убранных звуков
export function pianoLayer(piano) {
  const l = piano.layer;
  if (l && !l.name && PRESET_ALIAS[l.preset]) applyPreset(l, PRESET_ALIAS[l.preset]);
  return l || null;
}

// Сменить звук: ручки звука — из пресета, громкость и эквалайзер слоя остаются
export function applyPreset(patch, id) {
  const keep = {};
  MIX_KNOBS.forEach((k) => { if (patch[k] != null) keep[k] = patch[k]; });
  Object.keys(patch).forEach((k) => delete patch[k]); // от прошлого пресета ничего не остаётся
  return Object.assign(patch, presetOf(id) || PRESETS.piano, keep, { preset: PRESETS[id] ? id : PRESET_ALIAS[id] || 'piano', name: null });
}

// getPatch() → текущий патч; getLayer() → второй слой или null; getA4() → строй; mixer — для шин
export function createSynth({ mixer, getPatch, getLayer = () => null, getA4 = () => 440 }) {
  const voices = new Map();
  let order = [];
  const last = { piano: 0, theory: 0 };
  // Полосы слоёв пианино: громкость и эквалайзер (низ 250 Гц, середина 1 кГц, верх 4 кГц) → шина piano
  let strips = { c: null };
  const strip = (c, slot) => {
    if (strips.c !== c || strips.bus !== mixer.bus('piano')) strips = { c, bus: mixer.bus('piano') };
    if (!strips[slot]) {
      const lo = c.createBiquadFilter(), mid = c.createBiquadFilter(), hi = c.createBiquadFilter(), out = c.createGain();
      lo.type = 'lowshelf'; lo.frequency.value = 250;
      mid.type = 'peaking'; mid.frequency.value = 1000; mid.Q.value = 0.8;
      hi.type = 'highshelf'; hi.frequency.value = 4000;
      lo.connect(mid).connect(hi).connect(out).connect(strips.bus);
      strips[slot] = { inp: lo, lo, mid, hi, out };
      mixStrip(c, slot, slot === 'layer' ? getLayer() : getPatch(), 0);
    }
    return strips[slot].inp;
  };
  const mixStrip = (c, slot, s, tau = 0.03) => {
    const S = strips.c === c && strips[slot];
    if (!S || !s) return;
    const t = c.currentTime;
    S.out.gain.setTargetAtTime(knobVal(s, 'vol'), t, tau || 0.001);
    S.lo.gain.setTargetAtTime(knobVal(s, 'eqlo'), t, tau || 0.001);
    S.mid.gain.setTargetAtTime(knobVal(s, 'eqmid'), t, tau || 0.001);
    S.hi.gain.setTargetAtTime(knobVal(s, 'eqhi'), t, tau || 0.001);
  };

  const cleanup = (key) => {
    const vo = voices.get(key);
    if (!vo) return;
    voices.delete(key);
    order = order.filter((k) => k !== key);
    setTimeout(() => { try { vo.g.disconnect(); } catch { /* уже отключён */ } }, 100);
  };

  // Заглушить один голос (r — время затухания; fast — сразу)
  const offOne = (key, fast = false, at = 0) => {
    const vo = voices.get(key), c = vo && vo.g.context;
    if (!vo) return;
    const t = Math.max(c.currentTime, at || 0), r = fast ? 0.02 : vo.rel;
    try {
      vo.g.gain.cancelScheduledValues(t);
      vo.g.gain.setValueAtTime(Math.max(vo.g.gain.value, 0.0001), t);
      vo.g.gain.setTargetAtTime(0.0001, t, r / 4);
      vo.os.forEach((o) => { try { o.stop(t + r * 1.4 + 0.05); } catch { /* ignore */ } });
    } catch { /* ignore */ }
    voices.delete(key);
    order = order.filter((k) => k !== key);
    clearTimeout(vo.timer);
    setTimeout(() => { try { vo.g.disconnect(); } catch { /* ignore */ } }, (r * 1.4 + 0.2) * 1000);
  };

  let preC = null;
  const LK = '\u0001L'; // ключ голоса второго слоя: ключ ноты + LK
  // Рояль: запись ближайшей ноты с нужной скоростью. «Крышка» — яркость (фильтр), «Удар» — сила нажатия
  // (без MIDI-клавиатуры; громче — ярче), «Демпферы» — как быстро глушится отпущенная клавиша. Ноты чуть
  // расходятся по панораме: низкие слева, высокие справа — как слышит пианист
  const grandVoice = (c, m, key, opts, s, sm, out, busName, t, f, slot) => {
    const src = c.createBufferSource(), lp = c.createBiquadFilter(), g = c.createGain();
    const v = opts.vel != null ? opts.vel : 0.3 + 0.65 * knobVal(s, 'touch');
    src.buffer = sm.buf;
    src.playbackRate.value = Math.pow(2, (m - sm.root) / 12) * (getA4() / 440);
    lp.type = 'lowpass';
    lp.Q.value = 0.4;
    lp.frequency.value = Math.min(20000, f * (3 + 70 * Math.pow(s.bright, 1.6) * (0.35 + 0.65 * v)) + 400);
    const peak = 1.5 * (s.gain || 1) * (0.2 + 0.8 * Math.pow(v, 1.4)); // по громкости — как остальные звуки
    g.gain.value = peak;
    let node = src.connect(lp);
    if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = Math.max(-0.45, Math.min(0.45, (m - 64) / 50)); node = node.connect(p); }
    node.connect(g).connect(out);
    src.start(t);
    const life = sm.buf.duration / src.playbackRate.value;
    const vo = { g, os: [src], rel: Math.max(0.03, s.rel), key, bus: busName, held: !!opts.hold, lp, main: [], m, f, kind: 'grand', peak, own: !!opts.patch,
      opts, sig: sigOf(s), sustain: true, grand: true, vel: v, slot };
    voices.set(key, vo);
    order.push(key);
    vo.timer = setTimeout(() => { if (voices.get(key) === vo) cleanup(key); }, life * 1000 + 80);
  };
  const grandCut = (s, vo) => Math.min(20000, vo.f * (3 + 70 * Math.pow(s.bright, 1.6) * (0.35 + 0.65 * vo.vel)) + 400);

  // Один голос звуком s; slot — полоса слоя пианино ('main' | 'layer') или null — прямо в шину
  const play = (c, m, key, opts, s, slot) => {
    const busName = opts.bus || 'piano';
    const SU = opts.hold ? Math.max(s.sus, 0.45) : s.sus;
    const t = opts.at > c.currentTime ? opts.at : c.currentTime + 0.004, f = midiFreq(m, getA4()); // at — точное время (студия)
    let kind = s.kind || 'soft';
    if (slot !== 'layer') mixer.setReverb('piano', s.rev * 0.9);
    const bus = mixer.bus(busName);
    last[busName] = Date.now();
    // голосов не хватает — замолкает самый старый, но удержанные (Hold) не трогаем, пока есть другие
    while (order.length >= MAX_VOICES) offOne(order.find((k) => !voices.get(k)?.held) ?? order[0], true);
    const out = slot ? strip(c, slot) : bus;
    if (kind === 'grand') {
      if (preC !== c) { preC = c; grandPreload(c); } // средние октавы — сразу, остальные — по мере игры
      const sm = grandBuffer(c, m);
      if (sm) { grandVoice(c, m, key, opts, s, sm, out, busName, t, f, slot); return; }
      kind = 'piano'; // запись ещё не загрузилась — синтезированное пианино
    }

    const g = c.createGain(), lp = c.createBiquadFilter(), os = [], main = [];
    lp.type = 'lowpass';
    lp.Q.value = s.res != null ? s.res : kind === 'saw' ? 1 : 0.3;
    lp.connect(g);
    g.connect(out);

    const cut = Math.max(200, Math.min(16000, f * (1.2 + s.bright * 22)));
    // у пианино низкие ноты звучат дольше
    const pitchK = kind === 'piano' ? Math.max(0.35, Math.min(2.2, (5.2 - (m - 36) * 0.07) / 3.4)) : 1;
    const dec = Math.max(0.05, s.dec * 3 * pitchK), att = Math.max(0.002, s.att / 1000), peak = (kind === 'saw' ? 0.16 : 0.34) * (s.gain || 1) * (opts.vel != null ? 0.25 + 0.75 * opts.vel : 1); // vel — сила нажатия MIDI-клавиатуры, 0…1
    if (kind === 'piano') {
      lp.frequency.setValueAtTime(cut, t);
      lp.frequency.setTargetAtTime(Math.max(500, f * (1.5 + s.bright * 3)), t + 0.02, dec * 0.3);
    } else if (s.fenv) { // огибающая фильтра: удар открывает, дальше закрывается к «яркости»
      lp.frequency.setValueAtTime(Math.min(18000, cut * (1 + s.fenv * 9)), t);
      lp.frequency.setTargetAtTime(cut, t + att, dec * 0.22);
    } else if (s.swell) { // свелл: фильтр раскрывается медленно, звук «вырастает»
      lp.frequency.setValueAtTime(Math.max(120, f * 1.1), t);
      lp.frequency.linearRampToValueAtTime(cut, t + s.swell);
    } else lp.frequency.value = cut;
    g.gain.setValueAtTime(0.0001, t);
    // у воздушных пэдов вступление — плавной кривой, без «угла» в конце
    if (s.air && att > 0.1) g.gain.setTargetAtTime(peak, t, att / 3);
    else g.gain.linearRampToValueAtTime(peak, t + att);
    if (SU < 0.999) g.gain.setTargetAtTime(Math.max(0.0001, peak * SU), t + att, dec / 3);

    const osc = (det, amp) => {
      const o = c.createOscillator();
      o.setPeriodicWave(synWave(c, kind, s.tone));
      o.frequency.value = f;
      o.detune.value = det;
      let node = o;
      if (amp !== 1) { const og = c.createGain(); og.gain.value = amp; o.connect(og); node = og; }
      node.connect(lp);
      o.start(t);
      os.push(o); main.push(o);
    };
    if (s.air) { // воздушный звук (airsound.js): свой фильтр и ансамбль; «хорус» — ширина, «яркость» — фильтр
      lp.frequency.value = 18000;
      lp.Q.value = 0;
      const opt = { width: 0.4 + s.cho, bright: 0.6 + s.bright * 0.8, fade: att * 1.5 + 1, mul: AIR_MUL(s) };
      os.push(...airVoice(c, lp, s.air, f, t, s.layer ? { ...opt, body: { decay: dec, floor: 0.12 } } : opt).srcs);
      if (s.layer) { // пэд под клавишами: вступает медленно и держится, пока держится нота
        const lg = c.createGain();
        lg.gain.setValueAtTime(0, t);
        lg.gain.linearRampToValueAtTime(knobVal(s, 'lay'), t + 1.6);
        lg.connect(lp);
        os.push(...airVoice(c, lg, s.layer, f, t, { ...opt, fade: 3 }).srcs);
      }
      if (s.hall) sendToHall(g, s.hall);
    } else if (s.cho > 0.04) { const d = 4 + s.cho * 10; osc(-d, 0.55); osc(d, 0.55); } else osc(0, 1);
    if (s.fm) { // частотная модуляция: синус-модулятор, индекс спадает от удара к ровному звучанию
      const mo = c.createOscillator(), mg = c.createGain(), mf = f * s.fm.ratio, dev = mf * knobVal(s, 'fmi');
      mo.type = 'sine';
      mo.frequency.value = mf;
      mg.gain.setValueAtTime(dev, t);
      mg.gain.setTargetAtTime(dev * s.fm.sus, t + 0.005, Math.max(0.03, s.fm.dec * s.dec * pitchK));
      mo.connect(mg);
      main.forEach((o) => mg.connect(o.frequency));
      mo.start(t);
      os.push(mo);
    }
    if (s.shimmer) { // мерцание: октава и квинта над ней, вступают медленнее основы и звучат, пока держится нота
      [[2, 1, -0.5], [3, 0.45, 0.5], [4, 0.25, 0]].forEach(([k, a, pn]) => {
        const so = c.createOscillator(), sg = c.createGain();
        so.type = 'sine';
        so.frequency.value = f * k;
        so.detune.value = (Math.random() - 0.5) * 8;
        sg.gain.setValueAtTime(0, t);
        sg.gain.linearRampToValueAtTime(s.shimmer * a * 0.5, t + att * 1.8 + 0.6);
        let node = so.connect(sg);
        if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pn; node = node.connect(p); }
        node.connect(g);
        so.start(t);
        os.push(so);
      });
    }
    if (s.sub) { // саб-генератор: квадрат октавой ниже
      const so = c.createOscillator(), sg = c.createGain();
      so.type = 'square';
      so.frequency.value = f / 2;
      sg.gain.value = s.sub * 0.5;
      so.connect(sg).connect(lp);
      so.start(t);
      os.push(so);
    }
    if (s.vib) { // вибрато: медленный синус по расстройке всех основных генераторов
      const lo = c.createOscillator(), lg = c.createGain();
      lo.frequency.value = s.vib[0];
      lg.gain.setValueAtTime(0, t);
      lg.gain.linearRampToValueAtTime(s.vib[1], t + 0.35);
      lo.connect(lg);
      main.forEach((o) => lg.connect(o.detune));
      lo.start(t);
      os.push(lo);
    }
    let longest = 1;
    if (s.partials) { // обертоны колокола: свои частоты и своё затухание у каждого
      s.partials.forEach(([ratio, amp, dk]) => {
        const po = c.createOscillator(), pg = c.createGain(), tau = Math.max(0.05, dec * dk);
        po.type = 'sine';
        po.frequency.value = f * ratio;
        pg.gain.setValueAtTime(0.0001, t);
        pg.gain.linearRampToValueAtTime(amp * 0.9, t + 0.004);
        pg.gain.setTargetAtTime(0.0001, t + 0.006, tau / 2.2);
        po.connect(pg).connect(lp);
        po.start(t);
        os.push(po);
        longest = Math.max(longest, dk);
      });
    }
    if (s.tine) { // «язычок» электропиано / обертон колокола
      const o = c.createOscillator(), og = c.createGain();
      o.type = 'sine';
      o.frequency.value = f * s.tine;
      og.gain.setValueAtTime(0.0001, t);
      og.gain.linearRampToValueAtTime(s.tineAmp != null ? s.tineAmp : 0.35, t + 0.003);
      og.gain.setTargetAtTime(0.0001, t + 0.005, 0.12 + s.dec * 0.3);
      o.connect(og).connect(lp);
      o.start(t); o.stop(t + 2.5);
      os.push(o);
    }
    if (kind === 'piano' && s.ham) { // удар молоточка
      const n = c.createBufferSource(), bp = c.createBiquadFilter(), ng = c.createGain();
      n.buffer = noiseBuf(c);
      bp.type = 'bandpass';
      bp.frequency.value = Math.min(3500, f * 4);
      bp.Q.value = 1.5;
      ng.gain.setValueAtTime(0.14, t);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
      n.connect(bp).connect(ng).connect(g);
      n.start(t); n.stop(t + 0.04);
    }
    // для живой правки звука (refresh): из чего голос собран и каким патчем
    const vo = { g, os, rel: Math.max(0.03, s.rel), key, bus: busName, held: !!opts.hold, lp, main, m, f, kind, peak, own: !!opts.patch,
      opts, tine: s.tine || 0, sig: sigOf(s), sustain: SU >= 0.02, air: !!s.air, slot };
    voices.set(key, vo);
    order.push(key);
    if (SU < 0.02) { // затухающий звук — освобождаем голос сами
      const life = att + dec * 2.4 * longest + 0.2;
      os.forEach((o) => { try { o.stop(t + life); } catch { /* ignore */ } });
      vo.timer = setTimeout(() => { if (voices.get(key) === vo) cleanup(key); }, life * 1000 + 60);
    }
  };

  const syn = {
    // Нота звуком пианино (и вторым слоем, если он есть).
    // opts: { bus: 'piano' | 'theory', hold: true — держать (Hold), даже если у пресета нет сустейна,
    //        patch — сыграть другим звуком, без слоя, не меняя настройки пианино (тембры тренажёра слуха), vel — сила 0…1,
    //        at — время начала по часам контекста (планировщик студии) }
    on(m, key, opts = {}) {
      const c = getContext(mixer.state.mode);
      if (!c) return;
      syn.off(key, true);
      const own = !!opts.patch, busName = opts.bus || 'piano';
      play(c, m, key, opts, own ? opts.patch : getPatch(), own || busName !== 'piano' ? null : 'main');
      const L = own ? null : getLayer();
      if (L) play(c, m, key + LK, opts, L, busName === 'piano' ? 'layer' : null);
    },

    // Отпустить ноту (и её второй слой)
    off(key, fast = false, at = 0) {
      offOne(key, fast, at);
      if (!key.endsWith(LK)) offOne(key + LK, fast, at);
    },

    // Отпустить «с педалью» (Sustain): нота не глушится, а затухает долгим хвостом, как струна при нажатой педали.
    // Затухающие звуки (колокол) и рояль просто доигрывают сами — запись и так звучит, пока не затихнет струна
    release(key) {
      [key, key + LK].forEach((k) => {
        const vo = voices.get(k);
        if (!vo || !vo.sustain) return;
        vo.held = false;
        if (vo.grand) return;
        const c = vo.g.context, t = c.currentTime, tau = Math.max(vo.rel, 0.5) * 1.4 + 0.9, end = tau * 6;
        try {
          vo.g.gain.cancelScheduledValues(t);
          vo.g.gain.setValueAtTime(Math.max(vo.g.gain.value, 0.0001), t);
          vo.g.gain.setTargetAtTime(0.0001, t, tau);
          vo.os.forEach((o) => { try { o.stop(t + end); } catch { /* ignore */ } });
        } catch { /* ignore */ }
        clearTimeout(vo.timer);
        vo.timer = setTimeout(() => { if (voices.get(k) === vo) cleanup(k); }, end * 1000 + 100);
      });
    },

    all() { [...voices.keys()].forEach((k) => offOne(k, true)); },

    // Звук изменился (ручка, пресет, слой) — звучащие ноты слышат это сразу: удобно подбирать звук на удержанном
    // (Hold) аккорде. Тембр, яркость, хорус, сустейн, релиз, громкость и эквалайзер слоя меняются плавно на ходу;
    // другой вид звука — удержанные ноты переигрываются новым звуком; слой добавили — удержанные ноты получают и его
    refresh() {
      const P = getPatch(), L = getLayer(), c = getContext(mixer.state.mode);
      if (!c) return;
      mixer.setReverb('piano', P.rev * 0.9);
      if (strips.c === c) { mixStrip(c, 'main', P); mixStrip(c, 'layer', L); }
      const t = c.currentTime;
      const replay = (vo, s) => { offOne(vo.key, true); play(c, vo.m, vo.key, vo.opts, s, vo.slot); };
      [...voices.values()].forEach((vo) => {
        if (vo.own) return; // сыграно своим звуком (тренажёр, «Теория») — не пианино
        const s = vo.key.endsWith(LK) ? L : P;
        if (!s) { offOne(vo.key); return; } // слой убрали
        const kind = s.kind || 'soft';
        if (vo.grand) {
          if (kind !== 'grand') { if (vo.held) replay(vo, s); return; }
          vo.rel = Math.max(0.03, s.rel);
          vo.lp.frequency.setTargetAtTime(grandCut(s, vo), t, 0.03);
          return;
        }
        const chorus = s.cho > 0.04;
        if (vo.air && sigOf(s) === vo.sig) { vo.rel = Math.max(0.03, s.rel); return; } // воздушный звук — ручки слышны со следующей ноты
        if (kind !== vo.kind || sigOf(s) !== vo.sig || chorus !== (vo.main.length === 2)) {
          if (vo.sustain) replay(vo, s);
          return;
        }
        vo.main.forEach((o) => o.setPeriodicWave(synWave(c, kind, s.tone)));
        if (chorus) { const d = 4 + s.cho * 10; vo.main[0].detune.setTargetAtTime(-d, t, 0.03); vo.main[1].detune.setTargetAtTime(d, t, 0.03); }
        const cut = kind === 'piano' ? Math.max(500, vo.f * (1.5 + s.bright * 3)) : Math.max(200, Math.min(16000, vo.f * (1.2 + s.bright * 22)));
        vo.lp.frequency.setTargetAtTime(cut, t, 0.03);
        vo.rel = Math.max(0.03, s.rel);
        if (vo.sustain) {
          const SU = vo.held ? Math.max(s.sus, 0.45) : s.sus;
          vo.g.gain.cancelScheduledValues(t);
          vo.g.gain.setValueAtTime(Math.max(vo.g.gain.value, 0.0001), t);
          vo.g.gain.setTargetAtTime(Math.max(0.0001, vo.peak * SU), t, 0.05);
        }
      });
      if (L) [...voices.values()].filter((vo) => !vo.own && vo.held && !vo.key.endsWith(LK) && !voices.has(vo.key + LK))
        .forEach((vo) => play(c, vo.m, vo.key + LK, vo.opts, L, vo.slot ? 'layer' : null));
    },

    // Звучит ли шина: нота нажата или отзвучала меньше 3,5 с назад
    active(bus) {
      return Date.now() - last[bus] < 3500 || [...voices.values()].some((v) => v.bus === bus);
    },
    get voiceCount() { return voices.size; },
    // Заранее скачать записи рояля (при открытии пианино)
    preload() { grandPreload(getContext(mixer.state.mode)); },
  };
  return syn;
}

// Ноты по очереди (гамма, мелодия). step — секунды на ноту
// patch — свой звук (пресет синтезатора), иначе звук пианино
export function playSeq(syn, ms, { step = 0.3, bus = 'theory', patch = null } = {}) {
  ms.forEach((m, i) => {
    const k = 'q' + i + Math.random();
    setTimeout(() => syn.on(m, k, { bus, patch }), i * step * 1000);
    setTimeout(() => syn.off(k), (i * step + step * 0.95) * 1000);
  });
}

// Аккорд с лёгким арпеджио (18 мс между нотами), звучит 1,4 с
export function playChord(syn, ms, { bus = 'theory', dur = 1.4, patch = null } = {}) {
  const ks = ms.map((m, i) => 'c' + i + Math.random());
  ms.forEach((m, i) => setTimeout(() => syn.on(m, ks[i], { bus, patch }), i * 18));
  setTimeout(() => ks.forEach((k) => syn.off(k)), dur * 1000);
}
