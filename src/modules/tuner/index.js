// Тюнер. Обычный режим — хроматический: показывает любую ноту. Режим новичка — по строю инструмента: подсвечивает
// сыгранную струну, отмечает настроенные и напоминает, как настраивать безопасно.
// Виды шкалы: стрелка, стробоскоп-панорама (лента нот и бегущие полосы), полоса, кольцо. Показания приходят ~14 раз
// в секунду, а стрелка, точка и полосы движутся плавно между ними (экспоненциальное сглаживание по кадрам).
// Микрофон включается сам, пока окно тюнера открыто.
import './tuner.css';
import ru from './i18n/ru.json';
import uz from './i18n/uz.json';
import en from './i18n/en.json';
import el from './i18n/el.json';
import { yin, createPitchSmoother } from '../../audio/pitch.js';
import { TUNINGS, TOL, STYLES, normalizeTuner, curTuning, reading, inRange, mName, splitN } from '../../music/tuning.js';

const ICON = '<svg viewBox="0 0 24 24"><path d="M9 3v8a3 3 0 0 0 6 0V3M12 14v7"/></svg>';
const WARN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5 2.8 19.5h18.4zM12 10v4.5M12 17.2v.3"/></svg>';
const TICK_MS = 70, SILENCE_MS = 1400, TAU = 0.09, TUNED_MS = 700;
// Чувствительность: порог тишины. Микрофоны телефонов без автоусиления дают тихий сигнал, поэтому по умолчанию — «обычная»,
// втрое чувствительнее прежнего порога (−42 дБ → −52 дБ); «высокая» — для тихих инструментов и дальнего телефона
const SENS = { low: 0.008, normal: 0.0025, high: 0.0008 };

let host = null, ctx = null, size = 'full', ro = null;
let mic = null, timer = 0, raf = 0, smooth = null, lastT = 0, lock = null, micErr = null, starting = false;
// R — последнее показание (цель), D — то, что сейчас нарисовано (догоняет R)
let R = null;
const D = { c: 0, m: null, a: 0, ph1: 0, ph2: 0, t: 0 };
const tuned = new Set(); // настроенные струны (номера) в режиме новичка
let okSince = 0, okSi = -1, colors = null;

const st = () => {
  const s = normalizeTuner(ctx.store.all());
  // строи — только в режиме новичка (раньше был отдельный переключатель «настраивать по строю»)
  s.beginner ??= !!s.useTuning;
  return s;
};
const tol = () => TOL[st().tol] ?? 5;
const tuning = () => { const s = st(); return s.beginner ? curTuning({ ...s, useTuning: true }) : null; };
const tuningName = (tn) => (tn.custom ? tn.name : ctx.t(tn.nameKey));

function arcD(cx, cy, r, a0, a1) {
  const p = (a) => [cx + r * Math.cos((a * Math.PI) / 180), cy + r * Math.sin((a * Math.PI) / 180)];
  const [x0, y0] = p(a0), [x1, y1] = p(a1);
  return 'M' + x0.toFixed(2) + ' ' + y0.toFixed(2) + 'A' + r + ' ' + r + ' 0 ' + (Math.abs(a1 - a0) > 180 ? 1 : 0) + ' ' + (a1 >= a0 ? 1 : 0) + ' ' + x1.toFixed(2) + ' ' + y1.toFixed(2);
}

/* ---------- шкалы ---------- */

// Стрелка: ±50 центов на ±60°. Зелёная зона — ровно допуск точности, по краям мягкий переход
function gaugeSVG() {
  const k = 1.2, T = tol(), P = (r, deg) => { const a = ((deg - 90) * Math.PI) / 180; return [150 + r * Math.cos(a), 160 + r * Math.sin(a)]; };
  let s = '<svg viewBox="0 0 300 176" class="gauge" aria-hidden="true"><defs><linearGradient id="tgz" x1="0" x2="1"><stop offset="0" stop-color="#34C759" stop-opacity="0"/>' +
    '<stop offset=".5" stop-color="#34C759" stop-opacity=".35"/><stop offset="1" stop-color="#34C759" stop-opacity="0"/></linearGradient></defs>';
  s += '<path d="' + arcD(150, 160, 126, -90 - 60, -90 + 60) + '" class="gtrack"/>';
  s += '<path d="' + arcD(150, 160, 126, -90 - (T + 10) * k, -90 + (T + 10) * k) + '" class="gsoft"/>';
  s += '<path d="' + arcD(150, 160, 126, -90 - T * k, -90 + T * k) + '" class="gzone" id="gzone"/>';
  for (let c = -50; c <= 50; c += 5) {
    const big = c % 25 === 0, [x1, y1] = P(big ? 104 : 110, c * k), [x2, y2] = P(116, c * k);
    s += '<line x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) + '" class="gtick' + (big ? ' big' : '') + (c === 0 ? ' zero' : '') + '"/>';
  }
  [[-50, '−50'], [50, '+50']].forEach(([c, l]) => { const [x, y] = P(92, c * k); s += '<text x="' + x.toFixed(1) + '" y="' + (y + 4).toFixed(1) + '" class="glab">' + l + '</text>'; });
  s += '<text x="38" y="132" class="gfs" id="gflat">♭</text><text x="262" y="132" class="gfs" id="gsharp">♯</text>';
  return s + '<g id="tneedle" class="needle"><path d="M150 46 L154 156 Q150 162 146 156 Z"/><circle cx="150" cy="160" r="8"/><circle cx="150" cy="160" r="3" class="hub"/></g></svg>';
}

// Полоса: шкала центов, зона допуска, бегунок
function barHTML(cls = '') {
  const T = tol();
  return '<div class="tbar ' + cls + '" aria-hidden="true"><span class="tbfs">♭</span><div class="tbtrack"><i class="tbsoft" style="width:' + (T + 10) + '%"></i><i class="tbzone" style="width:' + T + '%"></i>' +
    [-40, -30, -20, -10, 10, 20, 30, 40].map((c) => '<i class="tbtick" style="left:' + (50 + c / 1) + '%"></i>').join('') + '<i class="tbmid"></i><i class="tbm" id="tbarm"></i></div><span class="tbfs">♯</span></div>';
}

// Кольцо: ±50 центов на ±90°; дуга от верха до точки показывает отклонение
function ringHTML() {
  const T = tol();
  return '<div class="tringw" id="tringw"><svg viewBox="0 0 200 200" class="tring" aria-hidden="true"><circle cx="100" cy="100" r="84" class="trtrack"/>' +
    '<path d="' + arcD(100, 100, 84, -90 - (T + 10) * 1.8, -90 + (T + 10) * 1.8) + '" class="trsoft"/><path d="' + arcD(100, 100, 84, -90 - T * 1.8, -90 + T * 1.8) + '" class="trzone"/>' +
    '<path id="trdev" class="trdev" d=""/><line x1="100" y1="8" x2="100" y2="26" class="trzero"/><g id="tringdot" class="trdot"><circle cx="100" cy="16" r="9"/></g></svg>' +
    '<div class="tringin">' + noteHTML() + '</div></div>';
}

// Стробоскоп-панорама: сверху лента нот едет под неподвижной меткой, снизу полосы бегут в сторону фальши
const strobeHTML = () => '<div class="tpano" id="tpano"><canvas id="tpanocv"></canvas></div>';

const noteHTML = () => '<div class="tnoteW" id="tnoteW"><span id="tnote">—</span><span id="toct" class="toct"></span></div>';

/* ---------- разметка ---------- */

function stringsHTML(tn) {
  const { t, ui } = ctx;
  return '<div class="tstrs" role="group" aria-label="' + t('strings') + '">' + tn.names.map((n, i) => {
    const [nm, oc] = splitN(n), num = tn.names.length - i;
    return '<button class="tsb' + (lock === i ? ' lock' : '') + (tuned.has(i) ? ' done' : '') + '" data-x="tstr" data-v="' + i + '" aria-pressed="' + (lock === i) + '" aria-label="' +
      ui.esc(t('stringBtn', { n: num, note: n }) + (tuned.has(i) ? ', ' + t('tuned') : '')) + '"><b>' + nm + '<sub>' + oc + '</sub></b><small>' + num + '</small><i class="tsok">✓</i></button>';
  }).join('') + '</div>';
}

function micNote() {
  if (!micErr) return '';
  const { t } = ctx;
  return '<div class="tnomic" role="alert"><span>' + t(micErr === 'denied' ? 'micDenied' : 'micNone') + '</span><button class="link" data-x="tretry">' + t('micRetry') + '</button></div>';
}

function view() {
  const { t, ui } = ctx, s = st(), tn = tuning(), style = ctx.mono ? 'bar' : s.style; // «Минимал» — шкала
  const cents = '<div id="tcent" class="tcent" aria-live="polite">' + t('play') + '</div>';
  const hz = '<div id="thz" class="thz num">' + t('hzNone') + '</div>';
  if (size === 'quarter') return '<div class="tq">' + noteHTML() + barHTML('sm') + cents + micNote() + '</div>';
  if (size === 'strip') return '<div class="ts">' + noteHTML() + '<div class="tsmid">' + barHTML('sm') + cents + '</div>' + micNote() + '</div>';
  const vis = style === 'ring' ? ringHTML() : style === 'strobe' ? strobeHTML() : style === 'bar' ? '<div class="tbarw">' + barHTML() + '</div>' : '<div class="tgw">' + gaugeSVG() + '</div>';
  // в половине окна — короткое напоминание, чтобы шкале хватило места
  const warn = tn ? '<div class="twarn" role="note">' + WARN + '<span>' + t(size === 'half' ? 'warnShort' : 'warn') + '</span></div>' : '';
  const mode = '<div class="tmode">' + ui.esc(tn ? t('beginner') + ' · ' + tuningName(tn) : t('chromatic')) + ' · ' + t('hz', { f: s.a4 }) + '</div>';
  return '<div class="tclean ' + size + ' st-' + style + (tn ? ' beg' : '') + '">' + ui.icb('data-x="tset"', ui.icons.gear, t('settings'), 'sm tgear') + warn +
    '<div class="tvis">' + vis + '</div>' + (style === 'ring' ? '' : noteHTML()) + cents + hz + (tn ? stringsHTML(tn) : '') + micNote() + mode + '</div>';
}

function render() {
  if (!host) return;
  host.innerHTML = view();
  const cs = getComputedStyle(host);
  colors = { ink: cs.getPropertyValue('--ink').trim() || '#000', l2: cs.getPropertyValue('--l2').trim() || '#888', l3: cs.getPropertyValue('--l3').trim() || '#ccc',
    fill: cs.getPropertyValue('--fill').trim() || '#eee', tint: cs.getPropertyValue('--tint').trim() || '#f90' };
  sizeCanvas();
  showText();
}

function sizeCanvas() {
  const cv = host && host.querySelector('#tpanocv');
  if (!cv) return;
  const r = cv.parentNode.getBoundingClientRect(), dpr = Math.min(3, globalThis.devicePixelRatio || 1);
  cv.width = Math.max(1, Math.round(r.width * dpr));
  cv.height = Math.max(1, Math.round(r.height * dpr));
}

/* ---------- показания ---------- */

const q = (id) => host && host.querySelector('#' + id);

// Подпись под нотой: «Настроено», «+7 центов», «Ниже на 1,5 тона — натянуть струну»
function centsText(c, ok, tn) {
  const { t, tn: tnum, num } = ctx, r = Math.round(Math.abs(c));
  if (ok) return t('inTune');
  if (tn) {
    const x = r >= 100 ? t('tones', { n: num(r / 100, 1) }) : tnum('cents', r);
    return t(c < 0 ? 'lower' : 'higher', { x });
  }
  return (c > 0 ? '+' : '−') + tnum('cents', r);
}

// Текст — по показаниям (14 раз в секунду), движение — в кадрах
function showText() {
  const nE = q('tnote');
  if (!nE) return;
  const { t, num } = ctx, cE = q('tcent'), hE = q('thz'), oE = q('toct'), w = q('tnoteW'), tn = tuning();
  if (!R) {
    nE.textContent = '—';
    if (oE) oE.textContent = '';
    if (cE) { cE.textContent = micErr ? '' : t('play'); cE.className = 'tcent'; }
    if (hE) hE.textContent = t('hzNone');
    if (w) w.classList.remove('ok');
    host.querySelectorAll('.tsb').forEach((b) => b.classList.remove('near'));
    return;
  }
  nE.textContent = R.note;
  if (oE) oE.textContent = R.oct;
  if (cE) { cE.textContent = centsText(R.cents, R.ok, tn); cE.className = 'tcent' + (R.ok ? ' ok' : R.cents < 0 ? ' flat' : ' sharp'); }
  if (hE) hE.textContent = tn ? t('hzTarget', { f: num(R.f, 1), target: num(R.targetHz, 1) }) : t('hz', { f: num(R.f, 1) });
  if (w) w.classList.toggle('ok', R.ok);
  host.querySelectorAll('.tsb').forEach((b) => b.classList.toggle('near', +b.dataset.v === R.si));
}

// Струна настроена, если держится в допуске TUNED_MS
function markTuned() {
  if (!R || !tuning() || !R.ok) { okSince = 0; okSi = -1; return; }
  const now = performance.now();
  if (okSi !== R.si) { okSi = R.si; okSince = now; return; }
  if (now - okSince > TUNED_MS && !tuned.has(R.si)) {
    tuned.add(R.si);
    const b = host && host.querySelector('.tsb[data-v="' + R.si + '"]');
    if (b) { b.classList.add('done'); b.setAttribute('aria-label', b.getAttribute('aria-label') + ', ' + ctx.t('tuned')); }
  }
}

function tick() {
  if (!mic) return;
  let f = yin(mic.read(), mic.sampleRate, SENS[st().sens] ?? SENS.normal);
  if (f && !inRange(f)) f = 0;
  if (!f) {
    if (R && Date.now() - lastT > SILENCE_MS) { R = null; okSince = 0; showText(); }
    return;
  }
  lastT = Date.now();
  const s = st(), sf = smooth(f), r = reading(sf, { a4: s.a4, tuning: tuning(), lock, tol: tol() });
  R = { ...r, f: sf, m: 69 + 12 * Math.log2(sf / s.a4) };
  showText();
  markTuned();
}

/* ---------- кадры: плавное движение ---------- */

function frame(now) {
  raf = 0;
  if (!host) return;
  const dt = D.t ? Math.min(0.1, (now - D.t) / 1000) : 0;
  D.t = now;
  const k = 1 - Math.exp(-dt / TAU), on = !!R;
  const tc = on ? Math.max(-50, Math.min(50, R.cents)) : 0;
  D.c += (tc - D.c) * k;
  D.a += ((on ? 1 : 0) - D.a) * (1 - Math.exp(-dt / (on ? 0.08 : 0.35)));
  if (on) D.m = D.m == null ? R.m : D.m + (R.m - D.m) * (Math.abs(R.m - D.m) > 3 ? 1 : k);
  const ok = on && R.ok;
  const nd = q('tneedle');
  if (nd) {
    nd.setAttribute('transform', 'rotate(' + (D.c * 1.2).toFixed(2) + ' 150 160)');
    nd.classList.toggle('ok', ok);
    nd.style.opacity = (0.35 + 0.65 * D.a).toFixed(2);
    const fl = q('gflat'), sh = q('gsharp'), gz = q('gzone');
    if (fl) fl.classList.toggle('on', on && !ok && R.cents < 0);
    if (sh) sh.classList.toggle('on', on && !ok && R.cents > 0);
    if (gz) gz.classList.toggle('ok', ok);
  }
  host.querySelectorAll('.tbar').forEach((b) => {
    const m = b.querySelector('.tbm');
    if (m) { m.style.left = (50 + D.c).toFixed(2) + '%'; m.style.opacity = (0.35 + 0.65 * D.a).toFixed(2); }
    b.classList.toggle('ok', ok);
    b.classList.toggle('flat', on && !ok && R.cents < 0);
    b.classList.toggle('sharp', on && !ok && R.cents > 0);
  });
  const dot = q('tringdot');
  if (dot) {
    const ang = D.c * 1.8;
    dot.setAttribute('transform', 'rotate(' + ang.toFixed(2) + ' 100 100)');
    dot.classList.toggle('ok', ok);
    dot.style.opacity = (0.35 + 0.65 * D.a).toFixed(2);
    const dev = q('trdev');
    if (dev) dev.setAttribute('d', Math.abs(ang) > 0.5 && on ? arcD(100, 100, 72, -90, -90 + ang) : '');
    const w = q('tringw');
    if (w) w.classList.toggle('ok', ok);
  }
  drawPano(dt, ok, on);
  if (mic || D.a > 0.01 || Math.abs(D.c) > 0.05) raf = requestAnimationFrame(frame);
}

function drawPano(dt, ok, on) {
  const cv = q('tpanocv');
  if (!cv || !colors) return;
  const g = cv.getContext('2d'), W = cv.width, H = cv.height, dpr = W / Math.max(1, cv.clientWidth);
  if (!W || !H) return;
  g.clearRect(0, 0, W, H);
  const tapeH = H * 0.58, px = Math.max(80 * dpr, W / 5), mid = W / 2, m0 = D.m ?? 69;
  // лента нот: ноты через полутон, мелкие деления — через 10 центов
  g.globalAlpha = 0.45 + 0.55 * D.a;
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  const from = Math.floor(m0 - mid / px) - 1, to = Math.ceil(m0 + mid / px) + 1;
  for (let m = from; m <= to; m++) {
    const x = mid + (m - m0) * px, cur = on && R && Math.round(R.m) === m;
    g.fillStyle = cur ? (ok ? '#34C759' : colors.ink) : colors.l2;
    g.font = (cur ? '700 ' : '500 ') + Math.round((cur ? 26 : 18) * dpr) + 'px system-ui, sans-serif';
    g.fillText(mName(m), x, tapeH * 0.5);
    g.strokeStyle = colors.l3;
    for (let j = 0; j < 10; j++) {
      const xx = x + (j * px) / 10, big = j === 0, h = big ? tapeH * 0.3 : j === 5 ? tapeH * 0.2 : tapeH * 0.12;
      g.lineWidth = (big ? 2 : 1) * dpr;
      g.beginPath(); g.moveTo(xx, tapeH); g.lineTo(xx, tapeH - h); g.stroke();
    }
  }
  // полосы стробоскопа: скорость пропорциональна отклонению, в допуске — стоят
  const v = on ? Math.max(-50, Math.min(50, R.cents)) : 0;
  D.ph1 = (D.ph1 + v * 1.4 * dpr * dt) % (48 * dpr);
  D.ph2 = (D.ph2 + v * 2.8 * dpr * dt) % (96 * dpr);
  const sy = tapeH + 8 * dpr, sh = (H - sy) / 2 - 3 * dpr;
  [[D.ph1, 24 * dpr, sy], [D.ph2, 48 * dpr, sy + sh + 6 * dpr]].forEach(([ph, p, y]) => {
    g.fillStyle = ok ? '#34C759' : colors.ink;
    g.globalAlpha = (0.15 + 0.6 * D.a) * (y === sy ? 1 : 0.6);
    for (let x = -2 * p + (((ph % (2 * p)) + 2 * p) % (2 * p)); x < W; x += 2 * p) g.fillRect(x, y, p, sh);
  });
  // неподвижная метка по центру
  g.globalAlpha = 1;
  g.fillStyle = ok ? '#34C759' : colors.tint;
  g.fillRect(mid - 1.5 * dpr, 0, 3 * dpr, H);
  g.beginPath(); g.moveTo(mid - 7 * dpr, 0); g.lineTo(mid + 7 * dpr, 0); g.lineTo(mid, 9 * dpr); g.closePath(); g.fill();
}

const kick = () => { if (!raf && host) { D.t = 0; raf = requestAnimationFrame(frame); } };

/* ---------- микрофон ---------- */

async function micStart() {
  if (mic || starting) return;
  starting = true;
  micErr = null;
  try {
    const m = await ctx.mic.request();
    starting = false;
    if (!host) { m.stop(); return; } // окно закрыли, пока система спрашивала разрешение
    mic = m;
    smooth = createPitchSmoother();
    timer = setInterval(tick, TICK_MS);
    render();
    kick();
  } catch (e) {
    starting = false;
    micErr = e.reason === 'denied' ? 'denied' : 'unavailable';
    render();
  }
}

function micStop() {
  clearInterval(timer);
  timer = 0;
  if (mic) mic.stop();
  mic = null;
  R = null;
}

/* ---------- шторки ---------- */

function a4Sheet(after) {
  const { t, ui } = ctx, s = st();
  ui.sheet(() => ui.snav(t('a4.title')) +
    '<div style="text-align:center;font-size:48px;font-weight:300;margin:6px 0 14px" class="num">' + s.a4 + ' <span style="font-size:20px;color:var(--l2)">' + t('a4.unit') + '</span></div>' +
    '<div class="group"><div class="cell"><span class="grow">' + t('a4.fine') + '</span><span class="stepper"><button data-a="-1" aria-label="' + t('a4.minus') + '">−</button>' +
    '<button data-a="1" aria-label="' + t('a4.plus') + '">+</button></span></div><div class="cellcol">' +
    ui.seg('a4', [432, 440, 442, 443].map((v) => [v, v]), s.a4, t('a4.title')) + '</div></div><p class="ftr">' + t('a4.ftr') + '</p>',
  (el, sh) => el.addEventListener('click', (e) => {
    const a = e.target.closest('[data-a]'), p = e.target.closest('[data-seg="a4"] [data-v]');
    if (!a && !p) return;
    s.a4 = p ? +p.dataset.v : Math.max(415, Math.min(466, s.a4 + +a.dataset.a));
    ctx.store.save();
    ctx.audio.drone.retune();
    sh.update();
    render();
    if (after) after();
  }));
}

function settingsSheet() {
  const { t, ui } = ctx, s = st();
  const body = () => {
    const tn = tuning();
    return ui.snav(t('set.title')) +
      '<div class="group" style="margin-top:4px"><div class="cell"><span class="grow">' + t('beginner') + '</span>' + ui.sw('tbeg', s.beginner, t('beginner')) + '</div>' +
      (s.beginner ? '<button class="cell" data-tpk><span class="grow">' + t('set.tuning') + '</span><span class="val">' + ui.esc(tn ? tuningName(tn) : t('set.noTuning')) + '</span>' + ui.icons.chev + '</button>' : '') + '</div>' +
      '<p class="ftr">' + t(s.beginner ? 'set.begOn' : 'set.begOff') + '</p>' +
      (ctx.mono ? '<div class="hdr">' + t('set.view') + '</div><p class="ftr" style="margin-top:0">' + t('monoFixed', { v: t('style.bar') }) + '</p>' :
      '<div class="hdr">' + t('set.view') + '</div><div class="tstys" role="group" aria-label="' + t('set.view') + '">' +
      STYLES.map((k) => '<button class="tsty' + (s.style === k ? ' on' : '') + '" data-tsty="' + k + '" aria-pressed="' + (s.style === k) + '"><span class="tsi ' + k +
        '"><i></i><i></i><i></i></span><b>' + t('style.' + k) + '</b></button>').join('') + '</div>') +
      '<div class="hdr">' + t('set.sens') + '</div><div class="group"><div class="cellcol">' + ui.seg('tsens', Object.keys(SENS).map((k) => [k, t('sens.' + k)]), s.sens || 'normal', t('set.sens')) +
      '<div class="segcap">' + t('sens.hint') + '</div></div></div>' +
      '<div class="hdr">' + t('set.tol') + '</div><div class="group">' + Object.keys(TOL).map((k) => '<button class="cell" data-ttol="' + k + '" aria-pressed="' + (s.tol === k) +
        '"><span class="grow"><div class="ttl">' + t('tol.' + k) + '</div><div class="st">' + t('tol.' + k + '.d') + '</div></span>' + (s.tol === k ? ui.icons.check : '') + '</button>').join('') + '</div>' +
      '<div class="hdr">' + t('a4.title') + '</div><div class="group"><button class="cell" data-ta4><span class="grow">A4</span><span class="val">' + t('hz', { f: s.a4 }) + '</span>' + ui.icons.chev + '</button></div>';
  };
  ui.sheet(body, (el, sh) => {
    const changed = () => { ctx.store.save(); sh.update(); render(); };
    el.addEventListener('click', (e) => {
      const g = (x) => e.target.closest(x);
      let b;
      if ((b = g('[data-seg="tsens"] [data-v]'))) s.sens = b.dataset.v;
      else if ((b = g('[data-tsty]'))) s.style = b.dataset.tsty;
      else if ((b = g('[data-ttol]'))) s.tol = b.dataset.ttol;
      else if (g('[data-tpk]')) { sh.close(); tuningPicker(); return; }
      else if (g('[data-ta4]')) { sh.close(); a4Sheet(); return; }
      else return;
      changed();
    });
    el.addEventListener('change', (e) => {
      if (e.target.dataset.sw !== 'tbeg') return;
      s.beginner = e.target.checked;
      if (s.beginner && (!s.tuning || s.tuning === 'chrom')) s.tuning = 'g_std';
      lock = null;
      tuned.clear();
      changed();
    });
  });
}

function tuningPicker(after) {
  const { t, ui } = ctx, s = st();
  const row = (id, title, sub) => '<button class="cell" data-tun="' + id + '" aria-pressed="' + (s.tuning === id) + '"><span class="grow"><div class="ttl">' + ui.esc(title) + '</div>' +
    (sub ? '<div class="st">' + ui.esc(sub) + '</div>' : '') + '</span>' + (s.tuning === id ? ui.icons.check : '') + '</button>';
  const body = () => ui.snav(t('set.tuning')) +
    TUNINGS.map(([g, ls]) => '<div class="hdr">' + t('group.' + g) + '</div><div class="group">' + ls.map(([id, ns]) => row(id, t('tuning.' + id), ns)).join('') + '</div>').join('') +
    '<div class="hdr">' + t('pick.mine') + '</div><div class="group">' + s.customs.map((c) => '<div class="cell"><button class="grow" data-tun="' + c.id +
      '" style="text-align:left;min-width:0"><div class="ttl">' + ui.esc(c.name) + '</div><div class="st">' + c.midis.map(mName).join(' ') + '</div></button><button class="link" data-cedit="' +
      c.id + '" style="font-size:15px;margin-right:8px">' + t('pick.edit') + '</button>' + (s.tuning === c.id ? ui.icons.check : '') + '</div>').join('') +
    '<button class="cell act" data-cedit="new">' + t('pick.new') + '</button></div><p class="ftr">' + t('pick.ftr') + '</p>';
  ui.sheet(body, (el, sh) => el.addEventListener('click', (e) => {
    const tb = e.target.closest('[data-tun]');
    if (tb) { s.tuning = tb.dataset.tun; lock = null; tuned.clear(); ctx.store.save(); sh.close(); render(); if (after) after(); return; }
    const ce = e.target.closest('[data-cedit]');
    if (ce) { sh.close(); customEditor(ce.dataset.cedit, after); }
  }));
}

function customEditor(id, after) {
  const { t, ui } = ctx, s = st(), ex = s.customs.find((c) => c.id === id), tn = tuning();
  let name = ex ? ex.name : t('custom.default');
  const midis = ex ? ex.midis.slice() : tn ? tn.midis.slice() : [40, 45, 50, 55, 59, 64];
  const body = () => ui.snav(t(ex ? 'custom.editTitle' : 'custom.newTitle'), {
    left: '<button class="link l" data-k="cancel">' + t('cancel') + '</button>', right: '<button class="link b r" data-k="save">' + t('save') + '</button>' }) +
    '<div class="group"><label class="cell"><input class="inp left" id="cname" value="' + ui.esc(name) + '" placeholder="' + t('custom.name') + '" aria-label="' + t('custom.name') + '" maxlength="40"></label></div>' +
    '<div class="hdr">' + t('custom.strings') + '</div><div class="group">' + midis.map((m, i) => '<div class="cell"><button class="link" data-k="rm" data-i="' + i + '" aria-label="' +
      t('custom.remove') + '" style="color:var(--red);font-size:22px;width:28px">⊖</button><span class="grow">' + t('custom.string', { n: midis.length - i }) +
      '</span><span class="val num" style="color:var(--ink);margin-right:6px;min-width:3ch">' + mName(m) + '</span><span class="stepper"><button data-k="dn" data-i="' + i +
      '" aria-label="' + t('custom.down') + '">−</button><button data-k="up" data-i="' + i + '" aria-label="' + t('custom.up') + '">+</button></span></div>').join('') +
    (midis.length < 12 ? '<button class="cell act" data-k="add">' + t('custom.add') + '</button>' : '') + '</div><p class="ftr">' + t('custom.ftr') + '</p>' +
    (ex ? '<div class="group" style="margin-top:24px"><button class="cell danger center" data-k="del">' + t('custom.delete') + '</button></div>' : '');
  ui.sheet(body, (el, sh) => {
    const re = () => { name = el.querySelector('#cname').value; sh.update(); };
    const done = () => { lock = null; tuned.clear(); ctx.store.save(); sh.close(); render(); if (after) after(); };
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-k]');
      if (!b) return;
      const k = b.dataset.k, i = +b.dataset.i;
      if (k === 'up') { midis[i] = Math.min(96, midis[i] + 1); ctx.audio.refTone(midis[i]); re(); }
      else if (k === 'dn') { midis[i] = Math.max(12, midis[i] - 1); ctx.audio.refTone(midis[i]); re(); }
      else if (k === 'rm') { if (midis.length > 1) { midis.splice(i, 1); re(); } }
      else if (k === 'add') { midis.push(Math.min(96, midis[midis.length - 1] + 5)); re(); }
      else if (k === 'cancel') { sh.close(); tuningPicker(after); }
      else if (k === 'del') { s.customs = s.customs.filter((c) => c.id !== id); if (s.tuning === id) s.tuning = 'g_std'; done(); }
      else if (k === 'save') {
        name = el.querySelector('#cname').value.trim() || t('custom.default');
        if (ex) { ex.name = name; ex.midis = midis.slice(); s.tuning = id; }
        else {
          const nid = 'c_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
          s.customs.push({ id: nid, name, midis: midis.slice() });
          s.tuning = nid;
        }
        done();
      }
    });
  });
}

/* ---------- жесты ---------- */

let onClick = null;
function bind() {
  onClick = (e) => {
    const x = e.target.closest('[data-x]');
    if (!x) return;
    const a = x.dataset.x;
    if (a === 'tset') settingsSheet();
    else if (a === 'tretry') micStart();
    else if (a === 'tstr') {
      // нажатие на струну: опорный звук и настройка только этой струны; повторное — снова автоопределение
      const i = +x.dataset.v, tn = tuning();
      if (lock === i) lock = null;
      else { lock = i; if (tn) ctx.audio.refTone(tn.midis[i]); }
      host.querySelectorAll('.tsb').forEach((b) => { const on = +b.dataset.v === lock; b.classList.toggle('lock', on); b.setAttribute('aria-pressed', on); });
    }
  };
  host.addEventListener('click', onClick);
}

export default {
  id: 'tuner',
  order: 20,
  name: { ru: ru.name, uz: uz.name, en: en.name, el: el.name },
  i18n: { ru, uz, en, el },
  icon: ICON,
  color: '#AF52DE',
  sizes: ['full', 'half', 'quarter', 'strip'],
  group: 'rhythm',
  status(c) {
    const s = normalizeTuner(c.store.all()), beg = s.beginner ?? !!s.useTuning, tn = beg ? curTuning({ ...s, useTuning: true }) : null;
    return c.t('status', { tuning: tn ? (tn.custom ? tn.name : c.t(tn.nameKey)) : c.t('chromatic'), a4: s.a4 });
  },
  mount(el, c, sz = 'full') {
    host = el; ctx = c; size = sz;
    render();
    bind();
    ro = new ResizeObserver(() => sizeCanvas());
    ro.observe(host);
    if (mic) kick();
    else micStart();
  },
  resize(sz) { size = sz; render(); kick(); },
  // Микрофон — только пока окно открыто
  unmount() {
    micStop();
    cancelAnimationFrame(raf);
    raf = 0;
    if (ro) ro.disconnect();
    if (host && onClick) host.removeEventListener('click', onClick);
    host = null;
  },
};
