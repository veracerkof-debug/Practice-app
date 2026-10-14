// Синтезатор: пианино, электропиано, орган, синус, пэд, колокол и три классических синтезаторных звука —
// FM-электропиано (частотная модуляция), аналоговый бас (саб-генератор, резонансный фильтр с огибающей),
// струнный ансамбль (расстроенные пилы и вибрато). Лёгкие голоса, до 22 одновременно.
// Параметры звука (patch) — как в прототипе (device.piano.syn).
import { getContext, midiFreq } from './context.js';
import { synWave, noiseBuf } from './waves.js';

// Встроенные пресеты; имена — ключи i18n synth.preset.<id>
export const PRESETS = {
  piano: { kind: 'piano', tone: 0.7, bright: 0.7, att: 3, dec: 0.75, sus: 0, rel: 0.3, cho: 0.15, rev: 0.3, ham: 1 },
  epiano: { kind: 'soft', tone: 0.3, bright: 0.5, att: 5, dec: 0.55, sus: 0.2, rel: 0.45, cho: 0.45, rev: 0.3, tine: 4 },
  organ: { kind: 'organ', tone: 0.65, bright: 0.75, att: 12, dec: 0.5, sus: 1, rel: 0.1, cho: 0.5, rev: 0.35 },
  sine: { kind: 'soft', tone: 0, bright: 1, att: 8, dec: 0.5, sus: 0.85, rel: 0.25, cho: 0, rev: 0.2 },
  pad: { kind: 'saw', tone: 0.85, bright: 0.32, att: 650, dec: 0.8, sus: 1, rel: 1.8, cho: 0.8, rev: 0.6 },
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
  // струнный ансамбль: широкий хорус из расстроенных пил, медленная атака, лёгкое вибрато
  strings: { kind: 'saw', tone: 0.75, bright: 0.36, att: 320, dec: 0.9, sus: 0.9, rel: 1.3, cho: 0.95, rev: 0.55, vib: [5.2, 7] },
  // Набор для поклонения (эмбиент): широкие пэды с долгим вступлением и хвостом, мерцание сверху, тёплые клавиши
  wshimmer: { kind: 'saw', tone: 0.7, bright: 0.26, att: 1100, dec: 1, sus: 1, rel: 3, cho: 0.9, rev: 0.95, shimmer: 0.45 },
  wswell: { kind: 'saw', tone: 0.8, bright: 0.42, att: 500, dec: 1, sus: 1, rel: 2.6, cho: 0.85, rev: 0.9, swell: 2.8 },
  wkeys: { kind: 'soft', tone: 0.25, bright: 0.42, att: 5, dec: 1.7, sus: 0.35, rel: 2.4, cho: 0.5, rev: 0.8, tine: 2, tineAmp: 0.07 },
};
// Пресеты набора для поклонения (на панели — отдельной группой)
export const WORSHIP = ['wshimmer', 'wswell', 'wkeys'];
// Поля звука, которые не ручки, но входят в пресет (свои пресеты сохраняют их тоже)
export const PATCH_EXTRA = ['kind', 'tine', 'ham', 'tineAmp', 'gain', 'partials', 'fm', 'res', 'fenv', 'sub', 'vib', 'shimmer', 'swell'];
const sigOf = (s) => JSON.stringify([s.kind || 'soft', s.tine || 0, s.partials || 0, s.fm || 0, s.sub || 0, s.vib || 0, s.shimmer || 0, s.swell || 0]);
// Ручки панели и их диапазоны
export const PATCH_KEYS = ['tone', 'bright', 'att', 'dec', 'sus', 'rel', 'cho', 'rev'];
export const PATCH_RANGE = { tone: [0, 1], bright: [0, 1], cho: [0, 1], att: [1, 1500], dec: [0.05, 2], sus: [0, 1], rel: [0.03, 3], rev: [0, 1] };

export const MAX_VOICES = 22;

// Патч пианино из настроек устройства (создаётся при первом обращении)
export function pianoPatch(piano) {
  if (!piano.syn) {
    const pre = piano.sound === 'pad' ? 'pad' : 'piano';
    piano.syn = Object.assign({ preset: pre }, PRESETS[pre]);
  }
  return piano.syn;
}

export function applyPreset(patch, id) {
  PATCH_EXTRA.forEach((k) => { if (k !== 'kind') delete patch[k]; }); // от прошлого пресета ничего не остаётся
  return Object.assign(patch, PRESETS[id], { preset: id, name: null });
}

// getPatch() → текущий патч; getA4() → строй; mixer — для шин
export function createSynth({ mixer, getPatch, getA4 = () => 440 }) {
  const voices = new Map();
  let order = [];
  const last = { piano: 0, theory: 0 };

  const cleanup = (key) => {
    const vo = voices.get(key);
    if (!vo) return;
    voices.delete(key);
    order = order.filter((k) => k !== key);
    setTimeout(() => { try { vo.g.disconnect(); } catch { /* уже отключён */ } }, 100);
  };

  const syn = {
    // opts: { bus: 'piano' | 'theory', hold: true — держать (Hold), даже если у пресета нет сустейна,
    //        patch — сыграть другим звуком, не меняя настройки пианино (тембры тренажёра слуха) }
    on(m, key, opts = {}) {
      const c = getContext(mixer.state.mode);
      if (!c) return;
      syn.off(key, true);
      const s = opts.patch || getPatch(), busName = opts.bus || 'piano';
      const SU = opts.hold ? Math.max(s.sus, 0.45) : s.sus;
      const t = c.currentTime + 0.004, f = midiFreq(m, getA4()), kind = s.kind || 'soft';
      mixer.setReverb('piano', s.rev * 0.9);
      const bus = mixer.bus(busName);
      last[busName] = Date.now();
      // голосов не хватает — замолкает самый старый, но удержанные (Hold) не трогаем, пока есть другие
      while (order.length >= MAX_VOICES) syn.off(order.find((k) => !voices.get(k)?.held) ?? order[0], true);

      const g = c.createGain(), lp = c.createBiquadFilter(), os = [], main = [];
      lp.type = 'lowpass';
      lp.Q.value = s.res != null ? s.res : kind === 'saw' ? 1 : 0.3;
      lp.connect(g);
      g.connect(bus);
      const cut = Math.max(200, Math.min(16000, f * (1.2 + s.bright * 22)));
      // у пианино низкие ноты звучат дольше
      const pitchK = kind === 'piano' ? Math.max(0.35, Math.min(2.2, (5.2 - (m - 36) * 0.07) / 3.4)) : 1;
      const dec = Math.max(0.05, s.dec * 3 * pitchK), att = Math.max(0.002, s.att / 1000), peak = (kind === 'saw' ? 0.16 : 0.34) * (s.gain || 1);
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
      g.gain.linearRampToValueAtTime(peak, t + att);
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
      if (s.cho > 0.04) { const d = 4 + s.cho * 10; osc(-d, 0.55); osc(d, 0.55); } else osc(0, 1);
      if (s.fm) { // частотная модуляция: синус-модулятор, индекс спадает от удара к ровному звучанию
        const mo = c.createOscillator(), mg = c.createGain(), mf = f * s.fm.ratio, dev = mf * s.fm.index;
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
        opts, tine: s.tine || 0, sig: sigOf(s), sustain: SU >= 0.02 };
      voices.set(key, vo);
      order.push(key);
      if (SU < 0.02) { // затухающий звук — освобождаем голос сами
        const life = att + dec * 2.4 * longest + 0.2;
        os.forEach((o) => { try { o.stop(t + life); } catch { /* ignore */ } });
        vo.timer = setTimeout(() => { if (voices.get(key) === vo) cleanup(key); }, life * 1000 + 60);
      }
    },

    off(key, fast = false) {
      const vo = voices.get(key), c = vo && vo.g.context;
      if (!vo) return;
      const t = c.currentTime, r = fast ? 0.02 : vo.rel;
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
    },

    // Отпустить «с педалью» (Sustain): нота не глушится, а затухает долгим хвостом, как струна при нажатой педали.
    // Затухающие звуки (пианино, колокол) просто доигрывают сами
    release(key) {
      const vo = voices.get(key);
      if (!vo) return;
      if (!vo.sustain) return;
      const c = vo.g.context, t = c.currentTime, tau = Math.max(vo.rel, 0.5) * 1.4 + 0.9, end = tau * 6;
      try {
        vo.g.gain.cancelScheduledValues(t);
        vo.g.gain.setValueAtTime(Math.max(vo.g.gain.value, 0.0001), t);
        vo.g.gain.setTargetAtTime(0.0001, t, tau);
        vo.os.forEach((o) => { try { o.stop(t + end); } catch { /* ignore */ } });
      } catch { /* ignore */ }
      vo.held = false;
      clearTimeout(vo.timer);
      vo.timer = setTimeout(() => { if (voices.get(key) === vo) cleanup(key); }, end * 1000 + 100);
    },

    all() { [...voices.keys()].forEach((k) => syn.off(k, true)); },

    // Патч изменился (ручка, пресет) — звучащие ноты слышат это сразу: удобно подбирать звук на удержанном (Hold)
    // аккорде. Тембр, яркость, хорус, сустейн, релиз и пространство меняются плавно на ходу; другой вид звука
    // (пресет «орган» вместо «пианино» и т. п.) — ноты переигрываются новым звуком.
    refresh() {
      const s = getPatch(), c = getContext(mixer.state.mode);
      if (!c) return;
      mixer.setReverb('piano', s.rev * 0.9);
      const t = c.currentTime, kind = s.kind || 'soft';
      [...voices.values()].forEach((vo) => {
        if (vo.own) return; // сыграно своим звуком (тренажёр, «Теория») — не пианино
        const chorus = s.cho > 0.04;
        if (kind !== vo.kind || sigOf(s) !== vo.sig || chorus !== (vo.main.length === 2)) {
          if (vo.sustain) syn.on(vo.m, vo.key, vo.opts);
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
    },

    // Звучит ли шина: нота нажата или отзвучала меньше 3,5 с назад
    active(bus) {
      return Date.now() - last[bus] < 3500 || [...voices.values()].some((v) => v.bus === bus);
    },
    get voiceCount() { return voices.size; },
  };
  return syn;
}

// Ноты по очереди (гамма, мелодия). step — секунды на ноту
export function playSeq(syn, ms, { step = 0.3, bus = 'theory' } = {}) {
  ms.forEach((m, i) => {
    const k = 'q' + i + Math.random();
    setTimeout(() => syn.on(m, k, { bus }), i * step * 1000);
    setTimeout(() => syn.off(k), (i * step + step * 0.95) * 1000);
  });
}

// Аккорд с лёгким арпеджио (18 мс между нотами), звучит 1,4 с
export function playChord(syn, ms, { bus = 'theory', dur = 1.4 } = {}) {
  const ks = ms.map((m, i) => 'c' + i + Math.random());
  ms.forEach((m, i) => setTimeout(() => syn.on(m, ks[i], { bus }), i * 18));
  setTimeout(() => ks.forEach((k) => syn.off(k)), dur * 1000);
}
