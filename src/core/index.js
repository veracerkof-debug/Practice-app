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

export function boot(root) {
  const store = createStore();
  ensureLib(store.state, t);
  applyTheme(store.state.settings);
  recoverToolView(store);
  let active = loadActive();
  const device = loadDevice();

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
  });
  addEventListener('pointerdown', () => audio.unlock(), { once: true, capture: true });

  const h = document.createElement('h1');
  h.textContent = t('app.title');
  const p = document.createElement('p');
  p.textContent = t('app.wip');
  root.replaceChildren(h, p);
  return { store, device, audio, modules, get active() { return active; }, set active(a) { active = a; saveActive(a); } };
}
