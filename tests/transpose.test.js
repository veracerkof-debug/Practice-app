import { describe, it, expect } from 'vitest';
import { transposeChord, detectKey, shiftKey, keyLabel, tonicName, parseNote } from '../src/music/transpose.js';
import { lyricsHTML, chordsIn } from '../src/music/lyrics.js';

const C = { pc: 0, minor: false }, Am = { pc: 9, minor: true };
const tr = (list, n, k) => list.map((c) => transposeChord(c, n, k));

describe('транспонирование по ступеням', () => {
  it('до мажор → ре мажор: B♭ (♭VII) становится C, а не B♯; F♯ в соль, B♭ в фа', () => {
    expect(tr(['C', 'Am', 'F', 'G7', 'Bb', 'E7'], 2, C)).toEqual(['D', 'Bm', 'G', 'A7', 'C', 'F♯7']);
    expect(tr(['C', 'F', 'G', 'D/F#'], 7, C)).toEqual(['G', 'C', 'D', 'A/C♯']);
    expect(tr(['C', 'F', 'G', 'Bb'], 5, C)).toEqual(['F', 'B♭', 'C', 'E♭']);
  });
  it('в бемольных тональностях — бемоли, в диезных — диезы', () => {
    expect(tr(['C', 'Am', 'F', 'G'], 1, C)).toEqual(['D♭', 'B♭m', 'G♭', 'A♭']);
    expect(tr(['C', 'Am', 'F', 'G'], 4, C)).toEqual(['E', 'C♯m', 'A', 'B']);
    expect(tr(['Am', 'Dm', 'E7'], 1, Am)).toEqual(['B♭m', 'E♭m', 'F7']);
    expect(tr(['Am', 'Dm', 'E7'], -2, Am)).toEqual(['Gm', 'Cm', 'D7']);
    expect(tr(['Am', 'Dm', 'E7'], 2, Am)).toEqual(['Bm', 'Em', 'F♯7']);
  });
  it('суффиксы, бас, скобки и немецкое H сохраняются', () => {
    expect(transposeChord('Cmaj7/E', 2, C)).toBe('Dmaj7/F♯');
    expect(transposeChord('(G7sus4)', 2, C)).toBe('(A7sus4)');
    expect(transposeChord('Hm', 0, { pc: 11, minor: true })).toBe('Hm');
    expect(transposeChord('Hm', 1, { pc: 11, minor: true })).toBe('Cm');
    expect(transposeChord('Cm7b5', 2, { pc: 10, minor: true })).toBe('Dm7♭5');
  });
  it('шесть знаков: F♯ или G♭ — по исходному написанию', () => {
    expect(keyLabel(shiftKey({ pc: 4, minor: false, sharp: true }, 2))).toBe('F♯');
    expect(keyLabel(shiftKey({ pc: 3, minor: false, sharp: false }, 3))).toBe('G♭');
    expect(tonicName(3, true)).toBe('E♭');
    expect(parseNote('Bb').name).toBe('B♭');
  });
  it('тональность по аккордам', () => {
    expect(detectKey(['C', 'Am', 'F', 'G', 'C'])).toMatchObject({ pc: 0, minor: false });
    expect(detectKey(['Am', 'Dm', 'E7', 'Am'])).toMatchObject({ pc: 9, minor: true });
    expect(detectKey(['G', 'D', 'Em', 'C', 'G'])).toMatchObject({ pc: 7, minor: false });
    expect(detectKey(['Em', 'C', 'G', 'D', 'Em'])).toMatchObject({ pc: 4, minor: true });
    expect(detectKey([])).toBe(null);
  });
  it('текст: аккорды в скобках и строки аккордов', () => {
    const txt = 'C   Am\n[F]Строка [G]песни\n[Bb]и дальше';
    expect(chordsIn(txt)).toEqual(['C', 'Am', 'F', 'G', 'Bb']);
    expect(lyricsHTML(txt, 2, C)).toBe('<b class="chd">D</b>   <b class="chd">Bm</b>\n<b class="chd">G</b>Строка <b class="chd">A</b>песни\n<b class="chd">C</b>и дальше');
  });
});

import { parseDegree, chordToDegree, degreeToRoman, degreeToNash, degreeToChord } from '../src/music/degrees.js';
import { degreesIn } from '../src/music/lyrics.js';

describe('ступени', () => {
  const roman = (c, k) => degreeToRoman(chordToDegree(c, k)), nash = (c, k) => degreeToNash(chordToDegree(c, k));
  it('аккорды → римские цифры и нэшвиллская запись', () => {
    expect(['C', 'Dm7', 'Em', 'Fmaj7', 'G7', 'Am', 'Bm7b5', 'Bb', 'G/B', 'Csus4', 'Ab'].map((c) => roman(c, C)))
      .toEqual(['I', 'ii7', 'iii', 'IVmaj7', 'V7', 'vi', 'viiø7', '♭VII', 'V/7', 'Isus4', '♭VI']);
    expect(['C', 'Dm7', 'G7', 'Am', 'Bm7b5', 'Bb', 'G/B', 'E7'].map((c) => nash(c, C)))
      .toEqual(['1', '2m⁷', '5⁷', '6m', '7ø⁷', '♭7', '5/7', '3⁷']);
  });
  it('в миноре — по натуральному звукоряду', () => {
    expect(['Am', 'Dm', 'E7', 'C', 'G', 'F', 'Bdim'].map((c) => roman(c, Am))).toEqual(['i', 'iv', 'V7', 'III', 'VII', 'VI', 'ii°']);
  });
  it('ступени → аккорды в любой тональности', () => {
    const D = { pc: 2, minor: false };
    expect(['I', 'vi7', 'IV', 'V/7', '♭VII', 'viiø7'].map((r) => degreeToChord(parseDegree(r), D))).toEqual(['D', 'Bm7', 'G', 'A/C♯', 'C', 'C♯m7♭5']);
    expect(['1', '6m', '4', '5/7', 'b7'].map((r) => degreeToChord(parseDegree(r), C))).toEqual(['C', 'Am', 'F', 'G/B', 'B♭']);
    expect(degreeToRoman(parseDegree('6m7'))).toBe('vi7');
    expect(degreeToNash(parseDegree('IVmaj7'))).toBe('4maj⁷');
    expect(parseDegree('Am')).toBe(null);
    expect(parseDegree('12')).toBe(null);
    expect(degreeToRoman(parseDegree('57'))).toBe('V7');
    expect(degreeToRoman(parseDegree('2m⁷'))).toBe('ii7');
  });
  it('текст: любая запись — любой вид', () => {
    const chords = '[C]Раз [Am]два [F]три [G7]четыре';
    expect(lyricsHTML(chords, 0, C, { view: 'degrees' })).toBe('<b class="chd">I</b>Раз <b class="chd">vi</b>два <b class="chd">IV</b>три <b class="chd">V7</b>четыре');
    expect(lyricsHTML(chords, 0, C, { view: 'degrees', style: 'nash' })).toBe('<b class="chd">1</b>Раз <b class="chd">6m</b>два <b class="chd">4</b>три <b class="chd">5⁷</b>четыре');
    const degs = '1  6m  4  5\n[I]Раз [vi]два';
    expect(degreesIn(degs).length).toBe(6);
    expect(lyricsHTML(degs, 2, C)).toBe('<b class="chd">D</b>  <b class="chd">Bm</b>  <b class="chd">G</b>  <b class="chd">A</b>\n<b class="chd">D</b>Раз <b class="chd">Bm</b>два');
    // с буквенными аккордами числа — просто числа
    expect(lyricsHTML('C 1', 0, C)).toBe('C 1');
  });
});
