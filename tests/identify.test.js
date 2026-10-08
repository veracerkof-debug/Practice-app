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

import { modeChords, onFifths, rotateMode, parentOf, familyOfType } from '../src/music/identify.js';
describe('гармония ладов и квинтовый круг', () => {
  it('аккорды ступеней и характерные', () => {
    const d = modeChords(2, 'dorian'); // ре дорийский
    expect(d.map((c) => c.rn).join(' ')).toBe('i ii ♭III IV v vi° ♭VII');
    expect(d.filter((c) => c.color).map((c) => c.rn)).toEqual(['ii', 'IV', 'vi°']); // где есть си (большая шестая)
    expect(modeChords(9, 'harm').map((c) => c.rn).join(' ')).toBe('i ii° ♭III+ iv V ♭VI vii°');
    expect(modeChords(7, 'mixo', true)[0].rn).toBe('I7');
  });
  it('лады — дуга квинт, светлее — ближе к бемольному краю', () => {
    expect(onFifths(5, [5, 7, 9, 11, 0, 2, 4]).tonicPos).toBe(0); // фа лидийский
    expect(onFifths(11, [11, 0, 2, 4, 5, 7, 9]).tonicPos).toBe(6); // си локрийский
    const h = onFifths(9, [9, 11, 0, 2, 4, 5, 8]); // ля гармонический: соль-диез вне дуги
    expect([h.outside, h.missing, h.len]).toEqual([[8], [7], 7]); // соль-диез вместо соли
    expect(onFifths(0, [0, 2, 4, 7, 9]).len).toBe(5); // пентатоника — пять квинт
  });
  it('поворот лада: те же ноты, другая тоника', () => {
    expect(rotateMode(0, 'major', 1)).toEqual({ pc: 2, id: 'dorian' });
    expect(rotateMode(4, 'phrygdom', -1)).toEqual({ pc: 2, id: 'dorian4' });
    expect(parentOf(2, 'dorian')).toBe(0);
    expect(familyOfType('blues')).toBe(null);
  });
});
