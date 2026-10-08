// Определитель аккордов и гамм; лады как сдвиги одной семьи
import { describe, it, expect } from 'vitest';
import { chordsOf, familiesOf, ladderOf, degreesOf, colorNote, MODE_IVS } from '../src/music/identify.js';

describe('аккорды по нотам', () => {
  it('трезвучия, септаккорды, без квинты, обращения', () => {
    expect(chordsOf([0, 4, 7])[0].name).toBe('C');
    expect(chordsOf([9, 0, 4])[0].name).toBe('Am');
    expect(chordsOf([7, 11, 2, 5])[0].name).toBe('G7');
    expect(chordsOf([0, 4, 10])[0].name).toBe('C7'); // без квинты
    expect(chordsOf([4, 7, 0], 4)[0].name).toBe('C/E');
    // один набор — несколько прочтений: Am7 = C6
    const names = chordsOf([9, 0, 4, 7]).map((c) => c.name);
    expect(names).toContain('Am7');
    expect(names).toContain('C6');
    expect(chordsOf([0, 1, 2])).toEqual([]);
  });
});

describe('семьи гамм: лады — один набор нот с разными центрами', () => {
  it('белые клавиши от ми — фригийский лад до мажора', () => {
    const f = familiesOf([4, 5, 7, 9, 11, 0, 2], 4);
    expect(f[0].fam).toBe('major');
    expect(f[0].parent).toBe(0);
    expect(f[0].at.id).toBe('phrygian');
    expect(f[0].modes.map((m) => m.id)).toEqual(['major', 'dorian', 'phrygian', 'lydian', 'mixo', 'minor', 'locrian']);
  });
  it('фригийский доминантовый (как у Ингви) — гармонический минор ля от ми', () => {
    const f = familiesOf([4, 5, 8, 9, 11, 0, 2], 4);
    expect(f[0].fam).toBe('harm');
    expect(f[0].parent).toBe(9);
    expect(f[0].at.id).toBe('phrygdom');
  });
  it('мало нот — несколько семей', () => {
    expect(familiesOf([0, 4, 7]).length).toBeGreaterThan(3);
  });
});

describe('лестница ладов', () => {
  it('от светлого к тёмному, соседние — на одну ноту', () => {
    const l = ladderOf(0);
    expect(l.map((x) => x.id)).toEqual(['lydian', 'major', 'mixo', 'dorian', 'minor', 'phrygian', 'locrian']);
    for (let i = 1; i < l.length; i++) expect(l[i].pcs.filter((p) => !l[i - 1].pcs.includes(p))).toHaveLength(1);
    expect(ladderOf(2, [2, 5, 11]).find((x) => x.id === 'dorian').fits).toBe(true);
  });
  it('ступени и характерная нота', () => {
    expect(degreesOf('dorian').join(' ')).toBe('1 2 ♭3 4 5 6 ♭7');
    expect(colorNote('dorian')).toEqual({ base: 'minor', notes: ['6'] });
    expect(colorNote('lydian')).toEqual({ base: 'major', notes: ['♯4'] });
    expect(colorNote('major')).toBe(null);
    expect(MODE_IVS.phrygdom).toEqual([0, 1, 4, 5, 7, 8, 10]);
  });
});
