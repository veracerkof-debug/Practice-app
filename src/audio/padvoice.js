// Голос-пэд для одной ноты: тембры модуля «Дрон» (пэды, drone.js — тёплый, пэд, смычок, хор, стекло), но нота
// может скользить и отзываться на эффекты руки. Тот же порядок вызовов, что у голоса глайдера
// (glider/voice.js: start, pitch, fx, release), — терменвокс играет им аккорды.
import { wave } from './waves.js';
import { SOUNDS } from './drone.js';

// тампура — щипок по рисунку, не созвучие. «Шиммер» — пэд для поклонения: тёплая основа, медленное вступление
// и мерцающий хвост из октавы и квинты сверху (как отражения большого зала), только у голоса пэда
export const PAD_SOUNDS = ['shimmer', ...Object.keys(SOUNDS).filter((k) => k !== 'tanpura')];
// Уровень генератора по тембру: подобран так, чтобы аккорд любым пэдом звучал так же громко,
// как голосом соло (замер: среднеквадратичный уровень четырёх голосов ≈ 0,09)
const LVL = { soft: 0.152, pad: 0.205, bow: 0.224, choir: 0.5, glass: 0.147, shimmer: 0.15 };

export function createPadVoice(c, dest, sound = 'soft', { a4 = 440, width = 0.5, move = 0.5 } = {}) {
  const snd = PAD_SOUNDS.includes(sound) ? sound : 'soft', bright0 = snd === 'shimmer' ? 0.62 : SOUNDS[snd], t0 = c.currentTime + 0.003;
  const freq = (m) => a4 * Math.pow(2, (m - 69) / 12);
  const lp = c.createBiquadFilter(), amp = c.createGain(), vol = c.createGain(), out = c.createGain();
  lp.type = 'lowpass';
  lp.Q.value = snd === 'pad' ? 1.3 : 0.5;
  amp.gain.value = 0;
  lp.connect(vol).connect(out).connect(dest);
  // «хор» — форманты гласной «а», как в пэдах
  if (snd === 'choir') {
    const mix = c.createGain();
    mix.gain.value = 1.4;
    [[800, 6, 1], [1150, 7, 0.7], [2900, 9, 0.25]].forEach(([fq, q, g0]) => {
      const bp = c.createBiquadFilter(), bg = c.createGain();
      bp.type = 'bandpass'; bp.frequency.value = fq; bp.Q.value = q; bg.gain.value = g0;
      amp.connect(bp).connect(bg).connect(mix);
    });
    mix.connect(lp);
  } else amp.connect(lp);
  const os = [], lfos = [];
  // дыхание — медленная волна громкости
  const breath = c.createOscillator(), bgn = c.createGain();
  breath.frequency.value = snd === 'glass' ? 0.35 : 0.11;
  bgn.gain.value = (snd === 'glass' ? 0.22 : 0.1) * move;
  breath.connect(bgn).connect(out.gain);
  lfos.push(breath);
  // вибрато: своё у смычка и хора + от руки
  const vib = c.createOscillator(), vibG = c.createGain();
  vib.frequency.value = snd === 'bow' ? 4.8 : 5.3;
  const vib0 = snd === 'bow' ? 5 : snd === 'choir' ? 7 : 0;
  vibG.gain.value = vib0;
  vib.connect(vibG);
  lfos.push(vib);
  // тремоло от руки
  const tr = c.createOscillator(), trG = c.createGain();
  tr.frequency.value = 5;
  trG.gain.value = 0;
  tr.connect(trG).connect(out.gain);
  lfos.push(tr);

  const det = 2 + width * 16, pan = width * 0.85;
  const add = (type, mult, d, pn, g0) => {
    const o = c.createOscillator(), g = c.createGain();
    if (type) o.type = type; else o.setPeriodicWave(wave(c, snd === 'bow' ? 'bow' : 'warm'));
    o.detune.value = d;
    vibG.connect(o.detune);
    g.gain.value = g0;
    if (c.createStereoPanner && pn) { const p = c.createStereoPanner(); p.pan.value = pn; o.connect(g).connect(p).connect(amp); }
    else o.connect(g).connect(amp);
    os.push({ o, mult });
  };
  const type = snd === 'pad' || snd === 'choir' ? 'sawtooth' : snd === 'glass' ? 'sine' : null;
  [[-det, -pan], [det, pan]].forEach(([d, pn]) => add(type, 1, d, pn, LVL[snd]));
  if (snd === 'glass') add('sine', 2, 0, 0, 0.049); // октава сверху
  if (snd === 'shimmer') { // мерцание: октава и квинта над ней, тихо и широко, вступают медленнее основы
    add('sine', 2, -det * 0.5, -0.6, 0.05); add('sine', 2, det * 0.5, 0.6, 0.05); add('sine', 3, 0, 0, 0.022);
  }

  let m0 = 60, bright = 0, dead = false;
  const filter = (tau) => {
    const t = c.currentTime, base = 250 * Math.pow(20, bright0) * Math.max(0.5, freq(m0) / 262) ** 0.5;
    lp.frequency.setTargetAtTime(Math.min(16000, base * (1 + bright * bright * 12)), t, tau);
  };

  const v = {
    start(m, fx) {
      m0 = m;
      const f = freq(m);
      os.forEach(({ o, mult }) => { o.frequency.setValueAtTime(f * mult, t0); o.start(t0); });
      lfos.forEach((o) => o.start(t0));
      // пэд вступает мягко
      amp.gain.setValueAtTime(0, t0);
      amp.gain.linearRampToValueAtTime(1, t0 + (snd === 'glass' ? 0.25 : snd === 'shimmer' ? 1.1 : 0.55));
      v.fx(fx, true);
    },
    pitch(m, tau = 0.05) {
      if (dead) return;
      m0 = m;
      const f = freq(m), t = c.currentTime;
      os.forEach(({ o, mult }) => o.frequency.setTargetAtTime(f * mult, t, Math.max(tau, 0.04)));
      filter(0.08);
    },
    // те же значения, что у голоса глайдера: { bright, vib, trem, volGain }; перегруза у пэда нет
    fx(fx, now = false) {
      if (dead) return;
      const t = c.currentTime, tau = now ? 0.001 : 0.03;
      bright = fx.bright || 0;
      vibG.gain.setTargetAtTime(vib0 + (fx.vib || 0) * 100, t, tau);
      vol.gain.setTargetAtTime(fx.volGain ?? 1, t, tau);
      const td = (fx.trem || 0) * 0.9;
      trG.gain.setTargetAtTime(td / 2, t, tau);
      tr.frequency.setTargetAtTime(4 + (fx.trem || 0) * 6, t, tau);
      out.gain.setTargetAtTime(1 - td / 2, t, tau);
      filter(tau);
    },
    release() {
      if (dead) return;
      dead = true;
      const t = c.currentTime, r = snd === 'glass' ? 0.9 : snd === 'shimmer' ? 2.6 : 1.4;
      amp.gain.cancelScheduledValues(t);
      amp.gain.setValueAtTime(amp.gain.value, t);
      amp.gain.setTargetAtTime(0, t, r / 4);
      const end = t + r * 1.5;
      [...os.map((x) => x.o), ...lfos].forEach((o) => { try { o.stop(end); } catch { /* уже остановлен */ } });
      setTimeout(() => { try { out.disconnect(); } catch { /* */ } }, (r * 1.5 + 0.2) * 1000);
    },
  };
  return v;
}
