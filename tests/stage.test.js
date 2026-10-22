import { describe, it, expect } from 'vitest';
import { itemOf, setItem, moveSong, songKey, barSec, resumeOk, tracksOf, chordsAbove } from '../src/core/stage.js';
import { lyricsHTML } from '../src/music/lyrics.js';

const song = { id: 's1', title: 'Песня', key: 'G', targetBpm: 72, notes: '[G]Слово [C]ещё' };
const files = [{ id: 'f1', name: 'минус.mp3', songs: ['s1'] }, { id: 'f2', kind: 'tab', songs: ['s1'] }, { id: 'f3', songs: ['x'] }];

describe('сет-лист', () => {
  it('настройки пункта по умолчанию — из песни', () => {
    const it0 = itemOf({}, song, files);
    expect([it0.bpm, it0.track, it0.click, it0.count, it0.pad, it0.text]).toEqual([72, 'f1', false, true, false, true]);
    const it1 = itemOf({}, song, []);
    expect([it1.click, it1.pad, it1.count]).toEqual([true, true, false]);
    expect(tracksOf(files, 's1').map((r) => r.id)).toEqual(['f1']);
  });
  it('свои настройки и сдвиг тональности', () => {
    const ev = { songs: ['s1'] };
    setItem(ev, 's1', { bpm: 500, tr: 2, track: '', pad: true });
    const it = itemOf(ev, song, files);
    expect([it.bpm, it.tr, it.track, it.pad, it.key.pc]).toEqual([300, 2, '', true, 9]); // G + 2 = A
    setItem(ev, 's1', { bpm: null });
    expect(itemOf(ev, song, files).bpm).toBe(72);
  });
  it('порядок, тональность по тексту, такт, возврат на сцену', () => {
    const ev = { songs: ['a', 'b', 'c'] };
    moveSong(ev, 2, -1);
    expect(ev.songs).toEqual(['a', 'c', 'b']);
    moveSong(ev, 0, -1);
    expect(ev.songs).toEqual(['a', 'c', 'b']);
    expect(songKey({ notes: '[Am]a [Dm]b [E]c [Am]d' }).minor).toBe(true);
    expect(songKey({})).toBe(null);
    expect(barSec(120, 4)).toBe(2);
    expect(resumeOk({ ev: 'e1', i: 2, at: Date.now() })).toBe(true);
    expect(resumeOk({ ev: 'e1', i: 2, at: Date.now() - 7 * 3600000 })).toBe(false);
  });
  it('аккорды над словами', () => {
    const [c, w] = chordsAbove('[G]О Господь мой [C]Бог').split('\n');
    expect([c.indexOf('G'), c.indexOf('C')]).toEqual([w.indexOf('О'), w.indexOf('Бог')]);
    expect(chordsAbove('[Am][F]Слово')).toBe('Am F\n   Слово'); // слово — под последним аккордом
    expect(chordsAbove('просто строка')).toBe('просто строка');
    expect(lyricsHTML(chordsAbove('[G]Слово'), 2)).toContain('<b class="chd">A</b>');
  });
});

// Капо (ночь 22.10.2026): у песни — song.capo, в сет-листе — своё; аккорды формами ниже, звучит та же тональность
import { capoClamp, CAPO_MAX } from '../src/core/stage.js';
describe('капо', () => {
  it('по умолчанию — из песни, в пределах 0…7; своё в пункте сет-листа', () => {
    expect(itemOf({}, { ...song, capo: 3 }, []).capo).toBe(3);
    expect(itemOf({}, { ...song, capo: 12 }, []).capo).toBe(CAPO_MAX);
    expect(itemOf({}, song, []).capo).toBe(0);
    const ev = { songs: ['s1'] };
    setItem(ev, 's1', { capo: 2 });
    expect(itemOf(ev, { ...song, capo: 5 }, []).capo).toBe(2);
    expect(capoClamp(-1)).toBe(0); expect(capoClamp('4')).toBe(4);
  });
  it('формы: капо 3 в G показывает E-формы, а звучит G', () => {
    const it = itemOf({}, { ...song, capo: 3 }, []);
    const html = lyricsHTML(chordsAbove(song.notes), it.tr - it.capo, it.srcKey);
    expect(html).toMatch(/>E</); expect(html).toMatch(/>A</); // G→E, C→A
    expect(it.key.pc).toBe(7); // звучит по-прежнему G
  });
});
