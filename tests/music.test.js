// Теория сверяется с прототипом для всех тоник, ладов, гамм и аккордов.
import { describe, it, expect } from 'vitest';
import { runLegacy } from './legacy.js';
import { keyInfo, scaleInfo, chordInfo, circleStep, SCALE_TYPES, CHORDS, intervalNote } from '../src/music/theory.js';
import { spell, MAJ_NAMES } from '../src/music/notes.js';

// keyInfo/scaleInfo/chordInfo прототипа читают T — подставляем
const T = {};
const proto = runLegacy([
  /^const SH=/, /^const LETTERS=/, /^const MAJ_NAMES=/, /^const accOf=/, /^const pcOf=/, /^function spell\(/, /^const plural=/,
  /^const CIRC=/, /^function keyInfo\(/, /^const SCALES=/, /^function scaleInfo\(/, /^const CHORDS=/, /^function chordInfo\(/, /^const INTERVALS=/,
], '{keyInfo,scaleInfo,chordInfo,spell,INTERVALS}', { T });
const J = (o) => JSON.parse(JSON.stringify(o));

describe('теория — как в прототипе', () => {
  it.each([...Array(12).keys()])('тональности, тоника %i', (pc) => {
    for (const minor of [false, true]) for (const sev of [false, true]) {
      const a = keyInfo(pc, minor, sev), b = J(proto.keyInfo(pc, minor, sev));
      expect(a.notes).toEqual(b.notes);
      expect(a.chords).toEqual(b.chords);
      expect(a.signs).toEqual(b.signs);
      expect(a.scaleMidis).toEqual(b.scaleMidis);
      expect(a.pcs).toEqual(b.pcs);
      expect(a.relRoot + (a.relMinor ? ' минор' : ' мажор')).toBe(b.rel);
      expect(a.root + (minor ? ' минор' : ' мажор')).toBe(b.title);
    }
  });
  it.each([...Array(12).keys()])('гаммы и аккорды, тоника %i', (pc) => {
    for (const type of SCALE_TYPES) {
      T.scale = { pc, type };
      const a = scaleInfo(pc, type), b = J(proto.scaleInfo());
      expect([a.notes, a.degs, a.pcs, a.seq, a.root]).toEqual([b.notes, b.degs, b.pcs, b.seq, b.root]);
      expect(a.steps.map((s) => (s === 1 ? 'П' : s === 2 ? 'Т' : s === 3 ? 'Т+П' : s + 'п'))).toEqual(b.steps);
    }
    for (const [id] of CHORDS) {
      T.theory = { croot: pc, ctype: id };
      const a = chordInfo(pc, id), b = J(proto.chordInfo());
      expect([a.name, a.notes, a.form, a.midis, a.pcs]).toEqual([b.name, b.notes, b.form, b.midis, b.pcs]);
    }
    for (let i = 0; i < 13; i++) {
      const iv = proto.INTERVALS[i];
      expect(intervalNote(pc, i)).toBe(proto.spell(MAJ_NAMES[pc], [iv[0]], [iv[3]])[0]);
    }
  });
  it('шаг по квинтовому кругу', () => {
    expect(circleStep(0, false, 1)).toBe(7);
    expect(circleStep(0, false, -1)).toBe(5);
    expect(circleStep(9, true, 1)).toBe(4);   // a → e
    expect(spell('C', [0, 4, 7], [0, 2, 4])).toEqual(['C', 'E', 'G']);
  });
});
