import { describe, it, expect } from 'vitest';
import { deg, jchord, JCHORDS, diatonic, iivi, voiceIIVI, VOICING_IDS, secondary, borrowed, pivots, subsIn, formIn, FORM_IDS, ust, roman, soWhat, chordDegree, JSCALE_GROUPS } from '../src/music/jazz.js';
import { scaleInfo, SCALES } from '../src/music/theory.js';

describe('джаз: ступени и аккорды', () => {
  it('ступени', () => {
    expect(deg('♭9')).toEqual({ iv: 13, li: 1 });
    expect(deg('♯11')).toEqual({ iv: 18, li: 3 });
    expect(deg('13')).toEqual({ iv: 21, li: 5 });
    expect(deg('♭♭7')).toEqual({ iv: 9, li: 6 });
  });
  it('правописание аккордов', () => {
    expect(jchord('C', '7alt').notes).toEqual(['C', 'E', 'B♭', 'D♭', 'D♯', 'F♯', 'A♭']);
    expect(jchord('D♭', 'maj7s11').notes).toEqual(['D♭', 'F', 'A♭', 'C', 'E♭', 'G']);
    expect(jchord('C', 'dim7').notes).toEqual(['C', 'E♭', 'G♭', 'B𝄫']);
    expect(jchord('F♯', 'm7b5').notes).toEqual(['F♯', 'A', 'C', 'E']);
    expect(jchord('G', '13').degs).toEqual(['1', '3', '5', '♭7', '9', '13']);
  });
  it('у всех аккордов ноты и звучание согласованы', () => {
    for (const [id] of JCHORDS) for (const r of ['C', 'E♭', 'F♯', 'B']) {
      const c = jchord(r, id);
      expect(c.notes.length).toBe(c.midis.length);
      c.midis.forEach((m, i) => expect(m % 12).toBe(c.pcs[i]));
    }
  });
  it('гаммы джаза: каждая нота — своя высота', () => {
    for (const [, ids] of JSCALE_GROUPS) for (const id of ids) {
      expect(SCALES[id]).toBeTruthy();
      const k = scaleInfo(2, id);
      expect(new Set(k.pcs).size).toBe(k.pcs.length);
      expect(k.notes.length).toBe(k.pcs.length);
    }
    expect(scaleInfo(0, 'bebdom').notes).toEqual(['C', 'D', 'E', 'F', 'G', 'A', 'B♭', 'B']);
    expect(scaleInfo(0, 'dimhw').degs).toEqual(['1', '♭2', '♯2', '3', '♯4', '5', '6', '♭7']);
  });
});

describe('джаз: тональность и обороты', () => {
  it('септаккорды мажора и мелодического минора', () => {
    expect(diatonic(7, 'major').map((c) => c.name)).toEqual(['Gmaj7', 'Am7', 'Bm7', 'Cmaj7', 'D7', 'Em7', 'F♯m7♭5']);
    expect(diatonic(0, 'mel').map((c) => c.rn)).toEqual(['i(maj7)', 'ii7', '♭IIImaj7♯5', 'IV7♯11', 'V7♭13', 'viø7', 'vii7alt'].map((x) => x.replace('vii7alt', 'VII7alt')));
  });
  it('II–V–I', () => {
    expect(iivi(10, false).map((c) => c.name)).toEqual(['Cm7', 'F7', 'B♭maj7']);
    expect(iivi(9, true).map((c) => c.name)).toEqual(['Bm7♭5', 'E7alt', 'Am6']);
  });
  it('обозначения ступеней', () => {
    expect(roman(1, 1, '7')).toBe('♭II7');
    expect(roman(6, 3, 'dim7')).toBe('♯iv°7');
    expect(roman(8, 5, 'maj7')).toBe('♭VImaj7');
  });
  it('голоса: вверх по порядку, A и B — без баса, в середине клавиатуры', () => {
    for (const id of VOICING_IDS) for (const minor of [false, true]) for (const pc of [0, 5, 11]) {
      voiceIIVI(pc, minor, id).forEach((v) => {
        for (let i = 1; i < v.midis.length; i++) expect(v.midis[i]).toBeGreaterThan(v.midis[i - 1]);
        expect(Math.max(...v.midis)).toBeLessThan(84);
      });
    }
    // rootless A в до мажоре: Dm7 — F A C E, G7 — F A B E, Cmaj7 — E G B D
    expect(voiceIIVI(0, false, 'rootA').map((v) => v.midis.map((m) => m % 12))).toEqual([[5, 9, 0, 4], [5, 9, 11, 4], [4, 7, 11, 2]]);
    // направляющие тоны: септима одного аккорда переходит в терцию следующего
    const g = voiceIIVI(0, false, 'guide').map((v) => v.midis.map((m) => m % 12));
    expect(g).toEqual([[5, 0], [5, 11], [4, 11]]);
  });
  it('вторичные доминанты и замены', () => {
    const s = secondary(0);
    expect(s.map((x) => x.v.name)).toEqual(['A7♭9', 'B7♭9', 'C7', 'D7', 'E7♭9']);
    expect(s.map((x) => x.sub.name)).toEqual(['E♭7', 'F7', 'G♭7', 'A♭7', 'B♭7']);
    expect(subsIn(0).find((x) => x.id === 'tritone').to.map((c) => c.name)).toEqual(['Dm7', 'D♭7', 'Cmaj7']);
    expect(subsIn(0).find((x) => x.id === 'coltrane').to.map((c) => c.name)).toEqual(['Dm7', 'E♭7', 'A♭maj7', 'B7', 'Emaj7', 'G7', 'Cmaj7']);
    expect(subsIn(0).find((x) => x.id === 'backdoor').to.map((c) => c.rn)).toEqual(['iv7', '♭VII7', 'Imaj7']);
  });
  it('заимствование и общие аккорды', () => {
    expect(borrowed(0).map((c) => c.name)).toContain('A♭maj7');
    expect(borrowed(0).map((c) => c.name)).toContain('B♭7');
    // до мажор и соль мажор: общие Cmaj7, Em7, Am7 (и G без септимы — разные: G7 и Gmaj7)
    expect(pivots(0, 7).map((p) => p.a.name)).toEqual(['Cmaj7', 'Em7', 'Am7']);
  });
  it('формы: 12 тактов блюза в фа', () => {
    for (const id of FORM_IDS) expect(formIn(5, id).length).toBeGreaterThan(0);
    expect(formIn(5, 'blues').map((b) => b[0].name)).toEqual(['F7', 'F7', 'F7', 'F7', 'B♭7', 'B♭7', 'F7', 'F7', 'C7', 'B♭7', 'F7', 'C7']);
  });
  it('верхние трезвучия и квартовые голоса', () => {
    expect(ust('G').map((u) => u.triad)).toEqual(['A', 'B♭', 'D♭', 'E♭', 'E', 'F']);
    expect(soWhat(4).map((m) => m % 12)).toEqual([4, 9, 2, 7, 11]);
    expect(chordDegree('dom', '7')).toBe(10);
    expect(chordDegree('min', '3')).toBe(3);
  });
});
