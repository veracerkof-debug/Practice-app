// Обновление (src/core/update.js): полоса внизу экрана — «есть новая версия», ход скачивания, «установить»;
// шторка в профиле — сборка и канал, «Обновление»: автоматически или по кнопке, «Проверить сейчас». Полоса не перехватывает экран:
// «Потом» убирает её до следующей сборки
import { t } from '../../i18n/index.js';
import { esc, sheet, snav, seg, toast } from '../../ui/index.js';

const pct = (f) => Math.round((f || 0) * 100);

function barHTML(s, U) {
  if (s.st === 'avail' && !U.skipped) return '<span class="grow">' + t('upd.avail', { n: s.info.build }) + '</span><button class="link" data-upd="skip">' + t('upd.later') + '</button><button class="btn fill sm" data-upd="get">' + t('upd.get') + '</button>';
  if (s.st === 'down') return '<span class="grow">' + (s.wait ? t('upd.wait') : t('upd.down', { p: pct(s.f) })) + '</span><i class="updprog" style="--f:' + pct(s.f) + '%"></i>';
  if (s.st === 'ready') return '<span class="grow">' + t(s.onClose ? 'upd.onClose' : 'upd.ready') + '</span><button class="btn fill sm" data-upd="install">' + t(s.onClose ? 'upd.now' : 'upd.install') + '</button>';
  return '';
}

export function mountUpdateBar(app) {
  const U = app.updater;
  if (!U || !U.platform) return;
  const el = document.createElement('div');
  el.className = 'updbar';
  el.setAttribute('role', 'status');
  document.body.appendChild(el);
  const draw = (s) => { const h = barHTML(s, U); el.innerHTML = h; el.hidden = !h; };
  U.subscribe(draw);
  draw(U.state);
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-upd]'); if (!b) return;
    if (b.dataset.upd === 'skip') U.skip();
    else if (b.dataset.upd === 'get') U.download();
    else if (b.dataset.upd === 'install') U.install().then((r) => { if (r === 'allow') toast(t('upd.allow')); }).catch(() => toast(t('upd.err')));
  });
}

// Строка статуса в шторке
function stateLine(s) {
  if (s.st === 'checking') return t('upd.checking');
  if (s.st === 'none') return t('upd.none');
  if (s.st === 'err') return t('upd.err');
  if (s.st === 'avail') return t('upd.avail', { n: s.info.build });
  if (s.st === 'down') return s.wait ? t('upd.wait') : t('upd.down', { p: pct(s.f) });
  if (s.st === 'ready') return t('upd.ready');
  return '';
}

export function updateSheet(app) {
  const U = app.updater, st = app.store.state.settings;
  let un = null;
  const sh = sheet(() => {
    const s = U.state, line = stateLine(s);
    return snav(t('upd.title')) +
      '<div class="group"><div class="cell"><span class="grow">' + t('upd.ver', { b: U.build || '—', ch: U.channel === 'dev' ? t('upd.dev') : t('upd.pre') }) + '</span></div>' +
      '<div class="cellcol">' + seg('updMode', [['auto', t('upd.mAuto')], ['button', t('upd.mButton')]], U.mode, t('upd.mode')) + '<div class="segcap">' + t(U.mode === 'auto' ? (U.platform === 'android' ? 'upd.autoAnd' : 'upd.autoWin') : 'upd.btnHint') + '</div></div>' +
      '<button class="cell act" data-u="check"' + (s.st === 'checking' || s.st === 'down' ? ' disabled' : '') + '>' + t('upd.check') + '</button>' +
      (s.st === 'avail' ? '<button class="cell act" data-u="get">' + t('upd.get') + '</button>' : '') +
      (s.st === 'ready' ? '<button class="cell act" data-u="install">' + t('upd.install') + '</button>' : '') +
      '</div><p class="ftr">' + (line ? esc(line) + '<br>' : '') + t('upd.hint') + '</p>';
  }, (el) => {
    un = U.subscribe(() => sh.update());
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-u]'); if (!b) return;
      if (b.dataset.u === 'check') U.check();
      else if (b.dataset.u === 'get') U.download();
      else if (b.dataset.u === 'install') U.install().then((r) => { if (r === 'allow') toast(t('upd.allow')); }).catch(() => toast(t('upd.err')));
    });
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-seg="updMode"] [data-v]'); if (!b) return;
      st.updMode = b.dataset.v; app.store.settingsChanged(); sh.update();
    });
  }, { onClose: () => un && un() });
  return sh;
}
