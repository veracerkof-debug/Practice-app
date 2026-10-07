// Терменвокс: играют руками перед камерой. Рука высоты (по умолчанию правая): выше — выше звук, ближе к краю кадра —
// ярче (характер). Другая рука — эффекты: выше — сильнее (как вертикаль глайдера), кулак — тишина, раскрытая ладонь — звук.
// Звук — движок глайдера (тот же голос, эффекты, привязка к нотам и лады) и его шина в микшере.
// Камера — только на устройстве (hands.js): изображение не сохраняется и никуда не отправляется.
// Отдельный модуль: сборку можно выпустить и без него (распознаванию рук нужна готовая модель — см. DECISIONS.md).
import '../glider/glider.css'; // общие с глайдером панель, нота и настройки
import './theremin.css';
import ru from './i18n/ru.json';
import uz from './i18n/uz.json';
import en from './i18n/en.json';
import el from './i18n/el.json';
import { PRESETS as SYN } from '../../audio/synth.js';
import { mName, SH } from '../../music/notes.js';
import { SCALE_TYPES } from '../../music/theory.js';
import { SNAPS, WIDTHS, allowedPcs, posToMidi, midiToPos, snapPitch, nearest, clampLo, notesIn } from '../glider/scale.js';
import { createGlideVoice, createFxBus } from '../glider/voice.js';
import { normalizeFx, voiceFx, busFx, applyPreset, PRESETS } from '../glider/fx.js';
import { assign, openness, heightOf, characterOf, oneEuro, EDGE } from './map.js';
import { startHands } from './hands.js';

const ICON = '<svg viewBox="0 0 24 24"><path d="M7 21V11.5a1.5 1.5 0 0 1 3 0V9a1.5 1.5 0 0 1 3 0v1a1.5 1.5 0 0 1 3 0v1.5a1.5 1.5 0 0 1 3 0V16a5 5 0 0 1-5 5z"/><path d="M3 7c1.5-2 3-2 4.5 0S10.5 9 12 7s3-2 4.5 0"/></svg>';
const I = {
  left: '<svg viewBox="0 0 24 24"><path d="M14.5 6l-6 6 6 6"/></svg>',
  right: '<svg viewBox="0 0 24 24"><path d="M9.5 6l6 6-6 6"/></svg>',
  cam: '<svg viewBox="0 0 24 24"><path d="M3 8h3l2-2.5h8L18 8h3v11H3z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  camOff: '<svg viewBox="0 0 24 24"><path d="M3 8h3l2-2.5h8L18 8h3v11H3z"/><path d="M4 4l16 16"/></svg>',
};
const SOUNDS = ['app', ...Object.keys(SYN)];
const LOST_MS = 180; // рука пропала из кадра на мгновение — звук не обрывается

let host = null, ctx = null, size = 'full', ro = null, probed = false;
const offs = [];
// состояние живёт между перерисовками окна
const S = { cam: null, state: 'off', err: '', voice: null, bus: null, seen: 0, hands: { pitch: null, fx: null }, m: null,
  fPos: oneEuro(), fFx: oneEuro({ minCutoff: 0.8, beta: 0.3 }), fOpen: oneEuro({ minCutoff: 2, beta: 0.2 }), fChar: oneEuro({ minCutoff: 1, beta: 0.2 }) };

const cfg = () => {
  const s = ctx.store.all();
  s.sound ??= 'app'; s.snap ??= 'magnet'; s.scale ??= 'chrom'; s.root ??= 0; s.side ??= 'right'; s.charX ??= true; s.showCam ??= true;
  s.width ??= 12; s.lo ??= 60;
  if (!WIDTHS.includes(s.width)) s.width = 12;
  s.lo = clampLo(s.lo, s.width);
  if (!s.fx) s.fx = applyPreset('violin'); // поющий звук с вибрато — ближе всего к терменвоксу
  normalizeFx(s);
  return s;
};
const save = () => ctx.store.save();
const rangeTxt = (s) => mName(s.lo) + '–' + mName(s.lo + s.width);
const patch = (s) => (s.sound === 'app' ? ctx.audio.pianoPatch() : SYN[s.sound] || SYN.sine);

/* ---------- разметка ---------- */

function view() {
  const { t, ui } = ctx, s = cfg(), big = size === 'full' || size === 'half', on = S.state === 'on';
  const gear = ui.icb('data-x="tset"', ui.icons.gear, t('settings'), 'sm');
  const camBtn = ui.icb('data-x="tcam"', on || S.state === 'loading' ? I.camOff : I.cam, t(on || S.state === 'loading' ? 'stop' : 'start'), 'sm');
  const range = big ? '<div class="glrange">' + ui.icb('data-x="tlo" data-d="-12"', I.left, t('octDown'), 'sm') + '<span class="num">' + rangeTxt(s) + '</span>' + ui.icb('data-x="tlo" data-d="12"', I.right, t('octUp'), 'sm') + '</div>' : '';
  const snap = big ? '<button class="glsnap" data-x="tsnap" aria-label="' + ui.esc(t('snapBtn', { mode: t('snap.' + s.snap) })) + '">' + t('snap.' + s.snap) + '</button>' : '';
  let mid = '';
  if (S.state === 'off' || S.state === 'error') {
    mid = '<div class="tmstart">' + (S.state === 'error' ? '<p class="tmerr">' + t('err.' + S.err) + '</p>' : '') +
      '<button class="btn fill" data-x="tcam">' + I.cam + '<span>' + t('start') + '</span></button>' +
      (size !== 'strip' && size !== 'quarter' ? '<p class="tmhint">' + t('hint.' + s.side) + '</p><p class="tmpriv">' + t('privacy') + '</p>' : '') + '</div>';
  } else if (S.state === 'loading') mid = '<div class="tmstart"><p class="tmhint">' + t('loading') + '</p></div>';
  return '<div class="tm ' + size + (s.showCam ? '' : ' nocam') + '"><video class="tmcam" playsinline muted aria-hidden="true"></video><canvas class="tmcv" aria-hidden="true"></canvas>' +
    '<div class="glnote tmnote" aria-live="off"><b class="num" id="tmnote">' + (on ? '—' : '') + '</b><span class="num" id="tmc"></span></div>' +
    '<span class="tmlost" id="tmlost" hidden>' + t('noHands') + '</span>' + mid +
    '<div class="glov tmbar">' + (size === 'strip' ? '' : range + snap) + camBtn + gear + '</div></div>';
}

function render() {
  if (!host) return;
  // видео с потоком камеры переносится в новую разметку, чтобы картинка не мигала
  const oldV = host.querySelector('video.tmcam');
  host.innerHTML = view();
  if (oldV && oldV.srcObject) { const v = host.querySelector('video.tmcam'); v.replaceWith(oldV); }
  draw();
}

/* ---------- рисунок поверх кадра: линии нот и точки рук ---------- */

// Кадр показывается «по размеру окна с обрезкой» — пересчёт долей кадра в точки окна
function frameMap(W, H) {
  const v = host && host.querySelector('video.tmcam'), vw = (v && v.videoWidth) || 4, vh = (v && v.videoHeight) || 3;
  const k = Math.max(W / vw, H / vh), dw = vw * k, dh = vh * k;
  return { x: (x) => x * dw - (dw - W) / 2, y: (y) => y * dh - (dh - H) / 2 };
}

function draw() {
  const cv = host && host.querySelector('canvas.tmcv');
  if (!cv) return;
  const W = cv.clientWidth, H = cv.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
  if (!W || !H) return;
  if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  if (S.state !== 'on') return;
  const s = cfg(), pcs = allowedPcs(s), map = frameMap(W, H), css = getComputedStyle(host.querySelector('.tm') || host);
  const ink = css.getPropertyValue('--ink').trim() || '#000', tint = css.getPropertyValue('--tint').trim() || '#AF52DE';
  // линии нот: высота руки → нота (снизу вверх)
  const notes = notesIn(s.lo, s.width, pcs), yOf = (m) => map.y(EDGE + (1 - midiToPos(m, s.lo, s.width)) * (1 - 2 * EDGE));
  const gap = notes.length > 1 ? Math.abs(yOf(notes[0]) - yOf(notes[1])) : 99;
  const right = s.side === 'right';
  g.font = '600 11px system-ui, sans-serif';
  g.textBaseline = 'middle';
  g.textAlign = right ? 'right' : 'left';
  notes.forEach((m) => {
    const y = yOf(m), pc = ((m % 12) + 12) % 12, key = pcs ? pc === s.root : pc === 0;
    g.strokeStyle = ink; g.globalAlpha = key ? 0.35 : 0.14; g.lineWidth = key ? 1.5 : 1;
    g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
    if (gap >= 16 || key) { g.globalAlpha = key ? 0.9 : 0.6; g.fillStyle = key ? tint : ink; g.fillText(mName(m), right ? W - 8 : 8, y - 8); }
  });
  g.globalAlpha = 1;
  // руки: высота — цветом акцента, эффекты — цветом текста
  const dot = (h, col) => {
    if (!h) return;
    g.fillStyle = col;
    h.lm.forEach((p, i) => { g.globalAlpha = i === 0 || i % 4 === 0 ? 0.95 : 0.55; g.beginPath(); g.arc(map.x(p.x), map.y(p.y), i % 4 === 0 && i ? 4 : 3, 0, Math.PI * 2); g.fill(); });
    g.globalAlpha = 1;
  };
  dot(S.hands.pitch, tint);
  dot(S.hands.fx, ink);
  if (S.m != null) { // где сейчас звучит
    const y = map.y(EDGE + (1 - midiToPos(S.m, s.lo, s.width)) * (1 - 2 * EDGE));
    g.strokeStyle = tint; g.lineWidth = 2.5; g.globalAlpha = 0.8;
    g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
    g.globalAlpha = 1;
  }
}

/* ---------- звук ---------- */

function showNote(m) {
  const n = host && host.querySelector('#tmnote'), c = host && host.querySelector('#tmc');
  if (!n) return;
  if (m == null) { n.textContent = '—'; if (c) c.textContent = ''; n.parentNode.classList.remove('on'); return; }
  const { n: k, cents } = nearest(m);
  n.textContent = mName(k);
  n.parentNode.classList.add('on');
  if (c) c.textContent = cfg().snap === 'note' ? '' : (cents > 0 ? '+' : cents < 0 ? '−' : '±') + Math.abs(cents) + '¢';
}

function silence() {
  if (S.voice) { S.voice.release(); S.voice = null; }
  S.m = null;
  S.fPos.reset(); S.fChar.reset();
  showNote(null);
}

function onHands(list, t) {
  if (!host) return;
  const s = cfg(), a = assign(list, s.side);
  S.hands = a;
  const lost = host.querySelector('#tmlost');
  if (lost) lost.hidden = list.length > 0;
  if (a.pitch) S.seen = t;
  else if (t - S.seen > LOST_MS) silence();
  if (a.pitch) {
    const pos = S.fPos.next(heightOf(a.pitch.c.y), t), m = snapPitch(posToMidi(pos, s.lo, s.width), s.snap, allowedPcs(s));
    const effY = a.fx ? S.fFx.next(heightOf(a.fx.c.y), t) : 0, gate = a.fx ? S.fOpen.next(openness(a.fx.lm), t) : 1;
    const o = voiceFx(s.fx, effY);
    if (s.charX) o.bright = Math.max(o.bright || 0, S.fChar.next(characterOf(a.pitch.c.x, s.side), t));
    o.volGain = (o.volGain ?? 1) * Math.max(0, Math.min(1, gate));
    const dest = ctx.audio.bus('glider');
    if (dest) {
      if (!S.bus || S.bus.ctx !== dest.context) { S.bus = createFxBus(dest.context, dest); S.bus.ctx = dest.context; }
      if (!S.voice) {
        const p = patch(s);
        ctx.audio.mixer.setReverb('glider', (p.rev || 0) * 0.9);
        S.voice = createGlideVoice(dest.context, S.bus.input, p, { hold: true, a4: ctx.audio.mf(69) });
        S.voice.start(m, o);
      } else {
        S.voice.pitch(m, s.snap === 'note' ? 0.03 : 0.02);
        S.voice.fx(o);
      }
      S.bus.set(busFx(s.fx, [effY]));
    }
    if (S.m == null || Math.round(S.m) !== Math.round(m) || s.snap !== 'note') showNote(m);
    S.m = m;
  }
  draw();
}

async function camOn() {
  if (S.state === 'on' || S.state === 'loading') return;
  if (!ctx.audio.unlock()) { ctx.ui.toast(ctx.t('noAudio')); return; }
  S.state = 'loading';
  render();
  try {
    const v = host.querySelector('video.tmcam');
    S.cam = await startHands(v, onHands);
    if (!host) { camOff(); return; }
    S.state = 'on';
  } catch (e) {
    S.state = 'error';
    S.err = e.reason || 'fail';
  }
  render();
}

function camOff() {
  if (S.cam) { S.cam.stop(); S.cam = null; }
  silence();
  S.hands = { pitch: null, fx: null };
  if (S.state !== 'error') S.state = 'off';
}

/* ---------- настройки ---------- */

function setSheet() {
  const { t, ui } = ctx;
  const chip = (attr, on, label) => '<button class="lchip pick glck' + (on ? ' on' : '') + '" ' + attr + ' aria-pressed="' + on + '" style="--c:var(--tint);--t:var(--on-tint)">' + label + '</button>';
  const body = () => {
    const s = cfg(), chrom = s.scale === 'chrom';
    return ui.snav(t('settings')) +
      '<div class="hdr" style="margin-top:4px">' + t('hands') + '</div><div class="group"><div class="cellcol">' + ui.seg('tside', [['right', t('hand.right')], ['left', t('hand.left')]], s.side, t('hands')) +
      '<div class="segcap">' + t('hint.' + s.side) + '</div></div><div class="cell"><span class="grow">' + t('charX') + '</span>' + ui.sw('tchar', s.charX, t('charX')) + '</div></div><p class="ftr">' + t('charHint') + '</p>' +
      '<div class="hdr">' + t('effects') + '</div><div class="glpre" role="group" aria-label="' + t('presets') + '">' +
      Object.keys(PRESETS).map((k) => chip('data-tpre="' + k + '"', false, t('preset.' + k))).join('') + '</div><p class="ftr" style="margin-top:0">' + t('fxHint') + '</p>' +
      '<div class="hdr">' + t('sound') + '</div><div class="group"><div class="cellcol"><div class="glchips">' +
      SOUNDS.map((k) => chip('data-ts="' + k + '"', s.sound === k, t('pre.' + k))).join('') + '</div></div></div>' +
      '<div class="hdr">' + t('snap') + '</div><div class="group"><div class="cellcol">' + ui.seg('tsnap', SNAPS.map((k) => [k, t('snap.' + k)]), s.snap, t('snap')) +
      '<div class="segcap">' + t('snapHint.' + s.snap) + '</div></div></div>' +
      '<div class="hdr">' + t('notes') + '</div><div class="group"><div class="cellcol"><select class="sortsel glsel" data-tsc aria-label="' + t('notes') + '"><option value="chrom"' + (chrom ? ' selected' : '') + '>' + t('chrom') + '</option>' +
      SCALE_TYPES.map((k) => '<option value="' + k + '"' + (s.scale === k ? ' selected' : '') + '>' + t('scale.' + k) + '</option>').join('') + '</select>' +
      (chrom ? '' : '<div class="glsub" style="margin-top:10px">' + t('root') + '</div><div class="glroots">' + SH.map((n, i) => chip('data-tr="' + i + '"', s.root === i, n)).join('') + '</div>') + '</div></div>' +
      '<div class="hdr">' + t('range') + '</div><div class="group"><div class="cell"><span class="grow">' + t('from') + '</span>' + ui.icb('data-tlo2="-1"', I.left, t('lower'), 'sm') + '<b class="num glv">' + mName(s.lo) + '</b>' + ui.icb('data-tlo2="1"', I.right, t('higher'), 'sm') + '</div>' +
      '<div class="cellcol"><div class="glsub">' + t('width') + ' · ' + rangeTxt(s) + '</div>' + ui.seg('tw', WIDTHS.map((w) => [w, t('w.' + w)]), s.width, t('width')) + '</div></div>' +
      '<div class="hdr">' + t('look') + '</div><div class="group"><div class="cell"><span class="grow">' + t('camShow') + '</span>' + ui.sw('tshow', s.showCam, t('camShow')) + '</div></div>' +
      '<p class="ftr">' + t('camHint') + ' ' + t('privacy') + '</p>';
  };
  ui.sheet(body, (el, sh) => {
    const done = () => { save(); sh.update(); render(); };
    el.addEventListener('click', (e) => {
      const s = cfg(), g = (q) => e.target.closest(q);
      let b;
      if ((b = g('[data-tpre]'))) { const keep = s.fx.echo.time; s.fx = applyPreset(b.dataset.tpre); if (!PRESETS[b.dataset.tpre].echo) s.fx.echo.time = keep; ctx.ui.toast(t('presetOn', { name: t('preset.' + b.dataset.tpre) })); }
      else if ((b = g('[data-ts]'))) { s.sound = b.dataset.ts; silence(); }
      else if ((b = g('[data-tr]'))) s.root = +b.dataset.tr;
      else if ((b = g('[data-tlo2]'))) s.lo = clampLo(s.lo + +b.dataset.tlo2, s.width);
      else if ((b = g('[data-seg] [data-v]'))) {
        const k = b.closest('[data-seg]').dataset.seg, v = b.dataset.v;
        if (k === 'tside') s.side = v;
        else if (k === 'tsnap') s.snap = v;
        else if (k === 'tw') { s.width = +v; s.lo = clampLo(s.lo, s.width); }
        else return;
      } else return;
      done();
    });
    el.addEventListener('change', (e) => {
      const s = cfg(), sw = e.target.dataset.sw || '';
      if (sw === 'tchar') s.charX = e.target.checked;
      else if (sw === 'tshow') s.showCam = e.target.checked;
      else if (e.target.hasAttribute('data-tsc')) s.scale = e.target.value;
      else return;
      done();
    });
  });
}

function bind() {
  const on = (el, ev, fn, o) => { el.addEventListener(ev, fn, o); offs.push(() => el.removeEventListener(ev, fn, o)); };
  on(host, 'click', (e) => {
    const b = e.target.closest('[data-x]');
    if (!b) return;
    const s = cfg(), x = b.dataset.x;
    if (x === 'tset') { setSheet(); return; }
    if (x === 'tcam') { if (S.state === 'on' || S.state === 'loading') { camOff(); render(); } else camOn(); return; }
    if (x === 'tlo') s.lo = clampLo(s.lo + +b.dataset.d, s.width);
    else if (x === 'tsnap') s.snap = SNAPS[(SNAPS.indexOf(s.snap) + 1) % SNAPS.length];
    else return;
    save();
    render();
  });
  // свернули приложение — камера выключается сразу (и не включается сама)
  on(document, 'visibilitychange', () => { if (document.visibilityState === 'hidden' && S.cam) { camOff(); render(); } });
}

export default {
  id: 'theremin',
  order: 36,
  name: { ru: ru.name, uz: uz.name, en: en.name, el: el.name },
  i18n: { ru, uz, en, el },
  icon: ICON,
  color: '#AF52DE',
  sizes: ['full', 'half', 'quarter', 'strip'],
  immersive: true, // в отдельном окне — на весь экран, без шапки
  status(c) {
    const s = c.store.all(), lo = s.lo ?? 60, w = s.width ?? 12;
    return mName(lo) + '–' + mName(lo + w) + ' · ' + c.t('hand.' + (s.side || 'right'));
  },
  mount(el, c, sz = 'full') {
    host = el; ctx = c; size = sz;
    if (!probed) { c.audio.mixer.probe('glider', () => !!S.voice); probed = true; }
    render();
    bind();
    ro = new ResizeObserver(() => draw());
    ro.observe(host);
  },
  resize(sz) { size = sz; render(); },
  // Окно закрыто — камера выключается всегда (и в сессии): снимать без открытого окна незачем
  unmount() {
    ro && ro.disconnect();
    offs.splice(0).forEach((f) => f());
    camOff();
    S.state = 'off';
    host = null;
  },
};

