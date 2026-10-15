import { describe, it, expect } from 'vitest';
import { syncFolder, readBackup, kindOfName, dirOfRec, freeName, songText, DATA_FILE } from '../src/core/folder.js';
import { fromChordPro } from '../src/core/songimport.js';

// Папка в памяти: { 'Dir/name': { data: Uint8Array, mtime } }
function memDrive(init = {}) {
  const fs = { ...init }; let clock = 1000;
  const items = (dir) => Object.entries(fs).filter(([p]) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '') === dir).map(([p, f]) => ({ name: p.slice(p.lastIndexOf('/') + 1), size: f.data.length, mtime: f.mtime, dir: false }));
  return {
    fs, tick: (ms = 5000) => { clock += ms; },
    list: async (dir) => items(dir),
    mkdirs: async () => {},
    read: async (path, off, len) => ({ data: fs[path].data.slice(off, off + len), size: fs[path].data.length }),
    write: async (path, u8, append) => { const old = append && fs[path] ? fs[path].data : new Uint8Array(0); const d = new Uint8Array(old.length + u8.length); d.set(old); d.set(u8, old.length); fs[path] = { data: d, mtime: ++clock }; },
    remove: async (path) => { delete fs[path]; },
    put: (path, text) => { fs[path] = { data: typeof text === 'string' ? new TextEncoder().encode(text) : text, mtime: (clock += 10) }; },
    text: (path) => new TextDecoder().decode(fs[path].data),
  };
}
function memApp() {
  const files = [], songs = [];
  return {
    files, songs,
    api: {
      files: () => files,
      addFile: async (r) => { const id = 'f' + files.length; files.push({ ...r, id }); return id; },
      songs: () => songs,
      addSong: (p) => { const id = 's' + songs.length; songs.push({ id, title: p.title, artist: p.artist, key: p.key, notes: p.notes }); return id; },
      setNotes: (id, notes) => { songs.find((s) => s.id === id).notes = notes; },
      parseText: (name, u8) => fromChordPro(new TextDecoder().decode(u8), name),
      backup: () => JSON.stringify({ version: 1, songs, sessions: [] }),
    },
  };
}

describe('папка Melete', () => {
  it('раскладка по типам', () => {
    expect(kindOfName('a.pdf')).toBe('pdf'); expect(kindOfName('a.gp5')).toBe('tabs'); expect(kindOfName('a.MP3')).toBe('media'); expect(kindOfName('a.cho')).toBe('lyrics'); expect(kindOfName('a.exe')).toBe(null);
    expect(dirOfRec({ kind: 'tab', fmt: 'pdf' })).toBe('PDF'); expect(dirOfRec({ kind: 'tab', name: 'x.gp' })).toBe('Tabs'); expect(dirOfRec({ name: 'x.wav' })).toBe('Media'); expect(dirOfRec({ kind: 'bible' })).toBe(null);
    expect(freeName('a.pdf', new Set(['a.pdf', 'a (2).pdf']))).toBe('a (3).pdf');
  });

  it('выгрузка: копия данных, файлы по папкам, тексты песен', async () => {
    const drv = memDrive(), app = memApp(), mem = {};
    app.files.push({ id: 'r1', name: 'take.wav', size: 4, blob: new Blob(['RIFF']), kind: 'audio' }, { id: 'r2', name: 'book.pdf', size: 3, blob: new Blob(['PDF']), kind: 'tab', fmt: 'pdf' });
    app.songs.push({ id: 'a', title: 'Song', artist: 'Band', key: 'Am', notes: '[Am]la la' }, { id: 'b', title: 'Empty', notes: '' });
    const r = await syncFolder(drv, mem, app.api);
    expect(Object.keys(drv.fs).sort()).toEqual([DATA_FILE, 'Lyrics/Song — Band.cho', 'Media/take.wav', 'PDF/book.pdf'].sort());
    expect(drv.text('Lyrics/Song — Band.cho')).toContain('{key: Am}');
    expect(JSON.parse(drv.text(DATA_FILE)).songs.length).toBe(2);
    expect(r.wrote).toBe(3);
    // второй раз — ничего не переписывается
    expect((await syncFolder(drv, mem, app.api)).wrote).toBe(0);
  });

  it('файлы, положенные в папку и в корень, подхватываются и раскладываются', async () => {
    const drv = memDrive(), app = memApp(), mem = {};
    await syncFolder(drv, mem, app.api);
    drv.put('Tabs/solo.gp5', 'GP'); drv.put('lesson.pdf', '%PDF'); drv.put('new.cho', '{title: Новая}\n[C]текст');
    const r = await syncFolder(drv, mem, app.api);
    expect(app.files.map((f) => f.name).sort()).toEqual(['lesson.pdf', 'solo.gp5']);
    expect(app.files.find((f) => f.name === 'lesson.pdf').fmt).toBe('pdf');
    expect(drv.fs['lesson.pdf']).toBeUndefined();
    expect(drv.fs['PDF/lesson.pdf']).toBeTruthy();
    expect(app.songs[0].title).toBe('Новая');
    expect(drv.fs['Lyrics/new.cho']).toBeTruthy();
    expect(r.sorted).toBe(2);
    // и не дублируются на следующем круге
    await syncFolder(drv, mem, app.api);
    expect(app.files.length).toBe(2); expect(app.songs.length).toBe(1);
  });

  it('правка текста: в файле → в песню, в приложении → в файл', async () => {
    const drv = memDrive(), app = memApp(), mem = {};
    app.songs.push({ id: 'a', title: 'S', notes: 'old' });
    await syncFolder(drv, mem, app.api);
    drv.tick(); drv.put('Lyrics/S.cho', '{title: S}\n\nnew from file');
    await syncFolder(drv, mem, app.api);
    expect(app.songs[0].notes).toBe('new from file');
    app.songs[0].notes = 'edited in app';
    await syncFolder(drv, mem, app.api);
    expect(drv.text('Lyrics/S.cho')).toContain('edited in app');
  });

  it('копия данных читается для восстановления', async () => {
    const drv = memDrive(), app = memApp();
    app.songs.push({ id: 'a', title: 'S', notes: 'x' });
    await syncFolder(drv, {}, app.api);
    expect((await readBackup(drv)).songs[0].title).toBe('S');
    expect(songText({ title: 'T', notes: 'n' })).toBe('{title: T}\n\nn\n');
  });
});

import { fileNameOf } from '../src/core/folder.js';
describe('имена файлов в папке', () => {
  it('расширение возвращается', () => {
    expect(fileNameOf({ name: 'Solo', kind: 'tab', ext: 'gp5' })).toBe('Solo.gp5');
    expect(fileNameOf({ name: 'Book', kind: 'tab', fmt: 'pdf' })).toBe('Book.pdf');
    expect(fileNameOf({ name: 'Score', kind: 'tab', type: 'application/vnd.recordare.musicxml+xml' })).toBe('Score.musicxml');
    expect(fileNameOf({ name: 'take.wav' })).toBe('take.wav');
    expect(fileNameOf({ name: 'Запись', type: 'audio/mpeg' })).toBe('Запись.mp3');
  });
});

describe('копии с подписью', async () => {
  const { writeBackup, listBackups, pruneBackups, readBackupFile, backupName, BACKUP_DIR } = await import('../src/core/folder.js');
  it('имя: дата, время и кто сохранил', () => {
    const at = new Date(2026, 9, 15, 9, 5).getTime();
    expect(backupName('Алекс', at)).toBe('Melete 2026-10-15 09-05 — Алекс.json');
    expect(backupName('', at)).toBe('Melete 2026-10-15 09-05.json');
    expect(backupName('a/b:c', at)).toBe('Melete 2026-10-15 09-05 — a_b_c.json');
  });
  it('сохранить, найти, прочитать; старые сверх лимита удаляются', async () => {
    const d = memDrive();
    const at = new Date(2026, 9, 15, 9, 5).getTime();
    const n1 = await writeBackup(d, '{"version":1,"sessions":[],"backupInfo":{"by":"Алекс"}}', 'Алекс', at);
    const n2 = await writeBackup(d, '{"version":1,"sessions":[]}', 'Алекс', at);
    expect(n2).not.toBe(n1); // то же время — не перезаписывает
    expect((await readBackupFile(d, n1)).backupInfo.by).toBe('Алекс');
    for (let i = 1; i <= 5; i++) await writeBackup(d, '{}', 'X', at + i * 86400000);
    expect((await listBackups(d))[0].name.startsWith('Melete 2026-10-20')).toBe(true);
    expect(await pruneBackups(d, 3)).toBe(4);
    expect(Object.keys(d.fs).filter((p) => p.startsWith(BACKUP_DIR))).toHaveLength(3);
  });
  it('синхронизация: автокопия раз в день', async () => {
    const d = memDrive(), a = memApp();
    a.api.by = () => 'Алекс';
    const day = new Date(2026, 9, 15, 10).getTime();
    await syncFolder(d, {}, a.api, day);
    await syncFolder(d, {}, a.api, day + 3600000);
    expect((await listBackups(d))).toHaveLength(1);
    await syncFolder(d, {}, a.api, day + 86400000);
    expect((await listBackups(d))).toHaveLength(2);
  });
});
