// Звуковой движок: единый AudioContext, шины и микшер, синтезатор, пэды, метроном, микрофон.
// Создаётся один раз ядром; модулям отдаётся через ctx.audio (см. MODULE_SPEC.md).
import { getContext, peekContext, now, midiFreq, masterNode } from './context.js';
import { createMixer } from './mixer.js';
import { createSynth, pianoPatch, playChord, playSeq } from './synth.js';
import { createDrone } from './drone.js';
import { createMetronome } from './metronome.js';
import { openMic } from './mic.js';

// device — настройки устройства (src/core/device.js); metroCfg — настройки метронома;
// onTempo(bpm, sec) — учёт темпа для активной сессии; save() — сохранить device
export function createAudio({ device, metroCfg, onTempo, onBpmChange, save = () => {} }) {
  const a4 = () => device.tuner.a4 || 440;
  const mixer = createMixer(device.mix, { onChange: save });
  const synth = createSynth({ mixer, getPatch: () => pianoPatch(device.piano), getA4: a4 });
  const drone = createDrone({ mixer, getSettings: () => device.drone, getA4: a4 });
  const metro = createMetronome({ mixer, cfg: metroCfg, onTempo, onBpmChange });
  mixer.probe('piano', () => synth.active('piano'));
  mixer.probe('theory', () => synth.active('theory'));
  mixer.probe('drone', () => drone.on);

  // Сигнал окончания (помодоро): две ноты и вибрация
  function chime() {
    const c = getContext(device.mix.mode);
    if (!c) return;
    const t = c.currentTime;
    [[880, 0], [1318.5, 0.22]].forEach(([f, d]) => {
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + d);
      g.gain.exponentialRampToValueAtTime(0.4, t + d + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + 1.2);
      o.connect(g).connect(masterNode());
      o.start(t + d);
      o.stop(t + d + 1.3);
    });
    try { navigator.vibrate && navigator.vibrate([120, 80, 120]); } catch { /* ignore */ }
  }

  let n = 0;
  const audio = {
    mixer, synth, drone, metro,
    unlock: () => !!getContext(device.mix.mode),   // вызвать на первом жесте пользователя
    ready: () => !!peekContext(),
    now,
    mf: (m) => midiFreq(m, a4()),
    bus: (name) => mixer.bus(name),
    // Короткая нота; opts: { bus = 'theory', dur = 0.9 }
    playNote(midi, { bus = 'theory', dur = 0.9 } = {}) {
      const k = 'n' + n++;
      synth.on(midi, k, { bus });
      setTimeout(() => synth.off(k), dur * 1000);
    },
    playChord: (midis, opts) => playChord(synth, midis, opts),
    playSeq: (midis, opts) => playSeq(synth, midis, opts),
    chime,
    openMic: () => openMic(device.mix.mode),
    // Остановить всё (выход из сессии)
    stopAll() {
      if (metro.running) metro.stop();
      drone.stop();
      synth.all();
    },
  };
  return audio;
}
