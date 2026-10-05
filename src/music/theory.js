// Теория: тональности (квинтовый круг), гаммы, аккорды, интервалы — только данные, без текстов интерфейса.
// Перенесено из legacy/practice.html (keyInfo, scaleInfo, chordInfo, SCALES, CHORDS, INTERVALS).
import { MAJI, NAT_MIN, MAJ_NAMES, MIN_NAMES, spell } from './notes.js';

// Квинтовый круг: тоники мажоров по часовой
export const CIRC = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];
export const ROM = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
// Функция ступени: T — тоника, S — субдоминанта, D — доминанта
export const FN = ['T', 'S', 'T', 'S', 'D', 'T', 'D'];

// Нижняя нота для звучания: тоники до E — от C4, остальные — от C3
const baseOf = (pc) => (pc < 5 ? 60 : 48) + pc;

// Тональность: pc — тоника, minor — натуральный минор, sev — септаккорды на ступенях
export function keyInfo(pc, minor, sev) {
  const root = (minor ? MIN_NAMES : MAJ_NAMES)[pc], ivs = minor ? NAT_MIN : MAJI, notes = spell(root, ivs, [0, 1, 2, 3, 4, 5, 6]), base = baseOf(pc);
  const tone = (i, k) => ivs[(i + k) % 7] + 12 * Math.floor((i + k) / 7);
  const chords = notes.map((n, i) => {
    const th = tone(i, 2) - ivs[i], fi = tone(i, 4) - ivs[i], se = tone(i, 6) - ivs[i];
    const q = th === 4 && fi === 7 ? 'maj' : th === 3 && fi === 7 ? 'min' : th === 3 && fi === 6 ? 'dim' : 'aug';
    let suf = { maj: '', min: 'm', dim: '°', aug: '+' }[q], rn = q === 'maj' || q === 'aug' ? ROM[i] : ROM[i].toLowerCase();
    if (q === 'dim') rn += '°';
    if (sev) {
      if (q === 'maj') { suf = se === 11 ? 'maj7' : '7'; rn += se === 11 ? 'maj7' : '7'; }
      else if (q === 'min') { suf = 'm7'; rn += '7'; }
      else if (q === 'dim') { suf = 'm7♭5'; rn = rn.replace('°', 'ø7'); }
    }
    return { rn, name: n + suf, f: FN[i], midis: [0, 2, 4].concat(sev ? [6] : []).map((k) => base - 12 + 12 + tone(i, k) - (i >= 5 ? 12 : 0)) };
  });
  const sharps = notes.filter((n) => n.includes('♯')).length, flats = notes.filter((n) => n.includes('♭')).length;
  const signs = sharps ? 'FCGDAEB'.split('').filter((L) => notes.some((n) => n === L + '♯')).map((L) => L + '♯')
    : flats ? 'BEADGCF'.split('').filter((L) => notes.some((n) => n === L + '♭')).map((L) => L + '♭') : [];
  // Параллельная тональность: тоника и лад
  const relRoot = minor ? (pc === 3 ? 'G♭' : MAJ_NAMES[(pc + 3) % 12]) : pc === 6 ? 'D♯' : MIN_NAMES[(pc + 9) % 12];
  const asc = ivs.map((v) => base + v).concat(base + 12);
  return { root, minor: !!minor, notes, chords, sharps, flats, signs, relRoot, relMinor: !minor,
    scaleMidis: asc.concat(asc.slice(0, -1).reverse()), pcs: ivs.map((v) => (pc + v) % 12), rootPc: pc };
}

// Соседняя тональность по кругу: dir = +1 по часовой, -1 против
export function circleStep(pc, minor, dir) {
  const mp = minor ? (pc + 3) % 12 : pc, np = (mp + (dir > 0 ? 7 : 5)) % 12;
  return minor ? (np + 9) % 12 : np;
}

/* ---------- гаммы ---------- */

// id → [интервалы, номера букв]. Названия — i18n scale.<id>
export const SCALES = {
  major: [MAJI], minor: [NAT_MIN], harm: [[0, 2, 3, 5, 7, 8, 11]], mel: [[0, 2, 3, 5, 7, 9, 11]],
  dorian: [[0, 2, 3, 5, 7, 9, 10]], phrygian: [[0, 1, 3, 5, 7, 8, 10]], lydian: [[0, 2, 4, 6, 7, 9, 11]], mixo: [[0, 2, 4, 5, 7, 9, 10]],
  locrian: [[0, 1, 3, 5, 6, 8, 10]],
  pmaj: [[0, 2, 4, 7, 9], [0, 1, 2, 4, 5]], pmin: [[0, 3, 5, 7, 10], [0, 2, 3, 4, 6]], blues: [[0, 3, 5, 6, 7, 10], [0, 2, 3, 4, 4, 6]],
};
export const SCALE_TYPES = Object.keys(SCALES);
export const SCALE_GROUPS = [['main', ['major', 'minor', 'harm', 'mel']], ['modes', ['dorian', 'phrygian', 'lydian', 'mixo', 'locrian']], ['penta', ['pmaj', 'pmin', 'blues']]];

// steps — шаги между нотами в полутонах (1 — полутон, 2 — тон, 3 — тон+полутон)
export function scaleInfo(pc, type) {
  const [ivs, li] = SCALES[type] || SCALES.major, lix = li || [0, 1, 2, 3, 4, 5, 6];
  const minorish = ivs.includes(3) && !ivs.includes(4), root = (minorish ? MIN_NAMES : MAJ_NAMES)[pc], notes = spell(root, ivs, lix);
  const degs = ivs.map((iv, k) => { const d = iv - MAJI[lix[k]]; return (d < 0 ? '♭'.repeat(-d) : d > 0 ? '♯'.repeat(d) : '') + (lix[k] + 1); });
  const steps = ivs.map((iv, k) => (k < ivs.length - 1 ? ivs[k + 1] : 12) - iv);
  const base = baseOf(pc), asc = ivs.map((v) => base + v).concat(base + 12);
  return { type, notes, degs, steps, pcs: ivs.map((v) => (pc + v) % 12), rootPc: pc, root, seq: asc.concat(asc.slice(0, -1).reverse()) };
}

/* ---------- аккорды ---------- */

// [id, обозначение, интервалы, номера букв]. Описание — i18n chord.<id>
export const CHORDS = [
  ['maj', '', [0, 4, 7], [0, 2, 4]], ['min', 'm', [0, 3, 7], [0, 2, 4]], ['dim', 'dim', [0, 3, 6], [0, 2, 4]], ['aug', 'aug', [0, 4, 8], [0, 2, 4]],
  ['sus2', 'sus2', [0, 2, 7], [0, 1, 4]], ['sus4', 'sus4', [0, 5, 7], [0, 3, 4]], ['6', '6', [0, 4, 7, 9], [0, 2, 4, 5]], ['m6', 'm6', [0, 3, 7, 9], [0, 2, 4, 5]],
  ['7', '7', [0, 4, 7, 10], [0, 2, 4, 6]], ['maj7', 'maj7', [0, 4, 7, 11], [0, 2, 4, 6]], ['m7', 'm7', [0, 3, 7, 10], [0, 2, 4, 6]], ['m7b5', 'm7♭5', [0, 3, 6, 10], [0, 2, 4, 6]],
  ['dim7', 'dim7', [0, 3, 6, 9], [0, 2, 4, 6]], ['9', '9', [0, 4, 7, 10, 14], [0, 2, 4, 6, 1]], ['add9', 'add9', [0, 4, 7, 14], [0, 2, 4, 1]],
];
export const chordLabel = (id) => (CHORDS.find((c) => c[0] === id) || CHORDS[0])[1] || 'maj';

// form — ступени аккорда (1, ♭3, 5, ♭7, 9…)
export function chordInfo(pc, type) {
  const ct = CHORDS.find((c) => c[0] === (type || 'maj')) || CHORDS[0], [id, suf, ivs, li] = ct;
  const minorish = ivs.includes(3) && !ivs.includes(4), root = (minorish ? MIN_NAMES : MAJ_NAMES)[pc], notes = spell(root, ivs, li);
  const form = ivs.map((iv, k) => {
    const L = li[k], hi = iv >= 12, d = iv - (MAJI[L] + (hi ? 12 : 0));
    return (d < 0 ? '♭'.repeat(-d) : d > 0 ? '♯'.repeat(d) : '') + (L + 1 + (hi ? 7 : 0));
  });
  const base = baseOf(pc);
  return { name: root + suf, notes, form, midis: ivs.map((v) => base + v), pcs: ivs.map((v) => (pc + v) % 12), root, pc, id };
}

/* ---------- интервалы ---------- */

// [полутонов, номер буквы]. Название и сокращение — i18n iv.<i>, ivs.<i>
export const INTERVALS = [[0, 0], [1, 1], [2, 1], [3, 2], [4, 2], [5, 3], [6, 3], [7, 4], [8, 5], [9, 5], [10, 6], [11, 6], [12, 7]];

// Верхняя нота интервала от тоники мажора pc
export const intervalNote = (pc, i) => spell(MAJ_NAMES[pc], [INTERVALS[i][0]], [INTERVALS[i][1]])[0];
export const intervalBase = (pc) => baseOf(pc);
