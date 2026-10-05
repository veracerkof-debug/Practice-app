// Ядро: песни, сессии, статистика, цели, ударный режим, хранение.
// Экраны пока в legacy/practice.html — переносятся вместе с рабочим пространством (ROADMAP, этап 1).
import { t } from '../i18n/index.js';
import { modules } from '../modules/index.js';
import { createStore } from './store.js';
import { loadActive, recoverToolView } from './session.js';
import { ensureLib } from './library.js';
import { applyTheme } from './settings.js';

export function boot(root) {
  const store = createStore();
  ensureLib(store.state, t);
  applyTheme(store.state.settings);
  recoverToolView(store);
  const active = loadActive();

  const h = document.createElement('h1');
  h.textContent = t('app.title');
  const p = document.createElement('p');
  p.textContent = t('app.wip');
  root.replaceChildren(h, p);
  return { store, active, modules };
}
