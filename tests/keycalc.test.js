import { describe, it, expect } from 'vitest';
import { keyShift, keyTo, diatonic, transposeLine, capoOptions } from '../src/music/keycalc.js';
import { keyLabel } from '../src/music/transpose.js';

describe('калькулятор тональности', () => {
  it('сдвиг по кратчайшему пути', () => {
    expect(keyShift({ pc: 7, minor: false }, 9)).toBe(2); // G → A
    expect(keyShift({ pc: 0, minor: false }, 7)).toBe(-5); // C → G (вниз на кварту)
    expect(keyLabel(keyTo({ pc: 9, minor: true }, 4))).toBe('Em');
  });
  it('строка аккордов и ступени', () => {
    const G = { pc: 7, minor: false, sharp: true };
    expect(transposeLine('G C D Em', G, 2)).toBe('A D E F♯m');
    expect(transposeLine('| G/B C | D7 |', G, 2)).toBe('| A/C♯ D | E7 |');
    expect(transposeLine('Куплет: G', G, 2)).toBe('Куплет: A');
    expect(diatonic({ pc: 2, minor: false }).map((c) => c.name).slice(0, 5)).toEqual(['D', 'Em', 'F♯m', 'G', 'A']);
  });
  it('каподастр', () => {
    expect(capoOptions({ pc: 4, minor: false })).toEqual([{ capo: 0, shape: 'E' }, { capo: 2, shape: 'D' }, { capo: 4, shape: 'C' }, { capo: 7, shape: 'A' }]);
    expect(capoOptions({ pc: 11, minor: true })[0]).toEqual({ capo: 2, shape: 'Am' });
  });
});
