// Глайдер — бесладовая клавиатура: по горизонтали высота (плавно, как на скрипке или безладовом грифе),
// по вертикали — выбранный эффект (яркость, вибрато, громкость, тремоло). До пяти пальцев сразу.
// Привязка: без ладов, магнит (тянет к нотам, но между ними можно скользить) или только ноты.
// Звукоряд — хроматика или лад от любой тоники; диапазон — от ноты и ширина (шире — больше нот, но меньше места на ноту).
// Звук — как у пианино приложения (или любой его пресет).
import './glider.css';
import ru from './i18n/ru.json';
import uz from './i18n/uz.json';
import en from './i18n/en.json';
import { PRESETS } from '../../audio/synth.js';
import { mName, SH } from '../../music/notes.js';
import { SCALE_TYPES } from '../../music/theory.js';
import { SNAPS, WIDTHS, allowedPcs, posToMidi, midiToPos, snapPitch, nearest, clampLo } from './scale.js';
import { createGlideVoice, FX } from './voice.js';

const ICON = '<svg viewBox="0 0 24 24"><path d="M3 17c3 0 4-10 9-10s6 6 9 6"/><circle cx="12" cy="7" r="1.6" fill="currentColor"/></svg>';
const I = {
  left: '<svg viewBox="0 0 24 24"><path d="M14.5 6l-6 6 6 6"/></svg>',
  right: '<svg viewBox="0 0 24 24"><path d="M9.5 6l6 6-6 6"/></svg>',
};
const MAX_TOUCH = 5, SOUNDS = ['app', ...Object.keys(PRESETS)]; // app — как сейчас настроено пианино
const BLACK = [1, 3, 6, 8, 10];

let host = null, ctx = null, size = 'full', ro = null, probed = false;
const offs = [], touches = new Map(); // pointerId → { voice, el, m }

const cfg = () => {
  const s = ctx.store.all();
  s.sound ??= 'app'; s.hold ??= true; s.snap ??= 'magnet'; s.port ??= 60; s.scale ??= 'chrom'; s.root ??= 0;
  s.fx ??= 'bright'; s.labels ??= true;
  s.width ??= 12; s.lo ??= 60; // октава C4–C5: на телефоне по ширине в самый раз
  if (!WIDTHS.includes(s.width)) s.width = 12;
  s.lo = clampLo(s.lo, s.width);
  return s;
};
const save = () => ctx.store.save();
const rangeTxt = (s) => mName(s.lo) + '–' + mName(s.lo + s.width);
const patch = (s) => (s.sound === 'app' ? ctx.audio.pianoPatch() : PRESETS[s.sound] || PRESETS.sine);

/* ---------- разметка ---------- */

function padHTML(s) {
  const pcs = allowedPcs(s), W = s.width + 1;
  let cols = '', lines = '';
  for (let m = s.lo; m <= s.lo + s.width; m++) {
    const pc = ((m % 12) + 12) % 12, inSc = !pcs || pcs.includes(pc), root = pcs ? pc === s.root : pc === 0;
    cols += '<i class="glk' + (BLACK.includes(pc) ? ' b' : '') + (inSc ? '' : ' off') + '" style="left:' + ((m - s.lo) / W) * 100 + '%;width:' + 100 / W + '%"></i>';
    const x = midiToPos(m, s.lo, s.width);
    if (inSc) lines += '<i class="gll' + (root ? ' root' : '') + (pc === 0 ? ' c' : '') + (x < 0.04 ? ' el' : x > 0.96 ? ' er' : '') + '" style="left:' + x * 100 + '%">' + (s.labels ? '<b>' + mName(m) + '</b>' : '') + '</i>';
  }
  return '<div class="glpad" id="glpad" role="application" aria-roledescription="' + ctx.t('padRole') + '" aria-label="' + ctx.t('padAria', { range: rangeTxt(s), fx: ctx.t('fx.' + s.fx) }) + '">' +
    cols + lines + '<span class="glaxis" aria-hidden="true">↑ ' + ctx.t('fx.' + s.fx) + '</span><div id="gltouch"></div></div>';
}

function view() {
  const { t, ui } = ctx, s = cfg(), full = size === 'full', big = full || size === 'half';
  const note = '<div class="glread" aria-live="off"><b class="num" id="glnote">—</b><span class="num l2" id="glc"></span></div>';
  if (size === 'strip') return '<div class="gl strip">' + padHTML(s) + '<button class="ic sm glgear" data-x="gset" aria-label="' + t('settings') + '">' + ui.icons.gear + '</button></div>';
  const range = '<div class="glrange">' + ui.icb('data-x="glo" data-d="-12"', I.left, t('octDown'), 'sm') + '<span class="num">' + rangeTxt(s) + '</span>' + ui.icb('data-x="glo" data-d="12"', I.right, t('octUp'), 'sm') + '</div>';
  const bar = '<div class="glbar">' + note + (big ? range : '') + ui.icb('data-x="gset"', ui.icons.gear, t('settings'), 'sm') + '</div>';
  const snap = full ? ui.seg('gsnap', SNAPS.map((k) => [k, t('snap.' + k)]), s.snap, t('snap')) : '';
  return '<div class="gl ' + size + '">' + bar + snap + padHTML(s) + '</div>';
}

function render() {
  if (!host) return;
  releaseAll();
  host.innerHTML = view();
  dense();
}

// Мало места между подписями — подписываем только «до» и тонику (в ладу нот меньше — места больше)
function dense() {
  const p = host && host.querySelector('#glpad'), s = cfg(), pcs = allowedPcs(s);
  if (!p) return;
  const per = p.clientWidth / (s.width + 1), gap = pcs ? Math.min(...pcs.map((x) => pcs.map((y) => (y - x + 12) % 12).filter(Boolean)).flat()) : 1;
  p.classList.toggle('dense', per * gap < 28);
}

/* ---------- игра ---------- */

function show(m) {
  const n = host && host.querySelector('#glnote'), c = host && host.querySelector('#glc');
  if (!n) return;
  const { n: k, cents } = nearest(m);
  n.textContent = mName(k);
  if (c) c.textContent = cfg().snap === 'note' ? '' : (cents > 0 ? '+' : cents < 0 ? '−' : '±') + Math.abs(cents) + '¢';
}

function place(tc, x, y) {
  tc.el.style.left = x * 100 + '%';
  tc.el.style.top = (1 - y) * 100 + '%';
}

function at(e, pad) {
  const r = pad.getBoundingClientRect(), s = cfg();
  const x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), y = Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height));
  const m = snapPitch(posToMidi(x, s.lo, s.width), s.snap, allowedPcs(s));
  return { x: midiToPos(m, s.lo, s.width), y, m };
}

const tau = (s) => (s.snap === 'note' ? Math.max(0.004, s.port / 3000) : s.snap === 'magnet' ? 0.015 : 0.008);

function down(e) {
  const pad = e.target.closest('#glpad');
  if (!pad || touches.size >= MAX_TOUCH) return;
  e.preventDefault();
  if (!ctx.audio.unlock()) { ctx.ui.toast(ctx.t('noAudio')); return; }
  try { pad.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  const s = cfg(), p = patch(s), dest = ctx.audio.bus('piano');
  if (!dest) return;
  ctx.audio.mixer.setReverb('piano', (p.rev || 0) * 0.9);
  const a = at(e, pad), voice = createGlideVoice(dest.context, dest, p, { hold: s.hold, a4: ctx.audio.mf(69) });
  voice.start(a.m, s.fx, a.y);
  const el = document.createElement('i');
  el.className = 'gltc';
  host.querySelector('#gltouch').appendChild(el);
  const tc = { voice, el, m: a.m };
  touches.set(e.pointerId, tc);
  place(tc, a.x, a.y);
  show(a.m);
}

function move(e) {
  const tc = touches.get(e.pointerId), pad = host && host.querySelector('#glpad');
  if (!tc || !pad) return;
  const s = cfg(), a = at(e, pad);
  if (a.m !== tc.m) { tc.voice.pitch(a.m, tau(s)); tc.m = a.m; show(a.m); }
  tc.voice.fx(s.fx, a.y);
  place(tc, a.x, a.y);
}

function up(e) {
  const tc = touches.get(e.pointerId);
  if (!tc) return;
  tc.voice.release();
  tc.el.classList.add('out');
  setTimeout(() => tc.el.remove(), 260);
  touches.delete(e.pointerId);
}

function releaseAll() {
  touches.forEach((tc) => { tc.voice.release(); tc.el.remove(); });
  touches.clear();
}

/* ---------- настройки ---------- */

function setSheet() {
  const { t, ui } = ctx;
  const body = () => {
    const s = cfg(), chrom = s.scale === 'chrom';
    return ui.snav(t('settings')) +
      '<div class="hdr" style="margin-top:4px">' + t('sound') + '</div><div class="group"><div class="cellcol"><div class="glchips">' +
      SOUNDS.map((k) => '<button class="lchip pick glck' + (s.sound === k ? ' on' : '') + '" data-gs="' + k + '" aria-pressed="' + (s.sound === k) + '" style="--c:var(--tint);--t:var(--on-tint)">' + t('pre.' + k) + '</button>').join('') +
      '</div></div><div class="cell"><span class="grow">' + t('hold') + '</span>' + ui.sw('ghold', s.hold, t('hold')) + '</div></div><p class="ftr">' + t('soundHint') + '</p>' +
      '<div class="hdr">' + t('snap') + '</div><div class="group"><div class="cellcol">' + ui.seg('gsnap', SNAPS.map((k) => [k, t('snap.' + k)]), s.snap, t('snap')) +
      '<div class="segcap">' + t('snapHint.' + s.snap) + '</div></div>' +
      (s.snap === 'note' ? '<div class="cellcol"><div class="l2" style="font-size:13px;margin-bottom:6px">' + t('port') + '</div>' + ui.seg('gport', [[0, t('port0')], [60, '60 ' + t('ms')], [150, '150 ' + t('ms')], [300, '300 ' + t('ms')]], s.port, t('port')) + '</div>' : '') + '</div>' +
      '<div class="hdr">' + t('notes') + '</div><div class="group"><div class="cellcol"><select class="sortsel glsel" data-gsc aria-label="' + t('notes') + '"><option value="chrom"' + (chrom ? ' selected' : '') + '>' + t('chrom') + '</option>' +
      SCALE_TYPES.map((k) => '<option value="' + k + '"' + (s.scale === k ? ' selected' : '') + '>' + t('scale.' + k) + '</option>').join('') + '</select>' +
      (chrom ? '' : '<div class="l2" style="font-size:13px;margin:10px 0 6px">' + t('root') + '</div><div class="glroots">' + SH.map((n, i) => '<button class="lchip pick glck' + (s.root === i ? ' on' : '') + '" data-gr="' + i + '" aria-pressed="' + (s.root === i) + '" style="--c:var(--tint);--t:var(--on-tint)">' + n + '</button>').join('') + '</div>') +
      '</div></div>' +
      '<div class="hdr">' + t('range') + '</div><div class="group"><div class="cell"><span class="grow">' + t('from') + '</span>' + ui.icb('data-glo2="-1"', I.left, t('lower'), 'sm') + '<b class="num glv">' + mName(s.lo) + '</b>' + ui.icb('data-glo2="1"', I.right, t('higher'), 'sm') + '</div>' +
      '<div class="cellcol"><div class="l2" style="font-size:13px;margin-bottom:6px">' + t('width') + ' · ' + rangeTxt(s) + '</div>' + ui.seg('gw', WIDTHS.map((w) => [w, t('w.' + w)]), s.width, t('width')) + '</div></div><p class="ftr">' + t('widthHint') + '</p>' +
      '<div class="hdr">' + t('vertical') + '</div><div class="group"><div class="cellcol">' + ui.seg('gfx', FX.map((k) => [k, t('fx.' + k)]), s.fx, t('vertical')) + '<div class="segcap">' + t('fxHint.' + s.fx) + '</div></div>' +
      '<div class="cell"><span class="grow">' + t('labels') + '</span>' + ui.sw('glab', s.labels, t('labels')) + '</div></div>';
  };
  ui.sheet(body, (el, sh) => {
    const done = () => { save(); sh.update(); render(); };
    el.addEventListener('click', (e) => {
      const s = cfg(), g = (q) => e.target.closest(q);
      let b;
      if ((b = g('[data-gs]'))) s.sound = b.dataset.gs;
      else if ((b = g('[data-gr]'))) s.root = +b.dataset.gr;
      else if ((b = g('[data-glo2]'))) s.lo = clampLo(s.lo + +b.dataset.glo2, s.width);
      else if ((b = g('[data-seg] [data-v]'))) {
        const k = b.closest('[data-seg]').dataset.seg, v = b.dataset.v;
        if (k === 'gsnap') s.snap = v;
        else if (k === 'gport') s.port = +v;
        else if (k === 'gw') { s.width = +v; s.lo = clampLo(s.lo, s.width); }
        else if (k === 'gfx') s.fx = v;
        else return;
      } else return;
      done();
    });
    el.addEventListener('change', (e) => {
      const s = cfg();
      if (e.target.dataset.sw === 'ghold') s.hold = e.target.checked;
      else if (e.target.dataset.sw === 'glab') s.labels = e.target.checked;
      else if (e.target.hasAttribute('data-gsc')) s.scale = e.target.value;
      else return;
      done();
    });
  });
}

function bind() {
  const on = (el, ev, fn, o) => { el.addEventListener(ev, fn, o); offs.push(() => el.removeEventListener(ev, fn, o)); };
  on(host, 'pointerdown', down);
  on(window, 'pointermove', move, { passive: true });
  on(window, 'pointerup', up);
  on(window, 'pointercancel', up);
  // браузер не должен прокручивать и масштабировать, пока играешь
  on(host, 'touchmove', (e) => { if (e.target.closest('#glpad')) e.preventDefault(); }, { passive: false });
  on(host, 'contextmenu', (e) => { if (e.target.closest('#glpad')) e.preventDefault(); });
  on(host, 'click', (e) => {
    const b = e.target.closest('[data-x], [data-seg="gsnap"] [data-v]');
    if (!b) return;
    const s = cfg();
    if (b.dataset.x === 'gset') { setSheet(); return; }
    if (b.dataset.x === 'glo') s.lo = clampLo(s.lo + +b.dataset.d, s.width);
    else if (b.dataset.v) s.snap = b.dataset.v;
    save();
    render();
  });
}

export default {
  id: 'glider',
  order: 35,
  name: { ru: ru.name, uz: uz.name, en: en.name },
  i18n: { ru, uz, en },
  icon: ICON,
  color: '#AF52DE',
  sizes: ['full', 'half', 'quarter', 'strip'],
  status(c) {
    const s = c.store.all(), lo = s.lo ?? 60, w = s.width ?? 12;
    return mName(lo) + '–' + mName(lo + w) + ' · ' + c.t('snap.' + (s.snap || 'magnet'));
  },
  mount(el, c, sz = 'full') {
    host = el; ctx = c; size = sz;
    // Пока звучит глайдер, шина пианино в микшере подсвечена
    if (!probed) { c.audio.mixer.probe('piano', () => touches.size > 0); probed = true; }
    render();
    bind();
    ro = new ResizeObserver(() => dense());
    ro.observe(host);
  },
  resize(sz) { size = sz; render(); },
  unmount() {
    ro && ro.disconnect();
    offs.splice(0).forEach((f) => f());
    releaseAll();
    host = null;
  },
};
