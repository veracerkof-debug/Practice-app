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

import { normKey, cleanProfile } from '../src/core/share.js';
import { aiDoc, AI_EXAMPLE } from '../src/core/aidoc.js';
import { quoteAt, setsOf } from '../src/core/quotes.js';
import { readFileSync } from 'node:fs';

const enc = (o) => new TextEncoder().encode(typeof o === 'string' ? o : JSON.stringify(o));
const fullStore = (songs = []) => {
  const st = { songs, events: [], settings: { days: [1, 1, 1, 1, 1, 0, 0], goalMin: 300, profile: { name: 'A', instruments: ['piano'], level: 'amateur', priorHours: 0 } } };
  return { state: st, now: () => 1000, save() {}, settingsChanged() {} };
};

describe('файл от нейросети (простой JSON)', () => {
  const BY = { ru: 'П. И. Чайковский', en: 'P. I. Tchaikovsky', uz: 'P. I. Chaykovskiy' };
  for (const lang of ['ru', 'uz', 'en']) it('пример из инструкции принимается целиком: ' + lang, async () => {
    const ex = new RegExp('## ' + AI_EXAMPLE[lang] + '\\n\\n```json\\n([\\s\\S]*?)\\n```').exec(aiDoc(lang))[1];
    const un = unpack(enc(ex)), m = un.manifest;
    expect(m.songs[0].key).toBe('G');
    expect(m.quotes[0].items[0].by).toBe(BY[lang]);
    const store = fullStore();
    const r = await applyImport({ store, files: null, unpacked: un, plan: planImport([], m) });
    expect(r.added).toBe(1); expect(r.books).toBe(1); expect(r.profile).toBe(true);
    const S = store.state.settings, id = 'own:' + S.quoteBooks[0].id;
    expect(setsOf(S)).toContain(id);
    expect(quoteAt(0, lang, [id], S.quoteBooks).ref).toBe(BY[lang]);
    expect(S.profile.instruments).toEqual(['guitar']);
  });
  it('часы, занятия и опыт файлом не меняются', async () => {
    const store = fullStore();
    store.state.settings.profile.priorHours = 0;
    const un = unpack(enc({ format: 'melete', v: 1, profile: { level: 'pro', priorHours: 99999, hours: 500 }, sessions: [{ start: 1, dur: 99999 }], stats: { total: 1e9 } }));
    expect(un.manifest.profile).toEqual({ level: 'pro' });
    await applyImport({ store, files: null, unpacked: un, plan: [] });
    expect(store.state.settings.profile.priorHours).toBe(0);
    expect(store.state.sessions).toBeUndefined();
    expect(cleanProfile({ goalMin: 5, days: [1, 1] })).toBe(null);
  });
  it('тональности и мусор', () => {
    expect(normKey('C#m')).toBe('C♯m'); expect(normKey('Bb')).toBe('B♭'); expect(normKey('A minor')).toBe('Am'); expect(normKey('H')).toBe(null);
    expect(() => unpack(enc({ format: 'melete', v: 1 }))).toThrow('empty');
    expect(() => unpack(enc('{ not json'))).toThrow('notMelete');
    const m = unpack(enc({ format: 'melete', v: 1, songs: [{ title: '' }, { title: 'X', targetBpm: 9999, key: 'Q' }], quotes: { title: 'Q', items: ['a', { text: '' }] } })).manifest;
    expect(m.songs).toEqual([{ ref: 'ai1-X', title: 'X' }]);
    expect(m.quotes[0].items).toEqual([{ text: 'a' }]);
  });
  it('docs/ai-format*.md совпадают с инструкцией в приложении', () => {
    expect(readFileSync('docs/ai-format.md', 'utf8')).toBe(aiDoc('ru'));
    expect(readFileSync('docs/ai-format.uz.md', 'utf8')).toBe(aiDoc('uz'));
    expect(readFileSync('docs/ai-format.en.md', 'utf8')).toBe(aiDoc('en'));
  });
});
