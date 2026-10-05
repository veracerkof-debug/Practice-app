// Ноты и правописание (диезы/бемоли по правилам тональности). Перенесено из legacy/practice.html.

export const SH = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
export const FL = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
export const LETTERS = 'CDEFGAB';
export const NAT = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export const MAJI = [0, 2, 4, 5, 7, 9, 11];
export const NAT_MIN = [0, 2, 3, 5, 7, 8, 10];
// Как называть тонику мажора и минора на каждой ступени (меньше знаков)
export const MAJ_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export const MIN_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'B♭', 'B'];

export const accOf = (n) => [...n.slice(1)].reduce((t, ch) => t + (ch === '♯' ? 1 : ch === '♭' ? -1 : 0), 0);
export const pcOf = (n) => (NAT[n[0]] + accOf(n) + 24) % 12;

// Ноты от root по интервалам ivs; li — номер буквы (ступени) для каждой ноты
export function spell(root, ivs, li) {
  const L0 = LETTERS.indexOf(root[0]), rpc = pcOf(root);
  return ivs.map((iv, k) => {
    const L = LETTERS[(L0 + li[k]) % 7], d = ((((rpc + iv) % 12) - NAT[L] + 18) % 12) - 6;
    return L + (d > 0 ? '♯'.repeat(d) : '♭'.repeat(-d));
  });
}

// 'E♭2' → MIDI
export const parseN = (n) => {
  const m = n.match(/^([A-G])([♯♭]*)(-?\d)$/);
  return 12 * (+m[3] + 1) + NAT[m[1]] + accOf(m[1] + m[2]);
};
// MIDI → 'C♯4'
export const mName = (m) => SH[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
// 'C♯4' → ['C♯', '4']
export const splitN = (n) => { const m = n.match(/^(.*?)(-?\d)$/); return [m[1], m[2]]; };
// 'C♯/D♭' для кнопок выбора тоники
export const enh = (i) => (SH[i] === FL[i] ? SH[i] : SH[i] + '/' + FL[i]);
