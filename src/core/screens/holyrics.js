// Holyrics по Wi-Fi: адрес и порт компьютера с Holyrics, токен (Holyrics: Файл → Настройки → API Server →
// «Управление правами», разрешение GetSongs). Хранятся только на этом устройстве (не в резервной копии).
// «Загрузить песни» — песни Holyrics в шторку импорта (повторы по названию сняты).
import { t } from '../../i18n/index.js';
import { esc, sheet, snav } from '../../ui/index.js';
import { holyricsSongs, holyricsCheck } from '../holyrics.js';
import { importPreview } from './songimport.js';
import { log } from '../log.js';

export function holyricsSheet(app, onDone) {
  const cfg = (app.device.holyrics ??= { addr: '', port: '', token: '' });
  const field = (k, label, ph, type = 'text', mode = 'text') => '<label class="cell"><span style="min-width:96px">' + label + '</span><input class="inp" data-hr="' + k + '" type="' + type + '" inputmode="' + mode +
    '" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="' + esc(ph) + '" value="' + esc(cfg[k] || '') + '" aria-label="' + esc(label) + '"></label>';
  const api = sheet(() => snav('Holyrics') +
    '<div class="group">' + field('addr', t('hr.addr'), '192.168.1.10', 'text', 'decimal') + field('port', t('hr.port'), '8091', 'text', 'numeric') + field('token', t('hr.token'), t('hr.tokenPh'), 'password') + '</div>' +
    '<div class="hrbtns"><button class="btn" data-hr-check>' + t('hr.check') + '</button><button class="btn fill" data-hr-go>' + t('hr.load') + '</button></div>' +
    '<div class="hrres" aria-live="polite"></div>' +
    '<p class="ftr">' + t('hr.hint') + '</p>', (el) => {
    const res = el.querySelector('.hrres');
    // итог проверки или ошибка — в окне: что случилось, подробность от системы и что проверить
    const show = (ok, title, detail = '', tips = '') => {
      res.innerHTML = '<div class="hrbox' + (ok ? ' ok' : '') + '"><b>' + esc(title) + '</b>' + (detail ? '<span class="hrdet">' + esc(detail) + '</span>' : '') + (tips ? '<span class="hrtip">' + esc(tips) + '</span>' : '') + '</div>';
    };
    const fail = (err) => {
      const r = err.reason || 'net';
      log('holyrics', r + ': ' + (err.detail || err.message), 'w');
      show(false, t('hr.err.' + r), (err.base ? err.base + ' · ' : '') + (err.detail || ''), t('hr.tip.' + r));
    };
    el.addEventListener('input', (e) => { const k = e.target.dataset.hr; if (k) { cfg[k] = e.target.value.trim(); app.saveDevice(); } });
    el.addEventListener('click', async (e) => {
      const go = e.target.closest('[data-hr-go]'), chk = e.target.closest('[data-hr-check]'), b = go || chk;
      if (!b || b.disabled) return;
      const label = b.textContent;
      b.disabled = true;
      b.textContent = t('hr.loading');
      res.innerHTML = '';
      try {
        if (chk) {
          const c = await holyricsCheck(cfg);
          log('holyrics', 'проверка: связь есть' + (c.version ? ', версия ' + c.version : '') + ', GetSongs: ' + c.songs);
          show(c.songs, t(c.songs ? 'hr.okTitle' : 'hr.err.perm'), (c.version ? 'Holyrics ' + c.version : '') + (c.perms.length ? ' · ' + c.perms.join(', ') : ''), c.songs ? '' : t('hr.tip.perm'));
        } else {
          const songs = await holyricsSongs(cfg);
          log('holyrics', 'получено песен: ' + songs.length);
          if (!songs.length) { show(true, t('hr.empty')); return; }
          api.close();
          importPreview(app, songs, [], 'holyrics', onDone);
        }
      } catch (err) { fail(err); }
      finally { b.disabled = false; b.textContent = label; }
    });
  });
}
