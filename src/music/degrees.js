// Ступени вместо аккордов. Аккорд хранится относительно тональности — «ступень + вид + добавки + бас», —
// поэтому его можно показать в любой тональности и в любой записи, что бы ни было в исходном тексте:
//   • аккорды: C, Am7, G/B, B♭maj7;
//   • римские цифры (как в учебниках гармонии): I, vi7, V/7, ♭VIImaj7 — мажор прописными, минор строчными,
//     ° — уменьшённый, ø — полууменьшённый, + — увеличенный;
//   • нэшвиллская система (студийная практика): 1, 6m7, 5/7, ♭7maj7.
// Ступени считаются по натуральному звукоряду тональности: в ля миноре C — III, G — VII, E7 — V7.
// Бас записывается номером ступени: G/B в до мажоре — V/7 (в римской записи) и 5/7 (в нэшвиллской).
import { parseNote, tonicName, noteOf, sharpKey, accStr, mod12, CH } from './transpose.js';
import { SH, FL } from './notes.js';

const SCALE = { maj: [0, 2, 4, 5, 7, 9, 11], min: [0, 2, 3, 5, 7, 8, 10] };
const scaleOf = (key) => SCALE[key.minor ? 'min' : 'maj'];
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
const ACC = { '#': 1, '♯': 1, b: -1, '♭': -1, '##': 2, bb: -2 };

// Вид аккорда по суффиксу: { kind: maj | min | dim | hdim | aug, ext — что осталось после обозначения вида }
export function quality(q) {
  let m;
  if ((m = /^(maj|M|Δ)/.exec(q))) return { kind: 'maj', ext: q };
  if ((m = /^(m7(?:b|♭)5|ø7?)/.exec(q))) return { kind: 'hdim', ext: q.slice(m[0].length) };
  if ((m = /^(dim|°)/.exec(q))) return { kind: 'dim', ext: q.slice(m[0].length) };
  if ((m = /^(aug|\+)/.exec(q))) return { kind: 'aug', ext: q.slice(m[0].length) };
  if ((m = /^(min|m|-)/.exec(q))) return { kind: 'min', ext: q.slice(m[0].length) };
  return { kind: 'maj', ext: q };
}
const norm = (s) => s.replace(/#/g, '♯').replace(/b(?=\d)/g, '♭');

// Ступень звука относительно тональности: { d — номер ступени 0…6, acc — знак относительно звукоряда }
function degreeOf(note, key) {
  const t = parseNote(tonicName(key.pc, key.minor, key.sharp));
  const d = (note.L - t.L + 7) % 7;
  let acc = mod12(note.pc - t.pc - scaleOf(key)[d]);
  if (acc > 6) acc -= 12;
  return { d, acc };
}
// Звук по ступени в тональности; двойные знаки — простым равнозвучным названием
function noteAt(deg, key) {
  const t = parseNote(tonicName(key.pc, key.minor, key.sharp));
  const n = noteOf(t.L + deg.d, t.pc + scaleOf(key)[deg.d] + deg.acc);
  return Math.abs(n.acc) <= 1 ? n.name : (sharpKey(key) ? SH : FL)[n.pc];
}

// Римская или нэшвиллская ступень с возможным знаком перед ней
const RO_RE = /^(\(?)(##|bb|#|b|♯|♭)?(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)(°|ø|\+)?(.*?)(?:\/(##|bb|#|b|♯|♭)?([1-7]))?(\)?)$/;
const NA_RE = /^(\(?)(##|bb|#|b|♯|♭)?([1-7])(m(?!aj)|-|°|ø|\+)?(.*?)(?:\/(##|bb|#|b|♯|♭)?([1-7]))?(\)?)$/;
// Что может стоять после ступени: цифры и обычные добавки (7, maj7, sus4, add9, 6/9, ♭5…)
const EXT_RE = /^(?:maj|M|sus|add|dim|aug|[0-9]|b|#|♭|♯|\(|\)|,)*$/;
// В нэшвиллской записи добавки пишут надстрочными цифрами: 5⁷, 2m⁷ — так «57» не спутать с числом
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const toSup = (s) => s.replace(/[0-9]/g, (d) => SUP[d]);
const fromSup = (s) => s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (c) => SUP.indexOf(c));

// Ступень из записи римскими цифрами или числами; null — это не ступень
export function parseDegree(tok, { numbers = true } = {}) {
  let m = RO_RE.exec(tok);
  if (m && EXT_RE.test(m[5])) {
    const up = m[3] === m[3].toUpperCase(), sym = m[4] || '';
    const kind = sym === '°' ? 'dim' : sym === 'ø' ? 'hdim' : sym === '+' ? 'aug' : up ? 'maj' : 'min';
    return { o: m[1], c: m[8], deg: { d: ROMAN.indexOf(m[3].toUpperCase()), acc: ACC[m[2]] || 0 }, kind, ext: m[5],
      bass: m[7] ? { d: +m[7] - 1, acc: ACC[m[6]] || 0 } : null };
  }
  if (!numbers) return null;
  m = NA_RE.exec(fromSup(tok));
  // сразу за номером обычной цифрой — только 6, 7, 9 (57 — это 5⁷); «12» или «35» — просто числа
  if (m && EXT_RE.test(m[5]) && !/^[0-9]/.test(m[5]) || (m && /^(6|7|9|69)(?![0-9])/.test(m[5]) && EXT_RE.test(m[5]))) {
    const sym = m[4] || '';
    const kind = sym === '°' ? 'dim' : sym === 'ø' ? 'hdim' : sym === '+' ? 'aug' : sym ? 'min' : 'maj';
    return { o: m[1], c: m[8], deg: { d: +m[3] - 1, acc: ACC[m[2]] || 0 }, kind, ext: m[5],
      bass: m[7] ? { d: +m[7] - 1, acc: ACC[m[6]] || 0 } : null };
  }
  return null;
}

// Аккорд (C, Am7, G/B) → ступень в тональности key
export function chordToDegree(tok, key) {
  const m = CH.exec(tok);
  const root = m && parseNote(m[2]);
  if (!root) return null;
  const { kind, ext } = quality(m[3]);
  const bass = m[4] ? parseNote(m[4]) : null;
  return { o: m[1], c: m[5], deg: degreeOf(root, key), kind, ext, q: m[3], bass: bass ? degreeOf(bass, key) : null };
}

const SUFFIX = { maj: '', min: 'm', dim: 'dim', aug: '+', hdim: 'm7♭5' };
const ROMAN_SYM = { maj: '', min: '', dim: '°', aug: '+', hdim: 'ø' };
const NASH_SYM = { maj: '', min: 'm', dim: '°', aug: '+', hdim: 'ø' };
// у полууменьшённого семёрка входит в обозначение (m7♭5, ø7) — во второй раз не пишем
const extFor = (x) => norm(x.kind === 'hdim' ? x.ext.replace(/^7/, '') : x.ext);

// Ступень → аккорд в тональности key (исходный суффикс аккорда сохраняется как был)
export function degreeToChord(x, key) {
  const suf = x.q != null ? norm(x.q) : SUFFIX[x.kind] + extFor(x);
  return x.o + noteAt(x.deg, key) + suf + (x.bass ? '/' + noteAt(x.bass, key) : '') + x.c;
}

const bassNum = (b) => (b ? '/' + accStr(b.acc) + (b.d + 1) : '');

// Римская запись: ♭VII, vi7, viiø7, V/7
export function degreeToRoman(x) {
  const lower = x.kind === 'min' || x.kind === 'dim' || x.kind === 'hdim', r = ROMAN[x.deg.d];
  return x.o + accStr(x.deg.acc) + (lower ? r.toLowerCase() : r) + ROMAN_SYM[x.kind] + (x.kind === 'hdim' ? '7' : '') + extFor(x) + bassNum(x.bass) + x.c;
}

// Нэшвиллская запись: ♭7, 6m⁷, 7ø⁷, 5/7
export function degreeToNash(x) {
  return x.o + accStr(x.deg.acc) + (x.deg.d + 1) + NASH_SYM[x.kind] + toSup((x.kind === 'hdim' ? '7' : '') + extFor(x)) + bassNum(x.bass) + x.c;
}

// Есть ли в тексте ступени (тогда без тональности песни берётся до мажор или ля минор)
export const tonicIsMinor = (degs) => { const t = degs.find((x) => x.deg.d === 0 && !x.deg.acc); return !!t && t.kind === 'min'; };
