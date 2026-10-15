// Звуковой движок: единый AudioContext, шины и микшер, синтезатор, пэды, метроном, микрофон.
// Создаётся один раз ядром; модулям отдаётся через ctx.audio (см. MODULE_SPEC.md).
import { getContext, peekContext, now, midiFreq, masterNode, addTap } from './context.js';
import { createMixer } from './mixer.js';
import { createSynth, pianoPatch, playChord, playSeq, PRESETS } from './synth.js';
import { createDrone } from './drone.js';
import { createMetronome } from './metronome.js';
import { openMic } from './mic.js';

// device — настройки устройства (src/core/device.js); metroCfg — настройки метронома;
// onTempo(bpm, sec) — учёт темпа для активной сессии; save() — сохранить device
// saveMetro(cfg) — сохранить настройки метронома
export function createAudio({ device, metroCfg, onTempo, onBpmChange, saveMetro, save = () => {} }) {
  const a4 = () => device.tuner.a4 || 440;
  const mixer = createMixer(device.mix, { onChange: save });
  const synth = createSynth({ mixer, getPatch: () => pianoPatch(device.piano), getA4: a4 });
  const drone = createDrone({ mixer, getSettings: () => device.drone, getA4: a4 });
  const metro = createMetronome({ mixer, cfg: metroCfg, onTempo, onBpmChange, onSave: saveMetro });
  mixer.probe('piano', () => synth.active('piano'));
  mixer.probe('theory', () => synth.active('theory'));
  mixer.probe('drone', () => drone.on);
  // Дрон на ноте (из теории): сменить тонику и зазвучать
  drone.tonic = (pc) => {
    device.drone.pc = pc;
    save();
    drone.on ? drone.retune() : drone.start();
  };

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

  // Опорная нота тюнера: чистый тон 2,4 с
  function refTone(m) {
    const c = getContext(device.mix.mode);
    if (!c) return;
    const t = c.currentTime, f = midiFreq(m, a4()), g = c.createGain();
    g.connect(masterNode());
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3, t + 0.03);
    g.gain.setValueAtTime(0.3, t + 1.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
    [['sine', 1, 1], ['triangle', 1, 0.35], ['sine', 2, 0.12]].forEach(([ty, mul, amp]) => {
      const o = c.createOscillator(), og = c.createGain();
      o.type = ty;
      o.frequency.value = f * mul;
      og.gain.value = amp;
      o.connect(og).connect(g);
      o.start(t);
      o.stop(t + 2.5);
    });
  }

  // Анализатор общего выхода (осциллограмма «живой сигнал»); создаётся по первому запросу
  let ana = null;
  function analyser() {
    const c = peekContext();
    if (!c) return null;
    if (!ana) {
      ana = c.createAnalyser();
      ana.fftSize = 4096;
      ana.smoothingTimeConstant = 0.6;
      masterNode().connect(ana);
    }
    return ana;
  }

  let n = 0;
  const audio = {
    mixer, synth, drone, metro,
    unlock: () => !!getContext(device.mix.mode),   // вызвать на первом жесте пользователя
    ready: () => !!peekContext(),
    now,
    mf: (m) => midiFreq(m, a4()),
    // Текущий звук пианино (пресет и ручки панели) — чтобы другие инструменты звучали так же (глайдер)
    pianoPatch: () => pianoPatch(device.piano),
    bus: (name) => mixer.bus(name),
    // Короткая нота; opts: { bus = 'theory', dur = 0.9, preset — встроенный звук синтезатора (piano, organ, bell…) }
    playNote(midi, { bus = 'theory', dur = 0.9, preset = null } = {}) {
      const k = 'n' + n++;
      synth.on(midi, k, { bus, patch: preset ? PRESETS[preset] || PRESETS.piano : null });
      setTimeout(() => synth.off(k), dur * 1000);
    },
    // opts.preset — встроенный звук синтезатора (как у playNote)
    playChord: (midis, opts = {}) => playChord(synth, midis, { ...opts, patch: opts.preset ? PRESETS[opts.preset] || null : null }),
    playSeq: (midis, opts = {}) => playSeq(synth, midis, { ...opts, patch: opts.preset ? PRESETS[opts.preset] || null : null }),
    chime,
    refTone,
    analyser,
    openMic: () => openMic(device.mix.mode),
    // Для записи: контекст и отвод всего, что звучит (после компрессора и прямой выход метронома), в узел:
    // into(node) → off(). null — звука нет
    tap() {
      const c = getContext(device.mix.mode);
      if (!c || !c.createMediaStreamDestination) return null;
      return { ctx: c, into: (node) => addTap(node) };
    },
    // Остановить всё (выход из сессии)
    stopAll() {
      if (metro.running) metro.stop();
      drone.stop();
      synth.all();
    },
  };
  return audio;
}
