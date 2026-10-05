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

export function boot(root) {
  const store = createStore();
  ensureLib(store.state, t);
  applyTheme(store.state.settings);
  recoverToolView(store);
  let active = loadActive();
  const device = loadDevice();
  // Способ регулировки темпа в прототипе хранился в общих настройках — теперь в настройках модуля
  device.metro ??= { adj: store.state.settings.metroAdj || 'wheel' };

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

  const app = {
    store, device, audio, modules,
    shared: createShared(),
    saveDevice: () => saveDevice(device),
    get active() { return active; },
    set active(a) { active = a; saveActive(a); },
  };
  // Пока перенесены только инструменты — показываем их экран
  renderTools(app, root);
  return app;
}

