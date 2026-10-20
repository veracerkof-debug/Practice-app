import { describe, it, expect } from 'vitest';
import { newProject, newTrack, newPattern, normalizeProject, toggleNote, moveNote, resizeNote, setChord, chordAt, expandChords, diatonicChords, chordName, projectEvents, patBeats, songBeats, songNotes, cellOf, countOf, toggleStep, stepOn, drumNotes, addPattern, clonePattern, removePattern, songAdd, songMove, isEmptyProject, PATTERNS_MAX } from '../src/music/project.js';

describe('студия: проект', () => {
  it('новый проект: дорожки, один паттерн, плейлист из него', () => {
    const p = normalizeProject(newProject({ bpm: 999, bars: 0 }));
    expect([p.bpm, p.num, p.tracks.map((t) => t.kind), p.patterns.length, p.patterns[0].bars, p.song, p.cur]).toEqual([300, 4, ['drums', 'chords', 'notes'], 1, 4, [p.patterns[0].id], p.patterns[0].id]);
    expect(p.tracks[2].inst).toBe('abass');
    expect(patBeats(newProject({ num: 3 }), newPattern(0, 4))).toBe(12);
    expect(isEmptyProject(p)).toBe(true);
  });
  it('ноты: поставить, убрать, двигать, длина — по сетке и в границах паттерна', () => {
    const p = newProject(), pat = p.patterns[0], d = cellOf(pat, p.tracks[2]);
    pat.bars = 2;
    const n = toggleNote(d, 1.5, 60, 0.5);
    expect(n).toEqual({ t: 1.5, d: 0.5, m: 60, v: 0.8 });
    moveNote(patBeats(p, pat), n, 10, 3, 0.5);
    expect([n.t, n.m]).toEqual([7.5, 63]);
    resizeNote(patBeats(p, pat), n, 5, 0.5);
    expect(n.d).toBe(0.5);
    expect(countOf(pat, p.tracks[2])).toBe(1);
    expect(toggleNote(d, 7.5, 63, 0.5)).toBe(null);
    expect(d.notes.length).toBe(0);
  });
  it('аккорды: перекрытие укорачивает, режимы разворачивают', () => {
    const p = newProject({ num: 4 }), tr = newTrack('chords'), d = { chords: [] };
    setChord(d, 0, 4, 0, 'maj');
    setChord(d, 2, 4, 7, 'maj');
    expect(d.chords.map((c) => [c.t, c.d])).toEqual([[0, 2], [2, 4]]);
    expect(chordAt(d, 3).pc).toBe(7);
    tr.mode = 'hold';
    expect(expandChords(d, tr, p).filter((n) => n.t === 0).map((n) => n.m)).toEqual([48, 52, 55]);
    tr.mode = 'arp'; tr.arp = { dir: 'updown', step: 0.5 };
    expect(expandChords(d, tr, p).filter((n) => n.t < 2).map((n) => n.m)).toEqual([48, 52, 55, 52]);
    tr.mode = 'rhythm';
    expect(expandChords(d, tr, p).filter((n) => n.t < 2).length).toBe(6);
    expect(diatonicChords({ pc: 7, minor: false }).map((c) => c.label).slice(0, 3)).toEqual(['G', 'Am', 'Bm']);
    expect(chordName(9, 'min', true)).toBe('Am');
  });
  it('ударные: шаги — шестнадцатые, сильные громче, за концом паттерна — срезаются', () => {
    const p = newProject(), pat = p.patterns[0], tr = p.tracks[0], d = cellOf(pat, tr);
    expect(toggleStep(d, 'kick', 0)).toBe(true);
    toggleStep(d, 'kick', 8); toggleStep(d, 'hat', 2); toggleStep(d, 'hat', 99);
    expect(stepOn(d, 'kick', 8)).toBe(true);
    expect(drumNotes(d).map((n) => [n.drum, n.t, n.v])).toEqual([['kick', 0, 0.9], ['kick', 2, 0.9], ['hat', 0.5, 0.7], ['hat', 24.75, 0.7]]);
    normalizeProject(p);
    expect(d.steps.hat).toEqual([2]);
    expect(toggleStep(d, 'kick', 0)).toBe(false);
    expect(countOf(pat, tr)).toBe(2);
  });
  it('паттерны и песня: добавить, дублировать, плейлист со смещением, удалить', () => {
    const p = newProject(), a = p.patterns[0];
    a.bars = 1;
    toggleNote(cellOf(a, p.tracks[2]), 0, 60, 1);
    const b = addPattern(p, 2);
    expect([p.patterns.length, p.cur, b.bars, b.name]).toEqual([2, b.id, 2, 'B']);
    toggleNote(cellOf(b, p.tracks[2]), 1, 62, 1);
    p.song = [a.id, b.id, a.id];
    expect(songBeats(p)).toBe(4 + 8 + 4);
    expect(songNotes(p).map((n) => [n.t, n.m])).toEqual([[0, 60], [5, 62], [12, 60]]);
    expect(songNotes(p, b).map((n) => [n.t, n.m])).toEqual([[1, 62]]);
    songMove(p, 2, 0);
    expect(p.song).toEqual([a.id, a.id, b.id]);
    const c = clonePattern(p, a);
    expect([c.name, c.bars, countOf(c, p.tracks[2]), p.patterns.indexOf(c)]).toEqual(["A'", 1, 1, 1]);
    expect(songAdd(p, c)).toBe(true);
    expect(removePattern(p, a)).toBe(true);
    expect(p.song).toEqual([b.id, c.id]);
    expect(isEmptyProject(p)).toBe(false);
    for (let i = p.patterns.length; i < PATTERNS_MAX; i++) addPattern(p);
    expect(addPattern(p)).toBe(null);
  });
  it('старый проект (ноты в дорожках) переезжает в один паттерн', () => {
    const p = normalizeProject({ id: 'x', bpm: 100, bars: 2, tracks: [{ id: 't1', kind: 'chords', chords: [{ t: 0, d: 4, pc: 0, type: 'maj' }] }, { id: 't2', kind: 'notes', notes: [{ t: 1, d: 1, m: 60, v: 0.8 }] }] });
    expect([p.patterns.length, p.patterns[0].bars, p.song.length, p.bars]).toEqual([1, 2, 1, undefined]);
    expect(p.patterns[0].data.t1.chords.length).toBe(1);
    expect(p.patterns[0].data.t2.notes[0].m).toBe(60);
    expect(p.tracks[1].notes).toBe(undefined);
  });
  it('события MIDI: включения и выключения по темпу, тишина не идёт, ударные — нотами GM', () => {
    const p = newProject({ bpm: 120 }), pat = p.patterns[0];
    pat.bars = 1;
    toggleNote(cellOf(pat, p.tracks[2]), 1, 60, 1);
    toggleStep(cellOf(pat, p.tracks[0]), 'snare', 4);
    p.tracks[1].mute = true;
    const ev = projectEvents(p);
    expect(ev.map((e) => [e.k, e.t, e.m])).toEqual([['on', 0.5, 38], ['on', 0.5, 60], ['off', 0.625, undefined], ['off', 1, undefined]]);
  });
});
