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
