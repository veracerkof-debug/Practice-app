// «Часы устройства сбиты»: пока это так, занятия не подтверждаются. Кнопка — сверить дату по интернету
// (src/core/clock.js). Окно показывается при обнаружении, при запуске и перед началом практики.
import { t, getLang } from '../../i18n/index.js';
import { esc, toast, leave } from '../../ui/index.js';

const fmt = (ms) => new Intl.DateTimeFormat(getLang() === 'uz' ? 'uz-Latn' : getLang(), { dateStyle: 'medium', timeStyle: 'short' }).format(ms);

export function clockNotice(app) {
  const c = app.clock;
  if (!c || !c.bad || document.querySelector('.ask[data-clock]:not(.leaving)')) return;
  const d = document.createElement('div');
  d.className = 'ask';
  d.dataset.clock = '1';
  const body = (msg) => '<div class="alert" role="alertdialog" aria-label="' + esc(t('clock.title')) + '"><div class="ab"><h3>' + t('clock.title') + '</h3><p>' + esc(msg) + '</p></div>' +
    '<div class="abtns"><button data-k="no">' + t('clock.later') + '</button><button data-k="net">' + t('clock.check') + '</button></div></div>';
  d.innerHTML = body(t('clock.' + (c.reason || 'past')) + ' ' + t('clock.need'));
  document.body.appendChild(d);
  d.addEventListener('click', async (e) => {
    const k = e.target.closest('[data-k]');
    if (!k) return;
    if (k.dataset.k === 'no') { leave(d, 160); return; }
    k.disabled = true;
    k.textContent = t('clock.checking');
    try {
      const r = await c.verify();
      if (r.ok) { leave(d, 160); toast(t('clock.ok')); return; }
      d.innerHTML = body(t('clock.wrong', { device: fmt(r.device), net: fmt(r.net) }));
    } catch {
      k.disabled = false;
      k.textContent = t('clock.check');
      toast(t('clock.offline'));
    }
  });
}
