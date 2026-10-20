import { describe, it, expect } from 'vitest';
import { newProject, newTrack, newData, newClip, normalizeProject, toggleNote, moveNote, resizeNote, setChord, chordAt, expandChords, diatonicChords, chordName, projectEvents, dataBeats, songBeats, songBars, songNotes, clipNotes, countOf, toggleStep, stepOn, drumNotes, addClip, dupClip, moveClip, resizeClip, trimClipStart, splitClip, removeClip, clipAt, clipsOf, isEmptyProject, CLIPS_MAX } from '../src/music/project.js';

describe('студия: проект', () => {
  it('новый проект: дорожки, клипов нет, песня — 4 такта', () => {
    const p = normalizeProject(newProject({ bpm: 999, bars: 0 }));
    expect([p.bpm, p.num, p.tracks.map((t) => t.kind), p.clips, p.bars]).toEqual([300, 4, ['drums', 'chords', 'notes'], [], undefined]);
    expect(p.tracks[2].inst).toBe('abass');
    expect(dataBeats(newProject({ num: 3 }), newData('notes', 4))).toBe(12);
    expect([songBeats(p), songBars(p), isEmptyProject(p)]).toEqual([4, 1, true]);
  });
  it('ноты: поставить, убрать, двигать, длина — по сетке и в границах куска', () => {
    const p = newProject(), d = newData('notes', 2), total = dataBeats(p, d);
    const n = toggleNote(d, 1.5, 60, 0.5);
    expect(n).toEqual({ t: 1.5, d: 0.5, m: 60, v: 0.8 });
    moveNote(total, n, 10, 3, 0.5);
    expect([n.t, n.m]).toEqual([7.5, 63]);
    resizeNote(total, n, 5, 0.5);
    expect(n.d).toBe(0.5);
    expect(countOf(p.tracks[2], d)).toBe(1);
    expect(toggleNote(d, 7.5, 63, 0.5)).toBe(null);
    expect(d.notes.length).toBe(0);
  });
  it('аккорды: перекрытие укорачивает, режимы разворачивают', () => {
    const p = newProject({ num: 4 }), tr = newTrack('chords'), d = newData('chords', 2);
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
  it('ударные: шаги — шестнадцатые, сильные громче, за концом куска — срезаются', () => {
    const p = newProject(), tr = p.tracks[0], c = addClip(p, tr, 0, 0, newData('drums', 1)), d = c.data;
    expect(toggleStep(d, 'kick', 0)).toBe(true);
    toggleStep(d, 'kick', 8); toggleStep(d, 'hat', 2); toggleStep(d, 'hat', 99);
    expect(stepOn(d, 'kick', 8)).toBe(true);
    expect(drumNotes(d).map((n) => [n.drum, n.t, n.v])).toEqual([['kick', 0, 0.9], ['kick', 2, 0.9], ['hat', 0.5, 0.7], ['hat', 24.75, 0.7]]);
    normalizeProject(p);
    expect(c.data.steps.hat).toEqual([2]);
    expect(toggleStep(c.data, 'kick', 0)).toBe(false);
    expect(countOf(tr, c.data)).toBe(2);
  });
  it('клипы: кусок повторяется на длину клипа, песня — до конца последнего клипа целыми тактами', () => {
    const p = newProject(), tr = p.tracks[2], c = addClip(p, tr, 4, 12, newData('notes', 1));
    toggleNote(c.data, 0, 60, 1);
    expect([c.at, c.len]).toEqual([4, 12]);
    expect(clipNotes(p, tr, c).map((n) => n.t)).toEqual([4, 8, 12]);
    expect(songBeats(p)).toBe(16);
    resizeClip(p, c, 13.2, 1);
    expect(c.len).toBe(13);
    expect(songBeats(p)).toBe(20);
    expect(songNotes(p).map((n) => [n.t, n.m])).toEqual([[4, 60], [8, 60], [12, 60], [16, 60]]);
    expect(songNotes(p, c).map((n) => n.t)).toEqual([0, 4, 8, 12]); // один клип — от его начала
    expect(isEmptyProject(p)).toBe(false);
  });
  it('клипы: двигать, обрезать слева, дублировать, резать, убирать; на другую дорожку — только того же рода', () => {
    const p = newProject(), keys = p.tracks[2], bass = newTrack('notes', 3);
    p.tracks.push(bass);
    const c = addClip(p, keys, 0, 8, newData('notes', 1));
    toggleNote(c.data, 0, 60, 1);
    moveClip(p, c, 2.4, bass.id, 1);
    expect([c.at, c.tr]).toEqual([2, bass.id]);
    moveClip(p, c, 2, p.tracks[0].id, 1); // ударные — не туда
    expect(c.tr).toBe(bass.id);
    trimClipStart(p, c, 4, 1);
    expect([c.at, c.len]).toEqual([4, 6]);
    expect(clipAt(p, bass, 5)).toBe(c); expect(clipAt(p, bass, 3)).toBe(null);
    const d = dupClip(p, c);
    expect([d.at, d.len, d.tr, d.data !== c.data]).toEqual([10, 6, bass.id, true]);
    const e = splitClip(p, c, 7, 1);
    expect([c.at, c.len, e.at, e.len]).toEqual([4, 3, 7, 3]);
    expect(clipsOf(p, bass).map((x) => x.at)).toEqual([4, 7, 10]);
    removeClip(p, d);
    expect(p.clips.length).toBe(2);
  });
  it('запись: обрезка слева сдвигает место в файле, разрез — тоже', () => {
    const p = newProject({ bpm: 120 }), au = newTrack('audio', 3);
    p.tracks.push(au);
    const c = addClip(p, au, 0, 8, { fileId: 'f1', off: 0 });
    trimClipStart(p, c, 2, 1);
    expect([c.at, c.len, c.data.off]).toEqual([2, 6, 1]); // 2 доли при 120 — 1 с
    const n = splitClip(p, c, 4, 1);
    expect([n.at, n.len, n.data.off]).toEqual([4, 4, 2]);
    expect(normalizeProject(p).clips.length).toBe(2);
  });
  it('старый проект (паттерны и плейлист) переезжает в клипы: одинаковые куски подряд сливаются', () => {
    const p = normalizeProject({ id: 'x', bpm: 100, num: 4, tracks: [{ id: 't1', kind: 'chords' }, { id: 't2', kind: 'notes' }, { id: 't3', kind: 'audio', fileId: 'f9' }],
      patterns: [{ id: 'a', bars: 1, data: { t1: { chords: [{ t: 0, d: 4, pc: 0, type: 'maj' }] }, t2: { notes: [{ t: 1, d: 1, m: 60, v: 0.8 }] } } }, { id: 'b', bars: 2, data: { t2: { notes: [{ t: 0, d: 1, m: 62, v: 0.8 }] } } }],
      song: ['a', 'a', 'b'], cur: 'a' });
    expect([p.patterns, p.song, p.cur]).toEqual([undefined, undefined, undefined]);
    expect(clipsOf(p, p.tracks[0]).map((c) => [c.at, c.len, c.data.bars])).toEqual([[0, 8, 1]]); // A A → один клип на 2 такта
    expect(clipsOf(p, p.tracks[1]).map((c) => [c.at, c.len])).toEqual([[0, 8], [8, 8]]);
    expect(clipsOf(p, p.tracks[2]).map((c) => [c.at, c.len, c.data.fileId])).toEqual([[0, 16, 'f9']]);
    expect(p.tracks[2].fileId).toBe(undefined);
    expect(songNotes(p).filter((n) => n.tr.kind === 'notes').map((n) => [n.t, n.m])).toEqual([[1, 60], [5, 60], [8, 62]]);
  });
  it('совсем старый проект (ноты в дорожках) — тоже в клипы', () => {
    const p = normalizeProject({ id: 'x', bpm: 100, bars: 2, tracks: [{ id: 't1', kind: 'chords', chords: [{ t: 0, d: 4, pc: 0, type: 'maj' }] }, { id: 't2', kind: 'notes', notes: [{ t: 1, d: 1, m: 60, v: 0.8 }] }] });
    expect(p.clips.map((c) => [c.tr, c.at, c.len, c.data.bars])).toEqual([['t1', 0, 8, 2], ['t2', 0, 8, 2]]);
    expect(p.tracks[1].notes).toBe(undefined);
  });
  it('нормализация: клипы чужих дорожек и мусор — прочь, не больше лимита', () => {
    const p = newProject(), tr = p.tracks[2];
    p.clips = [{ id: 'z', tr: 'nope', at: 0, len: 4, data: {} }, { id: 'y', tr: tr.id, at: -3, len: 0, data: { bars: 999, notes: [{ t: -1, d: 1, m: 60 }, { t: 1, d: 100, m: 60, v: 0.8 }] } }];
    normalizeProject(p);
    expect(p.clips.length).toBe(1);
    expect([p.clips[0].at, p.clips[0].len, p.clips[0].data.bars, p.clips[0].data.notes]).toEqual([0, 256, 64, [{ t: 1, d: 100, m: 60, v: 0.8 }]]);
    for (let i = 0; i < CLIPS_MAX + 5; i++) addClip(p, tr, i * 4, 4, newData('notes', 1));
    expect(p.clips.length).toBe(CLIPS_MAX);
    expect(newClip(p, tr, 0).len).toBe(4);
  });
  it('события MIDI: включения и выключения по темпу, тишина не идёт, ударные — нотами GM', () => {
    const p = newProject({ bpm: 120 });
    toggleNote(addClip(p, p.tracks[2], 0, 4, newData('notes', 1)).data, 1, 60, 1);
    toggleStep(addClip(p, p.tracks[0], 0, 4, newData('drums', 1)).data, 'snare', 4);
    setChord(addClip(p, p.tracks[1], 0, 4, newData('chords', 1)).data, 0, 4, 0, 'maj');
    p.tracks[1].mute = true;
    const ev = projectEvents(p);
    expect(ev.map((e) => [e.k, e.t, e.m])).toEqual([['on', 0.5, 38], ['on', 0.5, 60], ['off', 0.625, undefined], ['off', 1, undefined]]);
  });
});
