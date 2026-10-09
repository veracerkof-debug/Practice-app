// Кнопка записи в окне инструмента: нажатие — лист выбора (звук приложения, с микрофоном; у модуля с видео —
// звук или звук и видео) и «Начать»; во время записи — красная точка и время, нажатие — остановить и сохранить
// в медиатеку. Запись — recorder.js.
import { t } from '../../i18n/index.js';
import { sheet, snav, seg, toast, icb } from '../../ui/index.js';
import { fmtClock } from '../format.js';

export const REC_ICON = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4" fill="currentColor" stroke="none"/></svg>';

export const recButtonHTML = (cls = '') => icb('data-tv="rec"', REC_ICON, t('rec.start'), 'sm tvrec ' + cls);

// Настройки записи — в общих настройках: { mic, video }
const prefs = (app) => (app.store.state.settings.rec ??= { mic: false, video: false });

function startSheet(app, mod, host, name) {
  const p = prefs(app), hasVideo = typeof mod.recordVideo === 'function';
  sheet(() => snav(t('rec.title')) +
    '<div class="group"><div class="cellcol">' + seg('rsrc', [['app', t('rec.src.app')], ['mic', t('rec.src.mic')]], p.mic ? 'mic' : 'app', t('rec.src')) +
    '<div class="segcap">' + t(p.mic ? 'rec.src.micHint' : 'rec.src.appHint') + '</div></div>' +
    (hasVideo ? '<div class="cellcol">' + seg('rfmt', [['audio', t('rec.fmt.audio')], ['video', t('rec.fmt.video')]], p.video ? 'video' : 'audio', t('rec.fmt')) +
      '<div class="segcap">' + t(p.video ? 'rec.fmt.videoHint' : 'rec.fmt.audioHint') + '</div></div>' : '') + '</div>' +
    '<button class="btn fill recgo" data-rgo>' + REC_ICON + '<span>' + t('rec.go') + '</span></button>' +
    '<p class="ftr">' + t('rec.hint') + '</p>', (el, sh) => {
    el.addEventListener('click', async (e) => {
      const g = (q) => e.target.closest(q);
      let b;
      if ((b = g('[data-seg="rsrc"] [data-v]'))) { p.mic = b.dataset.v === 'mic'; app.store.settingsChanged(); sh.update(); return; }
      if ((b = g('[data-seg="rfmt"] [data-v]'))) { p.video = b.dataset.v === 'video'; app.store.settingsChanged(); sh.update(); return; }
      if (!g('[data-rgo]')) return;
      sh.close();
      let video = null;
      if (hasVideo && p.video) {
        video = mod.recordVideo(host);
        if (!video) toast(t('rec.noVideo'));
      }
      const r = await app.rec.start({ tool: name, mic: p.mic, video });
      if (r === 'unsupported') toast(t('rec.unsupported'));
      else if (r === 'nosound') toast(t('rec.nosound'));
      else if (r === 'mic') toast(t('rec.micDenied'));
    });
  });
}

// Подключить кнопку записи в окне инструмента: layer — окно, host — место модуля. → stop() при закрытии окна
export function bindRec(app, layer, mod, host, name) {
  const btn = () => layer.querySelector('[data-tv="rec"]');
  let timer = 0;
  const paint = (st) => {
    const b = btn();
    if (!b) return;
    b.classList.toggle('on', !!st);
    b.setAttribute('aria-label', t(st ? 'rec.stop' : 'rec.start'));
    let tm = b.querySelector('.rectm');
    if (st) {
      if (!tm) { tm = document.createElement('span'); tm.className = 'rectm num'; b.appendChild(tm); }
      tm.textContent = fmtClock((Date.now() - st.t0) / 1000);
    } else if (tm) tm.remove();
  };
  const tick = () => paint(app.rec.state);
  const off = app.rec.subscribe((cur) => {
    clearInterval(timer);
    tick();
    if (cur) timer = setInterval(tick, 500);
  });
  tick();
  if (app.rec.active) timer = setInterval(tick, 500);
  const stop = async () => {
    const r = await app.rec.stop();
    if (r) toast(t('rec.saved', { name: r.name.replace(/\.[a-z0-9]+$/, '') }));
  };
  layer.addEventListener('click', (e) => {
    if (!e.target.closest('[data-tv="rec"]')) return;
    if (app.rec.active) stop();
    else startSheet(app, mod, host, name);
  });
  // окно закрывается — запись сохраняется
  return () => { off(); clearInterval(timer); if (app.rec.active) stop(); };
}

