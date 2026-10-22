import { describe, it, expect } from 'vitest';
import { fretNotes, tuningFor, TUNINGS } from '../src/music/tabfinger.js';
import { projectFromSong } from '../src/music/project.js';
import { projectXML } from '../src/music/musicxml.js';

const G = TUNINGS.guitar;
const pitchOf = (tf, tuning) => tuning[tuning.length - tf.s] + tf.f;

describe('аппликатура для табулатуры', () => {
  it('каждая нота — на струне, где звучит её высота', () => {
    const notes = [60, 62, 64, 65, 67, 69, 71, 72].map((m, i) => ({ t: i, d: 1, m }));
    const tf = fretNotes(notes, G);
    tf.forEach((x, i) => { expect(x).not.toBeNull(); expect(pitchOf(x, G)).toBe(notes[i].m); });
  });
  it('гамма до мажор — в одной позиции, без прыжков', () => {
    const notes = [48, 50, 52, 53, 55, 57, 59, 60].map((m, i) => ({ t: i, d: 1, m }));
    const fr = fretNotes(notes, G).map((x) => x.f).filter((f) => f > 0);
    expect(Math.max(...fr) - Math.min(...fr)).toBeLessThanOrEqual(4);
  });
  it('аккорд — разные струны, растяжка не больше 4 ладов', () => {
    const chord = [43, 47, 50, 55, 59, 67].map((m) => ({ t: 0, d: 1, m })); // соль мажор открытый
    const tf = fretNotes(chord, G);
    const strings = tf.map((x) => x.s);
    expect(new Set(strings).size).toBe(6);
    const fr = tf.map((x) => x.f).filter((f) => f > 0);
    expect(Math.max(...fr) - Math.min(...fr)).toBeLessThanOrEqual(4);
    tf.forEach((x, i) => expect(pitchOf(x, G)).toBe(chord[i].m));
  });
  it('нота вне грифа — без табулатуры', () => {
    expect(fretNotes([{ t: 0, d: 1, m: 30 }], G)[0]).toBeNull();
  });
  it('бас ниже ми — пятиструнный строй', () => {
    expect(tuningFor('bass', [{ m: 26 }])).toEqual(TUNINGS.bass5);
    expect(tuningFor('bass', [{ m: 40 }])).toEqual(TUNINGS.bass);
  });
  it('MusicXML: у гитары из .mid — строй и струна/лад, у фортепиано — нет', () => {
    const p = projectFromSong({ name: 't', bpm: 100, num: 4, den: 4, tracks: [
      { name: 'Guitar', program: 24, notes: [{ t: 0, d: 1, m: 64 }, { t: 1, d: 1, m: 67 }] },
      { name: 'Piano', program: 0, notes: [{ t: 0, d: 1, m: 60 }] },
    ] });
    const x = projectXML(p);
    const parts = x.split('<part id=');
    expect(parts[1]).toContain('<staff-lines>6</staff-lines>');
    expect(parts[1]).toContain('<staff-tuning line="1"><tuning-step>E</tuning-step><tuning-octave>2</tuning-octave>');
    expect(parts[1]).toMatch(/<technical><string>\d<\/string><fret>\d+<\/fret><\/technical>/);
    expect(parts[2]).not.toContain('staff-tuning');
  });
});
