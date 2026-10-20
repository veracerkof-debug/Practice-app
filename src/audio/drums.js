// Ударные студии: синтез без сэмплов — бочка (синус со скатом высоты), малый (шум + тон), закрытый и открытый
// хэт (фильтрованный шум), хлопок (три всплеска шума). Короткие голоса, точное время (at), без DOM.
import { noiseBuf } from './waves.js';

let longNoise = null;
const noise = (c) => {
  if (longNoise && longNoise.sampleRate === c.sampleRate) return longNoise;
  const len = Math.round(c.sampleRate * 0.5), b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return (longNoise = b);
};
const env = (c, g, t, peak, dec) => { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + 0.002); g.gain.setTargetAtTime(0.0001, t + 0.004, dec / 4); };
const burst = (c, out, t, { hp = 0, lp = 20000, peak = 0.5, dec = 0.1, q = 0.5 }) => {
  const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  s.buffer = noise(c);
  f.type = hp ? 'highpass' : 'lowpass'; f.frequency.value = hp || lp; f.Q.value = q;
  env(c, g, t, peak, dec);
  s.connect(f).connect(g).connect(out);
  s.start(t); s.stop(t + dec * 2 + 0.05);
};

// Удар: lane — 'kick' | 'snare' | 'hat' | 'ohat' | 'clap'; v — сила 0…1; at — время контекста
export function drumHit(c, out, lane, at, v = 0.8) {
  const t = Math.max(at, c.currentTime), k = 0.3 + 0.7 * v;
  if (lane === 'kick') {
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.09);
    env(c, g, t, 1.1 * k, 0.32);
    o.connect(g).connect(out); o.start(t); o.stop(t + 0.5);
    burst(c, out, t, { lp: 1200, peak: 0.25 * k, dec: 0.02 }); // щелчок удара
  } else if (lane === 'snare') {
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(150, t + 0.06);
    env(c, g, t, 0.45 * k, 0.1);
    o.connect(g).connect(out); o.start(t); o.stop(t + 0.3);
    burst(c, out, t, { hp: 1500, peak: 0.6 * k, dec: 0.16, q: 0.3 });
  } else if (lane === 'hat') burst(c, out, t, { hp: 6500, peak: 0.35 * k, dec: 0.045 });
  else if (lane === 'ohat') burst(c, out, t, { hp: 5500, peak: 0.32 * k, dec: 0.28 });
  else if (lane === 'clap') [0, 0.012, 0.026].forEach((dt, i) => burst(c, out, t + dt, { hp: 1000, lp: 7000, peak: (i === 2 ? 0.55 : 0.3) * k, dec: i === 2 ? 0.14 : 0.02, q: 1.2 }));
}
export { noiseBuf };
