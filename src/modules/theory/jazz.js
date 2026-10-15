// «Теория» → «Джаз»: справочник рабочими схемами и таблицами в выбранной тональности — аккорды и их гаммы,
// гаммы джаза, септаккорды тональности, II–V–I во всех тональностях, голоса для фортепиано, вторичные доминанты,
// заимствование и модуляции, замены, формы пьес, ритмы аккомпанемента, приёмы импровизации.
// Нажатие на аккорд или оборот — звучит; голоса — на мини-клавиатуре. Данные — src/music/jazz.js.
import { SH, MAJ_NAMES, MIN_NAMES, enh } from '../../music/notes.js';
import { scaleInfo, SCALES } from '../../music/theory.js';
import {
  JCHORDS, JFAMILIES, jchord, JSCALE_GROUPS, DIATONIC, diatonic, iivi, ORDERS, VOICINGS, voiceIIVI, ust, soWhat, quartal,
  secondary, borrowed, pivots, NEIGHBORS, subsIn, FORMS, FORM_IDS, formIn, SHAPES, RHYTHMS, APPROACH, DIGITS, PENTA, chordDegree, inKey,
} from '../../music/jazz.js';

export const JSUBS = ['chords', 'scales', 'key', 'iivi', 'voice', 'func', 'borrow', 'subs', 'forms', 'rhythm', 'improv'];
const PLAY = '<svg viewBox="0 0 24 24" class="f"><path d="M7 4.8v14.4c0 .8.9 1.3 1.6.9l11.3-7.2c.6-.4.6-1.4 0-1.8L8.6 3.9C7.9 3.5 7 4 7 4.8z"/></svg>';
const STOP = '<svg viewBox="0 0 24 24" class="f"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';

/* ---------- звук: аккорды, обороты, ритм (одна очередь — новое нажатие прерывает прежнее) ---------- */

let timers = [];
export function jstop() { timers.forEach(clearTimeout); timers = []; }
const later = (fn, s) => timers.push(setTimeout(fn, s * 1000));
// Аккорд для оборота: бас (корень) и аккорд октавой выше без корня
const voiced = (c) => [c.midis[0] - 12, ...c.midis.slice(1)];
function playProg(A, list, step = 1.1) {
  jstop();
  if (!A.unlock()) return;
  list.forEach((ms, i) => later(() => A.playChord(ms, { dur: step * 0.95 }), i * step));
}
function playLine(A, ms, step = 0.22) { jstop(); if (A.unlock()) A.playSeq(ms, { step }); }
// Ритм: аккорд по сетке восьмых, два такта; свинг — вторая восьмая доли на 2/3 доли
function playRhythm(A, ms, n, hits, swing, bpm) {
  jstop();
  if (!A.unlock()) return;
  const beat = 60 / bpm, slot = (i) => Math.floor(i / 2) * beat + (i % 2 ? (swing ? beat * 2 / 3 : beat / 2) : 0), bar = (n / 2) * beat;
  const bars = n > 8 ? 1 : 2;
  for (let b = 0; b < bars; b++) hits.forEach((h) => later(() => A.playChord(ms, { dur: swing ? beat * 0.55 : beat * 0.45 }), b * bar + slot(h)));
  // счёт: тихий щелчок на каждую долю (нижнее до)
  for (let i = 0; i < (n / 2) * bars; i++) later(() => A.playSeq([36], { step: 0.05 }), i * beat);
}

/* ---------- мини-клавиатура ---------- */

const BLK = [1, 3, 6, 8, 10];
function miniKb(midis, lo, hi) {
  const set = new Set(midis);
  lo = lo ?? Math.floor(Math.min(...midis) / 12) * 12;
  hi = hi ?? Math.max(lo + 24, Math.ceil((Math.max(...midis) + 1) / 12) * 12);
  const whites = [];
  for (let m = lo; m < hi; m++) if (!BLK.includes(m % 12)) whites.push(m);
  const W = 11, H = 40, w = whites.length * W;
  let s = '<svg class="jkb" viewBox="0 0 ' + w + ' ' + H + '" aria-hidden="true">';
  whites.forEach((m, i) => { s += '<rect x="' + i * W + '" y="0" width="' + (W - 1) + '" height="' + H + '" rx="2" class="' + (set.has(m) ? 'on' : 'w') + '"/>'; });
  whites.forEach((m, i) => {
    const b = m + 1;
    if (b < hi && BLK.includes(b % 12)) s += '<rect x="' + (i * W + W * 0.62) + '" y="0" width="' + W * 0.72 + '" height="' + H * 0.6 + '" rx="1.5" class="' + (set.has(b) ? 'on' : 'b') + '"/>';
  });
  return s + '</svg>';
}

/* ---------- раздел ---------- */

// env: { ctx, th, size }
export function jazzHTML(env) {
  const { ctx, th } = env, { t, ui } = ctx, sub = JSUBS.includes(th.jsub) ? th.jsub : 'chords';
  const pc = th.jpc ?? 0;
  const subs = '<div class="hscroll jsubs">' + JSUBS.map((k) => '<button class="pill" data-x="jsub" data-v="' + k + '" aria-pressed="' + (k === sub) + '">' + t('j.sub.' + k) + '</button>').join('') + '</div>';
  const keyBar = (minorSeg) => '<div class="jkey"><div class="vrow tight">' + ui.icb('data-x="jkeyp"', '‹', t('rootDown'), 'sm txt') +
    '<b class="sroot">' + (minorSeg && th.jmin ? MIN_NAMES : MAJ_NAMES)[pc] + (minorSeg && th.jmin ? 'm' : '') + '</b>' + ui.icb('data-x="jkeyn"', '›', t('rootUp'), 'sm txt') + '</div>' +
    (minorSeg ? '<div class="seg" style="width:auto">' + [['0', t('j.maj')], ['1', t('j.min')]].map(([v, n]) => '<button data-x="jmin" data-v="' + v + '" aria-pressed="' + ((v === '1') === !!th.jmin) + '">' + n + '</button>').join('') + '</div>' : '') + '</div>';
  const body = { chords, scales, key, iivi: iiviHTML, voice, func, borrow, subs: subsHTML, forms, rhythm, improv }[sub](env, pc, keyBar);
  return '<div class="swrap jazz">' + subs + body + '</div>';
}

/* --- общие кусочки --- */

const enc = (ms) => ms.join(',');
const encP = (list) => list.map(enc).join('|');
function chip(env, c, { rn = true, sel = false, ms } = {}) {
  return '<button class="jc' + (sel ? ' on' : '') + '" data-x="jch" data-m="' + enc(ms || voiced(c)) + '"><b>' + c.name + '</b>' + (rn && c.rn ? '<span>' + c.rn + '</span>' : '') + '</button>';
}
const progBtn = (env, list, label) => env.ctx.ui.icb('data-x="jprog" data-p="' + encP(list) + '"', PLAY, label || env.ctx.t('j.play'), 'sm');
const lineBtn = (env, ms, label) => env.ctx.ui.icb('data-x="jline" data-m="' + enc(ms) + '"', PLAY, label || env.ctx.t('j.play'), 'sm');
const hdr = (s) => '<div class="hdr">' + s + '</div>';
const scName = (env, id) => env.ctx.t('scale.' + id);

/* --- аккорды: словарь и гаммы к ним --- */

function chords(env, pc) {
  const { ctx, th } = env, { t } = ctx, root = MAJ_NAMES[pc], fam = JFAMILIES.includes(th.jfam) ? th.jfam : 'maj';
  const rootPills = '<div class="hscroll">' + SH.map((n, i) => '<button class="pill" data-x="jroot" data-v="' + i + '" aria-pressed="' + (pc === i) + '">' + enh(i) + '</button>').join('') + '</div>';
  const famSeg = '<div class="hscroll">' + JFAMILIES.map((f) => '<button class="pill" data-x="jfam" data-v="' + f + '" aria-pressed="' + (f === fam) + '">' + t('j.fam.' + f) + '</button>').join('') + '</div>';
  const list = JCHORDS.filter((c) => c[3] === fam).map((c) => jchord(root, c[0]));
  const cur = list.find((c) => c.id === th.jch) || list[0];
  const top = '<div class="jsel"><b class="cname">' + cur.name + '</b>' + miniKb(cur.midis) + '<div class="scnotes">' + cur.notes.map((n, i) => '<div><b>' + n + '</b><span>' + cur.degs[i] + '</span></div>').join('') + '</div></div>';
  const rows = list.map((c) => '<div class="jrow' + (c.id === cur.id ? ' on' : '') + '"><button class="jsym" data-x="jpick" data-v="' + c.id + '" data-m="' + enc(c.midis) + '">' + c.sym + '</button>' +
    '<span class="jdeg num">' + c.degs.join(' ') + '</span><span class="jsc">' + c.scales.map((s) => '<button class="lchip sm" data-x="jscale" data-v="' + s + '">' + scName(env, s) + '</button>').join('') + '</span></div>').join('');
  return rootPills + famSeg + top + '<div class="jtable">' + rows + '</div>';
}

/* --- гаммы джаза --- */

function scales(env, pc, keyBar) {
  const { ctx, th } = env, { t } = ctx, id = SCALES[th.jscale] ? th.jscale : 'altered', k = scaleInfo(pc, id);
  const top = '<div class="jsel"><div class="ch2"><b>' + k.root + ' ' + scName(env, id) + '</b>' + lineBtn(env, k.seq) + '</div>' +
    '<div class="scnotes">' + k.notes.map((n, i) => '<div><b>' + n + '</b><span>' + k.degs[i] + '</span></div>').join('') + '</div>' + miniKb(k.seq.slice(0, k.notes.length + 1)) + '</div>';
  return keyBar(false) + top + JSCALE_GROUPS.map(([g, ids]) => hdr(t('j.grp.' + g)) + '<div class="jpills">' +
    ids.map((s) => '<button class="pill" data-x="jscale" data-v="' + s + '" aria-pressed="' + (s === id) + '">' + scName(env, s) + '</button>').join('') + '</div>').join('');
}

/* --- тональность: септаккорды, функции, лады --- */

function key(env, pc, keyBar) {
  const { ctx, th } = env, { t } = ctx, kind = DIATONIC[th.jdia] ? th.jdia : 'major', list = diatonic(pc, kind);
  const seg = '<div class="hscroll">' + Object.keys(DIATONIC).map((k) => '<button class="pill" data-x="jdia" data-v="' + k + '" aria-pressed="' + (k === kind) + '">' + t('j.dia.' + k) + '</button>').join('') + '</div>';
  const fam = (f) => '<span class="fnb f' + f + '">' + f + '</span>';
  const rows = list.map((c) => '<div class="jrow">' + fam(c.fn) + '<span class="jrn">' + c.rn + '</span>' + chip(env, c, { rn: false }) +
    '<button class="lchip sm" data-x="jscale" data-v="' + c.mode + '">' + scName(env, c.mode) + '</button></div>').join('');
  // семьи: что чем заменяется (одна функция — один цвет)
  const groups = ['T', 'S', 'D'].map((f) => '<div class="jfam">' + fam(f) + list.filter((c) => c.fn === f).map((c) => '<span>' + c.rn + '</span>').join('') + '</div>').join('');
  return keyBar(false) + seg + '<div class="jtable">' + rows + '</div>' + hdr(t('j.families')) + '<div class="jfams">' + groups + '</div>' +
    '<div class="jacts">' + progBtn(env, [list[0], list[3], list[4], list[0]].map(voiced), 'I–IV–V–I') + progBtn(env, [list[0], list[5], list[1], list[4]].map(voiced), 'I–vi–ii–V') + '</div>';
}

/* --- II–V–I во всех тональностях --- */

function iiviHTML(env, pc, keyBar) {
  const { ctx, th } = env, { t } = ctx, minor = !!th.jmin, ord = ORDERS[th.jord] ? th.jord : 'fourths';
  const cur = iivi(pc, minor);
  const head = '<div class="jbig">' + cur.map((c) => chip(env, c)).join('<i>→</i>') + progBtn(env, cur.map(voiced)) + '</div>';
  const ordSeg = '<div class="hscroll">' + Object.keys(ORDERS).map((o) => '<button class="pill" data-x="jord" data-v="' + o + '" aria-pressed="' + (o === ord) + '">' + t('j.order.' + o) + '</button>').join('') + '</div>';
  const shift = (x) => (x + pc) % 12;
  const rows = ORDERS[ord].map((o) => { const p = iivi(shift(o), minor);
    return '<div class="jrow' + (shift(o) === pc ? ' on' : '') + '"><span class="jkn">' + (minor ? MIN_NAMES : MAJ_NAMES)[shift(o)] + (minor ? 'm' : '') + '</span>' + p.map((c) => chip(env, c, { rn: false })).join('') + progBtn(env, p.map(voiced)) + '</div>'; }).join('');
  // цепочки II–V: вниз по целым тонам и по полутонам (как в стандартах)
  const chain = (step) => { const out = []; for (let i = 0; i < 4; i++) { const p = iivi((pc + 12 - step * i) % 12, false); out.push(p[0], p[1]); } return out; };
  const ch = (step, label) => '<div class="jrow"><span class="jrn">' + label + '</span><span class="jflow">' + chain(step).map((c) => chip(env, c, { rn: false })).join('') + '</span>' + progBtn(env, chain(step).map(voiced)) + '</div>';
  return keyBar(true) + head + hdr(t('j.allKeys')) + ordSeg + '<div class="jtable">' + rows + '</div>' + hdr(t('j.chains')) + '<div class="jtable">' + ch(2, '−2') + ch(1, '−1') + '</div>';
}

/* --- голоса для фортепиано --- */

function voice(env, pc, keyBar) {
  const { ctx, th } = env, { t } = ctx, minor = !!th.jmin, vid = VOICINGS[th.jvo] ? th.jvo : 'rootA', vs = voiceIIVI(pc, minor, vid);
  const lo = Math.floor(Math.min(...vs.flatMap((v) => v.midis)) / 12) * 12, hi = Math.ceil((Math.max(...vs.flatMap((v) => v.midis)) + 1) / 12) * 12;
  const vSeg = '<div class="hscroll">' + Object.keys(VOICINGS).map((v) => '<button class="pill" data-x="jvo" data-v="' + v + '" aria-pressed="' + (v === vid) + '">' + t('j.vo.' + v) + '</button>').join('') + '</div>';
  const cols = '<div class="jvoice">' + vs.map((v) => '<button class="jvc" data-x="jch" data-m="' + enc(v.midis) + '"><span class="jvn"><b>' + v.chord.name + '</b><span class="jrn">' + v.chord.rn + '</span></span>' +
    miniKb(v.midis, Math.min(lo, hi - 24), hi) + '<span class="jdeg num">' + v.degs.join(' ') + '</span></button>').join('') + '</div>';
  const V = iivi(pc, minor)[1], u = ust(V.root);
  const ulo = Math.floor(Math.min(...u.flatMap((x) => x.midis)) / 12) * 12, uhi = Math.ceil((Math.max(...u.flatMap((x) => x.midis)) + 1) / 12) * 12;
  const ustRows = u.map((x) => '<button class="jvc" data-x="jch" data-m="' + enc(x.midis) + '"><span class="jvn"><b>' + x.sym + '</b><span class="jrn">' + x.triad + '/' + V.root + '</span></span>' + miniKb(x.midis, ulo, uhi) + '<span class="jdeg num">' + x.tens.join(' ') + '</span></button>').join('');
  const ii = iivi(pc, false)[0], sw = soWhat(ii.pc), qs = quartal(ii.pc, SCALES.dorian[0]);
  return keyBar(true) + vSeg + cols + '<div class="jacts">' + progBtn(env, vs.map((v) => v.midis), t('j.play')) + '</div>' +
    hdr(t('j.ust', { v: V.name })) + '<div class="jvoice">' + ustRows + '</div>' +
    hdr(t('j.quart', { ii: ii.name })) + '<div class="jvoice"><button class="jvc" data-x="jch" data-m="' + enc(sw) + '"><span class="jvn"><b>So What</b><span class="jrn">' + ii.name + '</span></span>' + miniKb(sw, 48, 84) + '<span class="jdeg num">4 4 4 3</span></button></div><div class="jtable">' +
    '<div class="jrow"><span class="jflow">' + qs.map((q, i) => '<button class="jc" data-x="jch" data-m="' + enc(q) + '"><b>' + (i + 1) + '</b></button>').join('') + '</span>' + progBtn(env, qs.concat([qs[0]])) + '</div></div>';
}

/* --- функции: вторичные доминанты --- */

function func(env, pc, keyBar) {
  const { ctx } = env, { t } = ctx, s = secondary(pc);
  const rows = s.map((x) => '<div class="jrow g5"><span class="jrn">' + x.rn + '</span>' + chip(env, x.target, { rn: false }) +
    chip(env, x.v, { rn: false }) + chip(env, x.ii, { rn: false }) + chip(env, x.sub, { rn: false }) + progBtn(env, [x.ii, x.v, x.target].map(voiced)) + '</div>').join('');
  const subs = subsIn(pc), chain = subs.find((x) => x.id === 'chain').to;
  return keyBar(false) + '<div class="jrow g5 jth"><span class="jrn"></span><span>x</span><span>V7/x</span><span>ii/x</span><span>subV/x</span><span></span></div>' + '<div class="jtable">' + rows + '</div>' +
    hdr(t('j.chain')) + '<div class="jtable"><div class="jrow"><span class="jflow">' + chain.map((c) => chip(env, c)).join('') + '</span>' + progBtn(env, chain.map(voiced)) + '</div></div>' +
    hdr(t('j.dims')) + '<div class="jtable">' + ['passdim', 'passdim4'].map((id) => { const x = subs.find((y) => y.id === id).to;
      return '<div class="jrow"><span class="jflow">' + x.map((c) => chip(env, c)).join('') + '</span>' + progBtn(env, x.map(voiced)) + '</div>'; }).join('') + '</div>';
}

/* --- заимствование и модуляции --- */

function borrow(env, pc, keyBar) {
  const { ctx, th } = env, { t } = ctx, I = inKey(pc, false, { o: 0, l: 0, q: 'maj7' });
  const rows = borrowed(pc).map((c) => '<div class="jrow"><span class="jrn">' + c.rn + '</span>' + chip(env, c, { rn: false }) +
    '<span class="lchip sm off">' + scName(env, c.src) + '</span>' + progBtn(env, [I, c, I].map(voiced)) + '</div>').join('');
  const nb = NEIGHBORS.includes(th.jnb) ? th.jnb : 7, to = (pc + nb) % 12;
  const nbSeg = '<div class="hscroll">' + NEIGHBORS.map((n) => '<button class="pill" data-x="jnb" data-v="' + n + '" aria-pressed="' + (n === nb) + '">' + MAJ_NAMES[pc] + ' → ' + MAJ_NAMES[(pc + n) % 12] + '</button>').join('') + '</div>';
  const pv = pivots(pc, to);
  const pvRows = pv.length ? pv.map((p) => '<div class="jrow">' + chip(env, p.a, { rn: false }) + '<span class="jrn">' + p.a.rn + ' = ' + p.b.rn + '</span>' +
    progBtn(env, [I, p.a, ...iivi(to, false).slice(1)].map(voiced)) + '</div>').join('') : '<p class="ftr">' + t('j.noPivot') + '</p>';
  const via = [I, ...iivi(to, false)];
  return keyBar(false) + '<div class="jtable">' + rows + '</div>' + hdr(t('j.modul')) + nbSeg + '<div class="jtable">' + pvRows +
    '<div class="jrow"><span class="jrn">ii–V</span><span class="jflow">' + via.map((c) => chip(env, c, { rn: false })).join('') + '</span>' + progBtn(env, via.map(voiced)) + '</div></div>';
}

/* --- замены --- */

function subsHTML(env, pc, keyBar) {
  const { ctx } = env, { t } = ctx;
  return keyBar(false) + '<div class="jtable">' + subsIn(pc).map((x) => '<div class="jsub"><div class="jsubh">' + t('j.subs.' + x.id) + '</div>' +
    '<div class="jrow"><span class="jflow was">' + x.from.map((c) => chip(env, c)).join('') + '</span>' + progBtn(env, x.from.map(voiced), t('j.was')) + '</div>' +
    '<div class="jrow"><span class="jflow">' + x.to.map((c) => chip(env, c)).join('') + '</span>' + progBtn(env, x.to.map(voiced), t('j.now')) + '</div></div>').join('') + '</div>';
}

/* --- формы --- */

function forms(env, pc, keyBar) {
  const { ctx, th } = env, { t } = ctx, id = FORMS[th.jform] ? th.jform : 'blues', bars = formIn(pc, id);
  const fSeg = '<div class="hscroll">' + FORM_IDS.map((f) => '<button class="pill" data-x="jform" data-v="' + f + '" aria-pressed="' + (f === id) + '">' + t('j.form.' + f) + '</button>').join('') + '</div>';
  const grid = '<div class="jbars">' + bars.map((b, i) => '<button class="jbar" data-x="jprog" data-p="' + encP(b.map(voiced)) + '" data-step="' + (b.length > 1 ? 0.6 : 1.1) + '"><i>' + (i + 1) + '</i>' +
    b.map((c) => '<b>' + c.name + '</b><span>' + c.rn + '</span>').join('') + '</button>').join('') + '</div>';
  // вся форма: по такту на 1,2 с (два аккорда — по половине)
  const all = [], steps = [];
  bars.forEach((b) => b.forEach((c) => { all.push(voiced(c)); steps.push(b.length > 1 ? 0.6 : 1.2); }));
  const playAll = env.ctx.ui.icb('data-x="jform-play" data-p="' + encP(all) + '" data-steps="' + steps.join(',') + '"', PLAY, t('j.playForm'), 'sm') + env.ctx.ui.icb('data-x="jstop"', STOP, t('j.stop'), 'sm');
  const shapes = SHAPES.map(([s, parts]) => { const tot = parts.reduce((a, p) => a + p[1], 0);
    return '<div class="jshape"><span>' + t('j.shape.' + s) + '</span><div>' + parts.map(([n, len]) => '<i class="p' + n[0] + '" style="flex:' + len + '">' + n + '<small>' + len + '</small></i>').join('') + '</div><small class="num l2">' + tot + '</small></div>'; }).join('');
  return keyBar(false) + fSeg + '<div class="jacts">' + playAll + '</div>' + grid + hdr(t('j.shapes')) + shapes;
}

/* --- ритм аккомпанемента --- */

function rhythm(env, pc, keyBar) {
  const { ctx, th } = env, { t } = ctx, minor = !!th.jmin, I = voiceIIVI(pc, minor, 'rootA')[2];
  // все узоры сразу: сетка восьмых (цифра — доля, «&» — вторая восьмая), закрашено — где звучит аккорд
  const rows = RHYTHMS.map(([id, n, hits]) => {
    const per = n === 6 ? 3 : 4, cnt = (i) => (i % 2 ? '&' : String(Math.floor(i / 2) % per + 1)), swing = id !== 'bossa' && id !== 'montuno';
    return '<div class="jrh"><div class="jrhh"><b>' + t('j.rh.' + id) + '</b><span class="l2">' + (swing ? t('j.swingS') : t('j.straightS')) + '</span>' +
      ctx.ui.icb('data-x="jrhplay" data-m="' + enc(I.midis) + '" data-n="' + n + '" data-h="' + hits.join(',') + '" data-sw="' + (swing ? 1 : 0) + '"', PLAY, t('j.play'), 'sm') + '</div>' +
      '<div class="jgrid" style="--n:' + n + '">' + Array.from({ length: n }, (_, i) => '<i class="' + (hits.includes(i) ? 'hit' : '') + (i % 2 ? '' : ' beat') + (i && i % (per * 2) === 0 ? ' bar' : '') + '">' + cnt(i) + '</i>').join('') + '</div></div>';
  }).join('');
  return keyBar(true) + '<div class="jsel"><div class="ch2"><b>' + I.chord.name + '</b><span class="l2 num">' + I.degs.join(' ') + '</span></div>' + miniKb(I.midis) + '</div>' + rows + '<p class="ftr">' + t('j.swing') + '</p>';
}

/* --- импровизация --- */

function improv(env, pc, keyBar) {
  const { ctx } = env, { t } = ctx, prog = iivi(pc, false), [ii, V, I] = prog;
  // подход: цель — терция I (ноты лада — мажор тональности)
  const tgt = 60 + ((I.pc + 4) % 12), maj = SCALES.major[0], above = (m) => { const r = (m - pc + 120) % 12; const i = maj.findIndex((x) => x > r); return m + ((i < 0 ? 12 : maj[i]) - r); };
  const ap = APPROACH.map(([id, steps]) => { const ms = steps.map((s) => (s === 's+1' ? above(tgt) : tgt + s)).concat(tgt);
    return '<div class="jrow"><span class="jkn2">' + t('j.ap.' + id) + '</span><span class="jflow num">' + ms.map((m) => '<i>' + SH[m % 12] + '</i>').join('') + '</span>' + lineBtn(env, ms, '') + '</div>'; }).join('');
  // цифровые фигуры на ii–V–I
  const fig = DIGITS.map(([id, ds]) => { const ms = prog.flatMap((c) => ds.map((d) => 60 + ((c.pc - 0 + 12) % 12) + chordDegree(c.fam, d) - (c.pc > 6 ? 12 : 0)));
    return '<div class="jrow"><span class="jkn">' + ds.join('-') + '</span><span class="jflow num">' + prog.map((c, k) => '<i>' + ms.slice(k * ds.length, k * ds.length + ds.length).map((m) => SH[m % 12]).join(' ') + '</i>').join('') + '</span>' + lineBtn(env, ms, '') + '</div>'; }).join('');
  // направляющие тоны: 3 и 7 по очереди, ближайшим голосом
  const g = voiceIIVI(pc, false, 'guide'), gl = g.flatMap((v) => v.midis);
  // пентатоники
  const pRows = [[I, 'maj7'], [ii, 'm7'], [V, '7'], [inKey(pc, false, { o: 7, l: 4, q: '7alt' }), '7alt'], [inKey(pc, false, { o: 11, l: 6, q: 'm7b5' }), 'm7b5']].map(([c, k]) =>
    '<div class="jrow">' + chip(env, c, { rn: false }) + '<span class="jflow">' + PENTA[k].map(([iv, type]) => { const s = scaleInfo((c.pc + iv) % 12, type);
      return '<button class="lchip sm" data-x="jline" data-m="' + enc(s.seq) + '">' + s.root + (type === 'pmin' ? 'm' : '') + ' ' + scName(env, type) + '</button>'; }).join('') + '</span></div>').join('');
  // бибоп-гамма вниз от корня V: хроматическая проходящая между корнем и ♭7 — опоры на сильных долях
  const bb = scaleInfo(V.pc, 'bebdom'), down = [12, 11, 10, 9, 7, 5, 4, 2, 0].map((x) => 60 + V.pc - (V.pc > 6 ? 12 : 0) + x);
  return keyBar(false) + hdr(t('j.imp.approach', { n: SH[tgt % 12], c: I.name })) + '<div class="jtable">' + ap + '</div>' +
    hdr(t('j.imp.digits')) + '<div class="jtable">' + fig + '</div>' +
    hdr(t('j.imp.guide')) + '<div class="jtable"><div class="jrow"><span class="jflow num">' + g.map((v) => '<i>' + v.chord.name + ': ' + v.midis.map((m) => SH[m % 12]).join(' ') + '</i>').join('') + '</span>' + lineBtn(env, gl, '') + '</div></div>' +
    hdr(t('j.imp.penta')) + '<div class="jtable">' + pRows + '</div>' +
    hdr(t('j.imp.bebop', { c: V.name })) + '<div class="jtable"><div class="jrow"><span class="jflow num">' + down.map((m) => '<i>' + SH[m % 12] + '</i>').join('') + '</span>' + lineBtn(env, down, '') + '</div>' +
    '<p class="ftr">' + bb.notes.join(' ') + '</p></div>';
}

/* ---------- нажатия ---------- */

// → true, если нажатие обработано
export function jazzAct(env, a, el) {
  const { ctx, th } = env, A = ctx.audio, d = el.dataset, ms = () => (d.m || '').split(',').filter(Boolean).map(Number);
  const prog = () => (d.p || '').split('|').map((x) => x.split(',').map(Number));
  switch (a) {
    case 'jsub': jstop(); th.jsub = d.v; return 'save';
    case 'jkeyp': case 'jkeyn': th.jpc = ((th.jpc ?? 0) + (a === 'jkeyn' ? 1 : 11)) % 12; return 'save';
    case 'jroot': th.jpc = +d.v; return 'save';
    case 'jmin': th.jmin = d.v === '1'; return 'save';
    case 'jfam': th.jfam = d.v; th.jch = null; return 'save';
    case 'jpick': th.jch = d.v; if (A.unlock()) A.playChord(ms()); return 'save';
    case 'jscale': th.jscale = d.v; th.jsub = 'scales'; return 'save';
    case 'jdia': th.jdia = d.v; return 'save';
    case 'jord': th.jord = d.v; return 'save';
    case 'jvo': th.jvo = d.v; return 'save';
    case 'jnb': th.jnb = +d.v; return 'save';
    case 'jform': jstop(); th.jform = d.v; return 'save';
    case 'jch': jstop(); if (A.unlock()) A.playChord(ms()); return true;
    case 'jprog': playProg(A, prog(), +(d.step || 1.1)); return true;
    case 'jline': playLine(A, ms()); return true;
    case 'jstop': jstop(); return true;
    case 'jform-play': {
      jstop();
      if (!A.unlock()) return true;
      const list = prog(), st = (d.steps || '').split(',').map(Number);
      let at = 0;
      list.forEach((m, i) => { later(() => A.playChord(m, { dur: st[i] * 0.95 }), at); at += st[i]; });
      return true;
    }
    case 'jrhplay': playRhythm(A, ms(), +d.n, d.h.split(',').map(Number), d.sw === '1', d.sw === '1' ? 132 : 140); return true;
  }
  return false;
}
