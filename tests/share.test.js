import { describe, it, expect } from 'vitest';
import { pack, unpack, planImport, applyImport, filesFor, shareName, differs } from '../src/core/share.js';
import { zipSync, strToU8 } from 'fflate';

const song = (id, title, extra = {}) => ({ id, title, artist: 'Band', genre: 'Worship', key: 'G', targetBpm: 72, currentBpm: 60, masteryPct: 40, difficulty: 4, tags: ['x'], notes: '[G]Text', ...extra });
const fileRec = (id, name, songs, kind = 'tab', text = 'tab-data') => ({ id, name, songs, kind, type: kind === 'tab' ? 'application/xml' : 'audio/wav', blob: new Blob([text]), size: text.length });

function memStore(songs = [], events = []) {
  return { state: { songs, events, settings: { cal: { kinds: [{ id: 'rehearsal' }] } } }, now: () => 1000, save() { this.saved = true; } };
}
function memFiles(list = []) {
  return { list: (k) => list.filter((r) => (k === 'tab' ? r.kind === 'tab' : r.kind !== 'tab')), add: async (r) => { list.push(r); }, save: async () => {}, all: list };
}

describe('файл .melete', () => {
  it('туда и обратно: песни, файлы, сет-лист; личное не уходит', async () => {
    const songs = [song('a', 'Way Maker'), song('b', 'Goodness', { metro: { bpm: 72, num: 6, den: 8 } })];
    const files = [fileRec('f1', 'Way Maker.musicxml', ['a']), fileRec('f2', 'take.wav', ['a'], 'audio', 'RIFF')];
    const set = { id: 'e1', title: 'Репетиция', kind: 'rehearsal', start: 5000, end: 9000, place: 'Зал', songs: ['b', 'a'] };
    const u8 = await pack({ songs, files: filesFor(files, ['a', 'b']), set });
    const { manifest, data } = unpack(u8);
    expect(manifest.format).toBe('melete');
    expect(manifest.songs.map((s) => s.title)).toEqual(['Way Maker', 'Goodness']);
    expect(manifest.songs[0]).not.toHaveProperty('masteryPct');
    expect(manifest.songs[0]).not.toHaveProperty('currentBpm');
    expect(manifest.songs[0]).not.toHaveProperty('tags');
    expect(manifest.songs[1].metro.num).toBe(6);
    expect(manifest.files.length).toBe(1); // запись — только по выбору
    expect(new TextDecoder().decode(data(manifest.files[0].path))).toBe('tab-data');
    expect(manifest.set.songs).toEqual(['b', 'a']);

    const store = memStore(), fs = memFiles();
    const r = await applyImport({ store, files: fs, unpacked: unpack(u8), plan: planImport([], manifest), base: { masteryPct: 0 } });
    expect(r.added).toBe(2);
    expect(r.files).toBe(1);
    const got = store.state.songs;
    expect(got[0].from).toBe('a');
    expect(got[0].masteryPct).toBe(0);
    expect(fs.all[0].songs).toEqual([got[0].id]);
    expect(store.state.events[0].songs).toEqual([got[1].id, got[0].id]);
    expect(store.state.events[0].place).toBe('Зал');
  });

  it('повторный приём обновляет ту же песню и событие, файлы не дублируются', async () => {
    const songs = [song('a', 'Way Maker')];
    const set = { id: 'e1', title: 'Репетиция', kind: 'rehearsal', start: 5000, songs: ['a'] };
    const store = memStore(), fs = memFiles();
    const u1 = await pack({ songs, files: [fileRec('f1', 'tab.xml', ['a'])], set });
    await applyImport({ store, files: fs, unpacked: unpack(u1), plan: planImport(store.state.songs, unpack(u1).manifest) });
    // лидер поменял тональность
    const u2 = await pack({ songs: [song('a', 'Way Maker', { key: 'A' })], files: [fileRec('f1', 'tab.xml', ['a'])], set: { ...set, place: 'Новый зал' } });
    const m2 = unpack(u2).manifest, plan = planImport(store.state.songs, m2);
    expect(plan[0].action).toBe('update');
    expect(differs(store.state.songs[0], m2.songs[0])).toBe(true);
    const r = await applyImport({ store, files: fs, unpacked: unpack(u2), plan });
    expect(r.updated).toBe(1);
    expect(store.state.songs.length).toBe(1);
    expect(store.state.songs[0].key).toBe('A');
    expect(fs.all.length).toBe(1);
    expect(store.state.events.length).toBe(1);
    expect(store.state.events[0].place).toBe('Новый зал');
  });

  it('совпадение по названию и исполнителю сохраняет личное', async () => {
    const mine = song('m1', 'way maker', { masteryPct: 90, artist: 'band' });
    const u8 = await pack({ songs: [song('a', 'Way Maker', { key: 'E' })] });
    const store = memStore([mine]);
    const { manifest } = unpack(u8);
    await applyImport({ store, files: null, unpacked: unpack(u8), plan: planImport(store.state.songs, manifest) });
    expect(mine.key).toBe('E');
    expect(mine.masteryPct).toBe(90);
    expect(mine.from).toBe('a');
  });

  it('пропуск и чужие файлы', async () => {
    const u8 = await pack({ songs: [song('a', 'X')] });
    const m = unpack(u8).manifest, store = memStore();
    const plan = planImport([], m).map((p) => ({ ...p, action: 'skip' }));
    expect((await applyImport({ store, files: null, unpacked: unpack(u8), plan })).added).toBe(0);
    expect(() => unpack(new Uint8Array([1, 2, 3]))).toThrow('notMelete');
    expect(() => unpack(zipSync({ 'a.txt': strToU8('x') }))).toThrow('notMelete');
    expect(() => unpack(zipSync({ 'melete.json': strToU8(JSON.stringify({ format: 'melete', v: 99, songs: [] })) }))).toThrow('newer');
  });

  it('имя файла', () => {
    expect(shareName('Репетиция: воскресенье', new Date(2026, 9, 14).getTime())).toBe('melete-Репетиция-воскресенье-20261014.melete');
  });
});
