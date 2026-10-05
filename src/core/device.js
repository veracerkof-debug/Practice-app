// Настройки инструментов на этом устройстве (не синхронизируются): микшер, пианино, пэды, тюнер, раскладки окон…
// Формат и ключ — как в прототипе (practice.v1.tools).
export const LS_T = 'practice.v1.tools';

export const DRONE_SOUNDS = ['soft', 'pad', 'bow', 'tanpura', 'choir', 'glass'];

export function deviceDefaults() {
  return {
    piano: { start: 0, oct: 4, size: 8, sound: 'piano' },
    drone: { pc: 9, oct: 3, fifth: true, octave: false, sound: 'soft', vol: 0.7 },
    pomo: { work: 25, short: 5, long: 15, every: 4, auto: true, pauseSession: true },
    theory: { pc: 0, minor: false, sev: false },
    scale: { pc: 9, type: 'minor' },
    tuner: { a4: 440, tuning: 'g_std', customs: [] },
    ws: { layout: 'F', panes: ['metro', 'tuner', 'drone', 'circle'], focus: 0 },
    wsMap: {}, lastAudio: {}, ear: {}, rh: {}, ui: {},
    mix: { metro: 1, piano: 0.9, drone: 1, audio: 1, mode: 'bal' },
    tab: { scale: 1, prof: 'tab', fs: 15, sec: 'tabs' },
  };
}

export function loadDevice(storage = globalThis.localStorage) {
  const d = deviceDefaults();
  try {
    const s = JSON.parse(storage.getItem(LS_T)) || {};
    Object.keys(d).forEach((k) => Object.assign(d[k], s[k] || {}));
  } catch { /* по умолчанию */ }
  if (!DRONE_SOUNDS.includes(d.drone.sound)) d.drone.sound = 'soft';
  d.piano.start = 0;
  if (!d.drone.layers) {
    d.drone.layers = { 2: false, 3: false, 4: false };
    d.drone.layers[d.drone.oct || 3] = true;
  }
  return d;
}

export function saveDevice(d, storage = globalThis.localStorage) {
  try { storage.setItem(LS_T, JSON.stringify(d)); } catch { /* ignore */ }
}
