import { describe, it, expect } from 'vitest';
import { newProject, newTrack, normalizeProject, toggleNote, moveNote, resizeNote, setChord, chordAt, expandChords, diatonicChords, chordName, projectEvents, beatsOf } from '../src/music/project.js';

describe('студия: проект', () => {
  it('новый проект и порядок', () => {
    const p = normalizeProject(newProject({ bpm: 999, bars: 0 }));
    expect([p.bpm, p.bars, p.num, p.tracks.length, p.tracks[0].kind, p.tracks[1].inst]).toEqual([300, 4, 4, 2, 'chords', 'abass']);
    expect(beatsOf(newProject({ bars: 4, num: 3 }))).toBe(12);
  });
  it('ноты: поставить, убрать, двигать, длина — по сетке и в границах', () => {
    const p = newProject({ bars: 2 }), tr = newTrack('notes');
    const n = toggleNote(tr, 1.5, 60, 0.5);
    expect(n).toEqual({ t: 1.5, d: 0.5, m: 60, v: 0.8 });
    moveNote(p, n, 10, 3, 0.5);
    expect([n.t, n.m]).toEqual([7.5, 63]);
    resizeNote(p, n, 5, 0.5);
    expect(n.d).toBe(0.5);
    expect(toggleNote(tr, 7.5, 63, 0.5)).toBe(null);
    expect(tr.notes.length).toBe(0);
  });
  it('аккорды: перекрытие укорачивает, режимы разворачивают', () => {
    const p = newProject({ bars: 2, num: 4 }), tr = newTrack('chords');
    setChord(tr, 0, 4, 0, 'maj');
    setChord(tr, 2, 4, 7, 'maj');
    expect(tr.chords.map((c) => [c.t, c.d])).toEqual([[0, 2], [2, 4]]);
    expect(chordAt(tr, 3).pc).toBe(7);
    tr.mode = 'hold';
    expect(expandChords(tr, p).filter((n) => n.t === 0).map((n) => n.m)).toEqual([48, 52, 55]);
    tr.mode = 'arp'; tr.arp = { dir: 'updown', step: 0.5 };
    const arp = expandChords(tr, p).filter((n) => n.t < 2);
    expect(arp.map((n) => n.m)).toEqual([48, 52, 55, 52]);
    tr.mode = 'rhythm';
    expect(expandChords(tr, p).filter((n) => n.t < 2).length).toBe(6);
    expect(diatonicChords({ pc: 7, minor: false }).map((c) => c.label).slice(0, 3)).toEqual(['G', 'Am', 'Bm']);
    expect(chordName(9, 'min', true)).toBe('Am');
  });
  it('события MIDI: включения и выключения по темпу, тишина не идёт', () => {
    const p = newProject({ bpm: 120, bars: 1 });
    p.tracks[1].notes = [{ t: 1, d: 1, m: 40, v: 0.8 }];
    p.tracks[0].mute = true;
    const ev = projectEvents(p);
    expect(ev.map((e) => [e.k, e.t])).toEqual([['on', 0.5], ['off', 1]]);
  });
});
