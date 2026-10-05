// Ядро: песни, сессии, статистика, цели, ударный режим, хранение, рабочее пространство.
// Переносится из legacy/practice.html (ROADMAP, этап 1).
import { t } from '../i18n/index.js';
import { modules } from '../modules/index.js';

export function boot(root) {
  const h = document.createElement('h1');
  h.textContent = t('app.title');
  const p = document.createElement('p');
  p.textContent = t('app.wip');
  root.replaceChildren(h, p);
  return { modules };
}
