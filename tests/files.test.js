import { describe, it, expect } from 'vitest';
import { createFiles, fileSongs, inSong, linkSong } from '../src/core/files.js';

describe('файлы', () => {
  it('привязка к песням, включая старое поле songId', () => {
    const r = { id: 'a', songId: 's1' };
    expect(fileSongs(r)).toEqual(['s1']);
    expect(inSong(r, 's1')).toBe(true);
    linkSong(r, 's2', true);
    expect(r).toEqual({ id: 'a', songs: ['s1', 's2'] });
    linkSong(r, 's1', false);
    linkSong(r, 's2', true);
    expect(r.songs).toEqual(['s2']);
    expect(fileSongs({ id: 'b' })).toEqual([]);
  });

  it('без IndexedDB файлы живут в памяти, noDb = true', async () => {
    const f = createFiles({ indexedDB: { open() { throw new Error('нет'); } } });
    await f.ready;
    expect(f.noDb).toBe(true);
    let n = 0;
    f.subscribe(() => n++);
    expect(await f.add({ id: 'a', name: 'x' })).toBe(false);
    await f.add({ id: 't', kind: 'tab' });
    expect(f.list('audio').map((r) => r.id)).toEqual(['a']);
    expect(f.list('tab').map((r) => r.id)).toEqual(['t']);
    expect(f.get('a').name).toBe('x');
    await f.remove('a');
    expect(f.list('audio')).toEqual([]);
    expect(n).toBe(3);
  });
});
