// Ядро: песни, сессии, статистика, цели, ударный режим, хранение.
// Экраны пока в legacy/practice.html — переносятся вместе с рабочим пространством (ROADMAP, этап 1).
import { t } from '../i18n/index.js';
import { modules } from '../modules/index.js';
import { createStore } from './store.js';
import { loadActive, saveActive, recoverToolView, addBpmTime } from './session.js';
import { loadDevice, saveDevice } from './device.js';
import { createAudio } from '../audio/index.js';
import { ensureLib } from './library.js';
import { applyTheme } from './settings.js';
import { renderTools } from './screens/tools.js';
import { createShared } from './modules.js';
import { createPomodoro, pomoDefaults } from './pomodoro.js';
import { pause as pauseActive, resume as resumeActive } from './session.js';
import { toast } from '../ui/index.js';

export function boot(root) {
  const store = createStore();
  ensureLib(store.state, t);
  applyTheme(store.state.settings);
  recoverToolView(store);
  let active = loadActive();
  const device = loadDevice();
  // Способ регулировки темпа в прототипе хранился в общих настройках — теперь в настройках модуля
  device.metro ??= { adj: store.state.settings.metroAdj || 'wheel' };
  // Гамма в прототипе хранилась отдельно (tools.scale) — теперь в настройках теории
  device.theory.scale ??= device.scale || { pc: 9, type: 'minor' };
  // Помодоро: настройки прототипа (tools.pomo) и вид (tools.ui.pomo) — в настройки модуля timer
  device.timer ??= { ...pomoDefaults(), ...device.pomo, style: device.ui?.pomo === 'flip' ? 'flip' : 'ring' };

  // Звук создаётся сразу, но AudioContext — только на первом жесте пользователя
  const audio = createAudio({
    device,
    metroCfg: store.state.settings.metro,
    save: () => saveDevice(device),
    onTempo: (bpm, sec) => {
      if (!active || active.pausedAt) return;
      addBpmTime(active, bpm, sec);
      saveActive(active);
    },
    onBpmChange: () => store.persist(),
    // Копия настроек песни сохраняется в песню при завершении сессии; общие — сразу
    saveMetro: (cfg) => { if (cfg === store.state.settings.metro) store.persist(); },
  });
  addEventListener('pointerdown', () => audio.unlock(), { once: true, capture: true });

  // Помодоро идёт в фоне; перерыв ставит сессию на паузу (прототип: sessPause)
  const pomoSubs = new Set();
  const pomodoro = createPomodoro(device.timer, {
    onEnd: (phase) => { audio.chime(); toast(t(phase === 'work' ? 'pomo.breakOver' : 'pomo.breakTime')); },
    pauseSession: (on) => {
      if (!active || !device.timer.pauseSession) return;
      if (on && !active.pausedAt) { audio.metro.flush(); pauseActive(active); active.pomoPaused = true; saveActive(active); }
      // время паузы на темп не засчитываем: сначала сбросить отсчёт, потом снять паузу
      else if (!on && active.pomoPaused && active.pausedAt) { audio.metro.flush(); resumeActive(active); saveActive(active); }
    },
    onChange: () => pomoSubs.forEach((fn) => fn()),
  });
  pomodoro.subscribe = (fn) => { pomoSubs.add(fn); return () => pomoSubs.delete(fn); };
  setInterval(() => pomodoro.tick(), 500);

  const app = {
    store, device, audio, modules, pomodoro,
    shared: createShared(),
    saveDevice: () => saveDevice(device),
    get active() { return active; },
    set active(a) { active = a; saveActive(a); },
  };
  // Пока перенесены только инструменты — показываем их экран
  renderTools(app, root);
  return app;
}

