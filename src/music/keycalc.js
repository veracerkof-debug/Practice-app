// Калькулятор тональности («Теория» → «Транспонирование»): на сколько сдвинуть, аккорды обеих тональностей
// по ступеням, пересчёт своей строки аккордов и каподастр — какими открытыми аккордами гитары сыграть.
import { CH, shiftTo, shiftKey, transposeChord, tonicName } from './transpose.js';
import { keyInfo } from './theory.js';

// Сдвиг из from в тональность с тоникой toPc → полутоны, от −5 до +6 (кратчайший путь)
export const keyShift = (from, toPc) => shiftTo(from, toPc);
export const keyTo = (from, toPc) => shiftKey(from, keyShift(from, toPc));

// Аккорды тональности по ступеням (I…VII): [{ rn, name, midis }]
export const diatonic = (k, sev = false) => keyInfo(k.pc, k.minor, sev).chords;

// Строка аккордов («G C D Em», «| Am F | C G |», «G/B») → в новой тональности; не аккорды остаются как были
export function transposeLine(text, from, n) {
  return String(text || '').split(/(\s+|\||,)/).map((tok) => (tok && CH.test(tok) && /^[(]?[A-H]/.test(tok) ? transposeChord(tok, n, from) : tok)).join('');
}

// Каподастр: открытые аккорды гитары. Для мажора — формы C, A, G, E, D; для минора — Am, Em, Dm.
// → [{ capo, shape }] по возрастанию лада, не выше 7-го
const SHAPES = { maj: [0, 9, 7, 4, 2], min: [9, 4, 2] };
export function capoOptions(k) {
  return (k.minor ? SHAPES.min : SHAPES.maj).map((pc) => ({ capo: (k.pc - pc + 12) % 12, shape: tonicName(pc, k.minor) + (k.minor ? 'm' : '') }))
    .filter((x) => x.capo <= 7).sort((a, b) => a.capo - b.capo);
}
