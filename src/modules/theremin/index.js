// Терменвокс: играют руками перед камерой. Рука высоты (по умолчанию правая): выше — выше звук, ближе к краю кадра —
// ярче (характер). Другая рука — эффекты, каждым своим движением (map.js, назначения меняются в настройках):
// ладонь раскрыта — звук, кулак — тишина; высота — пространство; поворот кисти — тембр; наклон вперёд-назад — вибрато;
// ближе к камере — перегруз; разворот ладони ребром — тремоло; щепоть — зафиксировать эффекты (чтобы не держать руку).
// Углы и расстояние считаются от нейтрального положения: запоминается само при первом появлении руки, заново — в настройках.
// Звук — движок глайдера (тот же голос, эффекты, привязка к нотам и лады) и его шина в микшере.
// Режим «Гитара» (guitar.js): камера видит гриф и пальцы и называет аккорд по схеме, звук только проверяет;
// терменвокс может тихо подыгрывать распознанный аккорд.
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
import { twoHandSign, assign, palm, heightOf, characterOf, oneEuro, EDGE, pose, gestureValues, applyGestures, GESTURES, TARGETS, DEFAULT_MAP, PINCH_ON, PINCH_OFF } from './map.js';
import { startHands } from './hands.js';
import { readSign, chordOf, chordName, voicing, shapeOf, harmOf, harmOffsets, HARM_IDS } from './chords.js';
import { createPadVoice, PAD_SOUNDS } from '../../audio/padvoice.js';
import { notesOf } from '../../music/guitarchords.js';
import { createGuitar } from './guitar.js';
import { melodyById, melodyName, createFollower, fitRange } from '../../music/melodies.js';
import { melStrip, melSheet } from '../glider/melody.js';

const ICON = '<svg viewBox="0 0 24 24"><path d="M7 21V11.5a1.5 1.5 0 0 1 3 0V9a1.5 1.5 0 0 1 3 0v1a1.5 1.5 0 0 1 3 0v1.5a1.5 1.5 0 0 1 3 0V16a5 5 0 0 1-5 5z"/><path d="M3 7c1.5-2 3-2 4.5 0S10.5 9 12 7s3-2 4.5 0"/></svg>';
const I = {
  left: '<svg viewBox="0 0 24 24"><path d="M14.5 6l-6 6 6 6"/></svg>',
  right: '<svg viewBox="0 0 24 24"><path d="M9.5 6l6 6-6 6"/></svg>',
  cam: '<svg viewBox="0 0 24 24"><path d="M3 8h3l2-2.5h8L18 8h3v11H3z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  camOff: '<svg viewBox="0 0 24 24"><path d="M3 8h3l2-2.5h8L18 8h3v11H3z"/><path d="M4 4l16 16"/></svg>',
  flip: '<svg viewBox="0 0 24 24"><path d="M3 8h3l2-2.5h8L18 8h3v11H3z"/><path d="M9 12.5a3 3 0 0 1 5.2-2"/><path d="M15 13.5a3 3 0 0 1-5.2 2"/><path d="M14.4 8.6v2h-2M9.6 17.4v-2h2"/></svg>',
  light: '<svg viewBox="0 0 24 24"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/></svg>',
};
const SOUNDS = ['app', ...Object.keys(SYN)];
const LOST_MS = 180; // рука пропала из кадра на мгновение — звук не обрывается
const AUTO_CAL_MS = 1500; // нейтраль запоминается сама, когда рука эффектов впервые продержалась в кадре столько
const PINCH_MS = 150; // щепоть держится столько — переключает фиксацию (случайное касание пальцев не считается)
const VOICE_FX = ['bright', 'vib', 'trem', 'drive', 'fuzz'];
const CHORD_MS = 180; // знак держится столько — аккорд меняется (пока пальцы разгибаются, рука «показывает» лишнее)
const OK_MS = 300; // «окей» держится столько — переключает «соло ↔ аккорды»
const HUDS = ['full', 'quiet', 'off']; // подсказки на экране; двойное касание по кадру переключает
const HARM_GAIN = 0.55; // голос гармонии — тише мелодии
const CHORD_GAIN = 0.42; // четыре голоса аккорда вместе — не громче одного голоса соло
const ALONG_GAIN = 0.3; // подыгрывание гитаре — тише: гитара главная
const MODES = ['solo', 'chord', 'guitar']; // кнопка режима переключает по кругу; «окей» — только соло ↔ аккорды

let host = null, ctx = null, size = 'full', ro = null, probed = false;
const offs = [];
// состояние живёт между перерисовками окна
const S = { cam: null, state: 'off', live: false, err: '', voice: null, bus: null, seen: 0, hands: { pitch: null, fx: null }, m: null,
  fPos: oneEuro(), fChar: oneEuro({ minCutoff: 1, beta: 0.2 }), fLean: oneEuro({ minCutoff: 1.2, beta: 0.1 }), fTilt: oneEuro({ minCutoff: 1.2, beta: 0.1 }),
  // рука эффектов: сглаживание каждого жеста, текущие силы (для подсказки), фиксация щепотью, автонейтраль
  fg: Object.fromEntries(GESTURES.map((g) => [g, oneEuro(g === 'open' ? { minCutoff: 2, beta: 0.2 } : { minCutoff: 0.8, beta: 0.3 })])),
  gv: null, pose: null, frozen: null, pinchT: 0, pinched: false, calT: 0,
  // аккорды: голоса, текущий аккорд и его расположение, знак-кандидат (ждёт CHORD_MS), «окей»
  cv: null, chord: null, cnotes: null, cand: null, okT: 0, okLatch: false,
  // гитара: распознавание (guitar.js) и аккорд, который сейчас подыгрывается
  G: null, along: null,
  // смена звука касанием рук: жест-кандидат и защёлка (сработал — ждёт, пока руки разойдутся)
  tw: null, twLatch: false,
  // мелодия по подсказке (соло): ведущий по нотам
  mf: null, mid: null };

const cfg = () => {
  const s = ctx.store.all();
  s.sound ??= 'app'; s.snap ??= 'magnet'; s.scale ??= 'chrom'; s.root ??= 0; s.side ??= 'right'; s.charX ??= true; s.showCam ??= true;
  s.width ??= 12; s.lo ??= 60;
  if (!WIDTHS.includes(s.width)) s.width = 12;
  s.lo = clampLo(s.lo, s.width);
  if (!s.fx) s.fx = applyPreset('violin'); // поющий звук с вибрато — ближе всего к терменвоксу
  s.gmap = { ...DEFAULT_MAP, ...(s.gmap || {}) };
  s.mode ??= 'solo'; if (!MODES.includes(s.mode)) s.mode = 'solo'; s.gmic ??= true; s.gplay ??= false; s.gdia ??= true; s.ckey ??= 0; s.cmode ??= 'maj'; s.cq ??= 'hand'; s.csound ??= 'same'; s.ctilt ??= true; s.harm ??= true; s.hstyle ??= 'classic'; if (!HARM_IDS.includes(s.hstyle)) s.hstyle = 'classic'; s.stilt ??= 'vib'; s.hud ??= 'full'; s.camAuto ??= false;
  s.facing ??= 'user'; s.light ??= false; s.sgest ??= true; s.mel ??= null;
  if (!HUDS.includes(s.hud)) s.hud = 'full';
  normalizeFx(s);
  return s;
};
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const save = () => ctx.store.save();
const rangeTxt = (s) => mName(s.lo) + '–' + mName(s.lo + s.width);
const patch = (s) => (s.sound === 'app' ? ctx.audio.pianoPatch() : SYN[s.sound] || SYN.sine);

/* ---------- разметка ---------- */

function view() {
  const { t, ui } = ctx, s = cfg(), big = size === 'full' || size === 'half', on = S.state === 'on', gtr = s.mode === 'guitar';
  const gear = ui.icb('data-x="tset"', ui.icons.gear, t('settings'), 'sm');
  // камера: передняя ↔ задняя; свет — фонарик у задней, светлая рамка экрана у передней (как «вспышка» селфи-камер)
  const flipBtn = ui.icb('data-x="tflip"', I.flip, t('cam.flip'), 'sm');
  const lightBtn = ui.icb('data-x="tlight" aria-pressed="' + !!s.light + '"', I.light, t('cam.light'), 'sm' + (s.light ? ' on' : ''));
  const camBtn = ui.icb('data-x="tcam"', on || S.state === 'loading' ? I.camOff : I.cam, t(on || S.state === 'loading' ? 'stop' : 'start'), 'sm');
  // узкое окно с работающей камерой: диапазон уходит в настройки — место кнопкам камеры и света
  const narrow = on && host && host.clientWidth < 470;
  const range = big && !gtr && !narrow ? '<div class="glrange">' + ui.icb('data-x="tlo" data-d="-12"', I.left, t('octDown'), 'sm') + '<span class="num">' + rangeTxt(s) + '</span>' + ui.icb('data-x="tlo" data-d="12"', I.right, t('octUp'), 'sm') + '</div>' : '';
  const snap = size === 'full' && s.mode === 'solo' && host && host.clientWidth > 520 ? '<button class="glsnap" data-x="tsnap" aria-label="' + ui.esc(t('snapBtn', { mode: t('snap.' + s.snap) })) + '">' + t('snap.' + s.snap) + '</button>' : '';
  // соло → аккорды → гитара (соло ↔ аккорды — то же жестом «окей» правой рукой)
  const modeBtn = size !== 'strip' ? '<button class="glsnap" data-x="tmode" aria-label="' + ui.esc(t('modeBtn', { mode: t('mode.' + s.mode) })) + '">' + t('mode.' + s.mode) + '</button>' : '';
  let mid = '';
  if (S.state === 'off' || S.state === 'error') {
    mid = '<div class="tmstart">' + (S.state === 'error' ? '<p class="tmerr">' + t('err.' + S.err) + '</p>' : '') +
      '<button class="btn fill" data-x="tcam">' + I.cam + '<span>' + t('start') + '</span></button>' +
      (size !== 'strip' && size !== 'quarter' ? '<p class="tmhint">' + t(gtr ? 'hint.guitar' : 'hint.' + s.side) + '</p><p class="tmpriv">' + t(gtr ? 'gPrivacy' : 'privacy') + '</p>' : '') + '</div>';
  } // пока камера включается — сплошной фон и тихая синусоида (её сменяет картинка с камеры)
  // poster — пустой кадр: иначе Android до первого кадра рисует на видео свою серую заставку
  return '<div class="tm ' + size + ' sd-' + s.side + ' hud-' + s.hud + (gtr ? ' gtr' : '') + (on && s.light && (s.facing === 'user' || !S.cam || !S.cam.hasTorch) ? ' ring' : '') + (s.showCam ? '' : ' nocam') + (S.live ? ' live' : '') + '"><video class="tmcam" playsinline muted aria-hidden="true" poster="' + BLANK + '"></video><div class="tmvig"></div><canvas class="tmcv" aria-hidden="true"></canvas>' +
    '<div class="glnote tmnote" aria-live="off"><b class="num" id="tmnote">' + (on ? '—' : '') + '</b><span class="num" id="tmc"></span></div>' +
    '<span class="tmlost" id="tmlost" hidden>' + t('noHands') + '</span>' +
    melOver(s) + (gtr && on ? '<div class="tmgs" id="tmgs" aria-live="polite" hidden><b></b><span></span></div>' : '') + mid + (S.state === 'loading' || (on && !S.live) ? '<div class="tmwait">' + ui.loader('wave') + '</div>' : '') +
    '<div class="glov tmbar">' + (size === 'strip' ? '' : range + modeBtn + snap) + (on && big ? flipBtn + lightBtn : '') + camBtn + gear + '</div></div>';
}

function render() {
  if (!host) return;
  // видео с потоком камеры переносится в новую разметку, чтобы картинка не мигала
  const oldV = host.querySelector('video.tmcam');
  host.innerHTML = view();
  if (oldV && oldV.srcObject) { const v = host.querySelector('video.tmcam'); v.replaceWith(oldV); }
  if (cfg().mode === 'guitar') guitarLabels();
  draw();
}

/* ---------- мелодия по подсказке (соло) ---------- */

function melOf(s) {
  const mel = s.mel && s.mode === 'solo' ? melodyById(s.mel) : null;
  if (!mel) return null;
  if (S.mid !== mel.id) { S.mf = createFollower(mel, { hold: 140 }); S.mid = mel.id; }
  return mel;
}
const melOver = (s) => { const mel = size === 'strip' ? null : melOf(s); return mel ? melStrip(ctx, mel, S.mf.index, { listen: false }) : ''; };
function melShow() {
  const el = host && host.querySelector('.glmel');
  if (!el) return;
  const w = document.createElement('div');
  w.innerHTML = melOver(cfg());
  if (w.firstChild) el.replaceWith(w.firstChild);
}
function melFeed(m, t) {
  if (!S.mf || !melOf(cfg())) return;
  const r = S.mf.feed(m, t);
  if (r) { melShow(); if (r === 'done') ctx.ui.toast(ctx.t('mel.done')); }
}
function melPick(id) {
  const s = cfg();
  s.mel = id;
  if (id) {
    const mel = melodyById(id), r = fitRange(mel, WIDTHS, { lo: s.lo, width: s.width });
    s.width = r.width; s.lo = clampLo(r.lo, r.width);
    const pcs = allowedPcs(s);
    if (pcs && mel.notes.some(([m]) => !pcs.includes(((m % 12) + 12) % 12))) s.scale = 'chrom';
    if (s.mode !== 'solo') setMode('solo');
    S.mid = null;
  }
  save();
  render();
}

/* ---------- рисунок поверх кадра: линии нот и точки рук ---------- */

// Кадр показывается «по размеру окна с обрезкой» — пересчёт долей кадра в точки окна
function frameMap(W, H) {
  const v = host && host.querySelector('video.tmcam'), vw = (v && v.videoWidth) || 4, vh = (v && v.videoHeight) || 3;
  const k = Math.max(W / vw, H / vh), dw = vw * k, dh = vh * k;
  return { x: (x) => x * dw - (dw - W) / 2, y: (y) => y * dh - (dh - H) / 2, ix: (x) => (x + (dw - W) / 2) / dw, iy: (y) => (y + (dh - H) / 2) / dh };
}

// Кости руки (как в MediaPipe): запястье, большой, указательный, средний, безымянный, мизинец, ладонь
const BONES = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];
const TIPS = [4, 8, 12, 16, 20];
const rgba = (hex, a) => { const h = hex.replace('#', ''), v = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16); return 'rgba(' + ((v >> 16) & 255) + ',' + ((v >> 8) & 255) + ',' + (v & 255) + ',' + a + ')'; };
const rrect = (g, x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };

// Подсказки на экране: 'full' — все, 'quiet' — только шкала и свечение ладоней, 'off' — чистая картинка камеры
function draw() {
  const cv = host && host.querySelector('canvas.tmcv');
  if (!cv) return;
  const W = cv.clientWidth, H = cv.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
  if (!W || !H) return;
  if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  const s = cfg(), hud = s.hud;
  if (S.state !== 'on' || hud === 'off') return;
  const full = hud === 'full', pcs = allowedPcs(s), map = frameMap(W, H), right = s.side === 'right';
  const tint = getComputedStyle(host.querySelector('.tm') || host).getPropertyValue('--tint').trim() || '#9C7242';
  // гитара: гриф, струны, пальцы и схема аккорда поверх кадра (guitar.js)
  if (s.mode === 'guitar') { if (S.G) S.G.draw(g, W, H, map, { tint, hud, size, dia: s.gdia }); return; }
  const yOf = (m) => map.y(EDGE + (1 - midiToPos(m, s.lo, s.width)) * (1 - 2 * EDGE));
  const notes = notesIn(s.lo, s.width, pcs), gap = notes.length > 1 ? Math.abs(yOf(notes[0]) - yOf(notes[1])) : 99;
  // шкала нот — тонкая линейка у края руки высоты
  const ex = right ? W - 6 : 6, dir = right ? -1 : 1;
  g.lineCap = 'round';
  g.font = '600 10.5px system-ui, sans-serif';
  g.textBaseline = 'middle';
  g.textAlign = right ? 'right' : 'left';
  notes.forEach((m) => {
    const y = yOf(m), pc = ((m % 12) + 12) % 12, key = pcs ? pc === s.root : pc === 0;
    g.strokeStyle = 'rgba(255,255,255,' + (key ? 0.75 : 0.35) + ')';
    g.lineWidth = key ? 1.6 : 1;
    g.beginPath(); g.moveTo(ex, y); g.lineTo(ex + dir * (key ? 16 : 9), y); g.stroke();
    if (full && (key || gap >= 18)) { g.fillStyle = key ? tint : 'rgba(255,255,255,.55)'; g.fillText(mName(m), ex + dir * 22, y); }
  });
  // где звучит: светящаяся черта от шкалы, гаснущая к середине кадра (у аккорда — по черте на ноту)
  const glow = (y, a = 1) => {
    const x2 = right ? W * 0.35 : W * 0.65, gr = g.createLinearGradient(ex, 0, x2, 0);
    gr.addColorStop(0, rgba(tint, 0.9 * a)); gr.addColorStop(1, rgba(tint, 0));
    g.strokeStyle = gr; g.lineWidth = full ? 2.5 : 1.5;
    g.beginPath(); g.moveTo(ex, y); g.lineTo(x2, y); g.stroke();
    g.fillStyle = rgba(tint, a); g.beginPath(); g.arc(ex + dir * 2, y, 3.5, 0, Math.PI * 2); g.fill();
  };
  // мелодия: нужная нота — пунктир через кадр от шкалы, со слогом песни
  const mel = melOf(s);
  if (mel) {
    const [tm, , tw] = S.mf.note, y = yOf(tm), x2 = right ? W * 0.3 : W * 0.7;
    g.save(); g.setLineDash([6, 6]); g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(ex, y); g.lineTo(x2, y); g.stroke(); g.restore();
    g.font = '600 15px system-ui, sans-serif'; g.fillStyle = '#fff'; g.textAlign = right ? 'right' : 'left';
    g.fillText(mName(tm) + (tw ? ' · ' + tw : ''), ex + dir * 30, y - 12);
    g.font = '600 10.5px system-ui, sans-serif';
  }
  if (S.cnotes) S.cnotes.forEach((m) => { if (m >= s.lo && m <= s.lo + s.width) glow(yOf(m), 0.8); });
  else if (S.m != null) glow(yOf(S.m));
  // руки: «Все» — тонкий скелет и светящиеся кончики пальцев, «Тихие» — мягкое свечение ладони
  const handDraw = (h, col) => {
    if (!h) return;
    const P = h.lm.map((p) => [map.x(p.x), map.y(p.y)]);
    if (!full) {
      const c = palm(h.lm), x = map.x(c.x), y = map.y(c.y), r = 34, gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, rgba(col, 0.35)); gr.addColorStop(1, rgba(col, 0));
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      return;
    }
    g.strokeStyle = rgba(col, 0.55); g.lineWidth = 2;
    g.beginPath();
    BONES.forEach(([a, b]) => { g.moveTo(P[a][0], P[a][1]); g.lineTo(P[b][0], P[b][1]); });
    g.stroke();
    g.save(); g.shadowColor = rgba(col, 0.9); g.shadowBlur = 10; g.fillStyle = rgba(col, 0.95);
    TIPS.forEach((i) => { g.beginPath(); g.arc(P[i][0], P[i][1], 3.5, 0, Math.PI * 2); g.fill(); });
    g.restore();
  };
  handDraw(S.hands.pitch, tint);
  handDraw(S.hands.fx, '#FFFFFF');
  // эффекты руки эффектов — на полупрозрачной подложке у её края, внизу (только «Все»)
  if (full && (S.gv || S.frozen)) {
    const rows = GESTURES.filter((k) => (s.gmap[k] || 'off') !== 'off'), lw = 86, bw = 58, pad = 10, rh = 17;
    const pw = pad * 2 + lw + bw, ph = pad * 2 + rows.length * rh + (S.frozen ? rh : 0);
    const x0 = right ? 10 : W - 10 - pw, y0 = H - 18 - ph;
    g.fillStyle = 'rgba(0,0,0,.38)'; rrect(g, x0, y0, pw, ph, 12); g.fill();
    g.textAlign = 'left';
    let y = y0 + pad + rh / 2;
    if (S.frozen) { g.fillStyle = tint; g.fillText('❄ ' + ctx.t('frozen'), x0 + pad, y); y += rh; }
    rows.forEach((k) => {
      const v = S.gv ? S.gv[k] || 0 : 0, dim = S.frozen && s.gmap[k] !== 'vol';
      g.fillStyle = 'rgba(255,255,255,.8)'; g.fillText(ctx.t('tg.' + s.gmap[k]), x0 + pad, y);
      g.fillStyle = 'rgba(255,255,255,.18)'; rrect(g, x0 + pad + lw, y - 2, bw, 4, 2); g.fill();
      if (v > 0.01) { g.fillStyle = s.gmap[k] === 'vol' ? 'rgba(255,255,255,.9)' : rgba(tint, dim ? 0.45 : 0.95); rrect(g, x0 + pad + lw, y - 2, Math.max(4, bw * v), 4, 2); g.fill(); }
      y += rh;
    });
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

function releaseChord() {
  if (S.cv) S.cv.forEach((v) => v.release());
  S.cv = null; S.chord = null; S.cnotes = null; S.along = null;
}

function releaseHarm() {
  if (S.hv) S.hv.forEach((v) => v.release());
  S.hv = null; S.hk = null; S.hc = null;
}

function silence() {
  if (S.voice) { S.voice.release(); S.voice = null; }
  releaseHarm();
  releaseChord();
  S.cand = null;
  S.m = null;
  if (S.mf) S.mf.feed(null, 0);
  S.fPos.reset(); S.fChar.reset(); S.fLean.reset(); S.fTilt.reset();
  showNote(null);
}

// «Окей» правой рукой (держится OK_MS) — переключение «соло ↔ аккорды»; пока держится — звук не меняется
function modeGesture(s, sign, t) {
  if (sign.kind !== 'ok') { S.okT = 0; S.okLatch = false; return false; }
  S.okT ||= t;
  if (!S.okLatch && t - S.okT > OK_MS) { S.okLatch = true; setMode(s.mode === 'chord' ? 'solo' : 'chord'); }
  return true;
}
function setMode(mode) {
  const s = cfg();
  s.mode = mode;
  save();
  silence();
  guitarSync();
  ctx.ui.toast(ctx.t('modeOn', { mode: ctx.t('mode.' + mode) }));
  render();
}

/* ---------- гитара ---------- */

// Режим «Гитара» включён и камера работает — распознавание идёт (крупный кадр, поток, микрофон); иначе — стоит
function guitarSync() {
  const want = cfg().mode === 'guitar' && S.state === 'on' && !!S.cam;
  if (want && !S.G) {
    S.G = createGuitar(guitarLabels);
    S.cam.hd(true);
    const v = host.querySelector('video.tmcam');
    S.G.start(v, { request: () => ctx.mic.request(), sound: cfg().gmic }).then((err) => { if (err && ctx) ctx.ui.toast(ctx.t(err === 'denied' ? 'gMicDenied' : 'gMicNo')); });
  } else if (!want && S.G) {
    S.G.stop(); S.G = null;
    playAlong(null);
    if (S.cam) S.cam.hd(false);
  }
}

// Подписи: аккорд крупно (как нота терменвокса), под ним — что сказал звук; внизу — почему гриф не виден
function guitarLabels() {
  if (!host) return;
  const G = S.G, t = ctx.t, n = host.querySelector('#tmnote'), c = host.querySelector('#tmc'), st = host.querySelector('#tmgs');
  const ch = G && G.chord, heard = G ? G.heard : null;
  if (n) { n.textContent = ch ? ch.name : '—'; n.parentNode.classList.toggle('on', !!ch); n.parentNode.classList.toggle('heard', heard === 'match'); }
  if (c) c.textContent = !ch || !heard ? '' : t('gHeard.' + heard);
  if (st) {
    const k = G ? G.state : 'find';
    st.hidden = k === 'ok';
    if (k !== 'ok') { st.querySelector('b').textContent = t('gs.' + k); st.querySelector('span').textContent = k === 'find' ? '' : t('gs.whole'); }
  }
}

function guitarHands(list, t) {
  if (!S.G) return;
  const heard = S.G.heard, changed = S.G.frame(list, t);
  if (changed) playAlong(S.G.chord);
  if (changed || heard !== S.G.heard) guitarLabels();
  draw();
}

// Подыгрывание: распознанный аккорд тянется пэдом (звук аккордов из настроек), тихо и в среднем регистре
function playAlong(ch) {
  const s = cfg(), key = ch && s.gplay ? ch.name + ':' + ch.frets : null;
  if (key === S.along) return;
  releaseChord();
  S.along = key;
  if (!key) return;
  const dest = ctx.audio.bus('glider');
  if (!dest) return;
  if (!S.bus || S.bus.ctx !== dest.context) { S.bus = createFxBus(dest.context, dest); S.bus.ctx = dest.context; }
  // звуки аккорда — тесно, от баса аккорда в малой октаве
  const ms = notesOf(ch.frets).filter((m) => m != null), pcs = [...new Set(ms.map((m) => m % 12))], root = Math.min(...ms) % 12;
  const notes = pcs.map((pc) => 48 + root + ((pc - root + 12) % 12)).sort((a, b) => a - b);
  const sound = PAD_SOUNDS.includes(s.csound) ? s.csound : 'soft', vo = { ...voiceFx(s.fx, 0), volGain: ALONG_GAIN };
  ctx.audio.mixer.setReverb('glider', 0.45);
  S.cv = notes.map((m) => { const v = createPadVoice(dest.context, S.bus.input, sound, { a4: ctx.audio.mf(69) }); v.start(m, vo); return v; });
}

// Соло: высота руки — высота звука; пальцы — голоса гармонии (chords.js: harmOf)
function playSolo(s, h, sign, t, o, dest) {
  releaseChord();
  const pos = S.fPos.next(heightOf(h.c.y), t), m = snapPitch(posToMidi(pos, s.lo, s.width), s.snap, allowedPcs(s));
  if (!S.voice) {
    const p = patch(s);
    ctx.audio.mixer.setReverb('glider', (p.rev || 0) * 0.9);
    S.voice = createGlideVoice(dest.context, S.bus.input, p, { hold: true, a4: ctx.audio.mf(69) });
    S.voice.start(m, o);
  } else {
    S.voice.pitch(m, s.snap === 'note' ? 0.03 : 0.02);
    S.voice.fx(o);
  }
  if (S.m == null || Math.round(S.m) !== Math.round(m) || s.snap !== 'note') showNote(m);
  S.m = m;
  melFeed(m, t);
  harmony(s, m, sign, t, o, dest);
}

// Гармония к мелодии: вид меняется, когда знак продержался CHORD_MS (как аккорды); голоса скользят за мелодией
function harmony(s, m, sign, t, o, dest) {
  const want = s.harm ? harmOf(sign, s.hstyle) : null;
  if (!S.hc || S.hc.k !== want) S.hc = { k: want, t };
  else if (t - S.hc.t >= CHORD_MS && S.hk !== want) { releaseHarm(); S.hk = want; S.hc = { k: want, t }; }
  if (!S.hk) return;
  const offs = harmOffsets(S.hk, m, { root: s.ckey, mode: s.cmode }), ho = { ...o, volGain: (o.volGain ?? 1) * HARM_GAIN / Math.sqrt(Math.max(1, offs.length)) }; // три голоса блок-аккорда — не громче одного
  if (!S.hv) {
    const p = patch(s);
    S.hv = offs.map((d) => { const v = createGlideVoice(dest.context, S.bus.input, p, { hold: true, a4: ctx.audio.mf(69) }); v.start(m + d, ho); return v; });
  } else S.hv.forEach((v, i) => { v.pitch(m + offs[i], s.snap === 'note' ? 0.03 : 0.02); v.fx(ho); });
}

// Аккорды: знак правой руки — ступень и лад (chords.js), высота руки — регистр (обращение); голоса скользят к новым нотам
function playChord(s, h, sign, t, o, dest, lean = 0, tilt = 0) {
  if (S.voice) { S.voice.release(); S.voice = null; S.m = null; }
  releaseHarm();
  const key = { root: s.ckey, mode: s.cmode };
  const center = posToMidi(S.fPos.next(heightOf(h.c.y), t), s.lo, s.width);
  // кандидат меняет аккорд, только когда продержался CHORD_MS
  const cand = sign.kind === 'fist' ? { id: 'fist' } : sign.kind === 'num' ? { id: 'c', c: chordOf(sign.n, sign.palm, key, s.cq) } : null;
  // наклон руки — вид аккорда: септаккорды, задержания (chords.js: shapeOf)
  if (cand && cand.c && s.ctilt) cand.c.q = shapeOf(cand.c.q, lean, tilt);
  if (cand) {
    const id = cand.id + (cand.c ? cand.c.root + cand.c.q + cand.c.n : '');
    if (!S.cand || S.cand.id !== id) S.cand = { id, t, c: cand.c };
    else if (t - S.cand.t >= CHORD_MS) {
      if (!cand.c) { if (S.cv) { releaseChord(); showNote(null); } }
      else if (!S.chord || S.cand.id !== S.chord.id) S.chord = { ...cand.c, id };
    }
  }
  if (!S.chord) return;
  // расположение по высоте руки; с запасом, чтобы на границе двух обращений не дрожало
  let notes = voicing(S.chord, center);
  if (S.cnotes && S.cv && S.cnotes.id === S.chord.id) {
    const mid = (n) => (n[1] + n.at(-1)) / 2;
    if (Math.abs(mid(notes) - center) > Math.abs(mid(S.cnotes) - center) - 1.5) notes = S.cnotes;
  }
  const vo = { ...o, volGain: (o.volGain ?? 1) * CHORD_GAIN };
  if (!S.cv) {
    // звук аккордов: как соло или пэд (тембры модуля «Пэды»)
    const pad = PAD_SOUNDS.includes(s.csound), p = pad ? null : patch(s);
    ctx.audio.mixer.setReverb('glider', pad ? 0.45 : (p.rev || 0) * 0.9);
    const make = () => (pad ? createPadVoice(dest.context, S.bus.input, s.csound, { a4: ctx.audio.mf(69) }) : createGlideVoice(dest.context, S.bus.input, p, { hold: true, a4: ctx.audio.mf(69) }));
    S.cv = notes.map((m) => { const v = make(); v.start(m, vo); return v; });
  } else {
    // септаккорд — на голос больше, трезвучие — на голос меньше: лишний затихает, недостающий вступает
    if (S.cv.length > notes.length) S.cv.splice(notes.length).forEach((v) => v.release());
    while (S.cv.length < notes.length) {
      const pad = PAD_SOUNDS.includes(s.csound), m = notes[S.cv.length];
      const v = pad ? createPadVoice(dest.context, S.bus.input, s.csound, { a4: ctx.audio.mf(69) }) : createGlideVoice(dest.context, S.bus.input, patch(s), { hold: true, a4: ctx.audio.mf(69) });
      v.start(m, vo);
      S.cv.push(v);
    }
    if (notes !== S.cnotes) S.cv.forEach((v, i) => v.pitch(notes[i], 0.05));
    S.cv.forEach((v) => v.fx(vo));
  }
  if (notes !== S.cnotes) { notes.id = S.chord.id; S.cnotes = notes; }
  const nm = chordName(S.chord, key), n = host && host.querySelector('#tmnote'), c = host && host.querySelector('#tmc');
  if (n) { n.textContent = nm.name; n.parentNode.classList.add('on'); }
  if (c) c.textContent = nm.roman;
}

// Смена звука касанием рук: сложенные ладони — следующий звук, кончики указательных — предыдущий.
// Жест держится TOUCH_MS — звук меняется; дальше — защёлка, пока руки не разойдутся. Пока руки сложены — тишина
const TOUCH_MS = 280;
function soundGesture(list, t) {
  const sign = list.length === 2 ? twoHandSign(list[0].lm, list[1].lm, list[0].ar) : null;
  if (!sign) { S.tw = null; S.twLatch = false; return false; }
  if (!S.tw || S.tw.k !== sign) S.tw = { k: sign, t };
  silence();
  if (!S.twLatch && t - S.tw.t >= TOUCH_MS) {
    S.twLatch = true;
    const s = cfg(), i = SOUNDS.indexOf(s.sound), n = SOUNDS[(i + (sign === 'palms' ? 1 : -1) + SOUNDS.length) % SOUNDS.length];
    s.sound = n; save();
    ctx.ui.toast(ctx.t('soundOn', { name: ctx.t('pre.' + n) }));
    if (navigator.vibrate) navigator.vibrate(20);
  }
  return true;
}

// Свет: задняя камера — фонарик (если есть), передняя — светлая рамка по краю экрана
function applyLight() {
  if (!S.cam) return;
  const s = cfg(), torch = s.facing === 'environment' && S.cam.hasTorch;
  S.cam.torch(torch && s.light);
  const tm = host && host.querySelector('.tm');
  if (tm) tm.classList.toggle('ring', !!s.light && !torch);
}

// Нейтральное положение руки эффектов: от него считаются поворот, разворот, наклон и расстояние
const neutralOf = (p) => ({ rot: p.rot, turn: p.turn ?? 0, tilt: p.tilt ?? 0, size: p.size });
function calibrate() {
  const { t, ui } = ctx;
  ui.toast(t('calSoon'));
  setTimeout(() => {
    if (!ctx) return;
    if (!S.pose) { ctx.ui.toast(t('calNo')); return; }
    cfg().cal = neutralOf(S.pose);
    save();
    GESTURES.forEach((g) => S.fg[g].reset());
    ctx.ui.toast(t('calDone'));
  }, 2500);
}

// Рука эффектов → силы жестов (сглаженные), фиксация щепотью, первая автонейтраль
function fxHand(s, h, t) {
  if (!h) { S.pose = null; S.gv = null; S.calT = 0; S.pinchT = 0; S.pinched = false; GESTURES.forEach((g) => S.fg[g].reset()); return null; }
  const p = pose(h);
  S.pose = p;
  if (!s.cal) {
    S.calT ||= t;
    if (t - S.calT > AUTO_CAL_MS) { s.cal = neutralOf(p); save(); ctx.ui.toast(ctx.t('calAuto')); }
  }
  const raw = gestureValues(p, s.cal || undefined, s.side), g = {};
  GESTURES.forEach((k) => { g[k] = S.fg[k].next(raw[k], t); });
  S.gv = g;
  // щепоть при раскрытой ладони (в кулаке большой палец тоже касается указательного — это не щепоть)
  if (s.gmap.pinch === 'freeze') {
    if (p.pinch < PINCH_ON && p.open > 0.45) {
      S.pinchT ||= t;
      if (!S.pinched && t - S.pinchT > PINCH_MS) { S.pinched = true; S.frozen = S.frozen ? null : applyGestures(g, s.gmap); ctx.ui.toast(ctx.t(S.frozen ? 'frozen' : 'unfrozen')); }
    } else if (p.pinch > PINCH_OFF || p.open <= 0.45) { S.pinchT = 0; S.pinched = false; }
  } else S.frozen = null;
  return g;
}

function onHands(list, t) {
  if (!host) return;
  const s = cfg();
  if (s.mode === 'guitar') { guitarHands(list, t); return; }
  if (s.sgest && soundGesture(list, t)) { draw(); return; }
  const a = assign(list, s.side);
  S.hands = a;
  const lost = host.querySelector('#tmlost');
  if (lost) lost.hidden = list.length > 0;
  const g = fxHand(s, a.fx, t);
  if (a.pitch) S.seen = t;
  else if (t - S.seen > LOST_MS) silence();
  if (a.pitch) {
    const sign = readSign(a.pitch, s.side === 'right');
    if (modeGesture(s, sign, t)) { draw(); return; }
    // наклон руки высоты: lean — как стрелка (+ наружу, от себя в сторону), tilt — вперёд (+) и назад
    const pp = pose(a.pitch), lean = S.fLean.next((s.side === 'right' ? 1 : -1) * pp.rot, t), tilt = S.fTilt.next(pp.tilt ?? 0, t);
    // эффекты: постоянные из набора + жесты руки эффектов (или зафиксированные щепотью); громкость — всегда живая
    const live = g ? applyGestures(g, s.gmap) : null;
    const fxv = S.frozen ? { ...S.frozen, vol: live ? live.vol : 1 } : live || { vol: 1 };
    const o = voiceFx(s.fx, 0);
    VOICE_FX.forEach((k) => { o[k] = Math.max(o[k] || 0, fxv[k] || 0); });
    if (s.charX) o.bright = Math.max(o.bright || 0, S.fChar.next(characterOf(a.pitch.c.x, s.side), t));
    o.volGain = (o.volGain ?? 1) * Math.max(0, Math.min(1, fxv.vol ?? 1));
    // соло: наклон руки высоты в любую сторону — свой эффект (по умолчанию вибрато, как у живого терменвокса)
    if (s.mode !== 'chord' && s.stilt !== 'off') { const k = s.stilt, v = Math.max(0, Math.min(1, (Math.abs(lean) - 12) / 40)); o[k] = Math.max(o[k] || 0, v); }
    const dest = ctx.audio.bus('glider');
    if (dest) {
      if (!S.bus || S.bus.ctx !== dest.context) { S.bus = createFxBus(dest.context, dest); S.bus.ctx = dest.context; }
      if (s.mode === 'chord') playChord(s, a.pitch, sign, t, o, dest, lean, tilt);
      else playSolo(s, a.pitch, sign, t, o, dest);
      const b = busFx(s.fx, [0]);
      S.bus.set({ echo: Math.max(b.echo, fxv.echo || 0), verb: Math.max(b.verb, fxv.verb || 0), time: b.time });
    }
  }
  draw();
}

// auto — включение само (окно открыли, вернулись в приложение): звук, если без касания его не разбудить,
// заработает от первого касания экрана
async function camOn(auto = false) {
  if (S.state === 'on' || S.state === 'loading') return;
  if (!ctx.audio.unlock()) {
    if (!auto) { ctx.ui.toast(ctx.t('noAudio')); return; }
    addEventListener('pointerdown', () => ctx && ctx.audio.unlock(), { once: true, capture: true });
  }
  S.state = 'loading';
  S.live = false;
  render();
  const t0 = Date.now();
  ctx.log('камера: включение' + (auto ? ' (само)' : ''));
  try {
    const v = host.querySelector('video.tmcam');
    // первый кадр — картинка плавно проявляется
    v.addEventListener('loadeddata', () => { ctx && ctx.log('камера: первый кадр через ' + (Date.now() - t0) + ' мс, ' + v.videoWidth + '×' + v.videoHeight); S.live = true; const el = host && host.querySelector('.tm'); if (el) el.classList.add('live'); }, { once: true });
    S.cam = await startHands(v, onHands, { facing: cfg().facing });
    if (!host) { camOff(); return; }
    ctx.log('камера: руки распознаются через ' + (Date.now() - t0) + ' мс');
    S.state = 'on';
    applyLight();
    guitarSync();
    // однажды разрешённая и включённая камера дальше включается сама (выключается в настройках)
    const s = cfg();
    if (!s.camAuto && !s.camAutoOff) { s.camAuto = true; save(); }
  } catch (e) {
    S.state = 'error';
    S.err = e.reason || 'fail';
    if (ctx) ctx.log('камера: ' + S.err + ' — ' + ((e && e.name) || '') + ' ' + ((e && e.message) || ''), S.err === 'denied' ? 'w' : 'e');
    if (S.err === 'denied') { cfg().camAuto = false; save(); } // запретили — сама больше не пытается
  }
  render();
}

function camOff() {
  if (S.G) { S.G.stop(); S.G = null; S.along = null; }
  if (S.cam) { S.cam.stop(); S.cam = null; }
  silence();
  fxHand(cfg(), null, 0);
  S.frozen = null;
  S.live = false;
  S.hands = { pitch: null, fx: null };
  if (S.state !== 'error') S.state = 'off';
}

/* ---------- настройки ---------- */

function setSheet() {
  const { t, ui } = ctx;
  const chip = (attr, on, label) => '<button class="lchip pick glck' + (on ? ' on' : '') + '" ' + attr + ' aria-pressed="' + on + '" style="--c:var(--tint);--t:var(--on-tint)">' + label + '</button>';
  const body = () => {
    const s = cfg(), chrom = s.scale === 'chrom';
    const mel = s.mel ? melodyById(s.mel) : null;
    return ui.snav(t('settings')) +
      // мелодия по подсказке (соло)
      '<div class="group" style="margin-top:4px"><button class="cell" data-tmel><span class="grow">' + t('mel.title') + '</span><span class="l2">' + ui.esc(mel ? melodyName(mel, ctx.lang()) : t('mel.none')) + '</span></button></div>' +
      '<div class="hdr">' + t('hands') + '</div><div class="group"><div class="cellcol">' + ui.seg('tside', [['right', t('hand.right')], ['left', t('hand.left')]], s.side, t('hands')) +
      '<div class="segcap">' + t('hint.' + s.side) + '</div></div><div class="cell"><span class="grow">' + t('charX') + '</span>' + ui.sw('tchar', s.charX, t('charX')) + '</div>' +
      '<div class="cell"><span class="grow">' + t('sgest') + '</span>' + ui.sw('tsgest', s.sgest, t('sgest')) + '</div></div><p class="ftr">' + t('charHint') + ' ' + t('sgestHint') + '</p>' +
      // аккорды правой рукой
      '<div class="hdr">' + t('chords') + '</div><div class="group"><div class="cellcol">' + ui.seg('tmode2', MODES.map((k) => [k, t('mode.' + k)]), s.mode, t('chords')) +
      '<div class="segcap">' + t(s.mode === 'guitar' ? 'gHint' : 'chordHint') + '</div></div>' +
      '<div class="cellcol"><div class="glsub">' + t('ckey') + '</div><div class="glroots">' + SH.map((n, i) => chip('data-tck="' + i + '"', s.ckey === i, n)).join('') + '</div>' +
      '<div style="margin-top:10px">' + ui.seg('tcmode', [['maj', t('cmode.maj')], ['min', t('cmode.min')]], s.cmode, t('ckey')) + '</div></div>' +
      '<div class="cellcol"><div class="glsub">' + t('cq') + '</div>' + ui.seg('tcq', [['hand', t('cq.hand')], ['key', t('cq.key')]], s.cq, t('cq')) +
      '<div class="segcap">' + t('cqHint.' + s.cq) + '</div></div>' +
      '<div class="cellcol"><div class="glsub">' + t('csound') + '</div><div class="glchips">' + ['same', ...PAD_SOUNDS].map((k) => chip('data-tcs="' + k + '"', s.csound === k, t('cs.' + k))).join('') +
      '</div><div class="segcap">' + t('csHint') + '</div></div>' +
      '<div class="cell"><span class="grow">' + t('ctilt') + '</span>' + ui.sw('tctilt', s.ctilt, t('ctilt')) + '</div></div><p class="ftr">' + t('ctiltHint') + '</p>' +
      // гитара: проверка звуком, подыгрывание, схема на экране
      '<div class="hdr">' + t('mode.guitar') + '</div><div class="group">' +
      '<div class="cell"><span class="grow">' + t('gMic') + '</span>' + ui.sw('tgmic', s.gmic, t('gMic')) + '</div>' +
      '<div class="cell"><span class="grow">' + t('gPlay') + '</span>' + ui.sw('tgplay', s.gplay, t('gPlay')) + '</div>' +
      '<div class="cell"><span class="grow">' + t('gDia') + '</span>' + ui.sw('tgdia', s.gdia, t('gDia')) + '</div></div>' +
      '<p class="ftr">' + t('gSetHint') + '</p>' +
      // соло: гармония пальцами и наклон руки
      '<div class="hdr">' + t('solo') + '</div><div class="group"><div class="cell"><span class="grow">' + t('harm') + '</span>' + ui.sw('tharm', s.harm, t('harm')) + '</div>' +
      '<div class="cellcol"><div class="glsub">' + t('hstyle') + '</div><div class="glchips">' + HARM_IDS.map((k) => chip('data-ths="' + k + '"', s.hstyle === k, t('hst.' + k))).join('') +
      '</div><div class="segcap">' + t('hstHint.' + s.hstyle) + '</div></div>' +
      '<div class="cellcol"><div class="glsub">' + t('stilt') + '</div>' + ui.seg('tstilt', ['off', 'vib', 'bright', 'trem'].map((k) => [k, t('stilt.' + k)]), s.stilt, t('stilt')) + '</div></div>' +
      '<p class="ftr">' + t('harmHint') + '</p>' +
      // рука эффектов: какое движение что делает
      '<div class="hdr">' + t('fxHand.' + (s.side === 'right' ? 'left' : 'right')) + '</div><div class="group">' +
      GESTURES.map((k) => '<label class="cell"><span class="grow">' + t('g.' + k) + '</span><select class="sortsel" data-tg="' + k + '" aria-label="' + ui.esc(t('g.' + k)) + '">' +
        TARGETS.map((tg) => '<option value="' + tg + '"' + (s.gmap[k] === tg ? ' selected' : '') + '>' + t('tg.' + tg) + '</option>').join('') + '</select></label>').join('') +
      '<label class="cell"><span class="grow">' + t('g.pinch') + '</span><select class="sortsel" data-tg="pinch" aria-label="' + ui.esc(t('g.pinch')) + '">' +
        ['off', 'freeze'].map((tg) => '<option value="' + tg + '"' + (s.gmap.pinch === tg ? ' selected' : '') + '>' + t('tg.' + tg) + '</option>').join('') + '</select></label>' +
      '<button class="cell act" data-tcal>' + t('cal') + '</button><button class="cell act" data-tgdef>' + t('gDefault') + '</button></div>' +
      '<p class="ftr">' + t('calHint') + '</p>' +
      '<div class="hdr">' + t('presetsBase') + '</div><div class="glpre" role="group" aria-label="' + t('presets') + '">' +
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
      '<div class="hdr">' + t('look') + '</div><div class="group"><div class="cellcol"><div class="glsub" style="margin-top:0">' + t('hud') + '</div>' +
      ui.seg('thud', HUDS.map((k) => [k, t('hud.' + k)]), s.hud, t('hud')) + '<div class="segcap">' + t('hudHint') + '</div></div>' +
      '<div class="cell"><span class="grow">' + t('camShow') + '</span>' + ui.sw('tshow', s.showCam, t('camShow')) + '</div>' +
      '<div class="cell"><span class="grow">' + t('camAuto') + '</span>' + ui.sw('tauto', !!s.camAuto, t('camAuto')) + '</div></div>' +
      '<p class="ftr">' + t('camHint') + ' ' + t('privacy') + '</p>';
  };
  ui.sheet(body, (el, sh) => {
    const done = () => { save(); sh.update(); render(); };
    el.addEventListener('click', (e) => {
      const s = cfg(), g = (q) => e.target.closest(q);
      let b;
      if (g('[data-tmel]')) { sh.close(); melSheet(ctx, s.mel, melPick); return; }
      if ((b = g('[data-tpre]'))) { const keep = s.fx.echo.time; s.fx = applyPreset(b.dataset.tpre); if (!PRESETS[b.dataset.tpre].echo) s.fx.echo.time = keep; ctx.ui.toast(t('presetOn', { name: t('preset.' + b.dataset.tpre) })); }
      else if ((b = g('[data-ts]'))) { s.sound = b.dataset.ts; silence(); }
      else if ((b = g('[data-tcs]'))) { s.csound = b.dataset.tcs; silence(); }
      else if ((b = g('[data-ths]'))) { s.hstyle = b.dataset.ths; releaseHarm(); }
      else if (g('[data-tcal]')) { calibrate(); return; }
      else if (g('[data-tgdef]')) { s.gmap = { ...DEFAULT_MAP }; S.frozen = null; }
      else if ((b = g('[data-tr]'))) s.root = +b.dataset.tr;
      else if ((b = g('[data-tck]'))) { s.ckey = +b.dataset.tck; S.chord = null; }
      else if ((b = g('[data-tlo2]'))) s.lo = clampLo(s.lo + +b.dataset.tlo2, s.width);
      else if ((b = g('[data-seg] [data-v]'))) {
        const k = b.closest('[data-seg]').dataset.seg, v = b.dataset.v;
        if (k === 'tside') s.side = v;
        else if (k === 'tmode2') { s.mode = v; silence(); guitarSync(); }
        else if (k === 'thud') s.hud = v;
        else if (k === 'tstilt') s.stilt = v;
        else if (k === 'tcmode') { s.cmode = v; S.chord = null; }
        else if (k === 'tcq') { s.cq = v; S.chord = null; }
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
      else if (sw === 'tctilt') { s.ctilt = e.target.checked; S.chord = null; }
      else if (sw === 'tharm') { s.harm = e.target.checked; releaseHarm(); }
      else if (sw === 'tauto') { s.camAuto = e.target.checked; s.camAutoOff = !e.target.checked; }
      else if (sw === 'tgmic') { s.gmic = e.target.checked; if (S.G) S.G.sound(s.gmic, () => ctx.mic.request()).then((err) => { if (err) ctx.ui.toast(ctx.t(err === 'denied' ? 'gMicDenied' : 'gMicNo')); }); }
      else if (sw === 'tgplay') { s.gplay = e.target.checked; playAlong(S.G && S.G.chord); }
      else if (sw === 'tgdia') s.gdia = e.target.checked;
      else if (sw === 'tsgest') s.sgest = e.target.checked;
      else if (e.target.hasAttribute('data-tsc')) s.scale = e.target.value;
      else if (e.target.dataset.tg) { s.gmap[e.target.dataset.tg] = e.target.value; if (e.target.dataset.tg === 'pinch') S.frozen = null; }
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
    if (x === 'tmel') { melSheet(ctx, s.mel, melPick); return; }
    if (x === 'mloff') { melPick(null); return; }
    if (x === 'tcam') { if (S.state === 'on' || S.state === 'loading') { camOff(); render(); } else camOn(); return; }
    if (x === 'tflip') {
      s.facing = s.facing === 'user' ? 'environment' : 'user'; save();
      camOff(); render(); camOn();
      ctx.ui.toast(ctx.t(s.facing === 'user' ? 'cam.front' : 'cam.back'));
      return;
    }
    if (x === 'tlight') {
      s.light = !s.light; save();
      applyLight();
      if (s.light && s.facing === 'environment' && S.cam && !S.cam.hasTorch) ctx.ui.toast(ctx.t('cam.noTorch'));
      render();
      return;
    }
    if (x === 'tmode') { setMode(MODES[(MODES.indexOf(s.mode) + 1) % MODES.length]); return; }
    if (x === 'tlo') s.lo = clampLo(s.lo + +b.dataset.d, s.width);
    else if (x === 'tsnap') s.snap = SNAPS[(SNAPS.indexOf(s.snap) + 1) % SNAPS.length];
    else return;
    save();
    render();
  });
  // гитара: долгое касание по грифу — «здесь порожек»
  let press = 0;
  const unpress = () => { clearTimeout(press); press = 0; };
  on(host, 'pointerdown', (e) => {
    if (!S.G || S.state !== 'on' || e.target.closest('button, .glov, input, select')) return;
    const r = host.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    unpress();
    press = setTimeout(() => {
      press = 0;
      if (!S.G) return;
      const map = frameMap(r.width, r.height);
      if (S.G.markNut(x, y, map)) { ctx.ui.toast(ctx.t('gNutSet')); if (navigator.vibrate) navigator.vibrate(15); draw(); }
    }, 550);
  });
  on(host, 'pointerup', unpress); on(host, 'pointercancel', unpress); on(host, 'pointermove', (e) => { if (press && (Math.abs(e.movementX) + Math.abs(e.movementY) > 6)) unpress(); });
  // двойное касание по кадру — подсказки «Все → Тихие → Нет» (экран терменвокса для игры не касаются)
  let lastTap = 0;
  on(host, 'pointerdown', (e) => {
    if (S.state !== 'on' || e.target.closest('button, .glov, input, select')) return;
    const now = e.timeStamp; // время самого касания: распознавание может занимать поток, обработка опаздывает
    if (now - lastTap < 350) {
      lastTap = 0;
      const s = cfg();
      s.hud = HUDS[(HUDS.indexOf(s.hud) + 1) % HUDS.length];
      save();
      const tm = host.querySelector('.tm');
      if (tm) { HUDS.forEach((k) => tm.classList.toggle('hud-' + k, k === s.hud)); }
      ctx.ui.toast(ctx.t('hudOn', { mode: ctx.t('hud.' + s.hud) }));
      draw();
    } else lastTap = now;
  });
  // свернули приложение — камера выключается сразу (и не включается сама)
  on(document, 'visibilitychange', () => {
    if (document.visibilityState === 'hidden' && S.cam) { camOff(); render(); }
    // вернулись в приложение, окно терменвокса открыто — камера снова сама
    else if (document.visibilityState === 'visible' && host && cfg().camAuto && S.state === 'off') camOn(true);
  });
}

export default {
  id: 'theremin',
  order: 36,
  name: { ru: ru.name, uz: uz.name, en: en.name, el: el.name },
  i18n: { ru, uz, en, el },
  icon: ICON,
  color: '#866B9D',
  sizes: ['full', 'half', 'quarter', 'strip'],
  immersive: true, // в отдельном окне — на весь экран, без шапки
  status(c) {
    const s = c.store.all(), lo = s.lo ?? 60, w = s.width ?? 12;
    if (s.mode === 'guitar') return c.t('mode.guitar');
    return mName(lo) + '–' + mName(lo + w) + ' · ' + c.t('hand.' + (s.side || 'right'));
  },
  mount(el, c, sz = 'full') {
    host = el; ctx = c; size = sz;
    if (!probed) { c.audio.mixer.probe('glider', () => !!S.voice || !!S.cv); probed = true; }
    render();
    bind();
    ro = new ResizeObserver(() => draw());
    ro.observe(host);
    if (cfg().camAuto) camOn(true); // камеру уже разрешали и включали — сразу
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

