// Микшер сбоку экрана: язычок справа появляется, когда что-то звучит; потянуть или нажать — пять ползунков
// (клик, пианино, пэды и дрон, медиа, теория и слух), нажатие на значок — выключить звук источника.
// Перенесено из legacy/practice.html (MIXSRC, mxFader, mxInit, mxSet, mxOpen, mxTick).
import { t } from '../../i18n/index.js';
import { esc } from '../../ui/index.js';
import { MIX_MAX } from '../../audio/mixer.js';
import { moduleById } from '../../modules/index.js';

const SRC = [['metro', '#FF9500', 'metro'], ['piano', '#5856D6', 'piano'], ['drone', '#30B0C7', 'drone'], ['media', '#FF2D55', 'audio'], ['theory', '#34C759', 'ear']];

export function createMixerDrawer(app) {
  const mixer = app.audio.mixer;
  let open = false, el = null, drag = null, sw = null;
  const raw = (k) => { const v = mixer.state[k === 'media' ? 'audio' : k]; return v == null ? 1 : v; };
  const muted = (k) => !!(mixer.state.mute || {})[k === 'media' ? 'audio' : k];

  const fader = ([k, c, icon]) => {
    const v = raw(k), mu = muted(k), lab = t('mix.' + k), pct = Math.round(v * 100);
    return '<div class="mxf' + (mu ? ' mu' : '') + '" data-k="' + k + '" style="--c:' + c + '"><span class="mxv num">' + (mu ? '0' : pct) + '</span>' +
      '<div class="mxt" role="slider" aria-label="' + esc(t('mix.volume', { src: lab })) + '" aria-valuemin="0" aria-valuemax="' + MIX_MAX * 100 + '" aria-valuenow="' + pct + '" tabindex="0">' +
      '<b style="height:' + (v / MIX_MAX) * 100 + '%"></b><i style="bottom:' + (v / MIX_MAX) * 100 + '%"></i><em style="bottom:' + (1 / MIX_MAX) * 100 + '%"></em></div>' +
      '<button class="mxi" data-mute="' + k + '" aria-label="' + esc(t(mu ? 'mix.unmute' : 'mix.mute', { src: lab })) + '" title="' + esc(lab) + '">' + (moduleById(icon) || {}).icon + '</button></div>';
  };
  const render = () => { el.querySelector('.mxp').innerHTML = SRC.map(fader).join(''); tick(); };
  const setOpen = (o) => { open = o; el.classList.toggle('open', o); el.querySelector('.mxh').setAttribute('aria-expanded', o); if (o) render(); };

  function tick() {
    let any = false;
    SRC.forEach(([k]) => {
      const a = mixer.isActive(k);
      any = any || a;
      const f = el.querySelector('.mxf[data-k="' + k + '"]');
      if (f) f.classList.toggle('act', a);
    });
    el.classList.toggle('show', any || open);
    el.classList.toggle('live', any);
  }

  function setFrom(d, y) {
    const r = d.tr.getBoundingClientRect(), v = Math.max(0, Math.min(MIX_MAX, (1 - (y - r.top) / r.height) * MIX_MAX));
    mixer.set(d.k, v);
    const now = raw(d.k), f = d.tr.parentNode;
    f.classList.remove('mu');
    d.tr.querySelector('b').style.height = (now / MIX_MAX) * 100 + '%';
    d.tr.querySelector('i').style.bottom = (now / MIX_MAX) * 100 + '%';
    f.querySelector('.mxv').textContent = Math.round(now * 100);
    d.tr.setAttribute('aria-valuenow', Math.round(now * 100));
  }

  el = document.createElement('div');
  el.id = 'mixd';
  el.innerHTML = '<button class="mxh" aria-label="' + esc(t('mix.aria')) + '" aria-expanded="false"><i></i><i></i><i></i></button><div class="mxp" role="group" aria-label="' + esc(t('mix.title')) + '"></div>';
  document.body.appendChild(el);
  render();

  // Язычок: нажать — открыть или закрыть; провести влево — открыть, вправо — закрыть
  const hd = el.querySelector('.mxh');
  let sx = null, moved = false;
  hd.addEventListener('pointerdown', (e) => { sx = e.clientX; moved = false; hd.setPointerCapture(e.pointerId); });
  hd.addEventListener('pointermove', (e) => {
    if (sx == null) return;
    const dx = e.clientX - sx;
    if (Math.abs(dx) > 14) { moved = true; if (dx < 0 && !open) setOpen(true); if (dx > 0 && open) setOpen(false); sx = null; }
  });
  hd.addEventListener('pointerup', () => { if (sx != null && !moved) setOpen(!open); sx = null; });

  el.addEventListener('pointerdown', (e) => {
    const tr = e.target.closest('.mxt');
    if (tr) { e.preventDefault(); drag = { tr, k: tr.parentNode.dataset.k, id: e.pointerId }; tr.setPointerCapture(e.pointerId); setFrom(drag, e.clientY); return; }
    if (el.querySelector('.mxp').contains(e.target) && !e.target.closest('.mxi')) sw = { x: e.clientX };
  });
  el.addEventListener('pointermove', (e) => {
    if (drag && e.pointerId === drag.id) { setFrom(drag, e.clientY); return; }
    if (sw && e.clientX - sw.x > 40) { sw = null; setOpen(false); }
  });
  el.addEventListener('pointerup', () => { drag = null; sw = null; });
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-mute]');
    if (!b) return;
    mixer.toggleMute(b.dataset.mute);
    render();
  });
  el.addEventListener('keydown', (e) => {
    const tr = e.target.closest('.mxt');
    if (!tr) return;
    const k = tr.parentNode.dataset.k;
    let v = raw(k);
    if (e.key === 'ArrowUp') v += 0.05;
    else if (e.key === 'ArrowDown') v -= 0.05;
    else return;
    e.preventDefault();
    mixer.set(k, v);
    render();
    el.querySelector('.mxf[data-k="' + k + '"] .mxt').focus();
  });
  document.addEventListener('pointerdown', (e) => { if (open && !el.contains(e.target)) setOpen(false); }, true);
  setInterval(tick, 350);
  return { render };
}
