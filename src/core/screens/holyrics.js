// Holyrics по Wi-Fi: адрес и порт компьютера с Holyrics, токен (Holyrics: Файл → Настройки → API Server →
// «Управление правами», разрешение GetSongs). Хранятся только на этом устройстве (не в резервной копии).
// «Загрузить песни» — песни Holyrics в шторку импорта (повторы по названию сняты).
import { t } from '../../i18n/index.js';
import { esc, sheet, snav, toast } from '../../ui/index.js';
import { holyricsSongs } from '../holyrics.js';
import { importPreview } from './songimport.js';
import { log } from '../log.js';

export function holyricsSheet(app, onDone) {
  const cfg = (app.device.holyrics ??= { addr: '', port: '', token: '' });
  const field = (k, label, ph, type = 'text', mode = 'text') => '<label class="cell"><span style="min-width:96px">' + label + '</span><input class="inp" data-hr="' + k + '" type="' + type + '" inputmode="' + mode +
    '" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="' + esc(ph) + '" value="' + esc(cfg[k] || '') + '" aria-label="' + esc(label) + '"></label>';
  const api = sheet(() => snav('Holyrics') +
    '<div class="group">' + field('addr', t('hr.addr'), '192.168.1.10', 'text', 'url') + field('port', t('hr.port'), '8091', 'text', 'numeric') + field('token', t('hr.token'), t('hr.tokenPh'), 'password') + '</div>' +
    '<button class="btn fill" data-hr-go style="width:100%;margin-top:14px">' + t('hr.load') + '</button>' +
    '<p class="ftr">' + t('hr.hint') + '</p>', (el) => {
    el.addEventListener('input', (e) => { const k = e.target.dataset.hr; if (k) { cfg[k] = e.target.value.trim(); app.saveDevice(); } });
    el.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-hr-go]');
      if (!b || b.disabled) return;
      b.disabled = true;
      b.textContent = t('hr.loading');
      try {
        const songs = await holyricsSongs(cfg);
        log('holyrics', 'получено песен: ' + songs.length);
        api.close();
        importPreview(app, songs, [], 'holyrics', onDone);
      } catch (err) {
        log('holyrics', (err.reason || 'fail') + ': ' + err.message, 'w');
        toast(t('hr.err.' + (err.reason || 'net')));
        b.disabled = false;
        b.textContent = t('hr.load');
      }
    });
  });
}
