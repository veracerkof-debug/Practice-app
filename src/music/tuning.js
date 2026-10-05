// Строи струнных и расчёт показаний тюнера — без DOM. Перенесено из legacy/practice.html (TUNINGS, curTuning, TU.show).

import { mName, parseN, splitN } from './notes.js';

export { mName, parseN, splitN };

// Группы строев: [ключ группы, [[id, ноты от низкой струны]]]. Названия — i18n group.<ключ>, tuning.<id>
export const TUNINGS = [
  ['guitar', [['g_std', 'E2 A2 D3 G3 B3 E4'], ['g_dropd', 'D2 A2 D3 G3 B3 E4'], ['g_half', 'E♭2 A♭2 D♭3 G♭3 B♭3 E♭4'], ['g_dstd', 'D2 G2 C3 F3 A3 D4'],
    ['g_dropc', 'C2 G2 C3 F3 A3 D4'], ['g_dadgad', 'D2 A2 D3 G3 A3 D4'], ['g_openg', 'D2 G2 D3 G3 B3 D4'], ['g_opend', 'D2 A2 D3 F♯3 A3 D4'],
    ['g_opene', 'E2 B2 E3 G♯3 B3 E4'], ['g_7', 'B1 E2 A2 D3 G3 B3 E4'], ['g_ru7', 'D2 G2 B2 D3 G3 B3 D4']]],
  ['bass', [['b4', 'E1 A1 D2 G2'], ['b4dd', 'D1 A1 D2 G2'], ['b4half', 'E♭1 A♭1 D♭2 G♭2'], ['b5', 'B0 E1 A1 D2 G2'], ['b6', 'B0 E1 A1 D2 G2 C3']]],
  ['uke', [['u_std', 'G4 C4 E4 A4'], ['u_low', 'G3 C4 E4 A4'], ['u_d', 'A4 D4 F♯4 B4'], ['u_bar', 'D3 G3 B3 E4']]],
  ['other', [['violin', 'G3 D4 A4 E5'], ['viola', 'C3 G3 D4 A4'], ['cello', 'C2 G2 D3 A3'], ['mando', 'G3 D4 A4 E5'], ['banjo', 'G4 D3 G3 B3 D4'],
    ['domra', 'E4 A4 D5'], ['balal', 'E4 E4 A4']]],
];

// Точность: допуск в центах
export const TOL = { strict: 2, normal: 5, soft: 10 };
export const STYLES = ['needle', 'strobe', 'bar', 'ring'];

// Значения по умолчанию (прототип: TUC())
export function normalizeTuner(t) {
  if (t.useTuning == null) t.useTuning = false;
  if (!t.tol) t.tol = 'normal';
  if (!t.style || !STYLES.includes(t.style)) t.style = 'needle';
  if (t.showStrings == null) t.showStrings = true;
  if (t.head == null) t.head = false;
  if (!t.customs) t.customs = [];
  return t;
}

// Текущий строй или null (хроматический режим). name — ключ i18n или имя своего строя
export function curTuning(t) {
  const id = t.tuning;
  if (id === 'chrom' || t.useTuning === false) return null;
  for (const [g, ls] of TUNINGS) {
    const x = ls.find((y) => y[0] === id);
    if (x) {
      const names = x[1].split(' ');
      return { id, group: g, nameKey: 'tuning.' + id, names, midis: names.map(parseN) };
    }
  }
  const c = (t.customs || []).find((x) => x.id === id);
  if (c) return { id, group: 'custom', name: c.name, names: c.midis.map(mName), midis: c.midis, custom: true };
  return null;
}

// Частота → показание: ближайшая струна строя (или закреплённая lock), либо ближайшая нота
export function reading(f, { a4 = 440, tuning = null, lock = null, tol = 5 } = {}) {
  const mfl = 69 + 12 * Math.log2(f / a4);
  let tgt, nm, si = -1;
  if (tuning) {
    if (lock != null && tuning.midis[lock] != null) si = lock;
    else {
      let bd = 1e9;
      tuning.midis.forEach((m, i) => { const dd = Math.abs(mfl - m); if (dd < bd) { bd = dd; si = i; } });
    }
    tgt = tuning.midis[si];
    nm = splitN(tuning.names[si]);
  } else {
    tgt = Math.round(mfl);
    nm = splitN(mName(tgt));
  }
  const cents = (mfl - tgt) * 100;
  return { si, target: tgt, targetHz: a4 * Math.pow(2, (tgt - 69) / 12), cents, ok: Math.abs(cents) <= tol, note: nm[0], oct: nm[1] };
}

// Частота в допустимом диапазоне тюнера
export const inRange = (f) => f >= 25 && f <= 4200;
