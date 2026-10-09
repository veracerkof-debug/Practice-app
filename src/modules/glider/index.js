// Глайдер — бесладовая клавиатура: по горизонтали высота (плавно, как на скрипке или безладовом грифе),
// по вертикали — эффекты (любое сочетание: яркость, вибрато, тремоло, громкость, перегруз, фузз, эхо, реверберация).
// Внизу поверхности эффекты выключены совсем, вверху — на заданной силе; у каждого своя чувствительность,
// любой можно включить «всегда». До пяти пальцев сразу.
// Привязка: без ладов, магнит (тянет к нотам, но между ними можно скользить) или только ноты.
// Звукоряд — хроматика или лад от любой тоники; диапазон — от ноты и ширина (шире — больше нот, но меньше места на ноту).
// Звук — как у пианино приложения (или любой его пресет). В отдельном окне глайдер занимает весь экран.
import './glider.css';
import '@fontsource/comfortaa/latin-400.css';
import '@fontsource/comfortaa/latin-ext-400.css';
import '@fontsource/comfortaa/cyrillic-400.css';
import ru from './i18n/ru.json';
import uz from './i18n/uz.json';
import en from './i18n/en.json';
import el from './i18n/el.json';
import { PRESETS as SYN } from '../../audio/synth.js';
import { mName, SH } from '../../music/notes.js';
import { SCALE_TYPES } from '../../music/theory.js';
import { SNAPS, WIDTHS, allowedPcs, posToMidi, midiToPos, snapPitch, nearest, clampLo } from './scale.js';
import { createGlideVoice, createFxBus, FX, CURVES } from './voice.js';
import { normalizeFx, voiceFx, busFx, applyPreset, axisFx, PRESETS } from './fx.js';
import { melodyById, createFollower, fitRange } from '../../music/melodies.js';
import { melStrip, melSheet, NOTE_ICON } from './melody.js';

const ICON = '<svg viewBox="0 0 24 24"><path d="M3 17c3 0 4-10 9-10s6 6 9 6"/><circle cx="12" cy="7" r="1.6" fill="currentColor"/></svg>';
const I = {
  left: '<svg viewBox="0 0 24 24"><path d="M14.5 6l-6 6 6 6"/></svg>',
  right: '<svg viewBox="0 0 24 24"><path d="M9.5 6l6 6-6 6"/></svg>',
};
const MAX_TOUCH = 5, SOUNDS = ['app', ...Object.keys(SYN)]; // app — как сейчас настроено пианино
const BLACK = [1, 3, 6, 8, 10], ECHO_TIMES = [180, 320, 500, 750];

let host = null, ctx = null, size = 'full', ro = null, probed = false, bus = null;
const offs = [], touches = new Map(); // pointerId → { voice, el, m, y }
// мелодия по подсказке: ведущий по нотам, последнее касание (его высота засчитывается), «послушать» — проигрывание
const M = { fol: null, id: null, last: null, raf: 0, play: null };

const cfg = () => {
  const s = ctx.store.all();
  s.sound ??= 'app'; s.hold ??= true; s.snap ??= 'magnet'; s.port ??= 60; s.scale ??= 'chrom'; s.root ??= 0; s.labels ??= true; s.keys ??= true;
  s.mel ??= null;
  s.width ??= 12; s.lo ??= 60; // октава C4–C5: на телефоне по ширине в самый раз
  if (!WIDTHS.includes(s.width)) s.width = 12;
  s.lo = clampLo(s.lo, s.width);
  normalizeFx(s);
  return s;
};
const save = () => ctx.store.save();
const rangeTxt = (s) => mName(s.lo) + '–' + mName(s.lo + s.width);
const patch = (s) => (s.sound === 'app' ? ctx.audio.pianoPatch() : SYN[s.sound] || SYN.sine);
const axisTxt = (s) => { const a = axisFx(s.fx); return a.length ? '↑ ' + a.map((k) => ctx.t('fx.' + k)).join(' · ') : ''; };

/* ---------- разметка ---------- */

function padHTML(s, over) {
  const pcs = allowedPcs(s), W = s.width + 1;
  let cols = '', lines = '';
  // без разметки — сплошное одноцветное поле: ни полос клавиш, ни линий, ни названий нот
  for (let m = s.lo; s.keys && m <= s.lo + s.width; m++) {
    const pc = ((m % 12) + 12) % 12, inSc = !pcs || pcs.includes(pc), root = pcs ? pc === s.root : pc === 0;
    cols += '<i class="glk' + (BLACK.includes(pc) ? ' b' : '') + (inSc ? '' : ' off') + '" style="left:' + ((m - s.lo) / W) * 100 + '%;width:' + 100 / W + '%"></i>';
    const x = midiToPos(m, s.lo, s.width);
    if (inSc) lines += '<i class="gll' + (root ? ' root' : '') + (pc === 0 ? ' c' : '') + (x < 0.04 ? ' el' : x > 0.96 ? ' er' : '') + '" style="left:' + x * 100 + '%">' + (s.labels ? '<b>' + mName(m) + '</b>' : '') + '</i>';
  }
  const ax = axisTxt(s);
  return '<div class="glpad' + (s.keys ? '' : ' plain') + '" id="glpad" role="application" aria-roledescription="' + ctx.t('padRole') + '" aria-label="' + ctx.t('padAria', { range: rangeTxt(s), fx: ax.replace('↑ ', '') || ctx.t('fxNone') }) + '">' +
    cols + lines + melOver(s) + (ax ? '<span class="glaxis" aria-hidden="true">' + ax + '</span>' : '') + '<div id="gltouch"></div>' + over + '</div>';
}

// Всё окно — доска (политика приложения: пространство работает на функцию). Поверх неё — только то,
// что не мешает игре: нота крупно и полупрозрачно (касания проходят сквозь), подпись эффектов вдоль левого края
// и одна узкая панель в углу: диапазон, привязка, настройки
function view() {
  const { t, ui } = ctx, s = cfg(), big = size === 'full' || size === 'half';
  const gear = ui.icb('data-x="gset"', ui.icons.gear, t('settings'), 'sm');
  const melBtn = ui.icb('data-x="gmel" aria-pressed="' + !!s.mel + '"', NOTE_ICON, t('mel.title'), 'sm' + (s.mel ? ' on' : ''));
  if (size === 'strip') return '<div class="gl strip">' + padHTML(s, '<div class="glov">' + gear + '</div>') + '</div>';
  const note = '<div class="glnote" aria-live="off"><b class="num" id="glnote">' + (big ? mName(s.lo) + '–' + mName(s.lo + s.width) : '—') + '</b><span class="num" id="glc"></span></div>';
  const range = big ? '<div class="glrange">' + ui.icb('data-x="glo" data-d="-12"', I.left, t('octDown'), 'sm') + '<span class="num">' + rangeTxt(s) + '</span>' + ui.icb('data-x="glo" data-d="12"', I.right, t('octUp'), 'sm') + '</div>' : '';
  // привязка — одной кнопкой: нажатие переключает «без ладов → магнит → ноты»
  const snap = big ? '<button class="glsnap" data-x="gsnap" aria-label="' + ui.esc(t('snapBtn', { mode: t('snap.' + s.snap) })) + '">' + t('snap.' + s.snap) + '</button>' : '';
  return '<div class="gl ' + size + '">' + padHTML(s, note + '<div class="glov">' + range + snap + melBtn + gear + '</div>') + '</div>';
}

function render() {
  if (!host) return;
  stopListen();
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

/* ---------- мелодия по подсказке ---------- */

function melOf(s) {
  const mel = s.mel ? melodyById(s.mel) : null;
  if (!mel) { M.fol = null; M.id = null; return null; }
  if (M.id !== mel.id) { M.fol = createFollower(mel); M.id = mel.id; }
  return mel;
}
// Нужная нота — светлая полоса на доске, ноты и слоги — полосой сверху (в «полоске» окна — только полоса на доске)
function melOver(s) {
  const mel = melOf(s);
  if (!mel) return '';
  const m = M.fol.note[0], x = midiToPos(m, s.lo, s.width);
  return '<i class="gltg" id="gltg" style="left:' + x * 100 + '%;width:' + 100 / (s.width + 1) + '%"></i>' +
    (size === 'strip' ? '' : melStrip(ctx, mel, M.fol.index, { playing: !!M.play }));
}
function melShow(hit) {
  const pad = host && host.querySelector('#glpad');
  if (!pad) return;
  const s = cfg();
  pad.querySelectorAll('.glmel, #gltg').forEach((e) => e.remove());
  const wrap = document.createElement('div');
  wrap.innerHTML = melOver(s);
  [...wrap.children].forEach((e) => pad.insertBefore(e, pad.querySelector('#gltouch')));
  if (hit) { const n = pad.querySelector('#gltg'); if (n) { n.classList.add('hit'); setTimeout(() => n.classList.remove('hit'), 220); } }
}
// Высота последнего касания проверяется и пока палец стоит на месте (нота засчитывается через долю секунды)
function melTick() {
  M.raf = 0;
  if (!M.fol || M.play) return;
  const tc = M.last && touches.get(M.last);
  const r = M.fol.feed(tc ? tc.m : null, performance.now());
  if (r) {
    melShow(true);
    if (r === 'done') ctx.ui.toast(ctx.t('mel.done'));
  }
  if (touches.size) M.raf = requestAnimationFrame(melTick);
}
function melOnset(id) {
  if (!M.fol || M.play) return;
  M.last = id;
  const tc = touches.get(id);
  M.fol.feed(tc.m, performance.now(), true);
  if (!M.raf) M.raf = requestAnimationFrame(melTick);
}
function melPick(id) {
  const s = cfg();
  s.mel = id;
  stopListen();
  if (id) {
    const mel = melodyById(id), r = fitRange(mel, WIDTHS, { lo: s.lo, width: s.width });
    s.width = r.width; s.lo = clampLo(r.lo, r.width);
    // в ладу нет нужных нот — на время мелодии хроматика
    const pcs = allowedPcs(s);
    if (pcs && mel.notes.some(([m]) => !pcs.includes(((m % 12) + 12) % 12))) s.scale = 'chrom';
    M.id = null;
  }
  save();
  render();
}
// «Послушать»: мелодия играет сама, точка касания идёт по доске, полоса показывает слоги
function listen() {
  const s = cfg(), mel = melOf(s);
  if (!mel) return;
  if (M.play) { stopListen(); return; }
  if (!ctx.audio.unlock()) { ctx.ui.toast(ctx.t('noAudio')); return; }
  const dest = ctx.audio.bus('glider');
  if (!dest) return;
  const p = patch(s);
  ctx.audio.mixer.setReverb('glider', (p.rev || 0) * 0.9);
  if (!bus || bus.ctx !== dest.context) { bus = createFxBus(dest.context, dest); bus.ctx = dest.context; }
  const beat = 60000 / mel.bpm, el = document.createElement('i');
  el.className = 'gltc demo';
  host.querySelector('#gltouch').appendChild(el);
  const P = { voice: null, el, k: 0, timer: 0 };
  M.play = P;
  M.fol.reset();
  const step = () => {
    if (M.play !== P) return;
    if (P.k >= mel.notes.length) { stopListen(); return; }
    const [m, d] = mel.notes[P.k], y = 0.35;
    if (P.voice) P.voice.release();
    P.voice = createGlideVoice(dest.context, bus.input, p, { hold: false, a4: ctx.audio.mf(69) });
    P.voice.start(m, voiceFx(s.fx, y));
    const c = cfg();
    el.style.left = midiToPos(m, c.lo, c.width) * 100 + '%'; el.style.top = (1 - y) * 100 + '%';
    show(m);
    M.fol.reset(P.k);
    melShow(false);
    P.k++;
    // нота звучит чуть короче своей доли — слышно, где начинается следующая
    P.timer = setTimeout(() => { if (P.voice) { P.voice.release(); P.voice = null; } P.timer = setTimeout(step, beat * d * 0.12); }, beat * d * 0.88);
  };
  melShow(false);
  step();
}
function stopListen() {
  const P = M.play;
  if (!P) return;
  M.play = null;
  clearTimeout(P.timer);
  if (P.voice) P.voice.release();
  P.el.remove();
  if (M.fol) M.fol.reset();
  const n = host && host.querySelector('.glnote');
  if (n) n.classList.remove('on');
  melShow(false);
}

/* ---------- игра ---------- */

function show(m) {
  const n = host && host.querySelector('#glnote'), c = host && host.querySelector('#glc');
  if (!n) return;
  const { n: k, cents } = nearest(m);
  n.textContent = mName(k);
  n.parentNode.classList.add('on');
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
const updateBus = () => { if (bus) bus.set(busFx(cfg().fx, [...touches.values()].map((tc) => tc.y))); };

function down(e) {
  const pad = e.target.closest('#glpad');
  // кнопки поверх поверхности — не ноты
  if (!pad || e.target.closest('.glov, .glmel, button') || touches.size >= MAX_TOUCH) return;
  if (M.play) stopListen();
  e.preventDefault();
  if (!ctx.audio.unlock()) { ctx.ui.toast(ctx.t('noAudio')); return; }
  try { pad.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  const s = cfg(), p = patch(s), dest = ctx.audio.bus('glider');
  if (!dest) return;
  ctx.audio.mixer.setReverb('glider', (p.rev || 0) * 0.9);
  if (!bus || bus.ctx !== dest.context) { bus = createFxBus(dest.context, dest); bus.ctx = dest.context; }
  const a = at(e, pad), voice = createGlideVoice(dest.context, bus.input, p, { hold: s.hold, a4: ctx.audio.mf(69) });
  voice.start(a.m, voiceFx(s.fx, a.y));
  const el = document.createElement('i');
  el.className = 'gltc';
  host.querySelector('#gltouch').appendChild(el);
  const tc = { voice, el, m: a.m, y: a.y };
  touches.set(e.pointerId, tc);
  place(tc, a.x, a.y);
  show(a.m);
  updateBus();
  melOnset(e.pointerId);
}

function move(e) {
  const tc = touches.get(e.pointerId), pad = host && host.querySelector('#glpad');
  if (!tc || !pad) return;
  const s = cfg(), a = at(e, pad);
  if (a.m !== tc.m) { tc.voice.pitch(a.m, tau(s)); tc.m = a.m; show(a.m); }
  tc.y = a.y;
  tc.voice.fx(voiceFx(s.fx, a.y));
  place(tc, a.x, a.y);
  updateBus();
}

function up(e) {
  const tc = touches.get(e.pointerId);
  if (!tc) return;
  tc.voice.release();
  tc.el.classList.add('out');
  setTimeout(() => tc.el.remove(), 260);
  touches.delete(e.pointerId);
  if (!touches.size) { const n = host && host.querySelector('.glnote'); if (n) n.classList.remove('on'); }
  // хвосты эха и реверберации доигрывают с последней силой
}

function releaseAll() {
  touches.forEach((tc) => { tc.voice.release(); tc.el.remove(); });
  touches.clear();
}

/* ---------- настройки ---------- */

// Эффект в настройках: вкл/выкл, режим (по вертикали / всегда), сила, чувствительность; у эха — время
function fxRow(k, e) {
  const { t, ui } = ctx;
  let h = '<div class="cell glfx"><span class="grow"><b>' + t('fx.' + k) + '</b><small>' + t('fxd.' + k) + '</small></span>' + ui.sw('gfx-' + k, e.on, t('fx.' + k)) + '</div>';
  if (!e.on) return h;
  h += '<div class="cellcol glfxc">' + (k === 'vol' ? '' : ui.seg('gfxm-' + k, [['axis', t('mode.axis')], ['fixed', t('mode.fixed')]], e.mode, t('mode'))) +
    '<label class="glamt"><span>' + t(k === 'vol' ? 'depth' : 'strength') + '</span><input type="range" min="0" max="100" step="5" value="' + Math.round(e.amt * 100) + '" data-gamt="' + k + '" aria-label="' +
    ui.esc(t('strength') + ': ' + t('fx.' + k)) + '"><b class="num" data-gamtv="' + k + '">' + Math.round(e.amt * 100) + '%</b></label>' +
    (e.mode !== 'fixed' || k === 'vol' ? '<div class="glsub">' + t('sens') + '</div>' + ui.seg('gfxc-' + k, Object.keys(CURVES).map((c) => [c, t('curve.' + c)]), e.curve, t('sens')) : '') +
    (k === 'echo' ? '<div class="glsub">' + t('echoTime') + '</div>' + ui.seg('gecho', ECHO_TIMES.map((v) => [v, v + ' ' + t('ms')]), e.time, t('echoTime')) : '') + '</div>';
  return h;
}

function setSheet() {
  const { t, ui } = ctx;
  const body = () => {
    const s = cfg(), chrom = s.scale === 'chrom';
    return ui.snav(t('settings')) +
      '<div class="hdr" style="margin-top:4px">' + t('effects') + '</div><div class="glpre" role="group" aria-label="' + t('presets') + '">' +
      Object.keys(PRESETS).map((k) => '<button class="lchip pick glck" data-gpre="' + k + '" style="--c:var(--tint);--t:var(--on-tint)">' + t('preset.' + k) + '</button>').join('') + '</div>' +
      '<div class="group">' + FX.map((k) => fxRow(k, s.fx[k])).join('') + '</div><p class="ftr">' + t('fxHint') + '</p>' +
      '<div class="hdr">' + t('sound') + '</div><div class="group"><div class="cellcol"><div class="glchips">' +
      SOUNDS.map((k) => '<button class="lchip pick glck' + (s.sound === k ? ' on' : '') + '" data-gs="' + k + '" aria-pressed="' + (s.sound === k) + '" style="--c:var(--tint);--t:var(--on-tint)">' + t('pre.' + k) + '</button>').join('') +
      '</div></div><div class="cell"><span class="grow">' + t('hold') + '</span>' + ui.sw('ghold', s.hold, t('hold')) + '</div></div><p class="ftr">' + t('soundHint') + '</p>' +
      '<div class="hdr">' + t('snap') + '</div><div class="group"><div class="cellcol">' + ui.seg('gsnap', SNAPS.map((k) => [k, t('snap.' + k)]), s.snap, t('snap')) +
      '<div class="segcap">' + t('snapHint.' + s.snap) + '</div></div>' +
      (s.snap === 'note' ? '<div class="cellcol"><div class="glsub">' + t('port') + '</div>' + ui.seg('gport', [[0, t('port0')], [60, '60 ' + t('ms')], [150, '150 ' + t('ms')], [300, '300 ' + t('ms')]], s.port, t('port')) + '</div>' : '') + '</div>' +
      '<div class="hdr">' + t('notes') + '</div><div class="group"><div class="cellcol"><select class="sortsel glsel" data-gsc aria-label="' + t('notes') + '"><option value="chrom"' + (chrom ? ' selected' : '') + '>' + t('chrom') + '</option>' +
      SCALE_TYPES.map((k) => '<option value="' + k + '"' + (s.scale === k ? ' selected' : '') + '>' + t('scale.' + k) + '</option>').join('') + '</select>' +
      (chrom ? '' : '<div class="glsub" style="margin-top:10px">' + t('root') + '</div><div class="glroots">' + SH.map((n, i) => '<button class="lchip pick glck' + (s.root === i ? ' on' : '') + '" data-gr="' + i + '" aria-pressed="' + (s.root === i) + '" style="--c:var(--tint);--t:var(--on-tint)">' + n + '</button>').join('') + '</div>') +
      '</div></div>' +
      '<div class="hdr">' + t('range') + '</div><div class="group"><div class="cell"><span class="grow">' + t('from') + '</span>' + ui.icb('data-glo2="-1"', I.left, t('lower'), 'sm') + '<b class="num glv">' + mName(s.lo) + '</b>' + ui.icb('data-glo2="1"', I.right, t('higher'), 'sm') + '</div>' +
      '<div class="cellcol"><div class="glsub">' + t('width') + ' · ' + rangeTxt(s) + '</div>' + ui.seg('gw', WIDTHS.map((w) => [w, t('w.' + w)]), s.width, t('width')) + '</div></div><p class="ftr">' + t('widthHint') + '</p>' +
      '<div class="hdr">' + t('look') + '</div><div class="group"><div class="cell"><span class="grow">' + t('keys') + '</span>' + ui.sw('gkeys', s.keys, t('keys')) + '</div>' +
      (s.keys ? '<div class="cell"><span class="grow">' + t('labels') + '</span>' + ui.sw('glab', s.labels, t('labels')) + '</div>' : '') + '</div><p class="ftr">' + t('keysHint') + '</p>';
  };
  ui.sheet(body, (el, sh) => {
    const done = () => { save(); sh.update(); render(); updateBus(); };
    el.addEventListener('click', (e) => {
      const s = cfg(), g = (q) => e.target.closest(q);
      let b;
      if ((b = g('[data-gpre]'))) { const keep = s.fx.echo.time; s.fx = applyPreset(b.dataset.gpre); if (!PRESETS[b.dataset.gpre].echo) s.fx.echo.time = keep; ctx.ui.toast(t('presetOn', { name: t('preset.' + b.dataset.gpre) })); }
      else if ((b = g('[data-gs]'))) s.sound = b.dataset.gs;
      else if ((b = g('[data-gr]'))) s.root = +b.dataset.gr;
      else if ((b = g('[data-glo2]'))) s.lo = clampLo(s.lo + +b.dataset.glo2, s.width);
      else if ((b = g('[data-seg] [data-v]'))) {
        const k = b.closest('[data-seg]').dataset.seg, v = b.dataset.v;
        if (k === 'gsnap') s.snap = v;
        else if (k === 'gport') s.port = +v;
        else if (k === 'gw') { s.width = +v; s.lo = clampLo(s.lo, s.width); }
        else if (k === 'gecho') s.fx.echo.time = +v;
        else if (k.startsWith('gfxm-')) s.fx[k.slice(5)].mode = v;
        else if (k.startsWith('gfxc-')) s.fx[k.slice(5)].curve = v;
        else return;
      } else return;
      done();
    });
    // сила — ползунком: число меняется сразу, сохраняется по отпусканию
    el.addEventListener('input', (e) => {
      const k = e.target.dataset.gamt;
      if (!k) return;
      cfg().fx[k].amt = +e.target.value / 100;
      const v = el.querySelector('[data-gamtv="' + k + '"]');
      if (v) v.textContent = e.target.value + '%';
      updateBus();
    });
    el.addEventListener('change', (e) => {
      const s = cfg(), sw = e.target.dataset.sw || '';
      if (e.target.dataset.gamt) { save(); render(); return; }
      if (sw === 'ghold') s.hold = e.target.checked;
      else if (sw === 'glab') s.labels = e.target.checked;
      else if (sw === 'gkeys') s.keys = e.target.checked;
      else if (sw.startsWith('gfx-')) s.fx[sw.slice(4)].on = e.target.checked;
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
  // браузер не должен прокручивать и масштабировать, пока идёт игра
  on(host, 'touchmove', (e) => { if (e.target.closest('#glpad') && !e.target.closest('.glov, .glmel')) e.preventDefault(); }, { passive: false });
  on(host, 'contextmenu', (e) => { if (e.target.closest('#glpad')) e.preventDefault(); });
  on(host, 'click', (e) => {
    const b = e.target.closest('[data-x]');
    if (!b) return;
    const s = cfg();
    if (b.dataset.x === 'gset') { setSheet(); return; }
    if (b.dataset.x === 'gmel') { melSheet(ctx, s.mel, melPick); return; }
    if (b.dataset.x === 'mlisten') { listen(); return; }
    if (b.dataset.x === 'mloff') { melPick(null); return; }
    if (b.dataset.x === 'glo') s.lo = clampLo(s.lo + +b.dataset.d, s.width);
    else if (b.dataset.x === 'gsnap') s.snap = SNAPS[(SNAPS.indexOf(s.snap) + 1) % SNAPS.length];
    save();
    render();
  });
}

export default {
  id: 'glider',
  order: 35,
  name: { ru: ru.name, uz: uz.name, en: en.name, el: el.name },
  i18n: { ru, uz, en, el },
  icon: ICON,
  color: '#866B9D',
  sizes: ['full', 'half', 'quarter', 'strip'],
  immersive: true, // в отдельном окне — на весь экран, без шапки
  status(c) {
    const s = c.store.all(), lo = s.lo ?? 60, w = s.width ?? 12;
    return mName(lo) + '–' + mName(lo + w) + ' · ' + c.t('snap.' + (s.snap || 'magnet'));
  },
  mount(el, c, sz = 'full') {
    host = el; ctx = c; size = sz;
    // Пока звучит глайдер, шина пианино в микшере подсвечена
    if (!probed) { c.audio.mixer.probe('glider', () => touches.size > 0); probed = true; }
    render();
    bind();
    ro = new ResizeObserver(() => dense());
    ro.observe(host);
  },
  resize(sz) { size = sz; render(); },
  unmount() {
    ro && ro.disconnect();
    offs.splice(0).forEach((f) => f());
    stopListen();
    if (M.raf) cancelAnimationFrame(M.raf);
    M.raf = 0;
    releaseAll();
    host = null;
  },
};
