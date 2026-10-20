import { describe, it, expect } from 'vitest';
import { strToU8, gzipSync, zipSync } from 'fflate';
import { importSongs, fromHolyricsJSON } from '../src/core/songimport.js';

const SONGS = [
  { title: 'Hino 1', artist: 'Autor', note: '8.5.8.3', lyrics: { paragraphs: [{ text: 'Linha 1\nLinha 2', description: 'Verse 1' }, { text: 'Coro', description: 'Chorus' }] } },
  { title: 'Hino 2', paragraphs: [{ text: 'A' }, { text: 'B' }] },
];

describe('Holyrics: файлы песен', () => {
  it('JSON — части песни с заголовками', () => {
    const s = fromHolyricsJSON(SONGS);
    expect(s.map((x) => x.title)).toEqual(['Hino 1', 'Hino 2']);
    expect(s[0].artist).toBe('Autor');
    expect(s[0].notes).toBe('Verse 1\nLinha 1\nLinha 2\n\nChorus\nCoro');
    expect(s[1].notes).toBe('A\n\nB');
  });
  it('.muf и .mufl: JSON, сжатый файл и архив', async () => {
    const json = strToU8(JSON.stringify(SONGS));
    const r = await importSongs([
      { name: 'a.muf', u8: strToU8(JSON.stringify(SONGS[0])) },
      { name: 'b.mufl', u8: gzipSync(json) },
      { name: 'c.mufl', u8: zipSync({ 'songs.json': json }) },
    ]);
    expect(r.errors).toEqual([]);
    expect(r.songs.length).toBe(5);
  });
  it('незнакомый .muf — понятная ошибка, без падения', async () => {
    const r = await importSongs([{ name: 'x.muf', u8: new Uint8Array([1, 2, 3, 4, 5]) }]);
    expect(r.songs.length).toBe(0);
    expect(r.errors.length).toBe(1);
  });
});
