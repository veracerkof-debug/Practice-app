// Аккорды на гитаре: схемы (аппликатуры) и их звуки. Схема — шесть значений от 6-й струны (низкая ми) до 1-й:
// null — струна заглушена, 0 — открытая, n — лад. Открытые аккорды — как в любом сборнике; подвижные (баррэ и квинты)
// строятся от формы «ми» (тоника на 6-й струне) и «ля» (тоника на 5-й) на ладах 1…12. Только данные и расчёты.
import { MAJ_NAMES, MIN_NAMES } from './notes.js';

export const STD = [40, 45, 50, 55, 59, 64]; // E2 A2 D3 G3 B3 E4

// 'x32010' → [null, 3, 2, 0, 1, 0]
export const shape = (s) => [...s].map((ch) => (ch === 'x' ? null : +ch));

// Открытые аккорды: [обозначение, схема, тип]. Тип — как в «Теории» (maj, min, 7, maj7, m7, sus2, sus4, add9, 5)
const OPEN = [
  ['C', 'x32010', 'maj'], ['C7', 'x32310', '7'], ['Cmaj7', 'x32000', 'maj7'], ['Cadd9', 'x32030', 'add9'],
  ['D', 'xx0232', 'maj'], ['Dm', 'xx0231', 'min'], ['D7', 'xx0212', '7'], ['Dmaj7', 'xx0222', 'maj7'], ['Dm7', 'xx0211', 'm7'],
  ['Dsus2', 'xx0230', 'sus2'], ['Dsus4', 'xx0233', 'sus4'],
  ['E', '022100', 'maj'], ['Em', '022000', 'min'], ['E7', '020100', '7'], ['Em7', '022030', 'm7'], ['Emaj7', '021100', 'maj7'],
  ['Esus4', '022200', 'sus4'], ['E5', '022xxx', '5'],
  ['F', '133211', 'maj'], ['Fm', '133111', 'min'], ['Fmaj7', 'xx3210', 'maj7'],
  ['G', '320003', 'maj'], ['G', '320033', 'maj'], ['G7', '320001', '7'], ['Gmaj7', '320002', 'maj7'],
  ['A', 'x02220', 'maj'], ['Am', 'x02210', 'min'], ['A7', 'x02020', '7'], ['Am7', 'x02010', 'm7'], ['Amaj7', 'x02120', 'maj7'],
  ['Asus2', 'x02200', 'sus2'], ['Asus4', 'x02230', 'sus4'], ['A5', 'x022xx', '5'],
  ['B7', 'x21202', '7'], ['Bm', 'x24432', 'min'], ['B', 'x24442', 'maj'], ['B♭', 'x13331', 'maj'], ['Bm7', 'x20202', 'm7'],
];

// Подвижные формы: [тип, струна тоники (0 — 6-я, 1 — 5-я), смещения от лада баррэ]
const MOVABLE = [
  ['maj', 0, [0, 2, 2, 1, 0, 0]], ['min', 0, [0, 2, 2, 0, 0, 0]], ['7', 0, [0, 2, 0, 1, 0, 0]], ['m7', 0, [0, 2, 0, 0, 0, 0]],
  ['sus4', 0, [0, 2, 2, 2, 0, 0]], ['5', 0, [0, 2, 2, null, null, null]],
  ['maj', 1, [null, 0, 2, 2, 2, 0]], ['min', 1, [null, 0, 2, 2, 1, 0]], ['7', 1, [null, 0, 2, 0, 2, 0]], ['m7', 1, [null, 0, 2, 0, 1, 0]],
  ['maj7', 1, [null, 0, 2, 1, 2, 0]], ['sus2', 1, [null, 0, 2, 2, 0, 0]], ['sus4', 1, [null, 0, 2, 2, 3, 0]], ['5', 1, [null, 0, 2, 2, null, null]],
];

// Интервалы типов (от тоники, по модулю 12)
export const TYPE_IVS = { maj: [0, 4, 7], min: [0, 3, 7], '7': [0, 4, 7, 10], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], sus2: [0, 2, 7], sus4: [0, 5, 7], add9: [0, 2, 4, 7], '5': [0, 7] };
const SUFFIX = { maj: '', min: 'm', '7': '7', maj7: 'maj7', m7: 'm7', sus2: 'sus2', sus4: 'sus4', add9: 'add9', '5': '5' };
const rootName = (pc, type) => ((type === 'min' || type === 'm7') ? MIN_NAMES : MAJ_NAMES)[pc];

// Звуки схемы (MIDI, null — струна заглушена) и высоты без октав
export const notesOf = (frets, tuning = STD) => frets.map((f, i) => (f == null ? null : tuning[i] + f));
export const pcsOf = (frets, tuning = STD) => [...new Set(notesOf(frets, tuning).filter((m) => m != null).map((m) => m % 12))];

// Все схемы: { name, frets, type, root (высота тоники), open — есть открытые струны, barre — лад баррэ или null,
// common — открытый аккорд из сборника (их играют чаще) }
export const TEMPLATES = (() => {
  const out = [];
  OPEN.forEach(([name, s, type]) => {
    const frets = shape(s), bass = frets.findIndex((f) => f != null), root = (STD[bass] + frets[bass]) % 12;
    // у F, B♭, Bm, B и т. п. — баррэ указательным пальцем: самый нижний лад на нескольких струнах
    const pressed = frets.filter((f) => f > 0), low = pressed.length ? Math.min(...pressed) : 0;
    const barre = low > 0 && frets.filter((f) => f === low).length >= 2 && !frets.includes(0) ? low : null;
    out.push({ name, frets, type, root, open: frets.includes(0), barre, common: true });
  });
  MOVABLE.forEach(([type, rs, rel]) => {
    for (let f = 1; f <= 12; f++) {
      const frets = rel.map((d) => (d == null ? null : f + d)), root = (STD[rs] + f) % 12;
      const name = rootName(root, type) + SUFFIX[type];
      if (out.some((t) => t.name === name && t.frets.every((x, i) => x === frets[i]))) continue;
      out.push({ name, frets, type, root, open: false, barre: rel.filter((d) => d === 0).length >= 2 ? f : null, common: false });
    }
  });
  return out;
})();
