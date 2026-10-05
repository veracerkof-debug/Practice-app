// Теория: квинтовый круг, гаммы, аккорды, интервалы; гриф и клавиши; дрон на тонике и подсветка на пианино.
// Перенесено из legacy/practice.html (theoryHTML, circleHTML, circleSVG, scalesHTML, chordsHTML, intervalsHTML, fretHTML, typeSheet).
import './theory.css';
import ru from './i18n/ru.json';
import uz from './i18n/uz.json';
import en from './i18n/en.json';
import { SH, MAJ_NAMES, MIN_NAMES, enh } from '../../music/notes.js';
import { CIRC, keyInfo, circleStep, SCALES, SCALE_TYPES, scaleInfo, CHORDS, chordLabel, chordInfo, INTERVALS, intervalNote, intervalBase } from '../../music/theory.js';
import { curTuning } from '../../music/tuning.js';
import { kbHTML } from '../../ui/keyboard.js';

const ICON = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4"/><path d="M12 3.5v4.5"/></svg>';
const SECS = ['circle', 'scales', 'chords', 'intervals'];
const I = {
  play: '<svg viewBox="0 0 24 24" class="f" style="width:18px"><path d="M7 4.8v14.4c0 .8.9 1.3 1.6.9l11.3-7.2c.6-.4.6-1.4 0-1.8L8.6 3.9C7.9 3.5 7 4 7 4.8z"/></svg>',
  wave: '<svg viewBox="0 0 24 24"><path d="M3 12c2-5 4-5 6 0s4 5 6 0 4-5 6 0"/></svg>',
  piano: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M8 5v14M13 5v14M10.5 5v8M15.5 5v8"/></svg>',
  drone: '<svg viewBox="0 0 24 24"><path d="M3 12h3l2-5 3 10 3-8 2 5 2-2h3"/></svg>',
  scales: '<svg viewBox="0 0 24 24"><path d="M4 19h4v-4h4v-4h4V7h4"/></svg>',
  fret: '<svg viewBox="0 0 24 24"><path d="M3 6h18M3 10h18M3 14h18M3 18h18M8 4v16M14 4v16"/></svg>',
};

let host = null, ctx = null, size = 'full', onClick = null, onKey = null, onDown = null;

// Настройки: device.theory (+ scale: тоника и тип гаммы)
function TH() {
  const th = ctx.store.all();
  th.pc ??= 0; th.minor ??= false; th.sev ??= false;
  th.scale ??= { pc: 9, type: 'minor' };
  return th;
}
const keyTitle = (k) => ctx.t(k.minor ? 'key.min' : 'key.maj', { root: k.root });
const sigText = (k) => (k.sharps ? ctx.tn('sharps', k.sharps) : k.flats ? ctx.tn('flats', k.flats) : ctx.t('noSigns'));
const stepTxt = (s) => (s <= 3 ? ctx.t('step.' + s) : ctx.t('step.n', { n: s }));
const scaleName = (type) => ctx.t('scale.' + type);
const icb = (attrs, icon, label, cls) => ctx.ui.icb(attrs, icon, label, cls);

/* ---------- гриф ---------- */

function fretHTML(pcs, root, frets) {
  const tn = curTuning(ctx.peek('tuner'));
  let strings = tn && tn.midis.length >= 4 && tn.midis.length <= 8 ? tn.midis.slice() : [40, 45, 50, 55, 59, 64];
  strings = strings.slice().reverse();
  const S = strings.length, F = frets || 12, W = 40 + F * 44, H = S * 22 + 26, y = (i) => 14 + i * 22, x = (f) => (f === 0 ? 18 : 40 + (f - 0.5) * 44);
  let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="fret" role="group" aria-label="' + ctx.t('fret') + '">';
  s += '<rect x="40" y="' + (y(0) - 1) + '" width="' + F * 44 + '" height="' + ((S - 1) * 22 + 2) + '" class="fbg"/>';
  [3, 5, 7, 9, 15].forEach((f) => { if (f <= F) s += '<circle cx="' + (40 + (f - 0.5) * 44) + '" cy="' + (y(0) + (S - 1) * 11) + '" r="4" class="fdot"/>'; });
  if (F >= 12) s += '<circle cx="' + (40 + 11.5 * 44) + '" cy="' + (y(0) + (S - 1) * 5.5) + '" r="4" class="fdot"/><circle cx="' + (40 + 11.5 * 44) + '" cy="' + (y(0) + (S - 1) * 16.5) + '" r="4" class="fdot"/>';
  for (let f = 0; f <= F; f++) s += '<line x1="' + (40 + f * 44) + '" y1="' + y(0) + '" x2="' + (40 + f * 44) + '" y2="' + y(S - 1) + '" class="' + (f === 0 ? 'fnut' : 'ffret') + '"/>';
  strings.forEach((m, i) => { s += '<line x1="40" y1="' + y(i) + '" x2="' + (40 + F * 44) + '" y2="' + y(i) + '" class="fstr" stroke-width="' + (0.8 + (i / (S - 1)) * 1.4).toFixed(2) + '"/>'; });
  strings.forEach((m, i) => {
    for (let f = 0; f <= F; f++) {
      const pc = (m + f) % 12;
      if (!pcs.has(pc)) continue;
      s += '<g class="fn' + (pc === root ? ' r' : '') + '" data-x="fplay" data-m="' + (m + f) + '" role="button" aria-label="' + SH[pc] + '"><circle cx="' + x(f) + '" cy="' + y(i) +
        '" r="9"/><text x="' + x(f) + '" y="' + (y(i) + 3.4) + '" text-anchor="middle">' + SH[pc].replace('♯', '#') + '</text></g>';
    }
  });
  for (let f = 1; f <= F; f++) if ([3, 5, 7, 9, 12, 15].includes(f)) s += '<text x="' + (40 + (f - 0.5) * 44) + '" y="' + (H - 3) + '" text-anchor="middle" class="fnum">' + f + '</text>';
  return '<div class="fretwrap">' + s + '</svg></div>';
}

/* ---------- круг ---------- */

function circleSVG(k) {
  const th = TH(), cx = 160, cy = 160, sel = th.minor ? (th.pc + 3) % 12 : th.pc, sp = CIRC.indexOf(sel), { t } = ctx;
  const P = (r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const arc = (r1, r2, a0, a1) => {
    const [x1, y1] = P(r1, a0), [x2, y2] = P(r1, a1), [x3, y3] = P(r2, a1), [x4, y4] = P(r2, a0);
    return 'M' + x1.toFixed(2) + ' ' + y1.toFixed(2) + 'A' + r1 + ' ' + r1 + ' 0 0 1 ' + x2.toFixed(2) + ' ' + y2.toFixed(2) + 'L' + x3.toFixed(2) + ' ' + y3.toFixed(2) +
      'A' + r2 + ' ' + r2 + ' 0 0 0 ' + x4.toFixed(2) + ' ' + y4.toFixed(2) + 'Z';
  };
  let s = '<svg viewBox="0 0 320 320" class="circle" role="group" aria-label="' + ctx.ui.esc(t('circleAria', { key: keyTitle(k) })) + '">';
  CIRC.forEach((mp, i) => {
    const a = ((i * 30 - 90) * Math.PI) / 180, a0 = a - Math.PI / 12 + 0.008, a1 = a + Math.PI / 12 - 0.008, near = i === (sp + 1) % 12 || i === (sp + 11) % 12;
    [[false, 156, 108, mp, i === 6 ? 'F♯/G♭' : MAJ_NAMES[mp], 17], [true, 106, 66, (mp + 9) % 12, MIN_NAMES[(mp + 9) % 12] + 'm', 13]].forEach(([mn, r1, r2, pc, lab, fs]) => {
      const isSel = i === sp && mn === th.minor, rel = i === sp && mn !== th.minor;
      const fill = isSel ? 'var(--tint)' : near || rel ? 'color-mix(in srgb,var(--tint) 24%,var(--cell))' : mn ? 'var(--fill)' : 'var(--cell)';
      const [tx, ty] = P((r1 + r2) / 2, a), aria = t(mn ? 'key.min' : 'key.maj', { root: mn ? lab.slice(0, -1) : lab });
      s += '<g class="sec" data-x="key" data-pc="' + pc + '" data-minor="' + (mn ? 1 : 0) + '" role="button" tabindex="0" aria-pressed="' + isSel + '" aria-label="' + aria +
        '"><path d="' + arc(r1, r2, a0, a1) + '" fill="' + fill + '"/><text x="' + tx.toFixed(1) + '" y="' + ty.toFixed(1) +
        '" text-anchor="middle" dominant-baseline="central" style="font:' + (isSel ? 700 : 500) + ' ' + (i === 6 && !mn ? 12.5 : fs) + 'px var(--font);fill:' +
        (isSel ? 'var(--on-tint)' : 'var(--ink)') + '">' + lab + '</text></g>';
    });
  });
  return s + '<text x="160" y="150" text-anchor="middle" style="font:700 19px var(--font);fill:var(--ink)">' + keyTitle(k) +
    '</text><text x="160" y="174" text-anchor="middle" style="font:400 13px var(--font);fill:var(--l2)">' + sigText(k) + '</text></svg>';
}

function circleHTML() {
  const th = TH(), k = keyInfo(th.pc, th.minor, th.sev), { t } = ctx;
  if (size === 'quarter') return '<div class="cwrap q">' + circleSVG(k) + '</div>';
  const modes = '<div class="seg" style="width:auto" data-seg="kmode" role="group" aria-label="' + t('modeToggle') + '"><button data-v="0" aria-pressed="' + !th.minor +
    '" style="min-width:54px">' + t('major') + '</button><button data-v="1" aria-pressed="' + th.minor + '" style="min-width:54px">' + t('minor') + '</button></div>' +
    '<button class="ic txt sm' + (th.sev ? ' act' : '') + '" data-x="sevt" aria-pressed="' + th.sev + '" aria-label="' + t('sevenths') + '">7</button>';
  const cgrid = '<div class="cgrid">' + k.chords.map((c, i) => '<button class="cbtn" data-x="chord" data-i="' + i + '"><span class="fnb f' + c.f + '">' + c.rn + '</span><b>' + c.name + '</b></button>').join('') + '</div>';
  if (size === 'strip') {
    return '<div class="srow2">' + icb('data-x="kprev"', '‹', t('ccw'), 'sm txt') + '<button class="ktitle" data-x="kmodet" aria-label="' + t('modeToggle') + '">' + keyTitle(k) +
      '<span class="l2">' + sigText(k) + '</span></button>' + icb('data-x="knext"', '›', t('cw'), 'sm txt') + '<div class="chips nowrap sgrow">' +
      k.chords.map((c, i) => '<button class="chip" data-x="chord" data-i="' + i + '"><span class="fnb f' + c.f + '">' + c.rn + '</span>' + c.name + '</button>').join('') + '</div></div>';
  }
  if (size === 'half') return '<div class="cwrap h"><div class="csvg">' + circleSVG(k) + '</div><div class="cside"><div class="vrow tight">' + modes + '</div>' + cgrid + '</div></div>';
  const rel = t(k.relMinor ? 'key.min' : 'key.maj', { root: k.relRoot });
  return '<div class="cwrap f"><div class="csvg">' + circleSVG(k) + '</div><div class="prow" style="margin:8px 0 4px;justify-content:center">' + modes + '</div>' + cgrid +
    '<p class="ftr">' + (k.signs.length ? k.signs.join(' ') : t('noSignsCap')) + ' · ' + t('rel', { key: rel }) + (th.minor ? ' · ' + t('harmV', { note: k.notes[4] }) : '') + '</p>' +
    '<div class="ctrl4">' + icb('data-x="kscale"', I.play, t('playScale')) + icb('data-x="kdrone"', I.drone, t('droneTonic')) + icb('data-x="kpiano"', I.piano, t('pianoHl')) +
    icb('data-x="kscales"', I.scales, t('openScales')) + '</div></div>';
}

/* ---------- гаммы ---------- */

function scalesHTML() {
  const th = TH(), sc = th.scale, k = scaleInfo(sc.pc, sc.type), { t, ui } = ctx;
  const notes = '<div class="scnotes">' + k.notes.map((n, i) => '<div><b>' + n + '</b><span>' + k.degs[i] + '</span></div>').join('') + '</div>';
  const root = '<div class="vrow tight">' + icb('data-x="srootp"', '‹', t('rootDown'), 'sm txt') + '<b class="sroot">' + k.root + '</b>' + icb('data-x="srootn"', '›', t('rootUp'), 'sm txt') + '</div>';
  const type = '<button class="ic txt sm stype" data-x="stypenext" aria-label="' + t('nextScale') + '">' + scaleName(sc.type) + '</button>';
  const play = icb('data-x="splay"', I.play, t('play'));
  if (size === 'quarter') return '<div class="vq">' + root + type + notes + play + '</div>';
  if (size === 'strip') return '<div class="vs"><div class="srow2" style="flex:none">' + root + type + '<span class="sgrow"></span>' + play + '</div>' + notes + '</div>';
  const vw = th.view || 'fret', title = k.root + ' ' + scaleName(sc.type);
  if (size === 'half') {
    const vb = icb('data-x="tview" data-v="' + (vw === 'fret' ? 'keys' : 'fret') + '"', vw === 'fret' ? I.piano : I.fret, t(vw === 'fret' ? 'showKeys' : 'showFret'), 'sm');
    return '<div class="swrap h2"><div class="shead2">' + root + '<button class="tpbtn" data-x="stypesheet" aria-label="' + t('pickScale') + '">' + ui.esc(scaleName(sc.type)) +
      ' <span>▾</span></button>' + vb + icb('data-x="splay"', I.play, t('play'), 'sm') + '</div>' + notes + '<div class="sviz">' +
      (vw === 'fret' ? fretHTML(new Set(k.pcs), k.rootPc, 12) : kbHTML(60, 15, new Set(k.pcs), k.rootPc)) + '</div></div>';
  }
  const head = '<div class="hscroll">' + SH.map((n, i) => '<button class="pill" data-x="sroot" data-v="' + i + '" aria-pressed="' + (sc.pc === i) + '">' + enh(i) + '</button>').join('') +
    '</div><div class="hscroll">' + SCALE_TYPES.map((x) => '<button class="pill" data-x="stype" data-v="' + x + '" aria-pressed="' + (sc.type === x) + '">' + scaleName(x) + '</button>').join('') + '</div>';
  const acts = '<div class="ctrl4">' + play + icb('data-x="sdrone"', I.drone, t('droneTonic')) + icb('data-x="spiano"', I.piano, t('onPiano')) + '<span></span></div>';
  const tog = '<div class="vtog"><div class="seg" style="width:auto"><button data-x="tview" data-v="fret" aria-pressed="' + (vw === 'fret') + '">' + t('fret') +
    '</button><button data-x="tview" data-v="keys" aria-pressed="' + (vw === 'keys') + '">' + t('keys') + '</button></div></div>';
  return '<div class="swrap">' + head + '<div class="ch2"><b>' + ui.esc(title) + '</b><span class="num l2">' + k.steps.map(stepTxt).join(' ') + '</span></div>' + notes + tog +
    (vw === 'fret' ? fretHTML(new Set(k.pcs), k.rootPc, 15) : '<div style="margin-top:8px">' + kbHTML(60, 15, new Set(k.pcs), k.rootPc) + '</div>') + acts + '</div>';
}

/* ---------- аккорды ---------- */

function chordsHTML() {
  const th = TH(), k = chordInfo(th.croot || 0, th.ctype), { t, ui } = ctx, lab = chordLabel(k.id), desc = t('chord.' + k.id);
  const notes = '<div class="scnotes">' + k.notes.map((n, i) => '<div><b>' + n + '</b><span>' + k.form[i] + '</span></div>').join('') + '</div>';
  const root = '<div class="vrow tight">' + icb('data-x="crootp"', '‹', t('rootDown'), 'sm txt') + '<b class="sroot">' + k.root + '</b>' + icb('data-x="crootn"', '›', t('rootUp'), 'sm txt') + '</div>';
  const type = '<button class="ic txt sm stype" data-x="ctypenext" aria-label="' + t('nextChord') + '">' + lab + '</button>';
  const play = icb('data-x="cplay"', I.play, t('playChord'));
  if (size === 'quarter') return '<div class="vq"><div class="cname">' + k.name + '</div>' + root + type + notes + play + '</div>';
  if (size === 'strip') return '<div class="vs"><div class="srow2" style="flex:none">' + root + type + '<b class="cname sm">' + k.name + '</b><span class="sgrow"></span>' + play + '</div>' + notes + '</div>';
  if (size === 'half') {
    return '<div class="swrap h2"><div class="shead2">' + root + '<button class="tpbtn" data-x="ctypesheet" aria-label="' + t('pickChord') + '"><b>' + ui.esc(k.name) + '</b> <span>▾</span></button>' +
      icb('data-x="carp"', I.wave, t('arp'), 'sm') + icb('data-x="cplay"', I.play, t('playChord'), 'sm') + '</div>' + notes + '<div class="sviz">' + fretHTML(new Set(k.pcs), k.pc, 12) + '</div></div>';
  }
  return '<div class="swrap"><div class="hscroll">' + SH.map((n, i) => '<button class="pill" data-x="croot" data-v="' + i + '" aria-pressed="' + (k.pc === i) + '">' + enh(i) + '</button>').join('') + '</div>' +
    '<div class="hscroll">' + CHORDS.map((c) => '<button class="pill" data-x="ctype" data-v="' + c[0] + '" aria-pressed="' + (c[0] === k.id) + '" aria-label="' + ui.esc(t('chord.' + c[0])) + '">' + (c[1] || 'maj') + '</button>').join('') + '</div>' +
    '<div class="ch2"><b class="cname">' + k.name + '</b><span class="l2">' + ui.esc(desc) + '</span></div>' + notes + fretHTML(new Set(k.pcs), k.pc, 15) +
    '<div class="ctrl4" style="margin-top:10px">' + play + icb('data-x="carp"', I.wave, t('arp')) + icb('data-x="cpiano"', I.piano, t('onPiano')) + icb('data-x="cdrone"', I.drone, t('droneTonic')) + '</div></div>';
}

/* ---------- интервалы ---------- */

function intervalsHTML() {
  const pc = TH().croot || 0, root = MAJ_NAMES[pc], { t } = ctx, nt = (i) => intervalNote(pc, i);
  const rootc = '<div class="vrow tight">' + icb('data-x="crootp"', '‹', t('noteDown'), 'sm txt') + '<b class="sroot">' + root + '</b>' + icb('data-x="crootn"', '›', t('noteUp'), 'sm txt') + '</div>';
  const list = INTERVALS.map((_, i) => i).slice(1);
  if (size === 'quarter') return '<div class="vq">' + rootc + '<div class="igrid">' + list.map((i) => '<button class="ibtn" data-x="iplay" data-i="' + i + '" aria-label="' + t('iv.' + i) + '">' + t('ivs.' + i) + '</button>').join('') + '</div></div>';
  if (size === 'strip') return '<div class="srow2">' + rootc + '<div class="chips nowrap sgrow">' + list.map((i) => '<button class="chip" data-x="iplay" data-i="' + i + '" aria-label="' + t('iv.' + i) + '"><span class="fnb fS">' + t('ivs.' + i) + '</span>' + nt(i) + '</button>').join('') + '</div></div>';
  if (size === 'half') {
    return '<div class="swrap h2"><div class="shead2">' + rootc + '<span class="l2" style="font-size:13px">' + t('tapToHear') + '</span></div><div class="igrid2">' +
      list.map((i) => '<button class="ib2" data-x="iplay" data-i="' + i + '"><b>' + t('ivs.' + i) + '</b><span>' + nt(i) + '</span><small>' + t('iv.' + i) + '</small></button>').join('') + '</div></div>';
  }
  return '<div class="swrap"><div class="hscroll">' + SH.map((n, i) => '<button class="pill" data-x="croot" data-v="' + i + '" aria-pressed="' + (pc === i) + '">' + enh(i) + '</button>').join('') + '</div>' +
    '<div class="group" style="margin-top:6px">' + INTERVALS.map((iv, i) => '<button class="cell" data-x="iplay" data-i="' + i + '"><span class="fnb fS" style="width:34px">' + t('ivs.' + i) +
      '</span><span class="grow">' + t('iv.' + i) + '</span><span class="val num">' + t('ivSemis', { n: iv[0], a: root, b: nt(i) }) + '</span></button>').join('') + '</div>' +
    '<p class="ftr">' + t('ivFtr') + '</p></div>';
}

/* ---------- окно ---------- */

function view() {
  const s = TH().sec || 'circle', big = size === 'full' || size === 'half', { t } = ctx;
  const sw = big ? '<div class="tsw" role="tablist">' + SECS.map((k) => '<button class="tswb' + (k === s ? ' on' : '') + '" data-x="tsec" data-v="' + k + '" role="tab" aria-selected="' + (k === s) + '">' +
    t('sec.' + k) + '</button>').join('') + '</div>'
    : '<div class="csw"><button class="cswb on txt" data-x="tsecnext" aria-label="' + t('secNext') + '">' + t('sec.' + s) + ' ›</button></div>';
  const body = s === 'circle' ? circleHTML() : s === 'scales' ? scalesHTML() : s === 'chords' ? chordsHTML() : intervalsHTML();
  return '<div class="comp ' + size + '">' + sw + '<div class="cbody">' + body + '</div></div>';
}

function render() {
  if (host) host.innerHTML = view();
}

// Шторка выбора гаммы или аккорда
function typeSheet(kind) {
  const { t, ui } = ctx, th = TH();
  const list = kind === 'sc' ? SCALE_TYPES.map((k) => [k, scaleName(k).replace(/^./, (c) => c.toUpperCase()), ''])
    : CHORDS.map((c) => [c[0], c[1] || 'maj', t('chord.' + c[0])]);
  const cur = kind === 'sc' ? th.scale.type : th.ctype || 'maj';
  ui.sheet(() => ui.snav(t(kind === 'sc' ? 'sheet.scale' : 'sheet.chord')) + '<div class="group">' + list.map(([v, n, d]) => '<button class="cell" data-tp="' + v + '" aria-pressed="' + (v === cur) +
    '"><span class="grow"><b style="font-weight:600">' + ui.esc(n) + '</b>' + (d ? ' <span class="l2" style="font-size:14px">' + ui.esc(d) + '</span>' : '') + '</span>' + (v === cur ? ui.icons.check : '') + '</button>').join('') + '</div>',
  (el, sh) => el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tp]');
    if (!b) return;
    if (kind === 'sc') th.scale.type = b.dataset.tp;
    else th.ctype = b.dataset.tp;
    ctx.store.save();
    sh.close();
    render();
  }));
}

function highlight(pcs, root, label) {
  ctx.shared.set('highlight', { pcs: new Set(pcs), root, label });
  ctx.openTool('piano');
}

function droneOn(pc, note) {
  if (!ctx.audio.unlock()) return;
  ctx.audio.drone.tonic(pc);
  ctx.ui.toast(ctx.t('droneToast', { note }));
}

function act(a, el) {
  const th = TH(), A = ctx.audio, save = () => { ctx.store.save(); render(); };
  switch (a) {
    case 'tsec': th.sec = el.dataset.v; save(); break;
    case 'tsecnext': th.sec = SECS[(SECS.indexOf(th.sec || 'circle') + 1) % SECS.length]; save(); break;
    case 'key': th.pc = +el.dataset.pc; th.minor = el.dataset.minor === '1'; save(); break;
    case 'sevt': th.sev = !th.sev; save(); break;
    case 'kprev': case 'knext': th.pc = circleStep(th.pc, th.minor, a === 'knext' ? 1 : -1); save(); break;
    case 'kmodet': th.minor = !th.minor; save(); break;
    case 'chord': A.playChord(keyInfo(th.pc, th.minor, th.sev).chords[+el.dataset.i].midis); break;
    case 'kscale': A.playSeq(keyInfo(th.pc, th.minor).scaleMidis, { step: 0.28 }); break;
    case 'kdrone': { const k = keyInfo(th.pc, th.minor); droneOn(k.rootPc, k.root); break; }
    case 'kpiano': { const k = keyInfo(th.pc, th.minor); highlight(k.pcs, k.rootPc, keyTitle(k)); break; }
    case 'kscales': th.scale = { pc: th.pc, type: th.minor ? 'minor' : 'major' }; th.sec = 'scales'; save(); break;
    case 'stypesheet': typeSheet('sc'); break;
    case 'ctypesheet': typeSheet('ch'); break;
    case 'sroot': th.scale.pc = +el.dataset.v; save(); break;
    case 'srootp': case 'srootn': th.scale.pc = (th.scale.pc + (a === 'srootn' ? 1 : 11)) % 12; save(); break;
    case 'stype': th.scale.type = el.dataset.v; save(); break;
    case 'stypenext': th.scale.type = SCALE_TYPES[(SCALE_TYPES.indexOf(th.scale.type) + 1) % SCALE_TYPES.length]; save(); break;
    case 'splay': A.playSeq(scaleInfo(th.scale.pc, th.scale.type).seq, { step: 0.28 }); break;
    case 'sdrone': { const k = scaleInfo(th.scale.pc, th.scale.type); droneOn(k.rootPc, k.root); break; }
    case 'spiano': { const k = scaleInfo(th.scale.pc, th.scale.type); highlight(k.pcs, k.rootPc, k.root + ' ' + scaleName(th.scale.type)); break; }
    case 'tview': th.view = el.dataset.v; save(); break;
    case 'croot': th.croot = +el.dataset.v; save(); break;
    case 'crootp': case 'crootn': th.croot = ((th.croot || 0) + (a === 'crootn' ? 1 : 11)) % 12; save(); break;
    case 'ctype': th.ctype = el.dataset.v; save(); break;
    case 'ctypenext': { const k = CHORDS.map((c) => c[0]); th.ctype = k[(k.indexOf(th.ctype || 'maj') + 1) % k.length]; save(); break; }
    case 'cplay': A.playChord(chordInfo(th.croot || 0, th.ctype).midis); break;
    case 'carp': { const m = chordInfo(th.croot || 0, th.ctype).midis; A.playSeq(m.concat(m.slice(0, -1).reverse()), { step: 0.22 }); break; }
    case 'cpiano': { const k = chordInfo(th.croot || 0, th.ctype); highlight(k.pcs, k.pc, k.name); break; }
    case 'cdrone': { const k = chordInfo(th.croot || 0, th.ctype); droneOn(k.pc, k.root); break; }
    case 'iplay': {
      const pc = th.croot || 0, m = intervalBase(pc), iv = INTERVALS[+el.dataset.i][0];
      A.playSeq([m, m + iv], { step: 0.5 });
      setTimeout(() => A.playChord([m, m + iv]), 1100);
      break;
    }
    case 'fplay': A.playSeq([+el.dataset.m], { step: 0.6 }); break;
  }
}

function bind() {
  onClick = (e) => {
    const sg = e.target.closest('[data-seg="kmode"] [data-v]');
    if (sg) { TH().minor = sg.dataset.v === '1'; ctx.store.save(); render(); return; }
    const x = e.target.closest('[data-x]');
    if (x) act(x.dataset.x, x);
  };
  // Сектора круга — с клавиатуры
  onKey = (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.sec[data-x="key"]')) { e.preventDefault(); act('key', e.target); }
  };
  // Клавиши в гаммах — сыграть ноту
  onDown = (e) => {
    const k = e.target.closest('.kb [data-m]');
    if (!k) return;
    e.preventDefault();
    if (ctx.audio.unlock()) ctx.audio.playNote(+k.dataset.m, { bus: 'theory', dur: 0.6 });
  };
  host.addEventListener('click', onClick);
  host.addEventListener('keydown', onKey);
  host.addEventListener('pointerdown', onDown);
}

export default {
  id: 'theory',
  name: { ru: ru.name, uz: uz.name, en: en.name },
  i18n: { ru, uz, en },
  icon: ICON,
  color: '#007AFF',
  sizes: ['full', 'half', 'quarter', 'strip'],
  status(c) {
    const th = c.store.all(), k = keyInfo(th.pc || 0, !!th.minor);
    return c.t(k.minor ? 'key.min' : 'key.maj', { root: k.root });
  },
  mount(el, c, sz = 'full') {
    host = el; ctx = c; size = sz;
    render();
    bind();
  },
  resize(sz) { size = sz; render(); },
  unmount() {
    if (host) {
      host.removeEventListener('click', onClick);
      host.removeEventListener('keydown', onKey);
      host.removeEventListener('pointerdown', onDown);
    }
    host = null;
  },
};
