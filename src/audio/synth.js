// Синтезатор: пианино, электропиано, орган, синус, пэд, колокол. Лёгкие голоса, до 22 одновременно.
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
  bell: { kind: 'soft', tone: 0.45, bright: 0.85, att: 2, dec: 0.9, sus: 0, rel: 1.2, cho: 0.1, rev: 0.5, tine: 2.76 },
};
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
      lp.Q.value = kind === 'saw' ? 1 : 0.3;
      lp.connect(g);
      g.connect(bus);
      const cut = Math.max(200, Math.min(16000, f * (1.2 + s.bright * 22)));
      // у пианино низкие ноты звучат дольше
      const pitchK = kind === 'piano' ? Math.max(0.35, Math.min(2.2, (5.2 - (m - 36) * 0.07) / 3.4)) : 1;
      const dec = Math.max(0.05, s.dec * 3 * pitchK), att = Math.max(0.002, s.att / 1000), peak = kind === 'saw' ? 0.16 : 0.34;
      if (kind === 'piano') {
        lp.frequency.setValueAtTime(cut, t);
        lp.frequency.setTargetAtTime(Math.max(500, f * (1.5 + s.bright * 3)), t + 0.02, dec * 0.3);
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
      if (s.tine) { // «язычок» электропиано / обертон колокола
        const o = c.createOscillator(), og = c.createGain();
        o.type = 'sine';
        o.frequency.value = f * s.tine;
        og.gain.setValueAtTime(0.0001, t);
        og.gain.linearRampToValueAtTime(0.35, t + 0.003);
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
        opts, tine: s.tine || 0, sustain: SU >= 0.02 };
      voices.set(key, vo);
      order.push(key);
      if (SU < 0.02) { // затухающий звук — освобождаем голос сами
        const life = att + dec * 2.4 + 0.2;
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
        if (kind !== vo.kind || (s.tine || 0) !== vo.tine || chorus !== (vo.main.length === 2)) {
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
