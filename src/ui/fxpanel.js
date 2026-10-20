// Панель эффектов — одна на всё приложение: шина микшера, слой лупера, дорожка студии. Эквалайзер (простой — три
// точки; продвинутый — до 8 полос с частотой, шириной, типом и выключением), сжатие, драйв, тремоло, задержка, хор,
// реверберация с выбором пространства. Вид по умолчанию — по уровню владения: новичку и любителю — простой,
// продвинутому и профи — продвинутый; выбор запоминается в настройках (поле mode). Звук — src/audio/fx.js,
// полотно — src/ui/eq.js. Используется внутри шторки: html() — разметка, bind(el, api) — после каждого api.update()
import { t } from '../i18n/index.js';
import { esc, seg, sw } from './index.js';
import { eqCanvas, BAND_COLORS } from './eq.js';
import { EQ_TYPES, REV_TYPES, CHORUS_TYPES, BANDS_MAX, Q_MIN, Q_MAX, normalizeFx } from '../audio/fx.js';

export const fmtFreq = (f) => (f >= 1000 ? String(Math.round(f / 100) / 10) + ' ' + t('fx.khz') : Math.round(f) + ' ' + t('fx.hz'));
const pc = (v) => Math.round(v * 100) + '%';
const dbs = (v) => (v > 0 ? '+' : '') + v + ' ' + t('fx.db');
const isCut = (b) => b.type === 'highpass' || b.type === 'lowpass';
export const defaultFxMode = (profile) => ((profile || {}).level === 'advanced' || (profile || {}).level === 'pro' ? 'adv' : 'simple');

// get() → настройки (полный вид), set(patch) → сохранить и применить (возвращает новые), profile — для вида по умолчанию
export function createFxPanel({ get, set, profile }) {
  let fx = normalizeFx(get()), mode = fx.mode || defaultFxMode(profile), sel = 0, eq = null;
  const bands = () => (mode === 'adv' ? fx.adv : fx.simple);
  const save = (patch = {}) => { fx = normalizeFx(set({ ...fx, ...patch }) || { ...fx, ...patch }); };
  const slider = (k, lab, v, min, max, step, txt) => '<div class="cell"><span class="fxl">' + esc(lab) + '</span><input type="range" class="fxr" data-fxs="' + k + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + v + '" aria-label="' + esc(lab) + '"><b class="num fxv" data-fxv="' + k + '">' + txt + '</b></div>';
  const bandChip = (b, i) => '<button type="button" class="fxb' + (i === sel ? ' on' : '') + (b.on ? '' : ' off') + '" data-band="' + i + '" style="--c:' + BAND_COLORS[b.type] + '" aria-pressed="' + (i === sel) + '">' + (i + 1) + ' · ' + fmtFreq(b.f) + '</button>';
  const bandRow = () => {
    const bs = bands(), b = bs[sel] || bs[0];
    if (!b) return '';
    return '<div class="fxbands">' + bs.map(bandChip).join('') + (bs.length < BANDS_MAX ? '<button type="button" class="fxb add" data-band-add aria-label="' + esc(t('fx.add')) + '">+</button>' : '') + '</div>' +
      '<div class="group">' +
      '<div class="cell"><span class="grow" data-bandinfo>' + esc(t('fx.band', { n: sel + 1 })) + ' · ' + fmtFreq(b.f) + (isCut(b) ? '' : ' · ' + dbs(b.g)) + '</span>' + sw('bandon', b.on, t('fx.on')) + '</div>' +
      '<div class="cell fxtypes">' + seg('btype', EQ_TYPES.map((k) => [k, t('fx.t.' + k)]), b.type, t('fx.type')) + '</div>' +
      slider('q', t('fx.q'), b.q, Q_MIN, Q_MAX, 0.05, b.q.toFixed(2)) +
      (bs.length > 1 ? '<button class="cell danger" data-band-del>' + esc(t('fx.remove')) + '</button>' : '') +
      '</div>';
  };

  const html = () =>
    '<div class="fxhead">' + seg('fxmode', [['simple', t('fx.simple')], ['adv', t('fx.adv')]], mode, t('fx.view')) + '</div>' +
    '<canvas class="fxcv" data-eq tabindex="0" aria-label="' + esc(t('fx.eq')) + '"></canvas>' +
    '<p class="ftr">' + esc(t(mode === 'adv' ? 'fx.hintAdv' : 'fx.hintSimple')) + '</p>' +
    (mode === 'adv' ? bandRow() : '') +
    '<div class="hdr">' + esc(t('fx.fx')) + '</div><div class="group">' +
    slider('comp', t('fx.comp'), fx.comp, 0, 1, 0.05, pc(fx.comp)) + slider('drive', t('fx.drive'), fx.drive, 0, 1, 0.05, pc(fx.drive)) +
    slider('trem', t('fx.trem'), fx.trem, 0, 1, 0.05, pc(fx.trem)) +
    (mode === 'adv' ? slider('tremRate', t('fx.tremRate'), fx.tremRate, 0.5, 12, 0.1, fx.tremRate + ' ' + t('fx.hz')) : '') +
    slider('delay', t('fx.delay'), fx.delay, 0, 1, 0.05, pc(fx.delay)) +
    (mode === 'adv' ? slider('delayTime', t('fx.delayTime'), fx.delayTime, 0.05, 1.5, 0.01, Math.round(fx.delayTime * 1000) + ' ' + t('fx.ms')) + slider('delayFb', t('fx.delayFb'), fx.delayFb, 0, 0.9, 0.05, pc(fx.delayFb)) : '') +
    slider('chorus', t('fx.chorus'), fx.chorus, 0, 1, 0.05, pc(fx.chorus)) +
    '<div class="cell fxtypes">' + seg('ctype', CHORUS_TYPES.map((k) => [k, t('fx.ct.' + k)]), fx.chorusType || 'chorus', t('fx.chorusType')) + '</div></div>' +
    '<div class="hdr">' + esc(t('fx.rev')) + '</div><div class="group">' +
    slider('rev', t('fx.rev'), fx.rev, 0, 1, 0.05, pc(fx.rev)) +
    '<div class="cell fxtypes">' + seg('revtype', REV_TYPES.map((k) => [k, t('fx.rt.' + k)]), fx.revType, t('fx.revType')) + '</div></div>' +
    '<div class="group" style="margin-top:14px"><button class="cell act" data-fx-reset>' + esc(t('fx.reset')) + '</button></div>';

  function bind(el, api) {
    const mount = () => {
      const cv = el.querySelector('canvas[data-eq]');
      if (!cv || cv.dataset.bound) return; // хозяин может звать mount() после каждой перерисовки
      cv.dataset.bound = '1';
      eq = eqCanvas(cv, {
        get: bands, simple: mode !== 'adv',
        onChange: () => { save(mode === 'adv' ? { adv: bands() } : { simple: bands() }); refreshBand(); },
        onSelect: (i) => { sel = i; refreshBand(); },
      });
      eq.select(sel);
    };
    const refreshBand = () => { // выбранная полоса: фишки, подписи, тип, ширина, выключатель — без перерисовки шторки
      const bs = bands(), b = bs[sel];
      if (!b || mode !== 'adv') return;
      el.querySelectorAll('.fxb[data-band]').forEach((c, i) => {
        c.textContent = (i + 1) + ' · ' + fmtFreq(bs[i].f);
        c.classList.toggle('on', i === sel); c.classList.toggle('off', !bs[i].on);
        c.style.setProperty('--c', BAND_COLORS[bs[i].type]); c.setAttribute('aria-pressed', i === sel);
      });
      const g = el.querySelector('[data-bandinfo]'), q = el.querySelector('[data-fxs="q"]'), qv = el.querySelector('[data-fxv="q"]'), on = el.querySelector('[data-sw="bandon"]');
      if (g) g.textContent = t('fx.band', { n: sel + 1 }) + ' · ' + fmtFreq(b.f) + (isCut(b) ? '' : ' · ' + dbs(b.g));
      if (q) q.value = b.q;
      if (qv) qv.textContent = b.q.toFixed(2);
      if (on) on.checked = !!b.on;
      el.querySelectorAll('[data-seg="btype"] [data-v]').forEach((x) => x.setAttribute('aria-pressed', x.dataset.v === b.type));
    };
    const rerender = () => { api.update(); mount(); };
    mount();
    el.addEventListener('input', (e) => {
      const s = e.target.closest('[data-fxs]');
      if (!s) return;
      const k = s.dataset.fxs, v = +s.value, lab = el.querySelector('[data-fxv="' + k + '"]');
      if (k === 'q') { const b = bands()[sel]; if (!b) return; b.q = v; save({ adv: bands() }); if (lab) lab.textContent = v.toFixed(2); eq && eq.draw(); return; }
      save({ [k]: v });
      if (lab) lab.textContent = k === 'delayTime' ? Math.round(v * 1000) + ' ' + t('fx.ms') : k === 'tremRate' ? v + ' ' + t('fx.hz') : pc(v);
    });
    el.addEventListener('change', (e) => {
      if (e.target.dataset && e.target.dataset.sw === 'bandon') { const b = bands()[sel]; if (!b) return; b.on = e.target.checked; save({ adv: bands() }); refreshBand(); eq && eq.draw(); }
    });
    el.addEventListener('click', (e) => {
      const g = (s) => e.target.closest(s);
      let b;
      if ((b = g('[data-seg="fxmode"] [data-v]'))) { mode = b.dataset.v; sel = 0; save({ mode }); rerender(); return; }
      if ((b = g('[data-seg="revtype"] [data-v]'))) { save({ revType: b.dataset.v }); el.querySelectorAll('[data-seg="revtype"] [data-v]').forEach((x) => x.setAttribute('aria-pressed', x === b)); return; }
      if ((b = g('[data-seg="ctype"] [data-v]'))) { save({ chorusType: b.dataset.v }); el.querySelectorAll('[data-seg="ctype"] [data-v]').forEach((x) => x.setAttribute('aria-pressed', x === b)); return; }
      if ((b = g('[data-seg="btype"] [data-v]'))) { const bd = bands()[sel]; if (!bd) return; bd.type = b.dataset.v; if (isCut(bd)) bd.g = 0; save({ adv: bands() }); refreshBand(); eq && eq.draw(); return; }
      if ((b = g('[data-band]'))) { sel = +b.dataset.band; refreshBand(); eq && eq.select(sel); return; }
      if (g('[data-band-add]')) {
        const bs = bands();
        if (bs.length >= BANDS_MAX) return;
        bs.push({ type: 'peaking', f: 2000, g: 0, q: 1, on: true });
        sel = bs.length - 1; save({ adv: bs }); rerender(); return;
      }
      if (g('[data-band-del]')) { const bs = bands(); if (bs.length <= 1) return; bs.splice(sel, 1); sel = Math.max(0, sel - 1); save({ adv: bs }); rerender(); return; }
      if (g('[data-fx-reset]')) { sel = 0; save({ ...normalizeFx(null), mode }); rerender(); }
    });
    return { mount }; // хозяин шторки зовёт mount() после своего api.update()
  }
  return { html, bind, get fx() { return fx; } };
}
