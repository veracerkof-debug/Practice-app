import { describe, it, expect } from 'vitest';
import { runLegacy } from './legacy.js';
import { CH_RE, trChord, lyricsHTML } from '../src/music/lyrics.js';

const proto = runLegacy([/^const esc=/, /^const SH=/, /^const LETTERS=/, /^const CH_RE=/, /^function trChord\(/, /^function lyricsHTML\(/],
  '{CH_RE,trChord,lyricsHTML}', { RegExp });

const CHORDS = ['Am', 'F', 'C', 'G', 'C#m7', 'Db', 'Bb/D', 'H7', 'Hm', 'Esus4', 'Gmaj7', 'F#dim', 'Aadd9', '(E7)', 'Cm7b5', 'Ab+', 'B°', 'Bø', 'G6', 'D/F#', 'Ebmaj7', 'X', 'Am!'];
const TEXT = 'Am        F\nСтрочка песни <тут> & "так"\n\nили в строке: [Am]Строчка [F#]песни [x]\n| C  G  | Am - F |\nC x2\nEb / Bb';

describe('текст и аккорды — как в прототипе', () => {
  it('распознавание аккордов', () => {
    for (const c of CHORDS) expect(CH_RE.test(c), c).toBe(proto.CH_RE.test(c));
  });
  it('транспонирование на −11…+11', () => {
    for (let n = -11; n <= 11; n++) for (const c of CHORDS) expect(trChord(c, n), c + ' ' + n).toBe(proto.trChord(c, n));
  });
  it('разметка текста', () => {
    for (let n = -11; n <= 11; n++) expect(lyricsHTML(TEXT, n)).toBe(proto.lyricsHTML(TEXT, n));
    expect(lyricsHTML('Am F', 2)).toBe('<b class="chd">Bm</b> <b class="chd">G</b>');
  });
});
