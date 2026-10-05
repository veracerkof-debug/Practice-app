// Голос глайдера: звук пианино приложения (те же таблицы волн и огибающая), но высота меняется плавно,
// а вертикаль управляет эффектом: яркость (фильтр с резонансом), вибрато, громкость, тремоло.
import { synWave } from '../../audio/waves.js';

export const FX = ['bright', 'vib', 'vol', 'trem'];

// c — AudioContext, dest — шина микшера, patch — параметры звука (как у пианино), hold — держать звук, пока палец на месте
export function createGlideVoice(c, dest, patch, { hold = true, a4 = 440 } = {}) {
  const s = patch, kind = s.kind || 'soft', t0 = c.currentTime + 0.003;
  const lp = c.createBiquadFilter(), amp = c.createGain(), vol = c.createGain(), out = c.createGain();
  lp.type = 'lowpass';
  lp.Q.value = kind === 'saw' ? 1 : 0.4;
  lp.connect(amp).connect(vol).connect(out).connect(dest);
  // вибрато — по центам у генераторов, тремоло — по громкости
  const vibLfo = c.createOscillator(), vibG = c.createGain(), trLfo = c.createOscillator(), trG = c.createGain();
  vibLfo.frequency.value = 5.6;
  vibG.gain.value = 0;
  vibLfo.connect(vibG);
  trLfo.frequency.value = 6.2;
  trG.gain.value = 0;
  trLfo.connect(trG).connect(out.gain);
  const os = [], dets = s.cho > 0.04 ? [-(4 + s.cho * 10), 4 + s.cho * 10] : [0];
  dets.forEach((d) => {
    const o = c.createOscillator(), g = c.createGain();
    o.setPeriodicWave(synWave(c, kind, s.tone));
    o.detune.value = d;
    vibG.connect(o.detune);
    g.gain.value = dets.length > 1 ? 0.55 : 1;
    o.connect(g).connect(lp);
    os.push(o);
  });
  const freq = (m) => a4 * Math.pow(2, (m - 69) / 12);
  let m0 = 60, fx = 'bright', y = 0.5, dead = false;

  // Фильтр следует за высотой; при «яркости» вертикаль открывает фильтр и добавляет резонанс
  const filter = (tau) => {
    const f = freq(m0), t = c.currentTime;
    const cut = fx === 'bright' ? f * (0.9 + y * y * 36) : f * (1.2 + s.bright * 22);
    lp.frequency.setTargetAtTime(Math.max(120, Math.min(18000, cut)), t, tau);
    lp.Q.setTargetAtTime(fx === 'bright' ? 0.5 + y * 5 : kind === 'saw' ? 1 : 0.4, t, 0.03);
  };

  const v = {
    start(m, fxKind, y0) {
      m0 = m; fx = fxKind; y = y0;
      const f = freq(m), att = Math.max(0.006, s.att / 1000), dec = Math.max(0.05, s.dec * 3), peak = kind === 'saw' ? 0.16 : 0.32;
      const su = hold ? Math.max(s.sus, 0.55) : s.sus;
      os.forEach((o) => { o.frequency.setValueAtTime(f, t0); o.start(t0); });
      vibLfo.start(t0);
      trLfo.start(t0);
      amp.gain.setValueAtTime(0.0001, t0);
      amp.gain.linearRampToValueAtTime(peak, t0 + att);
      if (su < 0.999) amp.gain.setTargetAtTime(Math.max(0.0001, peak * su), t0 + att, dec / 3);
      v.fx(fxKind, y0, true);
      filter(0.001);
    },
    // Высота: tau — постоянная времени скольжения (с)
    pitch(m, tau = 0.012) {
      if (dead) return;
      m0 = m;
      const f = freq(m), t = c.currentTime;
      os.forEach((o) => o.frequency.setTargetAtTime(f, t, tau));
      filter(Math.max(tau, 0.01));
    },
    // Эффект по вертикали: y 0 (низ) … 1 (верх)
    fx(kind2, y2, now = false) {
      if (dead) return;
      fx = kind2; y = Math.max(0, Math.min(1, y2));
      const t = c.currentTime, tau = now ? 0.001 : 0.025;
      vibG.gain.setTargetAtTime(fx === 'vib' ? y * 55 : 0, t, tau);
      vol.gain.setTargetAtTime(fx === 'vol' ? 0.08 + 0.92 * y * y : 1, t, tau);
      const td = fx === 'trem' ? y * 0.9 : 0;
      out.gain.setTargetAtTime(1 - td / 2, t, tau);
      trG.gain.setTargetAtTime(td / 2, t, tau);
      if (fx === 'trem') trLfo.frequency.setTargetAtTime(4 + y * 5, t, tau);
      filter(tau);
    },
    release() {
      if (dead) return;
      dead = true;
      const t = c.currentTime, r = Math.max(0.04, s.rel);
      amp.gain.cancelScheduledValues(t);
      amp.gain.setValueAtTime(Math.max(amp.gain.value, 0.0001), t);
      amp.gain.setTargetAtTime(0.0001, t, r / 4);
      const end = t + r * 1.4 + 0.05;
      [...os, vibLfo, trLfo].forEach((o) => { try { o.stop(end); } catch { /* ignore */ } });
      setTimeout(() => { try { out.disconnect(); } catch { /* ignore */ } }, (end - t + 0.2) * 1000);
    },
    get dead() { return dead; },
  };
  return v;
}
