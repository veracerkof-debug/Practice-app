// Дополнительное оформление: вход. Без подписей и подсказок.
import { t } from '../../i18n/index.js';
import { leave } from '../../ui/index.js';
import { extTry } from '../ext.js';

import { buzz } from '../pulse.js';

const HOLD_MS = 15000;

// Удержание названия приложения 15 секунд — окно кода (с вибрацией). open() — что показать после входа
export function bindExt(app, open) {
  let timer = 0, swallow = false, start = null;
  const clear = () => { clearTimeout(timer); timer = 0; start = null; };
  addEventListener('pointerdown', (e) => {
    if (!(e.target.closest && e.target.closest('.logo'))) return;
    start = { x: e.clientX, y: e.clientY };
    clearTimeout(timer);
    timer = setTimeout(() => { timer = 0; swallow = true; start = null; dialog(app, open); }, HOLD_MS);
  }, { capture: true, passive: true });
  addEventListener('pointermove', (e) => { if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 16) clear(); }, { capture: true, passive: true });
  addEventListener('pointerup', clear, { capture: true });
  addEventListener('pointercancel', clear, { capture: true });
  // долгое нажатие — не обычное нажатие (справка о названии не открывается)
  addEventListener('click', (e) => { if (swallow && e.target.closest && e.target.closest('.logo')) { e.preventDefault(); e.stopPropagation(); } swallow = false; }, { capture: true });
  addEventListener('contextmenu', (e) => { if (e.target.closest && e.target.closest('.logo')) e.preventDefault(); }, { capture: true });
  addEventListener('selectstart', (e) => { if (e.target.closest && e.target.closest('.logo')) e.preventDefault(); }, { capture: true });
}

function dialog(app, open) {
  const d = document.createElement('div');
  d.className = 'ask';
  d.innerHTML = '<div class="alert" role="dialog" aria-label="Μ"><div class="ab"><h3 lang="el" style="font-family:\'GFS Didot\',serif;font-size:28px;font-weight:400">Μ</h3>' +
    '<input class="inp num" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" aria-label="Μ" ' +
    'style="width:8em;margin:12px auto 0;display:block;text-align:center;font-size:24px;letter-spacing:.5em;padding:8px 0 8px .5em;' +
    'border:1px solid var(--sep);border-radius:12px;background:var(--fill);color:var(--ink)"></div>' +
    '<div class="abtns"><button data-k="no">' + t('ui.cancel') + '</button><button data-k="ok">OK</button></div></div>';
  document.body.appendChild(d);
  buzz(60, 220);
  const inp = d.querySelector('input');
  setTimeout(() => inp.focus(), 50);
  const done = () => leave(d, 160);
  const go = () => {
    const st = app.store.state.settings, r = extTry(st, inp.value.trim());
    if (!r) {
      inp.value = '';
      inp.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(0)' }], { duration: 240 });
      return;
    }
    app.store.settingsChanged();
    done();
    buzz(35, 160); setTimeout(() => buzz(35, 160), 120);
    open();
  };
  inp.addEventListener('input', () => { inp.value = inp.value.replace(/\D/g, '').slice(0, 4); if (inp.value.length === 4) go(); });
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); if (e.key === 'Escape') done(); });
  d.addEventListener('click', (e) => { const k = e.target.closest('[data-k]'); if (!k) return; if (k.dataset.k === 'ok') go(); else done(); });
}
