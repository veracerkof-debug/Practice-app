// Единый AudioContext: общий выход через компрессор, реверберация (свёртка со сгенерированным импульсом).
// Создаётся лениво — браузер разрешает звук только после жеста пользователя.
import { makeIR } from './waves.js';

// Режим звука: 'fast' — быстрый отклик, 'bal' — баланс, 'smooth' — без треска
const LATENCY = { fast: 'interactive', bal: 'balanced', smooth: 'playback' };

let ctx = null, master = null, reverb = null, comp = null;

export function getContext(mode = 'bal') {
  if (!ctx) {
    const C = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!C) return null;
    try { ctx = new C({ latencyHint: LATENCY[mode] || 'balanced' }); } catch { ctx = new C(); }
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 4;
    comp.attack.value = 0.005; comp.release.value = 0.2;
    comp.connect(ctx.destination);
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(comp);
    try {
      const cv = ctx.createConvolver();
      cv.buffer = makeIR(ctx, 2.8);
      const rg = ctx.createGain();
      rg.gain.value = 0.55;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 180;
      reverb = ctx.createGain();
      reverb.connect(hp).connect(cv).connect(rg).connect(comp);
    } catch { reverb = null; }
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// Уже созданный контекст (или null) — без создания и без resume
export const peekContext = () => ctx;
export const masterNode = () => master;   // общая шина → компрессор → выход
export const reverbNode = () => reverb;   // вход реверберации (может быть null)
// Запись (recorder.js): отводы от всего, что звучит, — общего выхода после компрессора и прямых выходов мимо него
// (метроном идёт напрямую, чтобы щелчок не сжимался)
const direct = new Set(), taps = new Set();
export function directOut(node) {
  node.connect(ctx.destination);
  direct.add(node);
  taps.forEach((d) => node.connect(d));
}
export function addTap(dest) {
  comp.connect(dest);
  direct.forEach((n) => n.connect(dest));
  taps.add(dest);
  return () => {
    taps.delete(dest);
    [comp, ...direct].forEach((n) => { try { n.disconnect(dest); } catch { /* уже отключено */ } });
  };
}
export const now = () => (ctx ? ctx.currentTime : 0);

// Мягко отправить узел в реверберацию с заданным уровнем; возвращает узел посыла
export function sendToReverb(node, level) {
  if (!reverb || !ctx) return null;
  const s = ctx.createGain();
  s.gain.value = level;
  node.connect(s).connect(reverb);
  return s;
}

// MIDI → Гц при заданном строе A4
export const midiFreq = (m, a4 = 440) => a4 * Math.pow(2, (m - 69) / 12);
