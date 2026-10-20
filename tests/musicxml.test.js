import { describe, it, expect } from 'vitest';
import { newProject, newTrack, setChord, normalizeProject, cellOf, addPattern, toggleStep } from '../src/music/project.js';
import { projectXML, splitDur, fifthsOf } from '../src/music/musicxml.js';

describe('MusicXML из проекта', () => {
  it('длительности и тональность', () => {
    expect(splitDur(16)).toEqual([[16, 'whole']]);
    expect(splitDur(6)).toEqual([[4, 'quarter'], [2, 'eighth']]);
    expect(fifthsOf({ pc: 7, minor: false })).toBe(1);
    expect(fifthsOf({ pc: 9, minor: true })).toBe(0);
    expect(fifthsOf({ pc: 10, minor: false })).toBe(-2);
  });
  it('ноты, паузы, аккорды и лиги по тактам; ударные не идут', () => {
    const p = newProject({ num: 4, bpm: 100 }), pat = p.patterns[0];
    pat.bars = 2;
    cellOf(pat, p.tracks[2]).notes = [{ t: 1, d: 1, m: 60, v: 0.8 }, { t: 1, d: 1, m: 64, v: 0.8 }, { t: 3, d: 2, m: 67, v: 0.8 }];
    setChord(cellOf(pat, p.tracks[1]), 0, 4, 0, 'maj');
    toggleStep(cellOf(pat, p.tracks[0]), 'kick', 0);
    const x = projectXML(p, { title: 'Тест' });
    expect(x).toContain('<work-title>Тест</work-title>');
    expect(x).toContain('<per-minute>100</per-minute>');
    expect((x.match(/<part id=/g) || []).length).toBe(2);
    const bass = x.split('<part id="P2">')[1];
    expect(bass).toContain('<note><rest/><duration>4</duration><voice>1</voice><type>quarter</type></note>'); // пауза в начале
    expect(bass).toContain('<chord/><pitch><step>E</step>'); // две ноты вместе
    expect(bass).toContain('<tie type="start"/>'); // нота через тактовую черту
    expect((bass.match(/<measure /g) || []).length).toBe(2);
  });
  it('песня по плейлисту: такты всех паттернов по порядку', () => {
    const p = newProject(), a = p.patterns[0];
    a.bars = 1;
    cellOf(a, p.tracks[2]).notes = [{ t: 0, d: 1, m: 60, v: 0.8 }];
    const b = addPattern(p, 2);
    p.song = [a.id, b.id, a.id];
    const x = projectXML(p), bass = x.split('<part id="P2">')[1];
    expect((bass.match(/<measure /g) || []).length).toBe(4);
    expect((bass.match(/<step>C<\/step>/g) || []).length).toBe(2);
  });
  it('дорожка-петля не идёт в ноты', () => {
    const p = normalizeProject(newProject());
    p.tracks.push(newTrack('audio', 2, { fileId: 'f1' }));
    expect(p.tracks[3].kind).toBe('audio');
    expect((projectXML(p).match(/<part id=/g) || []).length).toBe(2);
  });
});
