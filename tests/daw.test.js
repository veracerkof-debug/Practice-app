import { describe, it, expect } from 'vitest';
import { writeMidiTracks } from '../src/music/midi.js';
import { readMidiSong, readAls, readRpp, readFlp, dawFmt } from '../src/music/daw.js';
import { newProject, newData, addClip, clipsOf, toggleNote, toggleStep, projectTracks, projectFromSong, laneOf, instOfProgram } from '../src/music/project.js';

const bass = { t: 0, d: 1, m: 40, v: 0.8 }, hat = { t: 0.5, d: 0.25, m: 42, v: 0.7 };

describe('обмен со студиями', () => {
  it('.mid формат 1: туда и обратно — дорожки, канал ударных, темп, размер, тональность', () => {
    const u8 = writeMidiTracks({ bpm: 100, num: 3, den: 4, key: { pc: 7, minor: false }, name: 'Песня', tracks: [{ name: 'Bass', program: 33, notes: [bass] }, { name: 'Drums', ch: 9, notes: [hat] }] });
    expect(String.fromCharCode(...u8.subarray(0, 4))).toBe('MThd');
    expect([u8[9], u8[11]]).toEqual([1, 3]); // формат 1, три дорожки
    const s = readMidiSong(u8);
    expect([s.bpm, s.num, s.den, s.name, s.key]).toEqual([100, 3, 4, 'Песня', { pc: 7, minor: false }]);
    expect(s.tracks.map((t) => [t.name, t.drums, t.program])).toEqual([['Bass', false, 33], ['Drums', true, null]]);
    expect(s.tracks[0].notes[0]).toMatchObject({ t: 0, d: 1, m: 40 });
    expect(s.tracks[1].notes[0]).toMatchObject({ t: 0.5, d: 0.25, m: 42 });
  });
  it('проект → дорожки для DAW: свинг запечён, ударные — ноты GM', () => {
    const p = newProject({ bpm: 120 });
    p.swing = 0.6;
    toggleNote(addClip(p, p.tracks[2], 0, 4, newData('notes', 1)).data, 0.5, 60, 0.5);
    toggleStep(addClip(p, p.tracks[0], 0, 4, newData('drums', 1)).data, 'snare', 4);
    const tr = projectTracks(p);
    expect(tr.map((t) => [t.drums, t.program])).toEqual([[true, null], [false, 89], [false, 33]]);
    expect(tr[0].notes[0]).toMatchObject({ t: 1, m: 38 });
    expect(tr[2].notes[0].t).toBeCloseTo(0.5 + 0.2, 6);
    expect(projectTracks(p, { swing: false })[2].notes[0].t).toBe(0.5);
  });
  it('чужая песня → проект: дорожка — клип на всю длину, кусок до 64 тактов, ударные — шаги', () => {
    const song = { name: 'X', bpm: 90, num: 4, den: 4, tracks: [
      { name: 'Keys', drums: false, program: 90, notes: [{ t: 0, d: 2, m: 60, v: 0.8 }, { t: 127, d: 2, m: 64, v: 0.8 }] },
      { name: 'Drums', drums: true, notes: [{ t: 0, d: 0.25, m: 36, v: 0.9 }, { t: 1, d: 0.25, m: 38, v: 0.9 }, { t: 1.5, d: 0.25, m: 46, v: 0.9 }] },
    ] };
    const p = projectFromSong(song);
    expect([p.bpm, p.name, p.tracks.map((t) => [t.kind, t.inst]), p.clips.length]).toEqual([90, 'X', [['notes', 'wair'], ['drums', 'piano']], 2]);
    const keys = clipsOf(p, p.tracks[0]), dr = clipsOf(p, p.tracks[1]);
    expect(keys.map((c) => [c.at, c.len, c.data.bars])).toEqual([[0, 132, 33]]); // 33 такта одним клипом
    expect(keys[0].data.notes).toEqual([{ t: 0, d: 2, m: 60, v: 0.8 }, { t: 127, d: 2, m: 64, v: 0.8 }]);
    expect(dr[0].data.steps).toEqual({ kick: [0], snare: [4], ohat: [6] });
    expect(dr[0].len).toBe(4); // удары до 1,75 доли — один такт

    expect(laneOf(null, 'Clap 909')).toBe('clap');
    expect(laneOf(49)).toBe('ohat');
    expect(instOfProgram(35)).toBe('abass');
  });
  it('Ableton .als: темп, размер, клип в аранжировке, петля повторяется, Drum Rack — ударные', () => {
    const xml = '<?xml version="1.0"?><Ableton><LiveSet><Tracks>' +
      '<MidiTrack Id="1"><Name><EffectiveName Value="Bass"/></Name><DeviceChain><MainSequencer><ClipTimeable><ArrangerAutomation><Events>' +
      '<MidiClip Id="0" Time="4"><CurrentStart Value="4"/><CurrentEnd Value="8"/><Loop><LoopStart Value="0"/><LoopEnd Value="2"/><LoopOn Value="true"/></Loop>' +
      '<Notes><KeyTracks><KeyTrack Id="0"><Notes><MidiNoteEvent Time="0" Duration="1" Velocity="100" IsEnabled="true"/><MidiNoteEvent Time="1" Duration="0.5" Velocity="64"/></Notes><MidiKey Value="40"/></KeyTrack></KeyTracks></Notes></MidiClip>' +
      '</Events></ArrangerAutomation></ClipTimeable></MainSequencer></DeviceChain></MidiTrack>' +
      '<MidiTrack Id="2"><Name><EffectiveName Value="Kit"/></Name><DeviceChain><DeviceChain><Devices><DrumGroupDevice/></Devices></DeviceChain><MainSequencer><ClipTimeable><ArrangerAutomation><Events>' +
      '<MidiClip Id="1"><CurrentStart Value="0"/><CurrentEnd Value="1"/><Loop><LoopStart Value="0"/><LoopEnd Value="1"/><LoopOn Value="false"/></Loop><Notes><KeyTracks><KeyTrack><Notes><MidiNoteEvent Time="0" Duration="0.25" Velocity="127"/></Notes><MidiKey Value="36"/></KeyTrack></KeyTracks></Notes></MidiClip>' +
      '</Events></ArrangerAutomation></ClipTimeable></MainSequencer></DeviceChain></MidiTrack></Tracks>' +
      '<MasterTrack><DeviceChain><Mixer><Tempo><Manual Value="128"/></Tempo><TimeSignature><TimeSignatures><RemoteableTimeSignature><Numerator Value="6"/><Denominator Value="8"/></RemoteableTimeSignature></TimeSignatures></TimeSignature></Mixer></DeviceChain></MasterTrack>' +
      '</LiveSet></Ableton>';
    const s = readAls(xml);
    expect([s.bpm, s.num, s.den]).toEqual([128, 6, 8]);
    expect(s.tracks.map((t) => [t.name, t.drums])).toEqual([['Bass', false], ['Kit', true]]);
    // четверти → восьмые (размер x/8): клип с 4-й четверти = 8-я восьмая; петля в 2 четверти повторяется дважды
    expect(s.tracks[0].notes.map((n) => [n.t, n.d, n.m])).toEqual([[8, 2, 40], [10, 1, 40], [12, 2, 40], [14, 1, 40]]);
    expect(s.tracks[1].notes[0]).toMatchObject({ t: 0, m: 36 });
  });
  it('Reaper .rpp: темп, дорожки, MIDI-элементы', () => {
    const rpp = ['<REAPER_PROJECT 0.1 "6.0" 1', '  TEMPO 120 4 4', '  <TRACK {x}', '    NAME "Piano"', '    <ITEM', '      POSITION 2', '      LENGTH 4', '      <SOURCE MIDI', '        HASDATA 1 960 QN',
      '        E 0 90 3c 60', '        E 960 80 3c 00', '        E 0 91 40 50', '        e 480 81 40 00', '      >', '    >', '  >', '  <TRACK {y}', '    NAME "Drums"', '    <ITEM', '      POSITION 0', '      LENGTH 1', '      <SOURCE MIDI', '        HASDATA 1 960 QN', '        E 0 99 24 7f', '        E 240 89 24 00', '      >', '    >', '  >', '>'].join('\n');
    const s = readRpp(rpp);
    expect([s.bpm, s.num, s.den, s.tracks.length]).toEqual([120, 4, 4, 2]);
    expect(s.tracks[0].notes.map((n) => [n.t, n.d, n.m])).toEqual([[4, 1, 60], [5, 0.5, 64]]); // позиция 2 с = 4 четверти
    expect([s.tracks[1].drums, s.tracks[1].notes[0].m]).toEqual([true, 36]);
  });
  it('FL Studio .flp: каналы, паттерн с нотами, плейлист, темп', () => {
    const b = [];
    const byte = (id, v) => b.push(id, v), word = (id, v) => b.push(id, v & 255, v >> 8), dword = (id, v) => b.push(id, v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255);
    const text = (id, s) => { const u = []; for (const c of s) u.push(c.charCodeAt(0) & 255, c.charCodeAt(0) >> 8); b.push(id, u.length, ...u); };
    const data = (id, arr) => { b.push(id); let n = arr.length; do { b.push((n & 0x7f) | (n > 127 ? 0x80 : 0)); n >>= 7; } while (n); b.push(...arr); };
    text(199, '20.8.3'); byte(17, 4); byte(18, 4); dword(156, 140000); text(194, 'Трек');
    word(64, 0); byte(21, 0); text(192, 'Kick');
    word(64, 1); byte(21, 2); text(192, 'Bass');
    const note = (tk, ch, len, m, v) => [tk & 255, (tk >> 8) & 255, 0, 0, 0, 0, ch, 0, len & 255, (len >> 8) & 255, 0, 0, m, 0, 0, 0, 120, 0, 64, 0, 64, v, 128, 128];
    word(65, 1); text(193, 'Beat'); data(224, [...note(0, 0, 24, 60, 100), ...note(96, 0, 24, 60, 100), ...note(0, 1, 192, 36, 90)]);
    const item = (tk, pat, len) => { const f = new Uint8Array(32), v = new DataView(f.buffer); v.setUint32(0, tk, true); v.setUint16(4, 20480, true); v.setUint16(6, 20480 + pat - 1, true); v.setUint32(8, len, true); v.setFloat32(24, -1, true); v.setFloat32(28, -1, true); return [...f]; };
    data(225, [...item(0, 1, 384), ...item(384, 1, 384)]);
    const body = new Uint8Array(b), hdr = [0x46, 0x4c, 0x68, 0x64, 6, 0, 0, 0, 0, 0, 2, 0, 96, 0], dt = [0x46, 0x4c, 0x64, 0x74, body.length & 255, (body.length >> 8) & 255, 0, 0];
    const s = readFlp(new Uint8Array([...hdr, ...dt, ...body]));
    expect([s.bpm, s.num, s.den, s.name]).toEqual([140, 4, 4, 'Трек']);
    expect(s.tracks.map((t) => [t.name, t.drums])).toEqual([['Kick', true], ['Bass', false]]);
    expect(s.tracks[0].notes.map((n) => [n.t, n.lane])).toEqual([[0, 'Kick'], [1, 'Kick'], [4, 'Kick'], [5, 'Kick']]); // паттерн дважды по плейлисту
    expect(s.tracks[1].notes.map((n) => [n.t, n.d, n.m])).toEqual([[0, 2, 36], [4, 2, 36]]);
    expect(dawFmt('song.FLP')).toBe('flp'); expect(dawFmt('a.midi')).toBe('mid'); expect(dawFmt('a.txt')).toBe(null);
  });
});
