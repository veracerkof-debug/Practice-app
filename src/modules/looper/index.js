// Лупер: петля из слоёв с микрофона. Одна большая кнопка — всё по кругу: запись → петля → наложение → петля;
// удержание кнопки — отменить последний слой. По метроному — отсчёт такта и длина петли в целых тактах.
// Четыре петли (слота), у каждой свои слои; громкость и тишина слоя; сохранение сведения в медиатеку.
// Педаль Bluetooth (клавиши: пробел, PageDown — кнопка; PageUp — стоп; стрелки — отмена). Движок — src/audio/looper.js.
import './looper.css';
import ru from './i18n/ru.json';
import uz from './i18n/uz.json';
import en from './i18n/en.json';
import { createLooper, SLOTS, MAX_SEC } from '../../audio/looper.js';
import { encodeWav } from '../../audio/voicefx.js';
import { onHold, holdMenu } from '../../ui/hold.js';

const ICON = '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 1 2.6 5.9"/><path d="M4 18.5V14h4.5"/><circle cx="12" cy="12" r="2" style="fill:currentColor"/></svg>';
const I = {
  rec: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="6" style="fill:currentColor"/></svg>',
  stop: '<svg viewBox="0 0 24 24"><rect x="6.5" y="6.5" width="11" height="11" rx="2" style="fill:currentColor"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  undo: '<svg viewBox="0 0 24 24"><path d="M8 7H4v4"/><path d="M4.5 11A8 8 0 1 1 7 18"/></svg>',
  save: '<svg viewBox="0 0 24 24"><path d="M12 4v11M8 11l4 4 4-4M5 19h14"/></svg>',
  metro: '<svg viewBox="0 0 24 24"><path d="M9 4h6l3 16H6zM12 17V8M12 8l5-3"/></svg>',
  ear: '<svg viewBox="0 0 24 24"><path d="M6 10a6 6 0 0 1 12 0c0 3-2 4-2 7a3 3 0 0 1-6 0"/><path d="M9.5 10a2.5 2.5 0 0 1 5 0"/></svg>',
  mute: '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9l5 6M21 9l-5 6"/></svg>',
  vol: '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  reels: '<svg viewBox="0 0 24 24"><circle cx="7.5" cy="12" r="4"/><circle cx="16.5" cy="12" r="4"/><path d="M7.5 16h9"/></svg>',
  ring: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.5" style="fill:currentColor"/></svg>',
  left: '<svg viewBox="0 0 24 24"><path d="M14.5 6l-6 6 6 6"/></svg>',
  right: '<svg viewBox="0 0 24 24"><path d="M9.5 6l6 6-6 6"/></svg>',
};
const REELS = 4, SHIFT_STEP = 10; // катушек на экране; шаг сдвига слоя, мс
const R = 46, C = 2 * Math.PI * R;

let host = null, ctx = null, size = 'full', lp = null, raf = 0, offs = [], arm = null, offBeat = null;
const peaksCache = new Map(); // слой (номер:версия:точек) → огибающая
const reelsView = () => st().view === 'reels' && size !== 'strip';
const st = () => ctx.store.all();
const metro = () => ctx.audio.metro;
const barSec = () => { const m = metro().cfg; return (60 / m.bpm) * Math.max(1, m.num); };
const withMetro = () => !!st().metro;

/* ---------- разметка ---------- */

const fmt = (s) => { s = Math.max(0, s); const m = Math.floor(s / 60), x = Math.floor(s % 60); return m + ':' + String(x).padStart(2, '0'); };

function view() {
  const { t, ui } = ctx, S = lp ? lp.state : { state: 'idle', layers: [], slots: [0, 0, 0, 0], slot: 0, len: 0, pos: 0 }, s = S.state;
  const small = size === 'quarter' || size === 'strip', lab = arm ? 'cancel' : s === 'idle' && S.len ? 'resume' : s; // пауза: петля есть — «Играть»
  const main = '<button class="lpbtn ' + s + (arm ? ' arm' : '') + '" data-x="main" aria-label="' + ui.esc(t('do.' + lab)) + '">' +
    '<svg viewBox="0 0 100 100" aria-hidden="true"><circle class="lptrack" cx="50" cy="50" r="' + R + '"/><circle class="lpring" cx="50" cy="50" r="' + R + '" stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + (C * (1 - (S.pos || 0))).toFixed(1) + '"/></svg>' +
    '<span class="lpic">' + (arm ? '<b class="lpcount">' + (arm.n + 1) + '</b>' : lab === 'resume' ? ui.icons.play : s === 'idle' ? I.rec : s === 'rec' ? I.stop : s === 'play' ? I.plus : I.stop) + '</span>' +
    '<span class="lplab">' + ui.esc(t('do.' + lab)) + '</span></button>';
  const time = '<div class="lptime num">' + (s === 'rec' ? fmt(S.recSec) + ' / ' + fmt(MAX_SEC) : S.len ? fmt(S.len) + (withMetro() ? ' · ' + ctx.tn('bars', Math.round(S.len / barSec())) : '') : '') + '</div>';
  if (size === 'strip') return '<div class="lpstrip">' + main + time + (S.layers.length ? '<span class="lpn num">' + ctx.tn('layers', S.layers.length) + '</span>' : '') + '</div>';
  const layers = S.layers.length ? '<div class="lplayers">' + S.layers.map((L, i) => '<div class="lplayer' + (L.mute ? ' muted' : '') + '" data-li="' + i + '"><button class="lpm" data-x="mute" data-i="' + i + '" aria-label="' + ui.esc(t(L.mute ? 'unmute' : 'mute')) + '" aria-pressed="' + L.mute + '">' + (L.mute ? I.mute : I.vol) + '</button>' +
    '<span class="lpnum num">' + (i + 1) + '</span><input type="range" class="lpvol" min="0" max="1.5" step="0.01" value="' + L.gain + '" data-vol="' + i + '" aria-label="' + ui.esc(t('layerVol', { n: i + 1 })) + '"></div>').join('') + '</div>'
    : '<div class="lphint l2">' + ui.esc(t(small ? 'hintShort' : s === 'idle' ? 'hint' : 'hintMore')) + '</div>';
  const slots = '<div class="lpslots" role="group" aria-label="' + ui.esc(t('loops')) + '">' + Array.from({ length: SLOTS }, (_, i) => '<button class="lpslot' + (i === S.slot ? ' on' : '') + (S.slots[i] ? ' has' : '') + '" data-x="slot" data-i="' + i + '" aria-pressed="' + (i === S.slot) + '" aria-label="' + ui.esc(t('loopN', { n: i + 1 })) + '">' + (i + 1) + '</button>').join('') + '</div>';
  const bar = '<div class="lpbar">' +
    ui.icb('data-x="view"', reelsView() ? I.ring : I.reels, t(reelsView() ? 'viewRing' : 'viewReels'), 'sm') +
    ui.icb('data-x="metro"', I.metro, t('metro'), 'sm' + (withMetro() ? ' on' : '')) +
    ui.icb('data-x="mon"', I.ear, t('mon'), 'sm' + (S.mon ? ' on' : '')) +
    ui.icb('data-x="undo"', I.undo, t('undo'), 'sm') +
    ui.icb('data-x="stop"', I.stop, t('stop'), 'sm') +
    ui.icb('data-x="save"', I.save, t('save'), 'sm') + '</div>';
  if (reelsView()) {
    // «Катушки»: четыре кругляша — слои с волной по кругу, крутятся при игре; ниже — те же слои дорожками со сдвигом
    const reels = '<div class="lpreels">' + Array.from({ length: REELS }, (_, i) => { const L = S.layers[i]; return '<div class="lpreel' + (L ? (L.mute ? ' muted' : '') : ' lpnone') + '" data-li="' + i + '"' + (L ? ' data-x="edit" data-i="' + i + '" role="button" aria-label="' + ui.esc(t('layerEdit', { n: i + 1 })) + '"' : '') + '><canvas class="lpreelcv"></canvas><span class="lpreeln num">' + (i + 1) + '</span></div>'; }).join('') + '</div>';
    const lanes = '<div class="lplanes">' + S.layers.map((L, i) => '<div class="lplane' + (L.mute ? ' muted' : '') + '" data-li="' + i + '"><span class="lpnum num">' + (i + 1) + '</span><canvas class="lplanecv" data-x="edit" data-i="' + i + '" role="button" aria-label="' + ui.esc(t('layerEdit', { n: i + 1 })) + '"></canvas>' +
      '<span class="lpshift">' + ui.icb('data-x="shl" data-i="' + i + '"', I.left, t('earlier'), 'sm plain') + '<button class="lpshv num" data-x="sh0" data-i="' + i + '" aria-label="' + ui.esc(t('shiftReset')) + '">' + (L.shift > 0 ? '+' : '') + L.shift + '</button>' + ui.icb('data-x="shr" data-i="' + i + '"', I.right, t('later'), 'sm plain') + '</span></div>').join('') +
      (S.layers.length ? '' : '<div class="lphint l2">' + ui.esc(t(s === 'idle' ? 'hint' : 'hintMore')) + '</div>') + '</div>';
    return '<div class="lpwrap reels ' + size + '">' + reels + lanes + '<div class="lpmain row">' + main + time + slots + '</div>' + bar + '</div>';
  }
  return '<div class="lpwrap ' + size + '"><div class="lpmain">' + main + time + '</div>' + layers + slots + bar + '</div>';
}

/* ---------- катушки и дорожки: рисунок ---------- */

const peaks = (i, L, n) => { const k = i + ':' + L.ver + ':' + n; let p = peaksCache.get(k); if (!p) { p = lp.peaks(i, n); if (p) { if (peaksCache.size > 64) peaksCache.clear(); peaksCache.set(k, p); } } return p; };
const fit = (cv) => { const r = cv.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1), w = Math.max(1, Math.round(r.width * d)), h = Math.max(1, Math.round(r.height * d)); if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; } return [w, h, d]; };
let css = null;
const colors = () => css || (css = (() => { const s = getComputedStyle(host); return { tint: s.getPropertyValue('--tint').trim(), fill: s.getPropertyValue('--fill').trim(), ink: s.getPropertyValue('--ink').trim(), l2: s.getPropertyValue('--l2').trim(), red: '#D9534F' }; })());

// Катушка: кольцо волны (отрезки по кругу) крутится с петлёй, головка — неподвижная метка сверху
function drawReel(cv, i, L, pos, S) {
  const [w, h] = fit(cv), g = cv.getContext('2d'), C = colors(), cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2, r0 = R * 0.5, r1 = R * 0.92;
  g.clearRect(0, 0, w, h);
  g.beginPath(); g.arc(cx, cy, R * 0.98, 0, Math.PI * 2); g.fillStyle = C.fill; g.fill();
  if (!L) { g.beginPath(); g.arc(cx, cy, r0, 0, Math.PI * 2); g.strokeStyle = C.l2; g.globalAlpha = 0.35; g.setLineDash([4, 6]); g.lineWidth = 2; g.stroke(); g.setLineDash([]); g.globalAlpha = 1; return; }
  const N = 96, pk = peaks(i, L, N), rot = -pos * Math.PI * 2 - Math.PI / 2; // плёнка идёт мимо головки
  g.lineWidth = Math.max(1.5, (Math.PI * 2 * r0) / N * 0.6); g.lineCap = 'round';
  g.strokeStyle = L.mute ? C.l2 : S.state === 'dub' && i === S.layers.length - 1 ? C.red : C.tint;
  g.globalAlpha = L.mute ? 0.35 : 0.9;
  for (let k = 0; k < N; k++) {
    const a = rot + (k / N) * Math.PI * 2, len = r0 + (r1 - r0) * (0.08 + 0.92 * (pk ? pk[k] : 0));
    g.beginPath(); g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); g.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len); g.stroke();
  }
  g.globalAlpha = 1;
  // ось и головка
  g.beginPath(); g.arc(cx, cy, r0 * 0.5, 0, Math.PI * 2); g.fillStyle = C.ink; g.globalAlpha = L.mute ? 0.25 : 0.85; g.fill(); g.globalAlpha = 1;
  g.beginPath(); g.moveTo(cx - 5, cy - R); g.lineTo(cx + 5, cy - R); g.lineTo(cx, cy - R + 9); g.closePath(); g.fillStyle = C.ink; g.fill();
}
// Дорожка: волна слева направо, ход — линия
function drawLane(cv, i, L, pos) {
  const [w, h] = fit(cv), g = cv.getContext('2d'), C = colors(), N = Math.max(24, Math.floor(w / 3)), pk = peaks(i, L, N), bw = w / N;
  g.clearRect(0, 0, w, h);
  g.fillStyle = L.mute ? C.l2 : C.tint; g.globalAlpha = L.mute ? 0.35 : 0.85;
  for (let k = 0; k < N; k++) { const v = pk ? pk[k] : 0, bh = Math.max(2, v * (h - 4)); g.fillRect(k * bw + bw * 0.2, (h - bh) / 2, bw * 0.6, bh); }
  g.globalAlpha = 1;
  if (pos >= 0) { g.fillStyle = C.ink; g.fillRect(pos * w - 1, 0, 2, h); }
}
function drawAll() {
  const S = lp.state, pos = S.state === 'play' || S.state === 'dub' ? S.pos : -1;
  host.querySelectorAll('.lpreel').forEach((el, i) => drawReel(el.querySelector('canvas'), i, S.layers[i], Math.max(0, pos), S));
  host.querySelectorAll('.lplanecv').forEach((cv) => { const i = +cv.dataset.i; if (S.layers[i]) drawLane(cv, i, S.layers[i], pos); });
}

function render() {
  if (!host) return;
  const act = document.activeElement, keep = act && host.contains(act) && act.dataset.vol;
  host.innerHTML = view();
  if (keep) { const r = host.querySelector('[data-vol="' + keep + '"]'); if (r) r.focus(); }
  tick();
}
// кольцо хода петли — без перерисовки
function tick() {
  cancelAnimationFrame(raf);
  if (!host || !lp) return;
  const S = lp.state, ring = host.querySelector('.lpring'), tm = host.querySelector('.lptime');
  if (ring) ring.setAttribute('stroke-dashoffset', (C * (1 - S.pos)).toFixed(1));
  if (tm && S.state === 'rec') tm.textContent = fmt(S.recSec) + ' / ' + fmt(MAX_SEC);
  if (reelsView()) drawAll();
  if (S.state !== 'idle') raf = requestAnimationFrame(tick);
}

/* ---------- окно слоя: границы и сдвиг рукой, эквалайзер, компрессия, реверберация ---------- */

// Вся запись слоя (с хвостом) лентой; окно петли на ней — вести за середину: сдвиг (мс), за края — обрезка.
// Ручки ниже: ±1 и ±10 мс; ползунки — низ, середина, верх (дБ), сжатие и реверберация (0…100 %)
function layerSheet(i) {
  const { t, ui } = ctx, S0 = lp.state, L0 = S0.layers[i];
  if (!L0) return;
  // эффекты слоя — общая панель приложения (ctx.fxPanel): эквалайзер, сжатие, драйв, тремоло, задержка, хор, реверберация
  const pm = ctx.fxPanel({ get: () => (lp.state.layers[i] || {}).fx, set: (fx) => lp.setFx(i, fx) });
  let pmb = null;
  ui.sheet(() => { const L = lp.state.layers[i]; if (!L) return ui.snav(''); return ui.snav(t('layerN', { n: i + 1 })) +
    '<div class="lpedit"><canvas class="lpeditcv" aria-label="' + ui.esc(t('editHint')) + '"></canvas><p class="ftr" style="margin:4px 0 0">' + ui.esc(t('editHint')) + '</p>' +
    '<div class="lpnudge">' + ui.icb('data-nd="-10"', I.left, t('earlier'), 'sm plain') + ui.icb('data-nd="-1"', '−1', t('earlier1'), 'sm plain txt') + '<button class="lpshv num" data-nd="0" aria-label="' + ui.esc(t('shiftReset')) + '">' + (L.shift > 0 ? '+' : '') + L.shift + ' ms</button>' + ui.icb('data-nd="1"', '+1', t('later1'), 'sm plain txt') + ui.icb('data-nd="10"', I.right, t('later'), 'sm plain') + '</div></div>' +
    '<div class="hdr">' + ui.esc(t('fx')) + '</div>' + pm.html() +
    '<div class="group" style="margin-top:12px"><button class="cell" data-lmute><span class="grow">' + ui.esc(t(L.mute ? 'unmute' : 'mute')) + '</span></button><button class="cell danger center" data-lrm>' + ui.esc(t('removeLayer')) + '</button></div>'; },
  (el, sh) => {
    // холст пересоздаётся при каждом sh.update() — берём текущий, слушатели — на шторке
    const cvNow = () => el.querySelector('.lpeditcv'), C = colors();
    let drag = null, live = null; // live: { shift, a, b } во время ведения
    const geom = (cv) => { const S = lp.state, L = S.layers[i], [w, h] = fit(cv), lenMs = S.len * 1000, mg = L ? L.margin : 0, span = lenMs + 2 * mg; return { S, L, w, h, lenMs, mg, span, x: (ms) => ((ms + mg) / span) * w }; };
    function draw() {
      const cv = cvNow(); if (!cv) return;
      const G = geom(cv); if (!G.L) return;
      const { L, w, h, lenMs, mg, x } = G, g = cv.getContext('2d'), sh0 = live ? live.shift : L.shift, a = live ? live.a : L.trim.a, b = live ? live.b : L.trim.b;
      g.clearRect(0, 0, w, h);
      g.fillStyle = C.fill; g.fillRect(0, 0, w, h);
      // запись: от 0 до len+хвост (отрицательный сдвиг берёт конец петли — слева пусто)
      const N = Math.max(48, Math.floor(w / 3)), pk = lp.fullPeaks(i, N), x0 = x(0), x1 = x(lenMs + mg), bw = (x1 - x0) / N;
      g.fillStyle = C.l2; g.globalAlpha = 0.5;
      for (let k = 0; k < N; k++) { const v = pk ? pk[k] : 0, bh = Math.max(2, v * (h - 10)); g.fillRect(x0 + k * bw + bw * 0.2, (h - bh) / 2, bw * 0.6, bh); }
      g.globalAlpha = 1;
      // окно петли: [сдвиг, сдвиг + len]; внутри — обрезка a…b
      const wx0 = x(sh0), wx1 = x(sh0 + lenMs), ta = wx0 + (wx1 - wx0) * a, tb = wx0 + (wx1 - wx0) * b;
      g.fillStyle = C.tint; g.globalAlpha = 0.18; g.fillRect(wx0, 0, wx1 - wx0, h); g.globalAlpha = 0.32; g.fillRect(ta, 0, tb - ta, h); g.globalAlpha = 1;
      g.strokeStyle = C.tint; g.lineWidth = 2; g.strokeRect(wx0 + 1, 1, wx1 - wx0 - 2, h - 2);
      g.fillStyle = C.ink; [ta, tb].forEach((tx, k) => { g.beginPath(); g.moveTo(tx, h); g.lineTo(tx + (k ? -10 : 10), h); g.lineTo(tx, h - 12); g.closePath(); g.fill(); g.fillRect(tx - 1, 0, 2, h); });
      // ход
      if (G.S.state === 'play' || G.S.state === 'dub') { const px = wx0 + (wx1 - wx0) * G.S.pos; g.fillStyle = C.red; g.fillRect(px - 1, 0, 2, h); }
    }
    const pt = (cv, e) => { const r = cv.getBoundingClientRect(), d = cv.width / r.width; return (e.clientX - r.left) * d; };
    el.addEventListener('pointerdown', (e) => {
      const cv = e.target.closest('.lpeditcv'); if (!cv) return;
      const G = geom(cv); if (!G.L) return;
      const { L, w, lenMs, span, x } = G, px = pt(cv, e), wx0 = x(L.shift), wx1 = x(L.shift + lenMs), ta = wx0 + (wx1 - wx0) * L.trim.a, tb = wx0 + (wx1 - wx0) * L.trim.b;
      const near = (v) => Math.abs(px - v) < 18 * (cv.width / cv.getBoundingClientRect().width);
      drag = { id: e.pointerId, cv, x0: px, kind: near(ta) ? 'a' : near(tb) ? 'b' : px >= wx0 && px <= wx1 ? 'shift' : null, shift: L.shift, a: L.trim.a, b: L.trim.b, msPx: span / w, win: wx1 - wx0 };
      if (!drag.kind) { drag = null; return; }
      cv.setPointerCapture(e.pointerId); e.preventDefault();
    });
    el.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = pt(drag.cv, e) - drag.x0, L = lp.state.layers[i], lim = L.margin;
      if (drag.kind === 'shift') live = { shift: Math.max(-lim, Math.min(lim, Math.round(drag.shift + dx * drag.msPx))), a: drag.a, b: drag.b };
      else if (drag.kind === 'a') live = { shift: drag.shift, a: Math.max(0, Math.min(drag.b - 0.02, drag.a + dx / drag.win)), b: drag.b };
      else live = { shift: drag.shift, a: drag.a, b: Math.max(drag.a + 0.02, Math.min(1, drag.b + dx / drag.win)) };
      draw();
    });
    const up = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag, v = live; drag = null; live = null;
      if (!v) return;
      if (d.kind === 'shift') lp.shiftLayer(i, v.shift); else lp.trimLayer(i, v.a, v.b);
      sh.update(); pmb && pmb.mount();
    };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    pmb = pm.bind(el, sh);
    el.addEventListener('click', (e) => {
      let b;
      if ((b = e.target.closest('[data-nd]'))) { const d = +b.dataset.nd, L = lp.state.layers[i]; if (!L) return; lp.shiftLayer(i, d === 0 ? 0 : L.shift + d); sh.update(); pmb && pmb.mount(); }
      else if (e.target.closest('[data-lmute]')) { lp.toggleMute(i); sh.update(); pmb && pmb.mount(); }
      else if (e.target.closest('[data-lrm]')) { lp.removeLayer(i); sh.close(); }
    });
    let r = 0;
    const loop = () => { if (!el.isConnected) { cancelAnimationFrame(r); return; } draw(); r = requestAnimationFrame(loop); };
    loop();
  }, { onClose: render });
}

/* ---------- действия ---------- */

const fail = (e) => {
  const r = e && e.reason;
  ctx.ui.toast(ctx.t(r === 'denied' ? 'err.denied' : r === 'unavailable' ? 'err.mic' : r === 'layers' ? 'err.layers' : e && e.message === 'nosound' ? 'err.sound' : 'err.fail'));
  if (!r) ctx.logErr(e);
};

// Главная кнопка. По метроному и без петли: отсчёт одного такта, запись — с начала следующего
async function main() {
  if (!ctx.audio.unlock()) { fail(new Error('nosound')); return; }
  const S = lp.state;
  if (arm) { disarm(); render(); return; }
  if (S.state === 'idle' && withMetro() && !S.len) {
    try { await lp.openMic(); } catch (e) { fail(e); return; }
    const m = metro();
    arm = { n: m.running ? 0 : 1 }; // метроном уже идёт — с ближайшего такта, иначе один такт отсчёта
    if (!m.running) m.start();
    offBeat = m.onBeat(({ b, ms }) => {
      if (!arm || b !== 0) return;
      if (arm.n > 0) { arm.n--; render(); return; }
      const at = ctx.audio.now() + ms / 1000;
      disarm();
      lp.startRec(at).then(render).catch(fail);
    });
    render();
    return;
  }
  if (S.state === 'idle' && S.len) { lp.play(); render(); return; }
  try { await lp.tap(withMetro() ? barSec() : 0); } catch (e) { fail(e); }
  render();
}
function disarm() { arm = null; if (offBeat) { offBeat(); offBeat = null; } }
function stopAll() { disarm(); lp.stop(); if (withMetro() && metro().running) metro().stop(); render(); }

async function save() {
  const m = lp && lp.mix();
  if (!m) { ctx.ui.toast(ctx.t('err.empty')); return; }
  const wav = encodeWav([m.data], m.sr), at = Date.now(), song = ctx.session && ctx.session.songId;
  let d;
  try { d = new Date(at).toLocaleString(ctx.lang() === 'uz' ? 'uz-Latn' : ctx.lang(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { d = new Date(at).toISOString().slice(0, 16); }
  try {
    await ctx.files.add({ id: 'lp' + at.toString(36), name: ctx.t('fileName', { when: d }), size: wav.length, type: 'audio/wav', kind: 'audio', songs: song ? [song] : [], created: at,
      blob: new Blob([wav], { type: 'audio/wav' }), dur: m.data.length / m.sr });
    ctx.ui.toast(ctx.t('saved'));
  } catch (e) { fail(e); }
}

function act(x, el) {
  const i = el && el.dataset.i != null ? +el.dataset.i : -1;
  switch (x) {
    case 'main': main(); break;
    case 'stop': stopAll(); break;
    case 'undo': if (arm) { disarm(); render(); } else { ctx.ui.toast(ctx.t(lp.undo() ? 'undone' : 'nothing')); render(); } break;
    case 'save': save(); break;
    case 'metro': st().metro = !withMetro(); ctx.store.save(); render(); break;
    case 'mon': lp.setMonitor(!lp.state.mon); if (lp.state.mon) ctx.ui.toast(ctx.t('monOn')); render(); break;
    case 'mute': lp.toggleMute(i); render(); break;
    case 'slot': if (arm) disarm(); lp.select(i); render(); break;
    case 'view': st().view = reelsView() ? 'ring' : 'reels'; ctx.store.save(); render(); break;
    case 'shl': lp.shiftLayer(i, (lp.state.layers[i].shift || 0) + SHIFT_STEP); render(); break;
    case 'shr': lp.shiftLayer(i, (lp.state.layers[i].shift || 0) - SHIFT_STEP); render(); break;
    case 'sh0': lp.shiftLayer(i, 0); render(); break;
    case 'edit': layerSheet(i); break;
  }
}

// Педаль Bluetooth (как для перелистывания): пробел, Enter, PageDown — кнопка; PageUp — стоп; стрелки — отмена
function onKey(e) {
  if (!host || e.target.matches('input, textarea, select')) return;
  const k = e.key;
  if (k === ' ' || k === 'Enter' || k === 'PageDown') { e.preventDefault(); main(); }
  else if (k === 'PageUp') { e.preventDefault(); stopAll(); }
  else if (k === 'ArrowUp' || k === 'ArrowDown') { e.preventDefault(); act('undo'); }
}

export default {
  id: 'looper',
  order: 46,
  name: { ru: ru.name, uz: uz.name, en: en.name },
  i18n: { ru, uz, en },
  icon: ICON,
  color: '#B5533C',
  sizes: ['full', 'half', 'quarter', 'strip'],
  record: false, // лупер сам пишет микрофон; сведение — кнопкой «В медиатеку»
  status(c) { return c.t(c.store.get('metro') ? 'st.metro' : 'st.free'); },
  mount(el, c, sz = 'full') {
    host = el; ctx = c; size = sz;
    if (!lp) lp = createLooper({ mixer: c.audio.mixer, onChange: () => tick(), log: c.log });
    lp.setShift(st().shift || 0);
    const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); offs.push(() => t.removeEventListener(ev, fn, o)); };
    on(host, 'click', (e) => { const b = e.target.closest('[data-x]'); if (b) act(b.dataset.x, b); });
    on(host, 'input', (e) => { if (e.target.dataset.vol != null) lp.setGain(+e.target.dataset.vol, +e.target.value); });
    on(window, 'keydown', onKey);
    // удержание кнопки — отмена последнего слоя; удержание слоя — убрать его
    onHold(host, '[data-x="main"]', () => act('undo'));
    onHold(host, '.lplayer, .lplane, .lpreel:not(.empty)', (row) => holdMenu(row, [{ icon: I.x, label: c.t('removeLayer'), danger: true, run: () => { lp.removeLayer(+row.dataset.li); render(); } }], c.t('layerN', { n: +row.dataset.li + 1 })));
    render();
  },
  resize(sz) { size = sz; render(); },
  // Окно закрыто: петля звучит дальше (как Hold у пианино), пока не остановят — удобно играть под неё в другом инструменте
  unmount() {
    cancelAnimationFrame(raf);
    disarm();
    offs.splice(0).forEach((f) => f());
    if (lp && lp.state.state === 'rec') lp.stop();
    if (lp && lp.state.state === 'dub') lp.stopDub();
    if (lp && !lp.hasAny && lp.state.state === 'idle') { lp.close(); }
    host = null;
  },
};
