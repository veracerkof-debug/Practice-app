import { describe, it, expect } from 'vitest';
import { newProject, newTrack, newData, addClip, setChord, normalizeProject, toggleStep } from '../src/music/project.js';
import { projectXML, splitDur, fifthsOf } from '../src/music/musicxml.js';

describe('MusicXML из проекта', () => {
  it('длительности и тональность', () => {
    expect(splitDur(16)).toEqual([[16, 'whole']]);
    expect(splitDur(6)).toEqual([[4, 'quarter'], [2, 'eighth']]);
    expect(fifthsOf({ pc: 7, minor: false })).toBe(1);
    expect(fifthsOf({ pc: 9, minor: true })).toBe(0);
    expect(fifthsOf({ pc: 10, minor: false })).toBe(-2);
  });
  it('ноты, паузы, аккорды и лиги по тактам; ударные — перкуссия', () => {
    const p = newProject({ num: 4, bpm: 100 });
    addClip(p, p.tracks[2], 0, 8, newData('notes', 2)).data.notes = [{ t: 1, d: 1, m: 60, v: 0.8 }, { t: 1, d: 1, m: 64, v: 0.8 }, { t: 3, d: 2, m: 67, v: 0.8 }];
    setChord(addClip(p, p.tracks[1], 0, 8, newData('chords', 2)).data, 0, 4, 0, 'maj');
    toggleStep(addClip(p, p.tracks[0], 0, 8, newData('drums', 2)).data, 'kick', 0);
    const x = projectXML(p, { title: 'Тест' });
    expect(x).toContain('<work-title>Тест</work-title>');
    expect(x).toContain('<per-minute>100</per-minute>');
    expect((x.match(/<part id=/g) || []).length).toBe(3);
    const dr = x.split('<part id="P1">')[1].split('<part id="P2">')[0];
    expect(dr).toContain('<sign>percussion</sign>');
    expect(dr).toContain('<unpitched><display-step>F</display-step><display-octave>4</display-octave></unpitched>');
    expect(x).toContain('<midi-unpitched>37</midi-unpitched>'); // бочка 36 → по правилу MusicXML +1
    const bass = x.split('<part id="P3">')[1];
    expect(bass).toContain('<note><rest/><duration>4</duration><voice>1</voice><type>quarter</type></note>'); // пауза в начале
    expect(bass).toContain('<chord/><pitch><step>E</step>'); // две ноты вместе
    expect(bass).toContain('<tie type="start"/>'); // нота через тактовую черту
    expect((bass.match(/<measure /g) || []).length).toBe(2);
  });
  it('песня по клипам: такты до конца последнего клипа, кусок повторяется', () => {
    const p = newProject();
    addClip(p, p.tracks[2], 0, 4, newData('notes', 1)).data.notes = [{ t: 0, d: 1, m: 60, v: 0.8 }];
    addClip(p, p.tracks[2], 12, 4, newData('notes', 1)).data.notes = [{ t: 0, d: 1, m: 60, v: 0.8 }];
    const x = projectXML(p), bass = x.split('<part id="P3">')[1];
    expect((bass.match(/<measure /g) || []).length).toBe(4);
    expect((bass.match(/<step>C<\/step>/g) || []).length).toBe(2);
  });
  it('дорожка-петля не идёт в ноты', () => {
    const p = normalizeProject(newProject());
    p.tracks.push(newTrack('audio', 2));
    addClip(p, p.tracks[3], 0, 8, { fileId: 'f1', off: 0 });
    expect(p.tracks[3].kind).toBe('audio');
    expect((projectXML(p).match(/<part id=/g) || []).length).toBe(3);
  });
});
