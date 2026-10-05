// Пэды и дрон: тёплый, пэд, смычок, хор, стекло, тампура. Слои по октавам, созвучия, плавная смена нот.
// Настройки — объект device.drone (как в прототипе).
import { getContext, masterNode, sendToReverb, midiFreq } from './context.js';
import { wave } from './waves.js';

// Тембры: id → яркость по умолчанию. Названия — ключи i18n drone.sound.<id>
export const SOUNDS = { soft: 0.7, pad: 0.45, bow: 0.85, choir: 0.5, glass: 0.9, tanpura: 0.7 };
// Созвучия: интервалы от нажатой ноты
export const CHORDS = { root: [0], fifth: [0, 7], maj: [0, 4, 7], min: [0, 3, 7], sus4: [0, 5, 7] };
export const LAYERS = [2, 3, 4]; // октавы слоёв: низкий, средний, высокий

// Дополняет настройки значениями по умолчанию (прототип: DC())
export function normalizeDrone(d) {
  if (!d.chord) d.chord = d.fifth === false ? 'root' : 'fifth';
  if (d.bright == null) d.bright = SOUNDS[d.sound] ?? 0.7;
  if (d.move == null) d.move = 0.5;
  if (d.width == null) d.width = 0.5;
  if (d.fade == null) d.fade = 1.8;
  if (d.rev == null) d.rev = 0.45;
  if (d.xfade == null) d.xfade = true;
  return d;
}

// Ноты [midi, уровень] для текущих слоёв и созвучия
export function droneNotes(d) {
  const offs = CHORDS[d.chord] || CHORDS.fifth, notes = [];
  LAYERS.filter((o) => d.layers[o]).forEach((o) => {
    const b = 12 * (o + 1) + d.pc, lv = o === 2 ? 1 : o === 3 ? 0.8 : 0.6;
    offs.forEach((x, i) => notes.push([b + x, lv * (i ? 0.55 : 1)]));
  });
  return notes;
}

// Рисунок тампуры: квинта (или кварта для тоники и sus4), две октавы, тоника
export function tanpuraPattern(d) {
  const Ls = LAYERS.filter((o) => d.layers[o]);
  if (!Ls.length) return null;
  const base = 12 * (Ls[0] + 1) + d.pc;
  return { layers: Ls, pat: [d.chord === 'root' || d.chord === 'sus4' ? base + 5 : base + 7, base + 12, base + 12, base] };
}

export function createDrone({ mixer, getSettings, getA4 = () => 440 }) {
  let nodes = null, timer = null, next = 0, step = 0;
  const mf = (m) => midiFreq(m, getA4());
  const level = () => getSettings().vol * mixer.value('drone');

  function pluck(c, m, t, lvl) {
    const f = mf(m), o = c.createOscillator(), g = c.createGain(), lp = c.createBiquadFilter();
    o.setPeriodicWave(wave(c, 'tan'));
    o.frequency.value = f;
    o.detune.value = (Math.random() - 0.5) * 4;
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(Math.min(9000, f * 16), t);
    lp.frequency.setTargetAtTime(f * 5, t, 1.6);
    lp.Q.value = 2.5;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.14 * lvl, t + 0.012);
    g.gain.setTargetAtTime(0.0001, t + 0.02, 1.7);
    let out = g;
    if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = (Math.random() - 0.5) * 0.6; g.connect(p); out = p; }
    o.connect(lp).connect(g);
    out.connect(nodes.g);
    o.start(t); o.stop(t + 7);
  }

  function tan() {
    const c = nodes && nodes.g.context;
    if (!c) return;
    const tp = tanpuraPattern(normalizeDrone(getSettings()));
    if (!tp) return;
    const gap = 1.15;
    while (next < c.currentTime + 0.4) {
      const i = step % 4;
      pluck(c, tp.pat[i], next, i === 3 ? 1.1 : 0.9);
      tp.layers.slice(1).forEach((o) => pluck(c, tp.pat[i] + 12 * (o - tp.layers[0]), next + 0.015, 0.45));
      next += i === 3 ? gap * 1.6 : gap;
      step++;
    }
  }

  const dr = {
    get on() { return !!nodes; },

    start() {
      const c = getContext(mixer.state.mode);
      if (!c) return;
      const d = normalizeDrone(getSettings()), t = c.currentTime, master = c.createGain();
      master.connect(masterNode());
      const send = sendToReverb(master, d.rev);
      master.gain.setValueAtTime(0, t);
      master.gain.linearRampToValueAtTime(level(), t + Math.max(0.15, d.fade));
      const os = [];
      nodes = { g: master, os, send };
      if (d.sound === 'tanpura') {
        step = 0;
        next = t + 0.1;
        tan();
        timer = setInterval(tan, 120);
        return;
      }
      const base = 250 * Math.pow(20, d.bright), lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = base;
      lp.Q.value = d.sound === 'pad' ? 1.3 : 0.5;
      lp.connect(master);
      const amp = c.createGain();
      amp.gain.value = 1;
      if (d.sound === 'choir') { // форманты гласной «а»
        const mix = c.createGain();
        mix.gain.value = 1.4;
        [[800, 6, 1], [1150, 7, 0.7], [2900, 9, 0.25]].forEach(([fq, q, g0]) => {
          const bp = c.createBiquadFilter(), bg = c.createGain();
          bp.type = 'bandpass'; bp.frequency.value = fq; bp.Q.value = q; bg.gain.value = g0;
          amp.connect(bp).connect(bg).connect(mix);
        });
        mix.connect(lp);
      } else amp.connect(lp);
      // «дыхание» — медленная модуляция громкости
      const breath = c.createOscillator(), bgn = c.createGain();
      breath.frequency.value = d.sound === 'glass' ? 0.35 : 0.11;
      bgn.gain.value = (d.sound === 'glass' ? 0.22 : 0.1) * d.move;
      breath.connect(bgn).connect(amp.gain);
      breath.start(t);
      os.push(breath);
      let vibG = null;
      if (d.sound === 'bow' || d.sound === 'choir') {
        const vib = c.createOscillator();
        vibG = c.createGain();
        vib.frequency.value = d.sound === 'bow' ? 4.8 : 5.3;
        vibG.gain.value = d.sound === 'bow' ? 5 : 7;
        vib.connect(vibG);
        vib.start(t);
        os.push(vib);
      }
      const det = 2 + d.width * 16, pan = d.width * 0.85;
      const lvlK = { pad: 0.05, bow: 0.07, choir: 0.045, glass: 0.12 }[d.sound] || 0.11;
      droneNotes(d).forEach(([m, lvl]) => {
        const f = mf(m);
        [[-det, -pan], [det, pan]].forEach(([dt, pn]) => {
          const o = c.createOscillator();
          if (d.sound === 'pad' || d.sound === 'choir') o.type = 'sawtooth';
          else if (d.sound === 'glass') o.type = 'sine';
          else o.setPeriodicWave(wave(c, d.sound === 'bow' ? 'bow' : 'warm'));
          o.frequency.value = f;
          o.detune.value = dt;
          if (vibG) vibG.connect(o.detune);
          const g = c.createGain();
          g.gain.value = lvl * lvlK;
          if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pn; o.connect(g).connect(p).connect(amp); }
          else o.connect(g).connect(amp);
          o.start(t);
          os.push(o);
        });
        if (d.sound === 'glass') { // октава сверху
          const o = c.createOscillator(), g = c.createGain();
          o.type = 'sine'; o.frequency.value = f * 2; g.gain.value = lvl * 0.04;
          o.connect(g).connect(amp);
          o.start(t);
          os.push(o);
        }
      });
      if (d.move > 0.02 && d.sound !== 'glass') { // движение фильтра
        const l = c.createOscillator(), lg = c.createGain();
        l.frequency.value = 0.05 + d.move * 0.1;
        lg.gain.value = base * 0.55 * d.move;
        l.connect(lg).connect(lp.frequency);
        l.start(t);
        os.push(l);
      }
    },

    // Затухание за fade секунд (по умолчанию 1,2 с)
    stop(fade = 1.2) {
      clearInterval(timer);
      timer = null;
      if (!nodes) return;
      const { g, os } = nodes, t = g.context.currentTime, cur = g.gain.value;
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(cur, t);
      g.gain.linearRampToValueAtTime(0, t + fade);
      os.forEach((o) => { try { o.stop(t + fade + 0.1); } catch { /* ignore */ } });
      nodes = null;
    },

    retune() { if (nodes) { dr.stop(); dr.start(); } },

    // Сменить ноту или созвучие: плавный переход (если включён) или перезапуск
    swap() {
      if (!nodes) { dr.start(); return; }
      const d = normalizeDrone(getSettings());
      if (!d.xfade) { dr.retune(); return; }
      const x = Math.max(0.4, Math.min(2.5, d.fade));
      dr.stop(x);
      const f0 = d.fade;
      d.fade = x;
      dr.start();
      d.fade = f0;
    },

    // Громкость (настройка пэдов × микшер)
    vol() { if (nodes) nodes.g.gain.setTargetAtTime(level(), nodes.g.context.currentTime, 0.05); },
    setReverb(v) { if (nodes && nodes.send) nodes.send.gain.setTargetAtTime(v, nodes.send.context.currentTime, 0.05); },
  };
  mixer.subscribe(() => dr.vol());
  return dr;
}
