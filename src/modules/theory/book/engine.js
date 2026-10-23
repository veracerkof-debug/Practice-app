// Учебник теории (src/modules/theory/book): движок — правописание нот (буква + знак), интервалы по ступеням,
// аккорды и их разбор по символу, гаммы и лады с характерной ступенью, гармонизация терциями, римские цифры и функции,
// квинтовый круг, II–V–I. Названия — в языковых файлах (lang/*.js) по ключам; здесь только данные. Без DOM и звука.
const LET = 'CDEFGAB', NAT = [0, 2, 4, 5, 7, 9, 11];
const ACC = { '-2': '𝄫', '-1': '♭', '0': '', '1': '♯', '2': '𝄪' };
const N = (l, a = 0) => ({ l, a });
const pcOf = (n) => (((NAT[n.l] + n.a) % 12) + 12) % 12;
const nm = (n) => LET[n.l] + ACC[n.a];
function parseNote(s) {
  const m = /^([A-Ga-g])(𝄪|𝄫|##|bb|x|#|♯|b|♭)?/.exec(s.trim());
  if (!m) return null;
  const a = { '#': 1, '♯': 1, b: -1, '♭': -1, '##': 2, x: 2, '𝄪': 2, bb: -2, '𝄫': -2 }[m[2] || ''] || 0;
  return { n: N(LET.indexOf(m[1].toUpperCase()), a), rest: s.trim().slice(m[0].length) };
}
// Ступени: [шаг по буквам, полутоны]
const IV = {
  '1': [0, 0], 'b2': [1, 1], '2': [1, 2], '#2': [1, 3], 'bb3': [2, 2], 'b3': [2, 3], '3': [2, 4], 'b4': [3, 4], '4': [3, 5], '#4': [3, 6],
  'bb5': [4, 5], 'b5': [4, 6], '5': [4, 7], '#5': [4, 8], 'b6': [5, 8], '6': [5, 9], '#6': [5, 10], 'bb7': [6, 9], 'b7': [6, 10], '7': [6, 11],
  'b9': [1, 1], '9': [1, 2], '#9': [1, 3], '11': [3, 5], '#11': [3, 6], 'b13': [5, 8], '13': [5, 9], '8': [0, 0],
};
const EXT = new Set(['b9', '9', '#9', '11', '#11', 'b13', '13']);
const semis = (deg) => IV[deg][1] + (EXT.has(deg) ? 12 : deg === '8' ? 12 : 0);
function up(n, deg) {
  const [d, s] = IV[deg];
  const l2 = (n.l + d) % 7, t = (pcOf(n) + s) % 12;
  let a = t - NAT[l2];
  a = ((a + 6) % 12 + 12) % 12 - 6;
  return N(l2, a);
}
const spell = (root, degs) => degs.map((d) => up(root, d));
const midiOf = (root, deg, base = 60) => base + ((pcOf(root) - base % 12 + 12) % 12) + semis(deg);

// Удобные тоники (как в нотах): мажор и минор
const MAJ_ROOTS = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const MIN_ROOTS = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'B♭', 'B'];
const rootN = (s) => parseNote(s).n;
const ALL12 = ['C', 'C♯', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];

// ===== Интервалы =====
const INTERVALS = [
  { k: '1', s: 0, cons: 'perf', inv: '8' },
  { k: 'b2', s: 1, cons: 'diss', inv: '7' },
  { k: '2', s: 2, cons: 'diss', inv: 'b7' },
  { k: '#2', s: 3, cons: 'diss', inv: 'bb7' },
  { k: 'b3', s: 3, cons: 'imperf', inv: '6' },
  { k: '3', s: 4, cons: 'imperf', inv: 'b6' },
  { k: '4', s: 5, cons: 'ctx', inv: '5' },
  { k: '#4', s: 6, cons: 'diss', inv: 'b5' },
  { k: 'b5', s: 6, cons: 'diss', inv: '#4' },
  { k: '5', s: 7, cons: 'perf', inv: '4' },
  { k: '#5', s: 8, cons: 'diss', inv: 'b4' },
  { k: 'b6', s: 8, cons: 'imperf', inv: '3' },
  { k: '6', s: 9, cons: 'imperf', inv: 'b3' },
  { k: 'bb7', s: 9, cons: 'diss', inv: '#2' },
  { k: 'b7', s: 10, cons: 'diss', inv: '2' },
  { k: '7', s: 11, cons: 'diss', inv: 'b2' },
  { k: '8', s: 12, cons: 'perf', inv: '1' },
  { k: 'b9', s: 13, cons: 'diss' },
  { k: '9', s: 14, cons: 'diss' },
  { k: '#9', s: 15, cons: 'diss' },
  { k: '11', s: 17, cons: 'ctx' },
  { k: '#11', s: 18, cons: 'diss' },
  { k: 'b13', s: 20, cons: 'diss' },
  { k: '13', s: 21, cons: 'imperf' },
];
const ivByKey = (k) => INTERVALS.find((x) => x.k === k);
const degLabel = (d) => d.replace('bb', '𝄫').replace('b', '♭').replace('#', '♯');

// ===== Аккорды =====
// fam: maj | dom | min | hdim | dim | sus | aug
const CHORDS = [
  { id: '', f: ['1', '3', '5'], fam: 'maj', alt: 'C, CM, Cmaj' },
  { id: 'm', f: ['1', 'b3', '5'], fam: 'min', alt: 'Cm, C−, Cmin' },
  { id: '+', f: ['1', '3', '#5'], fam: 'aug', alt: 'C+, Caug' },
  { id: '°', f: ['1', 'b3', 'b5'], fam: 'dim', alt: 'C°, Cdim' },
  { id: 'sus4', f: ['1', '4', '5'], fam: 'sus', alt: 'Csus, Csus4, C4' },
  { id: '6', f: ['1', '3', '5', '6'], fam: 'maj', alt: 'C6' },
  { id: '6/9', f: ['1', '3', '5', '6', '9'], fam: 'maj', alt: 'C6/9, C69' },
  { id: 'm6', f: ['1', 'b3', '5', '6'], fam: 'min', alt: 'Cm6, C−6' },
  { id: 'maj7', f: ['1', '3', '5', '7'], fam: 'maj', alt: 'Cmaj7, CM7, CΔ' },
  { id: 'm(maj7)', f: ['1', 'b3', '5', '7'], fam: 'min', alt: 'Cm(maj7), CmM7, C−Δ' },
  { id: 'm7', f: ['1', 'b3', '5', 'b7'], fam: 'min', alt: 'Cm7, C−7, Cmin7' },
  { id: 'm7♭5', f: ['1', 'b3', 'b5', 'b7'], fam: 'hdim', alt: 'Cm7♭5, Cø' },
  { id: '°7', f: ['1', 'b3', 'b5', 'bb7'], fam: 'dim', alt: 'C°7, Cdim7' },
  { id: '7', f: ['1', '3', '5', 'b7'], fam: 'dom', alt: 'C7' },
  { id: '7sus4', f: ['1', '4', '5', 'b7'], fam: 'sus', alt: 'C7sus4, C7sus' },
  { id: 'maj7♯5', f: ['1', '3', '#5', '7'], fam: 'maj', alt: 'Cmaj7♯5, CΔ+' },
  { id: '7♯5', f: ['1', '3', '#5', 'b7'], fam: 'dom', alt: 'C7♯5, C+7' },
  { id: 'maj9', f: ['1', '3', '5', '7', '9'], fam: 'maj', alt: 'Cmaj9' },
  { id: 'maj7♯11', f: ['1', '3', '5', '7', '9', '#11'], fam: 'maj', alt: 'Cmaj9♯11' },
  { id: 'maj13', f: ['1', '3', '5', '7', '9', '13'], fam: 'maj', alt: 'Cmaj13' },
  { id: 'm9', f: ['1', 'b3', '5', 'b7', '9'], fam: 'min', alt: 'Cm9' },
  { id: 'm11', f: ['1', 'b3', '5', 'b7', '9', '11'], fam: 'min', alt: 'Cm11' },
  { id: 'm6/9', f: ['1', 'b3', '5', '6', '9'], fam: 'min', alt: 'Cm6/9' },
  { id: 'm9♭5', f: ['1', 'b3', 'b5', 'b7', '9'], fam: 'hdim', alt: 'Cø9' },
  { id: '9', f: ['1', '3', '5', 'b7', '9'], fam: 'dom', alt: 'C9' },
  { id: '13', f: ['1', '3', '5', 'b7', '9', '13'], fam: 'dom', alt: 'C13' },
  { id: '7♭9', f: ['1', '3', '5', 'b7', 'b9'], fam: 'dom', alt: 'C7♭9' },
  { id: '7♯9', f: ['1', '3', '5', 'b7', '#9'], fam: 'dom', alt: 'C7♯9' },
  { id: '13♭9', f: ['1', '3', '5', 'b7', 'b9', '13'], fam: 'dom', alt: 'C13♭9' },
  { id: '7♯11', f: ['1', '3', '5', 'b7', '9', '#11'], fam: 'dom', alt: 'C9♯11' },
  { id: '7♭13', f: ['1', '3', '5', 'b7', '9', 'b13'], fam: 'dom', alt: 'C9♭13' },
  { id: '7alt', f: ['1', '3', 'b7', '#9', 'b13'], fam: 'dom', alt: 'C7alt (♭9/♯9, ♭5/♯5)' },
  { id: '9sus4', f: ['1', '4', '5', 'b7', '9'], fam: 'sus', alt: 'C9sus4' },
  { id: '7sus4♭9', f: ['1', '4', '5', 'b7', 'b9'], fam: 'sus', alt: 'C7sus4♭9, Cphryg' },
];
const chordById = (id) => CHORDS.find((c) => c.id === id);
const chordName = (root, c) => nm(root) + c.id;

// Разбор символа аккорда: Dm7, G7alt, Bbmaj7, F#ø, Eb°7, C/B
function parseChord(s) {
  const p = parseNote(s.replace(/\s+/g, ''));
  if (!p) return null;
  let q = p.rest.replace(/\/.*$/, '');
  const raw = q;
  q = q.replace(/♭/g, 'b').replace(/♯/g, '#').replace(/Δ/g, 'maj').replace(/^M7/, 'maj7').replace(/^-/, 'm').replace(/^min/, 'm').replace(/^ma(?!j)/, 'maj');
  let fam = 'maj', six = false;
  if (/^(m7b5|ø|m7\(b5\)|mi7b5|-7b5)/.test(q)) fam = 'hdim';
  else if (/^(dim7|°7|o7|°|dim|o)/.test(q)) fam = /7/.test(q) || q === '°' || q === 'o' ? 'dim' : 'dim';
  else if (/^m(?!aj)/.test(q)) fam = 'min';
  else if (/^(maj|M)/.test(q)) fam = 'maj';
  else if (/sus/.test(q) && /7|9|13/.test(q)) fam = 'sus';
  else if (/sus/.test(q)) fam = 'sus';
  else if (/^(\+|aug)/.test(q) && !/7/.test(q)) fam = 'aug';
  else if (/^(7|9|11|13|\+7|aug7|alt)/.test(q)) fam = 'dom';
  else if (/^6/.test(q) || q === '') fam = 'maj';
  if (/6/.test(q) && !/13/.test(q)) six = true;
  return { root: p.n, fam, q: raw, sym: nm(p.n) + raw, six, alt: /alt|b9|#9|b13|#5|b5|#11/.test(q) };
}
// Опорные ступени по семейству (для анализа и голосов)
const FAM_DEGS = {
  maj: ['1', '3', '5', '7'], dom: ['1', '3', '5', 'b7'], min: ['1', 'b3', '5', 'b7'], hdim: ['1', 'b3', 'b5', 'b7'],
  dim: ['1', 'b3', 'b5', 'bb7'], sus: ['1', '4', '5', 'b7'], aug: ['1', '3', '#5'],
};

// ===== Гаммы и лады =====
const SCALES = [
  // мажорные лады
  { g: 'maj', id: 'ionian', f: ['1', '2', '3', '4', '5', '6', '7'], ch: '7', chord: 'maj7', bright: 6, avoid: ['4'] },
  { g: 'maj', id: 'dorian', f: ['1', '2', 'b3', '4', '5', '6', 'b7'], ch: '6', chord: 'm7', bright: 4 },
  { g: 'maj', id: 'phrygian', f: ['1', 'b2', 'b3', '4', '5', 'b6', 'b7'], ch: 'b2', chord: 'm7', bright: 2, avoid: ['b2', 'b6'] },
  { g: 'maj', id: 'lydian', f: ['1', '2', '3', '#4', '5', '6', '7'], ch: '#4', chord: 'maj7', bright: 7 },
  { g: 'maj', id: 'mixolydian', f: ['1', '2', '3', '4', '5', '6', 'b7'], ch: 'b7', chord: '7', bright: 5, avoid: ['4'] },
  { g: 'maj', id: 'aeolian', f: ['1', '2', 'b3', '4', '5', 'b6', 'b7'], ch: 'b6', chord: 'm7', bright: 3, avoid: ['b6'] },
  { g: 'maj', id: 'locrian', f: ['1', 'b2', 'b3', '4', 'b5', 'b6', 'b7'], ch: 'b5', chord: 'm7♭5', bright: 1, avoid: ['b2'] },
  // мелодический минор
  { g: 'mel', id: 'melmin', f: ['1', '2', 'b3', '4', '5', '6', '7'], ch: '7', chord: 'm(maj7)' },
  { g: 'mel', id: 'dorb2', f: ['1', 'b2', 'b3', '4', '5', '6', 'b7'], ch: 'b2', chord: '7sus4♭9' },
  { g: 'mel', id: 'lydaug', f: ['1', '2', '3', '#4', '#5', '6', '7'], ch: '#5', chord: 'maj7♯5' },
  { g: 'mel', id: 'lyddom', f: ['1', '2', '3', '#4', '5', '6', 'b7'], ch: '#4', chord: '7♯11' },
  { g: 'mel', id: 'mixob13', f: ['1', '2', '3', '4', '5', 'b6', 'b7'], ch: 'b6', chord: '7♭13' },
  { g: 'mel', id: 'locnat2', f: ['1', '2', 'b3', '4', 'b5', 'b6', 'b7'], ch: '2', chord: 'm9♭5' },
  { g: 'mel', id: 'altered', f: ['1', 'b9', '#9', '3', '#11', 'b13', 'b7'], ch: '3', chord: '7alt' },
  // гармонический минор
  { g: 'harm', id: 'harmmin', f: ['1', '2', 'b3', '4', '5', 'b6', '7'], ch: '7', chord: 'm(maj7)' },
  { g: 'harm', id: 'locnat6', f: ['1', 'b2', 'b3', '4', 'b5', '6', 'b7'], ch: '6', chord: 'm7♭5' },
  { g: 'harm', id: 'ion5', f: ['1', '2', '3', '4', '#5', '6', '7'], ch: '#5', chord: 'maj7♯5' },
  { g: 'harm', id: 'dor4', f: ['1', '2', 'b3', '#4', '5', '6', 'b7'], ch: '#4', chord: 'm7' },
  { g: 'harm', id: 'phrdom', f: ['1', 'b2', '3', '4', '5', 'b6', 'b7'], ch: 'b2', chord: '7♭9' },
  { g: 'harm', id: 'lyd2', f: ['1', '#2', '3', '#4', '5', '6', '7'], ch: '#2', chord: 'maj7♯11' },
  { g: 'harm', id: 'ultraloc', f: ['1', 'b2', 'b3', 'b4', 'b5', 'b6', 'bb7'], ch: 'bb7', chord: '°7' },
  // симметричные
  { g: 'sym', id: 'dimwh', f: ['1', '2', 'b3', '4', 'b5', 'b6', '6', '7'], ch: '7', chord: '°7' },
  { g: 'sym', id: 'dimhw', f: ['1', 'b2', '#2', '3', '#4', '5', '6', 'b7'], ch: 'b2', chord: '13♭9' },
  { g: 'sym', id: 'whole', f: ['1', '2', '3', '#4', '#5', 'b7'], ch: '#5', chord: '7♯5' },
  // пентатоники и блюз
  { g: 'pent', id: 'pentmaj', f: ['1', '2', '3', '5', '6'], ch: '6', chord: '6/9' },
  { g: 'pent', id: 'pentmin', f: ['1', 'b3', '4', '5', 'b7'], ch: 'b3', chord: 'm7' },
  { g: 'pent', id: 'bluesmin', f: ['1', 'b3', '4', '#4', '5', 'b7'], ch: '#4', chord: '7' },
  { g: 'pent', id: 'bluesmaj', f: ['1', '2', '#2', '3', '5', '6'], ch: '#2', chord: '6' },
  { g: 'pent', id: 'kumoi', f: ['1', '2', 'b3', '5', '6'], ch: '6', chord: 'm6' },
  { g: 'pent', id: 'insen', f: ['1', 'b2', '4', '5', 'b7'], ch: 'b2', chord: '7sus4♭9' },
  { g: 'pent', id: 'hirajoshi', f: ['1', '2', 'b3', '5', 'b6'], ch: 'b6', chord: 'm' },
  // бибоп
  { g: 'bebop', id: 'bebopdom', f: ['1', '2', '3', '4', '5', '6', 'b7', '7'], ch: '7', chord: '7' },
  { g: 'bebop', id: 'bebopmaj', f: ['1', '2', '3', '4', '5', '#5', '6', '7'], ch: '#5', chord: '6' },
  { g: 'bebop', id: 'bebopdor', f: ['1', '2', 'b3', '3', '4', '5', '6', 'b7'], ch: '3', chord: 'm7' },
  // экзотические (справочник)
  { g: 'world', id: 'dblharm', f: ['1', 'b2', '3', '4', '5', 'b6', '7'], ch: 'b2' },
  { g: 'world', id: 'hungmin', f: ['1', '2', 'b3', '#4', '5', 'b6', '7'], ch: '#4' },
  { g: 'world', id: 'hungmaj', f: ['1', '#2', '3', '#4', '5', '6', 'b7'], ch: '#2' },
  { g: 'world', id: 'gypsy', f: ['1', '2', 'b3', '#4', '5', 'b6', 'b7'], ch: '#4' },
  { g: 'world', id: 'neapmin', f: ['1', 'b2', 'b3', '4', '5', 'b6', '7'], ch: 'b2' },
  { g: 'world', id: 'neapmaj', f: ['1', 'b2', 'b3', '4', '5', '6', '7'], ch: 'b2' },
  { g: 'world', id: 'enigma', f: ['1', 'b2', '3', '#4', '#5', '#6', '7'], ch: '#6' },
  { g: 'world', id: 'persian', f: ['1', 'b2', '3', '4', 'b5', 'b6', '7'], ch: 'b5' },
  { g: 'world', id: 'oriental', f: ['1', 'b2', '3', '4', 'b5', '6', 'b7'], ch: 'b5' },
  { g: 'world', id: 'arabian', f: ['1', '2', '3', '4', 'b5', 'b6', 'b7'], ch: 'b5' },
  { g: 'world', id: 'lydmin', f: ['1', '2', '3', '#4', '5', 'b6', 'b7'], ch: 'b6' },
  { g: 'world', id: 'leadwt', f: ['1', '2', '3', '#4', '#5', '#6', '7'], ch: '7' },
  { g: 'world', id: 'spanish8', f: ['1', 'b2', '#2', '3', '4', 'b5', 'b6', 'b7'], ch: '#2' },
  { g: 'world', id: 'balinese', f: ['1', 'b2', 'b3', '5', 'b6'], ch: 'b2' },
  { g: 'world', id: 'iwato', f: ['1', 'b2', '4', 'b5', 'b7'], ch: 'b5' },
  { g: 'world', id: 'egyptian', f: ['1', '2', '4', '5', 'b7'], ch: '4' },
  { g: 'world', id: 'chinese', f: ['1', '3', '#4', '5', '7'], ch: '#4' },
  { g: 'world', id: 'mongol', f: ['1', '2', '3', '5', '6'], ch: '6' },
];
const scaleById = (id) => SCALES.find((s) => s.id === id);

// Трезвучие/септаккорд по ступеням гаммы (гармонизация терциями)
const QUAL = {
  '4,7,11': 'maj7', '4,7,10': '7', '3,7,10': 'm7', '3,6,10': 'm7♭5', '3,6,9': '°7', '3,7,11': 'm(maj7)', '4,8,11': 'maj7♯5',
  '4,8,10': '7♯5', '4,6,10': '7♭5', '3,6,11': '°(maj7)', '2,7,10': '7sus2', '5,7,10': '7sus4', '4,6,11': 'maj7♭5', '3,8,10': 'm7♯5',
};
function harmonize(root, scale) {
  const notes = spell(root, scale.f);
  const pcs = notes.map(pcOf), n = notes.length;
  return notes.map((nt, i) => {
    const t = [2, 4, 6].map((k) => (pcs[(i + k) % n] - pcs[i] + 12) % 12);
    const q = QUAL[t.join(',')] || '?';
    return { root: nt, q, sym: nm(nt) + q, notes: [0, 2, 4, 6].map((k) => notes[(i + k) % n]) };
  });
}
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
// Римская цифра относительно мажора на той же тонике
function roman(keyRoot, chRoot, q) {
  const deg = (chRoot.l - keyRoot.l + 7) % 7;
  const majPc = (pcOf(keyRoot) + NAT[deg] - NAT[0] + 12) % 12;
  const off = ((pcOf(chRoot) - (pcOf(keyRoot) + [0, 2, 4, 5, 7, 9, 11][deg])) % 12 + 18) % 12 - 6;
  const pre = off === -1 ? '♭' : off === 1 ? '♯' : off === -2 ? '𝄫' : '';
  const low = /^m|°|ø/.test(q) && !/^maj/.test(q);
  const r = low ? ROMAN[deg].toLowerCase() : ROMAN[deg];
  return pre + r + (q === 'maj7' ? 'maj7' : q === '7' ? '7' : q === 'm7' ? 'm7' : q === 'm7♭5' ? 'm7♭5' : q === '°7' ? '°7' : q);
}
// Функция ступени в ладу: T / S / D
function funcOf(deg, minor) {
  if (minor) return [0, 2].includes(deg) ? 'T' : [1, 3, 5].includes(deg) ? 'S' : 'D';
  return [0, 2, 5].includes(deg) ? 'T' : [1, 3].includes(deg) ? 'S' : 'D';
}

// ===== Квинтовый круг =====
const CIRCLE = ['C', 'G', 'D', 'A', 'E', 'B', 'F♯', 'D♭', 'A♭', 'E♭', 'B♭', 'F'];
const REL_MIN = ['A', 'E', 'B', 'F♯', 'C♯', 'G♯', 'D♯', 'B♭', 'F', 'C', 'G', 'D'];
const SIG = [0, 1, 2, 3, 4, 5, 6, -5, -4, -3, -2, -1];

// ===== II–V–I =====
function iiVI(keyStr, minor = false) {
  const k = rootN(keyStr);
  const ii = up(k, '2'), v = up(k, '5');
  return minor ? [{ r: ii, id: 'm7♭5' }, { r: v, id: '7alt' }, { r: k, id: 'm6' }] : [{ r: ii, id: 'm7' }, { r: v, id: '7' }, { r: k, id: 'maj7' }];
}


export { LET, NAT, ACC, N, pcOf, nm, parseNote, IV, EXT, semis, up, spell, midiOf, MAJ_ROOTS, MIN_ROOTS, rootN, ALL12, INTERVALS, ivByKey, degLabel, CHORDS, chordById, chordName, parseChord, FAM_DEGS, SCALES, scaleById, QUAL, harmonize, ROMAN, roman, funcOf, CIRCLE, REL_MIN, SIG, iiVI };
