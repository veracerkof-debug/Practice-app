// Тюнер: чистый вид (нота, Гц, попадание); строи, свои строи, точность, гриф-подсказка, 4 вида шкалы.
// Перенесено из legacy/practice.html (tunerHTML, TU, tunerSettings, tuningPicker, customEditor, a4Sheet).
import './tuner.css';
import ru from './i18n/ru.json';
import uz from './i18n/uz.json';
import en from './i18n/en.json';
import { yin, createPitchSmoother } from '../../audio/pitch.js';
import { TUNINGS, TOL, STYLES, normalizeTuner, curTuning, reading, inRange, mName, splitN } from '../../music/tuning.js';

const ICON = '<svg viewBox="0 0 24 24"><path d="M9 3v8a3 3 0 0 0 6 0V3M12 14v7"/></svg>';
const TICK_MS = 70;
const SILENCE_MS = 1400;

let host = null, ctx = null, size = 'full';
let mic = null, timer = 0, smooth = null, lastT = 0, lock = null, strobeX = 0;

const st = () => normalizeTuner(ctx.store.all());
const tol = () => TOL[st().tol] ?? 5;
const tuningName = (tn) => (tn.custom ? tn.name : ctx.t(tn.nameKey));

function arcD(cx, cy, r, a0, a1) {
  const p = (a) => [cx + r * Math.cos((a * Math.PI) / 180), cy + r * Math.sin((a * Math.PI) / 180)];
  const [x0, y0] = p(a0), [x1, y1] = p(a1);
  return 'M' + x0.toFixed(2) + ' ' + y0.toFixed(2) + 'A' + r + ' ' + r + ' 0 ' + (a1 - a0 > 180 ? 1 : 0) + ' 1 ' + x1.toFixed(2) + ' ' + y1.toFixed(2);
}

/* ---------- шкалы ---------- */

function gaugeSVG() {
  let s = '<svg viewBox="0 0 300 168" class="gauge" aria-hidden="true">';
  const P = (r, deg) => { const a = ((deg - 90) * Math.PI) / 180; return [150 + r * Math.cos(a), 156 + r * Math.sin(a)]; };
  const [g1x, g1y] = P(128, -6), [g2x, g2y] = P(128, 6);
  s += '<path d="M' + g1x + ' ' + g1y + 'A128 128 0 0 1 ' + g2x + ' ' + g2y + '" stroke="#34C759" stroke-width="8" fill="none" stroke-linecap="round" opacity=".5"/>';
  for (let c = -50; c <= 50; c += 5) {
    const big = c % 25 === 0, [x1, y1] = P(big ? 112 : 118, c * 1.2), [x2, y2] = P(128, c * 1.2);
    s += '<line x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) + '" stroke="' +
      (c === 0 ? 'var(--ink)' : 'var(--l3)') + '" stroke-width="' + (big ? 2.5 : 1.5) + '" stroke-linecap="round"/>';
  }
  [[-50, '−50'], [0, '0'], [50, '+50']].forEach(([c, l]) => {
    const [x, y] = P(100, c * 1.2);
    s += '<text x="' + x.toFixed(1) + '" y="' + (y + 4).toFixed(1) + '" text-anchor="middle" style="font:500 11px var(--font);fill:var(--l2)">' + l + '</text>';
  });
  return s + '<g id="tneedle" class="needle"><line x1="150" y1="156" x2="150" y2="34" stroke-width="3" stroke-linecap="round"/><circle cx="150" cy="156" r="7"/></g></svg>';
}

const tbarHTML = '<div class="tunbar" aria-hidden="true"><i class="tbarc"></i><i id="tbarm" class="tbarm"></i></div>';
const strobeHTML = () => '<div class="tstrobe" id="tstrobe" aria-hidden="true"><i></i><i></i><i></i></div>';
const ringHTML = () => '<div class="tringw"><svg viewBox="0 0 200 200" class="tring" aria-hidden="true"><circle cx="100" cy="100" r="84" class="trtrack"/><path d="' +
  arcD(100, 100, 84, -96, -84) + '" class="trzone"/><g id="tringdot" class="trdot"><circle cx="100" cy="16" r="9"/></g></svg><div class="tringin">' +
  '<div class="tnoteW"><span id="tnote">—</span><span id="toct" class="toct"></span></div></div></div>';

// Гриф с колками: подсвечивает колок ближайшей струны
function headHTML(tn) {
  const n = tn.names.length, L = Math.ceil(n / 2), W = 200, H = 150;
  let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="thead" aria-hidden="true"><path d="M70 150 L62 20 Q100 0 138 20 L130 150 Z" class="hsk"/>';
  for (let i = 0; i < n; i++) {
    const left = i < L, k = left ? i : i - L, y = 36 + k * (100 / Math.max(1, L)), x = left ? 30 : 170, sx = left ? 66 + k * 2 : 134 - k * 2;
    s += '<line x1="' + sx + '" y1="' + y + '" x2="' + (left ? 84 + k * 4 : 116 - k * 4) + '" y2="150" class="hstr"/><line x1="' + x + '" y1="' + y + '" x2="' + sx + '" y2="' + y +
      '" class="hpost"/><g class="hpeg" data-si="' + i + '"><circle cx="' + x + '" cy="' + y + '" r="13"/><text x="' + x + '" y="' + (y + 4) + '" text-anchor="middle">' +
      splitN(tn.names[i])[0].replace('♯', '#').replace('♭', 'b') + '</text></g>';
  }
  return s + '</svg><div id="tinst" class="tinst" aria-live="polite">' + ctx.t('head.play') + '</div>';
}

/* ---------- разметка ---------- */

function micButton() {
  const { t, ui } = ctx, on = !!mic;
  return '<button class="bigplay tmicb" data-x="tmic" aria-pressed="' + on + '" aria-label="' + t(on ? 'micStop' : 'micOn') + '">' + (on ? ui.icons.stop : ui.icons.mic) + '</button>';
}

function view() {
  const { t, ui } = ctx, s = st(), tn = curTuning(s), a4 = s.a4, style = s.style;
  const note = '<div class="tnoteW"><span id="tnote">—</span><span id="toct" class="toct"></span></div>';
  const cents = '<div id="tcent" class="tcent" aria-live="polite">' + t(mic ? 'play' : 'micOff') + '</div>';
  const hz = '<div id="thz" class="thz num">' + t('hzNone') + '</div>';
  const gear = ui.icb('data-x="tset"', ui.icons.gear, t('settings'), 'sm tgear');
  const strings = tn && s.showStrings ? '<div class="strings tstr2"><button class="pill" data-x="tstr" data-v="auto" aria-pressed="' + (lock == null) +
    '" aria-label="' + t('autoString') + '">A</button>' + tn.names.map((n, i) => '<button class="pill" data-x="tstr" data-v="' + i + '" aria-pressed="' + (lock === i) +
    '" aria-label="' + ui.esc(t('stringBtn', { n: tn.names.length - i, note: n })) + '">' + n + '</button>').join('') + '</div>' : '';
  if (size === 'quarter') return '<div class="vq">' + note + tbarHTML + cents + micButton() + '</div>';
  if (size === 'strip') return '<div class="srow2">' + note + '<div class="sgrow tmid">' + tbarHTML + cents + '</div>' + micButton() + '</div>';
  const vis = style === 'ring' ? ringHTML() : style === 'strobe' ? strobeHTML() : style === 'bar' ? '<div class="tbig">' + tbarHTML + '</div>' : '<div class="tgw">' + gaugeSVG() + '</div>';
  const head = tn && s.head && size === 'full' ? '<div class="theadw">' + headHTML(tn) + '</div>' : '';
  const mode = tn ? '<div class="tmode">' + ui.esc(tuningName(tn)) + ' · ' + t('hz', { f: a4 }) + '</div>' : a4 !== 440 ? '<div class="tmode">' + t('hz', { f: a4 }) + '</div>' : '';
  return '<div class="tclean ' + size + ' st-' + style + '">' + gear + '<div class="tvis">' + vis + '</div>' + (style === 'ring' ? '' : note) + hz + cents + head + strings +
    '<div class="tbot">' + micButton() + mode + '</div></div>';
}

function render() {
  if (!host) return;
  host.innerHTML = view();
}

/* ---------- показания ---------- */

const q = (id) => host && host.querySelector('#' + id);

function extra(c, ok, si, f) {
  const sEl = q('tstrobe');
  if (sEl) {
    strobeX += f ? Math.max(-30, Math.min(30, c)) * 0.25 : 0;
    sEl.style.setProperty('--sx', strobeX + 'px');
    sEl.classList.toggle('ok', !!ok);
  }
  const dot = q('tringdot');
  if (dot) {
    dot.style.transform = 'rotate(' + (f ? Math.max(-50, Math.min(50, c)) * 1.8 : 0) + 'deg)';
    dot.classList.toggle('ok', !!ok);
    const w = dot.closest('.tringw');
    if (w) w.classList.toggle('ok', !!ok);
  }
  const pegs = host.querySelectorAll('.hpeg');
  if (pegs.length) {
    pegs.forEach((p) => p.classList.toggle('on', !!f && +p.dataset.si === si));
    const ins = q('tinst');
    if (ins) {
      ins.textContent = ctx.t(!f ? 'head.play' : ok ? 'head.ok' : c < 0 ? 'head.up' : 'head.down');
      ins.className = 'tinst' + (f ? (ok ? ' ok' : ' act') : '');
    }
  }
}

// Текст под нотой: «Настроено», «+7 центов», «Ниже на 1,5 тона, подтяни»
function centsText(c, ok, tn) {
  const { t, tn: tnum, num } = ctx, r = Math.round(Math.abs(c));
  if (ok) return t('inTune');
  if (Math.abs(c) > 50 && tn) {
    const x = r >= 100 ? t('tones', { n: num(r / 100, 1) }) : tnum('cents', r);
    return t(c < 0 ? 'lower' : 'higher', { x });
  }
  return (c > 0 ? '+' : '−') + tnum('cents', r);
}

function show(f) {
  const nE = q('tnote');
  if (!nE) return;
  const { t, num } = ctx, needle = q('tneedle'), cE = q('tcent'), hE = q('thz'), oE = q('toct'), bar = q('tbarm');
  if (!f) {
    nE.textContent = '—';
    if (oE) oE.textContent = '';
    if (cE) { cE.textContent = t(mic ? 'play' : 'micOff'); cE.className = 'tcent'; }
    if (hE) hE.textContent = t('hzNone');
    if (needle) { needle.style.transform = 'rotate(0deg)'; needle.classList.remove('ok'); }
    nE.parentNode.classList.remove('ok');
    if (bar) { bar.style.left = '50%'; bar.classList.remove('ok'); }
    host.querySelectorAll('[data-x="tstr"]').forEach((p) => p.classList.remove('near'));
    extra(0, false, -1, 0);
    return;
  }
  const s = st(), tn = curTuning(s), r = reading(f, { a4: s.a4, tuning: tn, lock, tol: tol() }), c = r.cents;
  extra(c, r.ok, r.si, f);
  nE.textContent = r.note;
  if (oE) oE.textContent = r.oct;
  if (cE) { cE.textContent = centsText(c, r.ok, tn); cE.className = 'tcent' + (r.ok ? ' ok' : ''); }
  if (hE) hE.textContent = tn ? t('hzTarget', { f: num(f, 1), target: num(r.targetHz, 1) }) : t('hz', { f: num(f, 1) });
  const cc = Math.max(-50, Math.min(50, c));
  if (needle) { needle.style.transform = 'rotate(' + cc * 1.2 + 'deg)'; needle.classList.toggle('ok', r.ok); }
  if (bar) { bar.style.left = 50 + cc + '%'; bar.classList.toggle('ok', r.ok); }
  nE.parentNode.classList.toggle('ok', r.ok);
  host.querySelectorAll('[data-x="tstr"]').forEach((p) => p.classList.toggle('near', +p.dataset.v === r.si));
}

function tick() {
  let f = yin(mic.read(), mic.sampleRate);
  if (f && !inRange(f)) f = 0;
  if (!f) {
    if (Date.now() - lastT > SILENCE_MS) show(null);
    return;
  }
  lastT = Date.now();
  show(smooth(f));
}

async function micStart() {
  const { t, ui } = ctx;
  try {
    mic = await ctx.mic.request();
  } catch (e) {
    ui.toast(t(e.reason === 'denied' ? 'micDenied' : 'micNone'));
    return;
  }
  if (!host) { micStop(); return; } // окно закрыли, пока ждали разрешения
  smooth = createPitchSmoother();
  timer = setInterval(tick, TICK_MS);
  render();
}

function micStop() {
  clearInterval(timer);
  timer = 0;
  if (mic) mic.stop();
  mic = null;
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
    const tn = curTuning(s);
    return ui.snav(t('set.title')) +
      '<div class="hdr" style="margin-top:4px">' + t('set.view') + '</div><div class="tstys" role="group" aria-label="' + t('set.view') + '">' +
      STYLES.map((k) => '<button class="tsty' + (s.style === k ? ' on' : '') + '" data-tsty="' + k + '" aria-pressed="' + (s.style === k) + '"><span class="tsi ' + k +
        '"><i></i><i></i><i></i></span><b>' + t('style.' + k) + '</b></button>').join('') + '</div>' +
      '<div class="hdr">' + t('set.tol') + '</div><div class="group">' + Object.keys(TOL).map((k) => '<button class="cell" data-ttol="' + k + '" aria-pressed="' + (s.tol === k) +
        '"><span class="grow"><div class="ttl">' + t('tol.' + k) + '</div><div class="st">' + t('tol.' + k + '.d') + '</div></span>' + (s.tol === k ? ui.icons.check : '') + '</button>').join('') + '</div>' +
      '<div class="hdr">' + t('set.tuning') + '</div><div class="group"><div class="cell"><span class="grow">' + t('set.useTuning') + '</span>' + ui.sw('tuse', s.useTuning, t('set.useTuning')) + '</div>' +
      (s.useTuning ? '<button class="cell" data-tpk><span class="grow">' + t('set.tuning') + '</span><span class="val">' + ui.esc(tn ? tuningName(tn) : t('set.noTuning')) + '</span>' + ui.icons.chev + '</button>' +
        '<div class="cell"><span class="grow">' + t('set.strings') + '</span>' + ui.sw('tstrs', s.showStrings, t('set.strings')) + '</div>' +
        '<div class="cell"><span class="grow">' + t('set.head') + '</span>' + ui.sw('thead', s.head, t('set.head.short')) + '</div>' : '') + '</div>' +
      '<p class="ftr">' + t(s.useTuning ? 'set.ftrOn' : 'set.ftrOff') + '</p>' +
      '<div class="hdr">' + t('a4.title') + '</div><div class="group"><button class="cell" data-ta4><span class="grow">A4</span><span class="val">' + t('hz', { f: s.a4 }) + '</span>' + ui.icons.chev + '</button></div>';
  };
  ui.sheet(body, (el, sh) => {
    const changed = () => { ctx.store.save(); sh.update(); render(); };
    el.addEventListener('click', (e) => {
      const g = (x) => e.target.closest(x);
      let b;
      if ((b = g('[data-tsty]'))) s.style = b.dataset.tsty;
      else if ((b = g('[data-ttol]'))) s.tol = b.dataset.ttol;
      // как в прототипе: выбор строя и частоты открывается вместо настроек
      else if (g('[data-tpk]')) { if (s.tuning === 'chrom') s.tuning = 'g_std'; ctx.store.save(); sh.close(); tuningPicker(); return; }
      else if (g('[data-ta4]')) { sh.close(); a4Sheet(); return; }
      else return;
      changed();
    });
    el.addEventListener('change', (e) => {
      const k = e.target.dataset.sw;
      if (k === 'tuse') { s.useTuning = e.target.checked; if (s.useTuning && s.tuning === 'chrom') s.tuning = 'g_std'; lock = null; }
      else if (k === 'tstrs') s.showStrings = e.target.checked;
      else if (k === 'thead') s.head = e.target.checked;
      else return;
      changed();
    });
  });
}

function tuningPicker(after) {
  const { t, ui } = ctx, s = st();
  const row = (id, title, sub) => '<button class="cell" data-tun="' + id + '" aria-pressed="' + (s.tuning === id) + '"><span class="grow"><div class="ttl">' + ui.esc(title) + '</div>' +
    (sub ? '<div class="st">' + ui.esc(sub) + '</div>' : '') + '</span>' + (s.tuning === id ? ui.icons.check : '') + '</button>';
  const body = () => ui.snav(t('set.tuning')) +
    '<div class="group">' + row('chrom', t('chromatic')) + '</div>' +
    TUNINGS.map(([g, ls]) => '<div class="hdr">' + t('group.' + g) + '</div><div class="group">' + ls.map(([id, ns]) => row(id, t('tuning.' + id), ns)).join('') + '</div>').join('') +
    '<div class="hdr">' + t('pick.mine') + '</div><div class="group">' + s.customs.map((c) => '<div class="cell"><button class="grow" data-tun="' + c.id +
      '" style="text-align:left;min-width:0"><div class="ttl">' + ui.esc(c.name) + '</div><div class="st">' + c.midis.map(mName).join(' ') + '</div></button><button class="link" data-cedit="' +
      c.id + '" style="font-size:15px;margin-right:8px">' + t('pick.edit') + '</button>' + (s.tuning === c.id ? ui.icons.check : '') + '</div>').join('') +
    '<button class="cell act" data-cedit="new">' + t('pick.new') + '</button></div><p class="ftr">' + t('pick.ftr') + '</p>';
  ui.sheet(body, (el, sh) => el.addEventListener('click', (e) => {
    const tb = e.target.closest('[data-tun]');
    if (tb) { s.tuning = tb.dataset.tun; lock = null; ctx.store.save(); sh.close(); render(); if (after) after(); return; }
    const ce = e.target.closest('[data-cedit]');
    if (ce) { sh.close(); customEditor(ce.dataset.cedit, after); }
  }));
}

function customEditor(id, after) {
  const { t, ui } = ctx, s = st(), ex = s.customs.find((c) => c.id === id), tn = curTuning(s);
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
    const done = () => { lock = null; ctx.store.save(); sh.close(); render(); if (after) after(); };
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-k]');
      if (!b) return;
      const k = b.dataset.k, i = +b.dataset.i;
      if (k === 'up') { midis[i] = Math.min(96, midis[i] + 1); ctx.audio.refTone(midis[i]); re(); }
      else if (k === 'dn') { midis[i] = Math.max(12, midis[i] - 1); ctx.audio.refTone(midis[i]); re(); }
      else if (k === 'rm') { if (midis.length > 1) { midis.splice(i, 1); re(); } }
      else if (k === 'add') { midis.push(Math.min(96, midis[midis.length - 1] + 5)); re(); }
      else if (k === 'cancel') { sh.close(); tuningPicker(after); }
      else if (k === 'del') { s.customs = s.customs.filter((c) => c.id !== id); if (s.tuning === id) s.tuning = 'chrom'; done(); }
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
    if (a === 'tmic') { if (mic) { micStop(); render(); } else micStart(); }
    else if (a === 'tset') settingsSheet();
    else if (a === 'tstr') {
      const tn = curTuning(st());
      if (x.dataset.v === 'auto') lock = null;
      else { lock = +x.dataset.v; if (tn) ctx.audio.refTone(tn.midis[lock]); }
      render();
    }
  };
  host.addEventListener('click', onClick);
}

export default {
  id: 'tuner',
  order: 20,
  name: { ru: ru.name, uz: uz.name, en: en.name },
  i18n: { ru, uz, en },
  icon: ICON,
  color: '#AF52DE',
  sizes: ['full', 'half', 'quarter', 'strip'],
  group: 'rhythm',
  status(c) {
    const s = normalizeTuner(c.store.all()), tn = curTuning(s);
    return c.t('status', { tuning: tn ? (tn.custom ? tn.name : c.t(tn.nameKey)) : c.t('chromatic'), a4: s.a4 });
  },
  mount(el, c, sz = 'full') {
    host = el; ctx = c; size = sz;
    render();
    bind();
  },
  resize(sz) { size = sz; render(); },
  unmount() {
    micStop();
    if (host && onClick) host.removeEventListener('click', onClick);
    host = null;
  },
};
