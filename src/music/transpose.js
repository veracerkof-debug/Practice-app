// Транспонирование аккордов с правильным написанием. Аккорд сдвигается вместе с тональностью и сохраняет
// свою ступень: в до мажоре B♭ — это ♭VII, и в ре мажоре он станет C, а не B♯; в соль мажоре F♯ останется
// диезным, в фа мажоре B♭ — бемольным. Тональность берётся из песни или определяется по самим аккордам.
// Немецкое H читается как B. Двойные знаки (𝄪, 𝄫) заменяются простым равнозвучным названием.
import { NAT, LETTERS, SH, FL } from './notes.js';

const ACC = { '#': 1, '♯': 1, b: -1, '♭': -1, '##': 2, bb: -2 };
const accStr = (a) => (a > 0 ? '♯'.repeat(a) : '♭'.repeat(-a));
const mod12 = (n) => ((n % 12) + 12) % 12;

// Название ноты: { L — индекс буквы в CDEFGAB, acc, pc, name }
export function parseNote(s) {
  const m = /^([A-H])(##|bb|#|b|♯|♭)?/.exec(s);
  if (!m) return null;
  const letter = m[1] === 'H' ? 'B' : m[1], acc = ACC[m[2]] || 0;
  return { L: LETTERS.indexOf(letter), acc, pc: mod12(NAT[letter] + acc), len: m[0].length, name: letter + accStr(acc) };
}
const noteOf = (L, pc) => {
  const letter = LETTERS[(L + 7) % 7];
  let a = mod12(pc - NAT[letter]);
  if (a > 6) a -= 12;
  return { L: (L + 7) % 7, acc: a, pc: mod12(pc), name: letter + accStr(a) };
};

// Тоника тональности с наименьшим числом знаков; при равенстве (F♯/G♭ мажор, D♯/E♭ минор) — sharp: true → диезы
const MAJ_TONIC = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const MIN_TONIC = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'B♭', 'B'];
export function tonicName(pc, minor, sharp = null) {
  pc = mod12(pc);
  if (!minor && pc === 6) return sharp === false ? 'G♭' : 'F♯';
  if (minor && pc === 3) return sharp === true ? 'D♯' : 'E♭';
  return (minor ? MIN_TONIC : MAJ_TONIC)[pc];
}
export const keyLabel = (k) => (k ? tonicName(k.pc, k.minor, k.sharp) + (k.minor ? 'm' : '') : '');

// Диезная ли тональность (для выбора написания при равенстве и для аккордов вне ступеней)
const sharpKey = (k) => { const n = parseNote(tonicName(k.pc, k.minor, k.sharp)); const relMaj = k.minor ? mod12(k.pc + 3) : k.pc; return n.acc > 0 || [7, 2, 9, 4, 11, 6].includes(relMaj); };

// Аккорд: [скобка](корень)(остальное)[/бас][скобка]
const CH = /^(\(?)([A-H](?:##|bb|#|b|♯|♭)?)(.*?)(?:\/([A-H](?:##|bb|#|b|♯|♭)?))?(\)?)$/;
const isMinorQ = (q) => /^(m(?!aj)|min|-)/.test(q) || /^(dim|°|ø)/.test(q);

// Определить тональность по аккордам: каждый аккорд, который входит в тональность (с нужным наклонением),
// добавляет очко; первый и последний аккорды — вероятная тоника. В миноре V может быть мажорным.
export function detectKey(chords) {
  const list = chords.map((c) => { const m = CH.exec(c); const n = m && parseNote(m[2]); return n ? { pc: n.pc, minor: isMinorQ(m[3]), acc: n.acc } : null; }).filter(Boolean);
  if (!list.length) return null;
  const MAJ = [[0, 0], [2, 1], [4, 1], [5, 0], [7, 0], [9, 1], [11, 1]];
  const MIN = [[0, 1], [2, 1], [3, 0], [5, 1], [7, 1], [7, 0], [8, 0], [10, 0]];
  let best = null;
  for (let pc = 0; pc < 12; pc++) for (const minor of [false, true]) {
    const deg = minor ? MIN : MAJ;
    let s = 0;
    list.forEach((c) => {
      const iv = mod12(c.pc - pc);
      if (deg.some(([d, q]) => d === iv && !!q === c.minor)) s += 1;
      else if (deg.some(([d]) => d === iv)) s += 0.4;
    });
    const tonic = (c) => c && c.pc === pc && c.minor === minor;
    if (tonic(list[0])) s += 1.5;
    if (tonic(list[list.length - 1])) s += 1;
    s += list.filter(tonic).length * 0.3;
    if (!best || s > best.s) best = { s, pc, minor };
  }
  const sharps = list.filter((c) => c.acc > 0).length, flats = list.filter((c) => c.acc < 0).length;
  return { pc: best.pc, minor: best.minor, sharp: sharps === flats ? null : sharps > flats };
}

// Тональность после сдвига на n полутонов; при равенстве знаков — направление написания исходной
export function shiftKey(k, n) {
  const pc = mod12(k.pc + n);
  return { pc, minor: k.minor, sharp: k.sharp ?? sharpKey(k) };
}

// Один звук аккорда (корень или бас) — по ступени относительно тоники
function moveNote(s, from, to) {
  const n = parseNote(s);
  if (!n) return s;
  const t0 = parseNote(tonicName(from.pc, from.minor, from.sharp)), t1 = parseNote(tonicName(to.pc, to.minor, to.sharp));
  const d = (n.L - t0.L + 7) % 7, semis = mod12(n.pc - t0.pc);
  const out = noteOf(t1.L + d, t1.pc + semis);
  if (Math.abs(out.acc) <= 1) return out.name;
  return (sharpKey(to) ? SH : FL)[out.pc]; // двойной знак — простое название
}

// Аккорд из тональности from в тональность, сдвинутую на n полутонов
export function transposeChord(ch, n, from) {
  const m = CH.exec(ch);
  if (!m) return ch;
  const to = shiftKey(from, n), [, o, root, q, bass, c] = m;
  if (!n) return ch.replace(/#/g, '♯').replace(/([A-H])b/g, '$1♭'); // без сдвига — как написано (и H остаётся H)
  const mv = (x) => moveNote(x, from, to);
  const qq = q.replace(/#/g, '♯').replace(/b(?=\d)/g, '♭'); // m7b5 → m7♭5
  return o + mv(root) + qq + (bass ? '/' + mv(bass) : '') + c;
}

// Сдвиг, при котором тональность становится target ({ pc, minor }); от −5 до +6
export const shiftTo = (from, targetPc) => { let d = mod12(targetPc - from.pc); if (d > 6) d -= 12; return d; };
