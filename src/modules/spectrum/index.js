// Спектр и шумомер: частоты с микрофона и уровень звука в дБ. Рабочий инструмент — время в статистику не идёт.
// Звук анализируется только на устройстве, никуда не записывается и не отправляется.
// Уровень: среднеквадратичное значение сигнала (дБ полной шкалы) с весовым фильтром A, C или Z (по спектру),
// усреднение «быстро» (125 мс) или «медленно» (1 с), плюс поправка калибровки. Микрофоны телефонов не откалиброваны —
// без поправки цифры примерные.
import ru from './i18n/ru.json';
import uz from './i18n/uz.json';
import en from './i18n/en.json';
import el from './i18n/el.json';
import './spectrum.css';
import { mName } from '../../music/notes.js';
import { weightDb, levelDb, BASE_CAL, dominant } from './dsp.js';

const ICON = '<svg viewBox="0 0 24 24"><path d="M4 20v-4M8 20V9M12 20v-7M16 20V5M20 20v-9"/></svg>';
const I = {
  pause: '<svg viewBox="0 0 24 24"><rect x="6" y="5" width="4.2" height="14" rx="1.4"/><rect x="13.8" y="5" width="4.2" height="14" rx="1.4"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M7 4.8v14.4c0 .8.9 1.3 1.6.9l11.3-7.2c.6-.4.6-1.4 0-1.8L8.6 3.9C7.9 3.5 7 4 7 4.8z"/></svg>',
  reset: '<svg viewBox="0 0 24 24"><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4v3.5H8"/></svg>',
};
const F_MIN = 20, DB_LO = -110, DB_HI = -10, TAU = { fast: 0.125, slow: 1 };

let host = null, ctx = null, size = 'full', mic = null, raf = 0, onClick = null, ro = null;
// Текущее измерение (не сохраняется): уровень, мин, макс, среднее (Leq), пики спектра
const M = { avg: 0, last: 0, min: Infinity, max: -Infinity, sum: 0, n: 0, clip: 0, frozen: false, hold: null, dom: null, shown: NaN };
let micErr = null, starting = false; // микрофон: причина отказа ('denied' | 'unavailable'), идёт запрос
let freq = null, time = null, wts = null;

const st = () => ctx.store.all();
const cfg = () => {
  const s = st();
  s.view ??= 'spec'; s.weight ??= 'A'; s.speed ??= 'fast'; s.cal ??= 0; s.hold ??= true;
  return s;
};
const big = () => size === 'full' || size === 'half';
const fmtDb = (v) => (Number.isFinite(v) ? ctx.num(v, 1) : '—');

/* ---------- измерение ---------- */

function resetStats() { Object.assign(M, { min: Infinity, max: -Infinity, sum: 0, n: 0, clip: 0, hold: null }); }

function measure(now) {
  const an = mic.analyser, sr = mic.sampleRate;
  if (!freq || freq.length !== an.frequencyBinCount) { freq = new Float32Array(an.frequencyBinCount); time = new Float32Array(an.fftSize); wts = null; }
  an.getFloatFrequencyData(freq);
  an.getFloatTimeDomainData(time);
  const c = cfg();
  if (!wts || wts.k !== c.weight) wts = { k: c.weight, a: Float32Array.from(freq, (_, i) => weightDb(c.weight, (i * sr) / an.fftSize)) };
  let peak = 0;
  for (let i = 0; i < time.length; i++) peak = Math.max(peak, Math.abs(time[i]));
  if (peak > 0.99) M.clip = now;
  // уровень кадра → экспоненциальное усреднение по мощности
  const L = levelDb(time, freq, wts.a), p = 10 ** (L / 10), dt = M.last ? (now - M.last) / 1000 : 0;
  M.avg = M.last ? M.avg + (p - M.avg) * (1 - Math.exp(-dt / TAU[c.speed])) : p;
  M.last = now;
  const shown = 10 * Math.log10(M.avg + 1e-20) + BASE_CAL + c.cal;
  M.shown = shown;
  if (Number.isFinite(shown) && shown > 0) {
    M.min = Math.min(M.min, shown); M.max = Math.max(M.max, shown);
    M.sum += 10 ** (shown / 10); M.n++;
  }
  // пики спектра медленно опадают
  if (c.hold) {
    if (!M.hold || M.hold.length !== freq.length) M.hold = Float32Array.from(freq);
    for (let i = 0; i < freq.length; i++) M.hold[i] = Math.max(freq[i], M.hold[i] - 0.4);
  }
  M.dom = dominant(freq, sr, an.fftSize);
}

/* ---------- рисование ---------- */

function drawSpectrum() {
  const cv = host && host.querySelector('#spcv');
  if (!cv || !freq) return;
  const dpr = Math.min(2, devicePixelRatio || 1), W = cv.clientWidth, H = cv.clientHeight;
  if (!W || !H) return;
  if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const g = cv.getContext('2d'), cs = getComputedStyle(host), tint = cs.getPropertyValue('--tint').trim() || '#FF9500', l3 = cs.getPropertyValue('--l3').trim(), l2 = cs.getPropertyValue('--l2').trim();
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  const sr = mic.sampleRate, n = freq.length, fMax = Math.min(20000, sr / 2), lx = (f) => (Math.log10(f / F_MIN) / Math.log10(fMax / F_MIN)) * W;
  const y = (db) => H - ((Math.max(DB_LO, Math.min(DB_HI, db)) - DB_LO) / (DB_HI - DB_LO)) * H;
  // сетка: 100 Гц, 1 кГц, 10 кГц
  g.strokeStyle = l3; g.lineWidth = 1; g.fillStyle = l2; g.font = '10px ' + cs.getPropertyValue('--font');
  [50, 100, 200, 500, 1000, 2000, 5000, 10000].filter((f) => f < fMax).forEach((f) => {
    const x = lx(f);
    g.globalAlpha = f === 100 || f === 1000 || f === 10000 ? 0.9 : 0.4;
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke();
    if (big() && (f === 100 || f === 1000 || f === 10000)) g.fillText(f >= 1000 ? f / 1000 + 'k' : String(f), x + 3, H - 4);
  });
  g.globalAlpha = 1;
  const path = (arr) => {
    g.beginPath();
    let started = false;
    for (let i = 1; i < n; i++) {
      const f = (i * sr) / (n * 2);
      if (f < F_MIN || f > fMax) continue;
      const px = lx(f), py = y(arr[i]);
      if (!started) { g.moveTo(px, py); started = true; } else g.lineTo(px, py);
    }
  };
  path(freq);
  g.lineTo(W, H); g.lineTo(0, H); g.closePath();
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, tint); gr.addColorStop(1, 'transparent');
  g.globalAlpha = 0.35; g.fillStyle = gr; g.fill(); g.globalAlpha = 1;
  path(freq); g.strokeStyle = tint; g.lineWidth = 1.6; g.stroke();
  if (cfg().hold && M.hold) { path(M.hold); g.strokeStyle = l2; g.lineWidth = 1; g.setLineDash([3, 3]); g.stroke(); g.setLineDash([]); }
}

function zone(v) { return !Number.isFinite(v) ? '' : v >= 85 ? 'hi' : v >= 70 ? 'mid' : 'ok'; }

function updateNumbers() {
  if (!host) return;
  const q = (s) => host.querySelector(s), c = cfg(), v = M.shown;
  const lv = q('#splv');
  if (lv) { lv.textContent = fmtDb(v); lv.className = 'splv num ' + zone(v); }
  const bar = q('#splbar');
  if (bar) bar.style.width = (Number.isFinite(v) ? Math.max(0, Math.min(100, v - 20)) : 0) + '%';
  const leq = M.n ? 10 * Math.log10(M.sum / M.n) : NaN;
  const set = (id, x) => { const e = q(id); if (e) e.textContent = fmtDb(x); };
  set('#splmin', M.min); set('#splmax', M.max); set('#splleq', leq);
  const clip = q('#spclip');
  if (clip) clip.hidden = !(M.clip && performance.now() - M.clip < 1500);
  const dm = q('#spdom');
  if (dm) dm.textContent = M.dom ? ctx.t('dom', { f: ctx.num(M.dom.f, M.dom.f < 100 ? 1 : 0), note: mName(Math.round(69 + 12 * Math.log2(M.dom.f / 440))) }) : '';
  const w = q('#splw');
  if (w) w.textContent = ctx.t('unit.' + c.weight);
}

function loop(now) {
  if (!mic || !host) { raf = 0; return; }
  if (!M.frozen) measure(now);
  drawSpectrum();
  if (!loop.t || now - loop.t > 120) { loop.t = now; updateNumbers(); }
  raf = requestAnimationFrame(loop);
}

/* ---------- разметка ---------- */

// Микрофон включается сам, как только модуль открыт. Кнопка нужна, только если доступ не дали
function micNote() {
  if (!micErr) return '';
  const { t } = ctx;
  return '<div class="spnomic" role="alert"><span>' + t(micErr === 'denied' ? 'micDenied' : 'micNone') + '</span><button class="link" data-x="spretry">' + t('micRetry') + '</button></div>';
}

function splHTML() {
  const { t } = ctx, c = cfg();
  const stats = '<div class="splst num"><span>' + t('min') + '<b id="splmin">—</b></span><span>' + t('leq') + '<b id="splleq">—</b></span><span>' + t('max') + '<b id="splmax">—</b></span></div>';
  if (size === 'strip') return '<div class="srow2">' + '<b class="splv num" id="splv">—</b><span class="l2" id="splw">' + t('unit.' + c.weight) + '</span><span class="sgrow"></span><div class="splmeter sm"><i id="splbar"></i></div></div>';
  return '<div class="splwrap"><div class="splbig"><b class="splv num" id="splv">—</b><span class="l2" id="splw">' + t('unit.' + c.weight) + '</span></div>' +
    '<div class="splmeter" aria-hidden="true"><i id="splbar"></i><em style="left:50%"></em><em style="left:65%"></em></div>' +
    (big() ? '<div class="splscale l2">' + [20, 70, 85, 120].map((v) => '<span style="left:' + (v - 20) + '%">' + v + '</span>').join('') + '</div>' + stats : stats) +
    '<div class="spclip" id="spclip" hidden>' + t('clip') + '</div>' +
    (big() ? '<div class="vrow tight spctl">' + ctx.ui.icb('data-x="spreset"', I.reset, t('resetStats'), 'sm') + '</div><p class="ftr spnote">' + t('approx') + '</p>' : '') + '</div>';
}

function specHTML() {
  const { t, ui } = ctx;
  const cv = '<div class="spbox"><canvas id="spcv" role="img" aria-label="' + t('specAria') + '"></canvas><span class="spdom num" id="spdom"></span></div>';
  if (size === 'strip') return '<div class="srow2">' + cv + '</div>';
  return '<div class="spwrap">' + cv + (big() ? '<div class="vrow tight spctl">' + ui.icb('data-x="spfreeze"', M.frozen ? I.play : I.pause, t(M.frozen ? 'unfreeze' : 'freeze'), 'sm') + '</div>' : '') + '</div>';
}

function render() {
  if (!host) return;
  const { t, ui } = ctx, c = cfg();
  const head = big() ? '<div class="sphead">' + ui.seg('spview', [['spec', t('view.spec')], ['spl', t('view.spl')]], c.view, t('view.aria')) +
    ui.icb('data-x="spset"', ui.icons.gear, t('settings'), 'sm') + '</div>' : '';
  host.innerHTML = '<div class="spmod ' + size + '">' + head + (c.view === 'spl' ? splHTML() : specHTML()) + micNote() + '</div>';
  updateNumbers();
}

/* ---------- настройки ---------- */

function settingsSheet() {
  const { t, ui } = ctx, c = cfg();
  const body = () => ui.snav(t('settings')) +
    '<div class="hdr">' + t('set.weight') + '</div><div class="group"><div class="cellcol">' + ui.seg('spw', [['A', 'A'], ['C', 'C'], ['Z', 'Z']], c.weight, t('set.weight')) +
    '<div class="segcap">' + t('set.weight.' + c.weight) + '</div></div></div>' +
    '<div class="hdr">' + t('set.speed') + '</div><div class="group"><div class="cellcol">' + ui.seg('sps', [['fast', t('set.fast')], ['slow', t('set.slow')]], c.speed, t('set.speed')) + '</div></div>' +
    '<div class="hdr">' + t('set.cal') + '</div><div class="group"><div class="cell"><span class="grow">' + t('set.offset') + '</span><span class="val num" style="color:var(--ink);margin-right:6px">' +
    (c.cal > 0 ? '+' : '') + ctx.num(c.cal, 1) + ' ' + t('db') + '</span>' + ui.stepper('cal', t('set.offset')) + '</div>' +
    '<div class="cell"><button class="link" data-x="calreset">' + t('set.calReset') + '</button></div></div><p class="ftr">' + t('set.calHint') + '</p>' +
    '<div class="group" style="margin-top:12px"><div class="cell"><span class="grow">' + t('set.hold') + '</span>' + ui.sw('sphold', c.hold, t('set.hold')) + '</div></div>' +
    '<p class="ftr">' + t('privacy') + '</p>';
  ui.sheet(body, (el, sh) => {
    const done = () => { ctx.store.save(); sh.update(); render(); };
    el.addEventListener('click', (e) => {
      const sg = e.target.closest('[data-seg] [data-v]');
      if (sg) { const k = sg.closest('[data-seg]').dataset.seg; if (k === 'spw') { c.weight = sg.dataset.v; resetStats(); } else if (k === 'sps') c.speed = sg.dataset.v; done(); return; }
      const sp = e.target.closest('[data-step="cal"]');
      if (sp) { c.cal = Math.round(Math.max(-40, Math.min(40, c.cal + +sp.dataset.d * 0.5)) * 10) / 10; resetStats(); done(); return; }
      if (e.target.closest('[data-x="calreset"]')) { c.cal = 0; resetStats(); done(); }
    });
    el.addEventListener('change', (e) => { if (e.target.dataset.sw === 'sphold') { c.hold = e.target.checked; M.hold = null; done(); } });
  });
}

/* ---------- микрофон ---------- */

async function micStart() {
  if (mic || starting) return;
  starting = true;
  micErr = null;
  try {
    const m = await ctx.mic.request();
    starting = false;
    // окно успели закрыть, пока система спрашивала разрешение
    if (!host) { m.stop(); return; }
    mic = m;
    mic.analyser.smoothingTimeConstant = 0.6;
    resetStats();
    M.last = 0;
    M.shown = NaN;
    render();
    if (!raf) raf = requestAnimationFrame(loop);
  } catch (e) {
    starting = false;
    micErr = e.reason === 'denied' ? 'denied' : 'unavailable';
    render();
  }
}

function micStop() {
  cancelAnimationFrame(raf);
  raf = 0;
  if (mic) mic.stop();
  mic = null;
}

export default {
  id: 'spectrum',
  order: 100,
  name: { ru: ru.name, uz: uz.name, en: en.name, el: el.name },
  i18n: { ru, uz, en, el },
  icon: ICON,
  color: '#32ADE6',
  sizes: ['full', 'half', 'quarter', 'strip'],
  stats: false, // рабочий инструмент: время в нём не идёт в статистику
  status: (c) => c.t(c.store.get('view', 'spec') === 'spl' ? 'view.spl' : 'view.spec'),
  mount(el, c, sz = 'full') {
    host = el; ctx = c; size = sz;
    onClick = (e) => {
      const sv = e.target.closest('[data-seg="spview"] [data-v]');
      if (sv) { cfg().view = sv.dataset.v; ctx.store.save(); render(); return; }
      const x = e.target.closest('[data-x]');
      if (!x) return;
      const a = x.dataset.x;
      if (a === 'spretry') micStart();
      else if (a === 'spset') settingsSheet();
      else if (a === 'spreset') { resetStats(); updateNumbers(); }
      else if (a === 'spfreeze') { M.frozen = !M.frozen; render(); }
    };
    host.addEventListener('click', onClick);
    render();
    if (mic && !raf) raf = requestAnimationFrame(loop);
    else micStart();
  },
  resize(sz) { size = sz; render(); },
  // Микрофон — только пока окно открыто
  unmount() {
    micStop();
    if (host && onClick) host.removeEventListener('click', onClick);
    if (ro) ro.disconnect();
    host = null;
  },
};
