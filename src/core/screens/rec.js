// Кнопка записи в окне инструмента и лист записи. Источники — звук приложения (баланс инструментов — в микшере)
// и микрофон: каждый включается отдельно и регулируется громче-тише, в том числе во время записи. Мониторинг —
// микрофон в наушники через гейт (уровень и порог видны на шкале). У модуля с видео — «только звук» или «звук и видео».
// Во время записи кнопка красная, со временем; нажатие открывает лист: «Остановить и сохранить» и те же регулировки.
// Запись — recorder.js.
import { t } from '../../i18n/index.js';
import { sheet, snav, seg, sw, toast, icb } from '../../ui/index.js';
import { fmtClock } from '../format.js';
import { VOL_MAX, GATE_MIN, GATE_MAX } from '../recorder.js';

export const REC_ICON = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4" fill="currentColor" stroke="none"/></svg>';

export const recButtonHTML = (cls = '') => icb('data-tv="rec"', REC_ICON, t('rec.start'), 'sm tvrec ' + cls);

const pct = (v) => Math.round(v * 100) + '%';
const slider = (k, v, min, max, step, label, txt) => '<label class="recsl"><span>' + label + '</span><input type="range" min="' + min + '" max="' + max + '" step="' + step + '" value="' + v + '" data-rsl="' + k + '" aria-label="' + label + '"><b class="num" data-rslv="' + k + '">' + txt + '</b></label>';
// шкала уровня микрофона: −70…0 дБ, отметка — порог гейта
const toPos = (db) => Math.max(0, Math.min(100, ((db - GATE_MIN) / -GATE_MIN) * 100));

function recSheet(app, mod, host, name) {
  const R = app.rec, hasVideo = typeof mod.recordVideo === 'function';
  let raf = 0;
  const body = () => {
    const p = R.prefs, on = R.active;
    return snav(t('rec.title')) +
      (on ? '<button class="btn fill recstop" data-rstop>' + REC_ICON + '<span>' + t('rec.stopSave') + '</span><b class="num" data-rtm>' + fmtClock((Date.now() - R.state.t0) / 1000) + '</b></button>' : '') +
      // звук приложения
      '<div class="hdr">' + t('rec.app') + '</div><div class="group"><div class="cell"><span class="grow">' + t('rec.appOn') + '</span>' + sw('rapp', p.app, t('rec.appOn')) + '</div>' +
      (p.app ? '<div class="cellcol">' + slider('appVol', p.appVol, 0, VOL_MAX, 0.05, t('rec.vol'), pct(p.appVol)) + '</div>' : '') +
      (app.openMixer ? '<button class="cell act" data-rmix>' + t('rec.mixer') + '</button>' : '') + '</div><p class="ftr">' + t('rec.appHint') + '</p>' +
      // микрофон
      '<div class="hdr">' + t('rec.mic') + '</div><div class="group"><div class="cell"><span class="grow">' + t('rec.micOn') + '</span>' + sw('rmic', p.mic, t('rec.micOn')) + '</div>' +
      (p.mic ? '<div class="cellcol">' + slider('micVol', p.micVol, 0, VOL_MAX, 0.05, t('rec.vol'), pct(p.micVol)) +
        '<div class="recmeter" aria-hidden="true"><i data-rlev></i><s style="left:' + toPos(p.gate) + '%"></s></div></div>' +
        // мониторинг через гейт
        '<div class="cell"><span class="grow">' + t('rec.mon') + '</span>' + sw('rmon', p.mon, t('rec.mon')) + '</div>' +
        (p.mon ? '<div class="cellcol">' + slider('monVol', p.monVol, 0, 1.5, 0.05, t('rec.vol'), pct(p.monVol)) +
          slider('gate', p.gate, GATE_MIN, GATE_MAX, 1, t('rec.gate'), p.gate + ' ' + t('rec.db')) + '</div>' : '') : '') +
      '</div><p class="ftr">' + t(p.mic ? (p.mon ? 'rec.monHint' : 'rec.micHint') : 'rec.micOffHint') + '</p>' +
      (hasVideo && !on ? '<div class="hdr">' + t('rec.fmt') + '</div><div class="group"><div class="cellcol">' + seg('rfmt', [['audio', t('rec.fmt.audio')], ['video', t('rec.fmt.video')]], p.video ? 'video' : 'audio', t('rec.fmt')) +
        '<div class="segcap">' + t(p.video ? 'rec.fmt.videoHint' : 'rec.fmt.audioHint') + '</div></div></div>' : '') +
      (on ? '' : '<button class="btn fill recgo" data-rgo>' + REC_ICON + '<span>' + t('rec.go') + '</span></button><p class="ftr">' + t('rec.hint') + '</p>');
  };
  const arm = async () => { const r = await R.arm(); if (r === 'mic') { R.prefs.mic = false; app.store.settingsChanged(); toast(t('rec.micDenied')); } return r; };
  R.meter.howl = () => toast(t('rec.howl'));
  sheet(body, (el, sh) => {
    arm().then(() => sh.update());
    // уровень микрофона и гейт — на шкале; время записи — на кнопке
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (!el.isConnected) { cancelAnimationFrame(raf); if (!R.active) R.disarm(); R.meter.howl = null; return; }
      const lev = el.querySelector('[data-rlev]');
      if (lev) { lev.style.width = toPos(R.meter.db) + '%'; lev.classList.toggle('open', R.meter.open); }
      const tm = el.querySelector('[data-rtm]');
      if (tm && R.state) tm.textContent = fmtClock((Date.now() - R.state.t0) / 1000);
      const mon = el.querySelector('[data-sw="rmon"]');
      if (mon && mon.checked !== R.prefs.mon) sh.update(); // мониторинг выключился сам (обратная связь)
    };
    loop();
    const save = () => app.store.settingsChanged();
    el.addEventListener('input', (e) => {
      const k = e.target.dataset.rsl;
      if (!k) return;
      R.prefs[k] = +e.target.value;
      R.apply();
      const v = el.querySelector('[data-rslv="' + k + '"]');
      if (v) v.textContent = k === 'gate' ? e.target.value + ' ' + t('rec.db') : pct(+e.target.value);
      if (k === 'gate') { const m = el.querySelector('.recmeter s'); if (m) m.style.left = toPos(+e.target.value) + '%'; }
    });
    el.addEventListener('change', async (e) => {
      if (e.target.dataset.rsl) { save(); return; }
      const k = e.target.dataset.sw, p = R.prefs;
      if (k === 'rapp') p.app = e.target.checked;
      else if (k === 'rmic') { p.mic = e.target.checked; if (!p.mic) p.mon = false; }
      else if (k === 'rmon') p.mon = e.target.checked;
      else return;
      save();
      R.apply();
      if (k === 'rmic') await arm();
      sh.update();
    });
    el.addEventListener('click', async (e) => {
      const g = (q) => e.target.closest(q);
      let b;
      if ((b = g('[data-seg="rfmt"] [data-v]'))) { R.prefs.video = b.dataset.v === 'video'; save(); sh.update(); return; }
      if (g('[data-rmix]')) { sh.close(); app.openMixer(); return; }
      if (g('[data-rstop]')) {
        sh.close();
        const r = await R.stop();
        if (r) toast(t('rec.saved', { name: r.name.replace(/\.[a-z0-9]+$/, '') }));
        return;
      }
      if (!g('[data-rgo]')) return;
      let video = null;
      if (hasVideo && R.prefs.video) {
        video = mod.recordVideo(host);
        if (!video) toast(t('rec.noVideo'));
      }
      const r = await R.start({ tool: name, video });
      if (r === 'empty') { if (video) video.stop(); toast(t('rec.empty')); return; }
      sh.close();
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
    b.setAttribute('aria-label', t(st ? 'rec.open' : 'rec.start'));
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
  layer.addEventListener('click', (e) => {
    if (e.target.closest('[data-tv="rec"]')) recSheet(app, mod, host, name);
  });
  // окно закрывается — запись сохраняется
  return () => {
    off(); clearInterval(timer);
    if (app.rec.active) app.rec.stop().then((r) => { if (r) toast(t('rec.saved', { name: r.name.replace(/\.[a-z0-9]+$/, '') })); });
  };
}
