// Джазовая гармония — справочник в данных (раздел «Джаз» в «Теории»): аккорды и их гаммы, лады минора, II–V–I,
// голоса для фортепиано, вторичные доминанты, заимствование, общие аккорды тональностей, замены, формы пьес,
// ритмы аккомпанемента, приёмы импровизации. Только данные и чистые функции, без текстов интерфейса.
// Всё собрано заново по общеизвестной теории джаза (ступени, формулы, обороты), в своей подаче — таблицами.
import { MAJI, MAJ_NAMES, MIN_NAMES, spell, pcOf } from './notes.js';
import { ROM } from './theory.js';

/* ---------- ступени ---------- */

// '♭9' → { iv: 13, li: 1 }: полутоны от основного тона и номер буквы (0 — та же буква)
export function deg(s) {
  const m = /^([♭♯]*)(\d+)$/.exec(s);
  if (!m) throw new Error('ступень: ' + s);
  const n = +m[2], acc = [...m[1]].reduce((a, c) => a + (c === '♯' ? 1 : -1), 0);
  return { iv: MAJI[(n - 1) % 7] + 12 * Math.floor((n - 1) / 7) + acc, li: (n - 1) % 7 };
}
const shown = (d) => d.replace('♭♭', '𝄫');

/* ---------- аккорды ---------- */

// [id, обозначение, ступени, семья, гаммы]. Семьи: maj — мажорные, min — минорные, dom — доминантовые,
// hd — полууменьшённые, dim — уменьшённые. Гаммы — id из theory.js (SCALES) и ниже (JSCALES)
export const JCHORDS = [
  ['6', '6', ['1', '3', '5', '6'], 'maj', ['major', 'pmaj']],
  ['69', '6/9', ['1', '3', '5', '6', '9'], 'maj', ['major', 'pmaj']],
  ['maj7', 'maj7', ['1', '3', '5', '7'], 'maj', ['major', 'lydian']],
  ['maj9', 'maj9', ['1', '3', '5', '7', '9'], 'maj', ['major', 'lydian']],
  ['maj7s11', 'maj7♯11', ['1', '3', '5', '7', '9', '♯11'], 'maj', ['lydian']],
  ['maj7s5', 'maj7♯5', ['1', '3', '♯5', '7'], 'maj', ['lydaug']],
  ['m6', 'm6', ['1', '♭3', '5', '6'], 'min', ['mel', 'dorian']],
  ['m69', 'm6/9', ['1', '♭3', '5', '6', '9'], 'min', ['dorian', 'mel']],
  ['m7', 'm7', ['1', '♭3', '5', '♭7'], 'min', ['dorian', 'minor', 'phrygian']],
  ['m9', 'm9', ['1', '♭3', '5', '♭7', '9'], 'min', ['dorian', 'minor']],
  ['m11', 'm11', ['1', '♭3', '5', '♭7', '9', '11'], 'min', ['dorian', 'minor']],
  ['mmaj7', 'm(maj7)', ['1', '♭3', '5', '7'], 'min', ['mel', 'harm']],
  ['7', '7', ['1', '3', '5', '♭7'], 'dom', ['mixo', 'bebdom']],
  ['9', '9', ['1', '3', '5', '♭7', '9'], 'dom', ['mixo']],
  ['13', '13', ['1', '3', '5', '♭7', '9', '13'], 'dom', ['mixo', 'lyddom']],
  ['7sus4', '7sus4', ['1', '4', '5', '♭7'], 'dom', ['mixo', 'dorian']],
  ['9sus4', '9sus4', ['1', '4', '5', '♭7', '9'], 'dom', ['mixo']],
  ['7s11', '7♯11', ['1', '3', '5', '♭7', '9', '♯11'], 'dom', ['lyddom']],
  ['7b13', '7♭13', ['1', '3', '5', '♭7', '9', '♭13'], 'dom', ['mixob6']],
  ['7b9', '7♭9', ['1', '3', '5', '♭7', '♭9'], 'dom', ['dimhw', 'phrygdom']],
  ['13b9', '13♭9', ['1', '3', '5', '♭7', '♭9', '13'], 'dom', ['dimhw']],
  ['7s9', '7♯9', ['1', '3', '5', '♭7', '♯9'], 'dom', ['altered', 'dimhw']],
  ['7alt', '7alt', ['1', '3', '♭7', '♭9', '♯9', '♯11', '♭13'], 'dom', ['altered']],
  ['7s5', '7♯5', ['1', '3', '♯5', '♭7'], 'dom', ['whole']],
  ['m7b5', 'm7♭5', ['1', '♭3', '♭5', '♭7'], 'hd', ['locrian', 'locrian2']],
  ['m9b5', 'm9♭5', ['1', '♭3', '♭5', '♭7', '9'], 'hd', ['locrian2']],
  ['dim7', 'dim7', ['1', '♭3', '♭5', '♭♭7'], 'dim', ['dimwh']],
];
export const JFAMILIES = ['maj', 'min', 'dom', 'hd', 'dim'];
export const jchordById = (id) => JCHORDS.find((c) => c[0] === id) || null;

// Имя тона по номеру и тому, как он назван в тональности (буква важна: D♭7, а не C♯7 в тритоновой замене)
const nameAt = (keyName, o, l) => spell(keyName, [o], [l])[0];

// Нижний тон аккорда: от E2 до D♯3 — бас; voiced — выше (для голосов от F3)
const bassOf = (pc) => 40 + ((pc - 4 + 12) % 12);

// Аккорд от тона root (имя ноты): ноты, ступени (как пишутся), звучание (тесно, от баса)
export function jchord(root, id) {
  const c = jchordById(id) || JCHORDS[0], ds = c[2].map(deg), pc = pcOf(root), b = bassOf(pc) + 12;
  return { id: c[0], sym: c[1], name: root + c[1], root, pc, fam: c[3], scales: c[4],
    notes: spell(root, ds.map((d) => d.iv), ds.map((d) => d.li)).map(shown), degs: c[2].map(shown),
    midis: ds.map((d) => b + d.iv), pcs: ds.map((d) => (pc + d.iv) % 12) };
}

/* ---------- гаммы: бибоп, симметричные, пентатоники, другие — в theory.js (SCALES) ---------- */

// Группы для выбора гаммы в «Теории» (лады мелодического и гармонического минора — из theory.js)
export const JSCALE_GROUPS = [
  ['melmodes', ['mel', 'dorianb2', 'lydaug', 'lyddom', 'mixob6', 'locrian2', 'altered']],
  ['harmmodes', ['harm', 'locrian6', 'ionian5', 'dorian4', 'phrygdom', 'lydian2', 'ultraloc']],
  ['bebop', ['bebdom', 'bebmaj', 'bebdor']],
  ['sym', ['dimhw', 'dimwh', 'whole', 'augm']],
  ['pent', ['pmaj', 'pmin', 'blues', 'mblues', 'insen', 'hiraj']],
  ['other', ['hungmin', 'neapmaj', 'neapmin', 'dblharm']],
];

/* ---------- тональность: семь септаккордов и их лады ---------- */

// Мажор, гармонический и мелодический минор: на каждой ступени — аккорд (id из JCHORDS), лад и функция
// (T — тоника, S — субдоминанта, D — доминанта)
export const DIATONIC = {
  major: { ivs: MAJI, ch: ['maj7', 'm7', 'm7', 'maj7', '7', 'm7', 'm7b5'], modes: ['major', 'dorian', 'phrygian', 'lydian', 'mixo', 'minor', 'locrian'], fn: ['T', 'S', 'T', 'S', 'D', 'T', 'D'] },
  harm: { ivs: [0, 2, 3, 5, 7, 8, 11], ch: ['mmaj7', 'm7b5', 'maj7s5', 'm7', '7b9', 'maj7', 'dim7'], modes: ['harm', 'locrian6', 'ionian5', 'dorian4', 'phrygdom', 'lydian2', 'ultraloc'], fn: ['T', 'S', 'T', 'S', 'D', 'S', 'D'] },
  mel: { ivs: [0, 2, 3, 5, 7, 9, 11], ch: ['mmaj7', 'm7', 'maj7s5', '7s11', '7b13', 'm7b5', '7alt'], modes: ['mel', 'dorianb2', 'lydaug', 'lyddom', 'mixob6', 'locrian2', 'altered'], fn: ['T', 'S', 'T', 'S', 'D', 'S', 'D'] },
};
const keyName = (pc, minor) => (minor ? MIN_NAMES : MAJ_NAMES)[pc];

// Обозначение ступени: ♭VImaj7, iiø7, V7alt…
const RN_SUF = { maj7: 'maj7', m7: '7', '7': '7', m7b5: 'ø7', dim7: '°7', mmaj7: '(maj7)', maj7s5: 'maj7♯5', '7b9': '7♭9', '7s11': '7♯11', '7b13': '7♭13', '7alt': '7alt', m6: '6', '6': '6', '69': '6/9', m9: '9', '9': '9', '13': '13', '7sus4': '7sus4', maj9: 'maj9', '7s9': '7♯9' };
export function roman(o, l, id) {
  const fam = (jchordById(id) || [])[3], low = fam === 'min' || fam === 'hd' || fam === 'dim';
  const d = ((o - MAJI[l] + 18) % 12) - 6, acc = d < 0 ? '♭'.repeat(-d) : '♯'.repeat(d);
  return acc + (low ? ROM[l].toLowerCase() : ROM[l]) + (RN_SUF[id] ?? jchordById(id)[1]);
}

// Аккорд оборота в тональности: { o, l, q } — полутоны от тоники, номер буквы, id аккорда
export function inKey(pc, minor, x) {
  const root = nameAt(keyName(pc, minor), x.o, x.l), c = jchord(root, x.q);
  return { ...c, rn: roman(x.o, x.l, x.q), o: x.o, l: x.l };
}

export function diatonic(pc, kind) {
  const D = DIATONIC[kind], minor = kind !== 'major';
  return D.ivs.map((o, l) => ({ ...inKey(pc, minor, { o, l, q: D.ch[l] }), mode: D.modes[l], fn: D.fn[l] }));
}

/* ---------- обороты ---------- */

const C = (o, l, q) => ({ o, l, q });
// II–V–I: мажор и минор
export const IIVI = { major: [C(2, 1, 'm7'), C(7, 4, '7'), C(0, 0, 'maj7')], minor: [C(2, 1, 'm7b5'), C(7, 4, '7alt'), C(0, 0, 'm6')] };
export const iivi = (pc, minor) => IIVI[minor ? 'minor' : 'major'].map((x) => inKey(pc, minor, x));

// Порядок тональностей для занятий: по кварте (как идут II–V–I в стандартах), по полутону вниз, по целому тону вниз
export const ORDERS = { fourths: [0, 5, 10, 3, 8, 1, 6, 11, 4, 9, 2, 7], chrom: [0, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1], whole: [0, 10, 8, 6, 4, 2, 11, 9, 7, 5, 3, 1] };

/* ---------- голоса для фортепиано ---------- */

// Ступени каждого голоса — для ii, V, I (мажор) и iiø, V7alt, i (минор). Корень в басу — отдельной нотой
export const VOICINGS = {
  shell: { bass: true, major: [['1', '♭3', '♭7'], ['1', '♭7', '3'], ['1', '3', '7']], minor: [['1', '♭3', '♭7'], ['1', '♭7', '3'], ['1', '♭3', '6']] },
  guide: { bass: false, major: [['♭3', '♭7'], ['♭7', '3'], ['3', '7']], minor: [['♭3', '♭7'], ['♭7', '3'], ['♭3', '6']] },
  rootA: { bass: false, major: [['♭3', '5', '♭7', '9'], ['♭7', '9', '3', '13'], ['3', '5', '7', '9']], minor: [['♭3', '♭5', '♭7', '1'], ['♭7', '♭9', '3', '♭13'], ['♭3', '5', '6', '9']] },
  rootB: { bass: false, major: [['♭7', '9', '♭3', '5'], ['3', '13', '♭7', '9'], ['7', '9', '3', '5']], minor: [['♭7', '1', '♭3', '♭5'], ['3', '♭13', '♭7', '♯9'], ['6', '9', '♭3', '5']] },
  twohand: { bass: true, major: [['1', '♭7', '♭3', '5', '9'], ['1', '3', '♭7', '9', '13'], ['1', '7', '3', '5', '9']], minor: [['1', '♭7', '♭3', '♭5', '11'], ['1', '3', '♭7', '♯9', '♭13'], ['1', '6', '♭3', '5', '9']] },
};
export const VOICING_IDS = Object.keys(VOICINGS);

// Расставить ступени над корнем: каждая следующая выше предыдущей; нижняя — от F3 (53) до E4 (64)
function stack(rootPc, ds, lo = 53) {
  let prev = -1;
  return ds.map((s, i) => {
    let m = rootPc + deg(s).iv % 12;
    if (i === 0) { while (m < lo) m += 12; while (m >= lo + 12) m -= 12; } else { while (m <= prev) m += 12; }
    prev = m;
    return m;
  });
}
// Голоса оборота II–V–I в тональности: [{ chord, midis, degs }]. С басом — корень от E2, верх — над ним
export function voiceIIVI(pc, minor, id) {
  const V = VOICINGS[id], prog = iivi(pc, minor);
  return prog.map((c, i) => {
    const ds = V[minor ? 'minor' : 'major'][i], up = V.bass ? ds.slice(1) : ds;
    const top = stack(c.pc, up, V.bass ? 52 : 53);
    return { chord: c, degs: ds.map(shown), midis: V.bass ? [bassOf(c.pc), ...top] : top };
  });
}

// Квартовые голоса («So What»): три кварты и большая терция от тона; квартовые трезвучия по ладу
export function soWhat(rootPc) { return [0, 5, 10, 15, 19].map((x) => 50 + ((rootPc - 2 + 12) % 12) + x); }
export function quartal(rootPc, modeIvs) {
  // от каждой ступени лада — три ноты через ступень-кварту (ступени лада, а не ровно 5 полутонов)
  return modeIvs.map((_, i) => [0, 3, 6].map((k) => { const j = i + k; return 60 + rootPc + modeIvs[j % modeIvs.length] + 12 * Math.floor(j / modeIvs.length); }));
}

// Верхние трезвучия над доминантой (тритон 3–♭7 в левой руке): [интервал трезвучия от корня, буква, итоговое обозначение]
export const UST = [
  [2, 1, '13♯11', ['9', '♯11', '13']],
  [3, 2, '7♯9', ['♯9', '5', '♭7']],
  [6, 4, '7♭9♯11', ['♯11', '♭7', '♭9']],
  [8, 5, '7♯9♭13', ['♭13', '1', '♯9']],
  [9, 5, '13♭9', ['13', '♭9', '3']],
  [10, 6, '9sus4', ['♭7', '9', '11']],
];
export function ust(root) {
  const pc = pcOf(root);
  return UST.map(([iv, l, sym, tens]) => {
    const tr = nameAt(root, iv, l), tpc = pcOf(tr), lh = [bassOf(pc) + 12 + 4, bassOf(pc) + 12 + 10];
    while (lh[0] < 52) { lh[0] += 12; lh[1] += 12; }
    let r = tpc; while (r <= lh[1]) r += 12;
    return { triad: tr, sym: root + sym, tens, midis: [bassOf(pc), ...lh, r, r + 4, r + 7] };
  });
}

/* ---------- функции: вторичные доминанты ---------- */

// Цели в мажоре: ii, iii, IV, V, vi. Для каждой — V7/x, ii–V/x и тритоновая замена subV/x
export function secondary(pc) {
  const K = keyName(pc, false);
  return [[2, 1, false], [4, 2, false], [5, 3, true], [7, 4, true], [9, 5, false]].map(([o, l, maj]) => {
    const tgt = nameAt(K, o, l), tq = maj ? (o === 7 ? '7' : 'maj7') : 'm7';
    const v = nameAt(K, (o + 7) % 12, (l + 4) % 7), ii = nameAt(K, (o + 2) % 12, (l + 1) % 7), sub = nameAt(K, (o + 1) % 12, (l + 1) % 7);
    return { target: jchord(tgt, tq), rn: roman(o, l, tq), v: jchord(v, maj ? '7' : '7b9'), ii: jchord(ii, maj ? 'm7' : 'm7b5'), sub: jchord(sub, '7') };
  });
}

/* ---------- заимствование из одноимённого минора и других ладов ---------- */

export const BORROW = [
  [C(2, 1, 'm7b5'), 'minor'], [C(3, 2, 'maj7'), 'minor'], [C(5, 3, 'm7'), 'minor'], [C(5, 3, 'm6'), 'mel'],
  [C(7, 4, 'm7'), 'minor'], [C(8, 5, 'maj7'), 'minor'], [C(10, 6, '7'), 'minor'], [C(1, 1, 'maj7'), 'phrygian'], [C(6, 3, 'm7b5'), 'lydian'],
];
export const borrowed = (pc) => BORROW.map(([x, src]) => ({ ...inKey(pc, false, x), src }));

// Общие аккорды двух мажорных тональностей (мост для модуляции): [{ a: аккорд в первой, b: он же во второй }]
export function pivots(pcA, pcB) {
  const A = diatonic(pcA, 'major'), B = diatonic(pcB, 'major');
  return A.flatMap((a) => B.filter((b) => b.pc === a.pc && b.id === a.id).map((b) => ({ a, b })));
}
// Соседи для модуляции: квинта вверх и вниз, тон вверх и вниз, малая терция вверх, полутон вверх
export const NEIGHBORS = [7, 5, 2, 10, 3, 1];

/* ---------- замены (реармонизация): было → стало ---------- */

export const SUBS = [
  ['tritone', [C(2, 1, 'm7'), C(7, 4, '7'), C(0, 0, 'maj7')], [C(2, 1, 'm7'), C(1, 1, '7'), C(0, 0, 'maj7')]],
  ['relii', [C(7, 4, '7'), C(0, 0, 'maj7')], [C(2, 1, 'm7'), C(7, 4, '7'), C(0, 0, 'maj7')]],
  ['turn', [C(0, 0, 'maj7'), C(9, 5, 'm7'), C(2, 1, 'm7'), C(7, 4, '7')], [C(0, 0, 'maj7'), C(9, 5, '7b9'), C(2, 1, '7'), C(7, 4, '7')]],
  ['turntt', [C(0, 0, 'maj7'), C(9, 5, '7'), C(2, 1, '7'), C(7, 4, '7')], [C(0, 0, 'maj7'), C(3, 2, '7'), C(8, 5, '7'), C(1, 1, '7')]],
  ['diat', [C(0, 0, 'maj7'), C(0, 0, 'maj7')], [C(0, 0, 'maj7'), C(4, 2, 'm7')]],
  ['backdoor', [C(2, 1, 'm7'), C(7, 4, '7'), C(0, 0, 'maj7')], [C(5, 3, 'm7'), C(10, 6, '7'), C(0, 0, 'maj7')]],
  ['passdim', [C(0, 0, 'maj7'), C(2, 1, 'm7')], [C(0, 0, 'maj7'), C(1, 0, 'dim7'), C(2, 1, 'm7')]],
  ['passdim4', [C(5, 3, 'maj7'), C(0, 0, 'maj7')], [C(5, 3, 'maj7'), C(6, 3, 'dim7'), C(0, 0, 'maj7')]],
  ['decept', [C(7, 4, '7'), C(0, 0, 'maj7')], [C(7, 4, '7'), C(9, 5, 'm7')]],
  ['decept6', [C(7, 4, '7'), C(0, 0, 'maj7')], [C(7, 4, '7'), C(8, 5, 'maj7')]],
  ['chromii', [C(2, 1, 'm7'), C(7, 4, '7'), C(0, 0, 'maj7')], [C(3, 2, 'm7'), C(8, 5, '7'), C(2, 1, 'm7'), C(7, 4, '7'), C(0, 0, 'maj7')]],
  ['sus', [C(7, 4, '7'), C(0, 0, 'maj7')], [C(7, 4, '7sus4'), C(7, 4, '7b9'), C(0, 0, 'maj7')]],
  ['chain', [C(0, 0, 'maj7'), C(2, 1, 'm7'), C(7, 4, '7'), C(0, 0, 'maj7')], [C(4, 2, '7'), C(9, 5, '7'), C(2, 1, '7'), C(7, 4, '7'), C(0, 0, 'maj7')]],
  ['coltrane', [C(2, 1, 'm7'), C(7, 4, '7'), C(0, 0, 'maj7')], [C(2, 1, 'm7'), C(3, 2, '7'), C(8, 5, 'maj7'), C(11, 6, '7'), C(4, 2, 'maj7'), C(7, 4, '7'), C(0, 0, 'maj7')]],
];
export const subsIn = (pc) => SUBS.map(([id, a, b]) => ({ id, from: a.map((x) => inKey(pc, false, x)), to: b.map((x) => inKey(pc, false, x)) }));

/* ---------- формы ---------- */

// Такты: каждый — один или два аккорда. minor — тональность минорная (тоника im7)
const B = (...xs) => xs;
export const FORMS = {
  blues: { minor: false, bars: [B(C(0, 0, '7')), B(C(0, 0, '7')), B(C(0, 0, '7')), B(C(0, 0, '7')), B(C(5, 3, '7')), B(C(5, 3, '7')), B(C(0, 0, '7')), B(C(0, 0, '7')), B(C(7, 4, '7')), B(C(5, 3, '7')), B(C(0, 0, '7')), B(C(7, 4, '7'))] },
  jblues: { minor: false, bars: [B(C(0, 0, '7')), B(C(5, 3, '7')), B(C(0, 0, '7')), B(C(7, 4, 'm7'), C(0, 0, '7')), B(C(5, 3, '7')), B(C(6, 3, 'dim7')), B(C(0, 0, '7')), B(C(9, 5, '7b9')), B(C(2, 1, 'm7')), B(C(7, 4, '7')), B(C(0, 0, '7'), C(9, 5, '7b9')), B(C(2, 1, 'm7'), C(7, 4, '7'))] },
  bird: { minor: false, bars: [B(C(0, 0, 'maj7')), B(C(11, 6, 'm7b5'), C(4, 2, '7b9')), B(C(9, 5, 'm7'), C(2, 1, '7')), B(C(7, 4, 'm7'), C(0, 0, '7')), B(C(5, 3, '7')), B(C(5, 3, 'm7'), C(10, 6, '7')), B(C(4, 2, 'm7'), C(9, 5, '7')), B(C(3, 2, 'm7'), C(8, 5, '7')), B(C(2, 1, 'm7')), B(C(7, 4, '7')), B(C(0, 0, 'maj7'), C(9, 5, '7b9')), B(C(2, 1, 'm7'), C(7, 4, '7'))] },
  mblues: { minor: true, bars: [B(C(0, 0, 'm7')), B(C(0, 0, 'm7')), B(C(0, 0, 'm7')), B(C(0, 0, 'm7')), B(C(5, 3, 'm7')), B(C(5, 3, 'm7')), B(C(0, 0, 'm7')), B(C(0, 0, 'm7')), B(C(8, 5, '7')), B(C(7, 4, '7alt')), B(C(0, 0, 'm7')), B(C(8, 5, '7'), C(7, 4, '7alt'))] },
  rhythmA: { minor: false, bars: [B(C(0, 0, 'maj7'), C(9, 5, 'm7')), B(C(2, 1, 'm7'), C(7, 4, '7')), B(C(4, 2, 'm7'), C(9, 5, '7')), B(C(2, 1, 'm7'), C(7, 4, '7')), B(C(0, 0, 'maj7'), C(0, 0, '7')), B(C(5, 3, 'maj7'), C(6, 3, 'dim7')), B(C(2, 1, 'm7'), C(7, 4, '7')), B(C(0, 0, 'maj7'))] },
  rhythmB: { minor: false, bars: [B(C(4, 2, '7')), B(C(4, 2, '7')), B(C(9, 5, '7')), B(C(9, 5, '7')), B(C(2, 1, '7')), B(C(2, 1, '7')), B(C(7, 4, '7')), B(C(7, 4, '7'))] },
  rag: { minor: false, bars: [B(C(0, 0, '6')), B(C(9, 5, '7')), B(C(2, 1, '7')), B(C(7, 4, '7')), B(C(0, 0, '6')), B(C(9, 5, '7')), B(C(2, 1, '7')), B(C(7, 4, '7'), C(0, 0, '6'))] },
};
export const FORM_IDS = Object.keys(FORMS);
export const formIn = (pc, id) => { const F = FORMS[id]; return F.bars.map((bar) => bar.map((x) => inKey(pc, F.minor, x))); };
// Строение пьес: части и число тактов
export const SHAPES = [
  ['aaba', [['A', 8], ['A', 8], ['B', 8], ['A', 8]]],
  ['abac', [['A', 8], ['B', 8], ['A', 8], ['C', 8]]],
  ['blues', [['12', 12]]],
  ['abcd', [['A', 8], ['B', 8], ['C', 8], ['D', 8]]],
  ['strain', [['In', 4], ['A', 16], ['A', 16], ['B', 16], ['B', 16], ['A', 16], ['T', 16], ['C', 16], ['D', 16], ['C', 16]]],
];

/* ---------- ритм аккомпанемента ---------- */

// Сетка восьмых (свинг): n — долей сетки, hits — где звучит аккорд, beats — восьмых в доле (2)
export const RHYTHMS = [
  ['charleston', 8, [0, 3]], ['revch', 8, [1, 4]], ['antic', 8, [0, 7]], ['fourth', 8, [0, 2, 4, 6]],
  ['offb', 8, [3, 7]], ['waltz', 6, [0, 3, 5]], ['bossa', 16, [0, 3, 6, 10, 13]], ['montuno', 16, [1, 3, 6, 9, 11, 14]],
];

/* ---------- импровизация ---------- */

// Подходы к опорной ноте: смещения в полутонах (above — сверху ступенью лада, она даётся отдельно)
export const APPROACH = [
  ['chromBelow', [-1]], ['chromAbove', [1]], ['scaleAbove', ['s+1']], ['enclose', ['s+1', -1]], ['enclose2', [1, -1]],
  ['dblChrom', [-2, -1]], ['dblChromA', [2, 1]], ['bebEncl', ['s+1', -2, -1]],
];
// Цифровые фигуры по ступеням аккорда (1 — основной тон, 9 — нона)
export const DIGITS = [['1235', ['1', '2', '3', '5']], ['1357', ['1', '3', '5', '7']], ['3579', ['3', '5', '7', '9']], ['5321', ['5', '3', '2', '1']], ['1231', ['1', '2', '3', '1']], ['8753', ['8', '7', '5', '3']]];

// Какие пентатоники играть на аккорде (интервал тоники пентатоники от корня аккорда, мажорная/минорная)
export const PENTA = {
  maj7: [[0, 'pmaj'], [7, 'pmaj'], [2, 'pmaj']],
  m7: [[0, 'pmin'], [7, 'pmin'], [2, 'pmin']],
  '7': [[0, 'pmaj'], [7, 'pmin']],
  '7alt': [[6, 'pmaj'], [3, 'pmin']],
  m7b5: [[3, 'pmin']],
};

// Ступень аккорда (с учётом семьи) → полутоны: «3» у минорного — малая терция, «7» у доминанты — малая септима
export function chordDegree(fam, s) {
  const map = { min: { 3: '♭3', 7: '♭7' }, hd: { 3: '♭3', 5: '♭5', 7: '♭7' }, dom: { 7: '♭7' }, dim: { 3: '♭3', 5: '♭5', 7: '♭♭7' }, maj: {} };
  return deg((map[fam] || {})[s] || s).iv;
}
