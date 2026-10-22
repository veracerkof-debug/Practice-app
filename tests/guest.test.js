// Раздача в своей сети (src/core/guest.js): вход, что видно гостю, записи, ведение
import { describe, it, expect, beforeEach } from 'vitest';
import { handleGuest, sharedSongs, setLive, allowedOf, GUEST_DEF } from '../src/core/guest.js';

const song = (id, title, extra = {}) => ({ id, title, createdAt: 1, updatedAt: 1, notes: '[Am]Ой то не [C]вечер', ...extra });
function mkApp() {
  const files = [
    { id: 'a1', kind: 'audio', type: 'audio/mpeg', songs: ['s1'], blob: new Blob([new Uint8Array([1, 2, 3])]) },
    { id: 'a9', kind: 'audio', type: 'audio/mpeg', songs: ['s9'], blob: new Blob([new Uint8Array([9])]) }, // песня вне сет-листа
    { id: 'st', kind: 'audio', songs: ['s1'], stem: { src: 'a1', part: 'vocals' }, blob: new Blob([]) },
  ];
  return {
    store: { state: { songs: [song('s1', 'Вечер'), song('s2', 'Аве'), song('s9', 'Личная'), song('sx', 'Удалена', { deleted: true })], events: [{ id: 'e1', title: 'Воскресенье', songs: ['s2', 's1'], stage: { s1: { tr: 2 } } }], sessions: [{ id: 'x' }] } },
    files: { list: (k) => files.filter((r) => k === 'audio' && (!r.kind || r.kind === 'audio')), get: (id) => files.find((r) => r.id === id) },
  };
}
const call = (ctx, path, q = {}, body = null) => handleGuest(ctx, { method: body ? 'POST' : 'GET', path: '/g/v1/' + path, q, body: body ? JSON.stringify(body) : '' });

describe('раздача в своей сети', () => {
  let ctx;
  beforeEach(() => { ctx = { app: mkApp(), cfg: { ...GUEST_DEF, on: true }, rt: { token: 'tok123', guests: new Map(), leader: 'host', live: null }, name: 'PC' }; });

  it('открытый вход — сразу внутри, без входа — отказ', async () => {
    expect((await call(ctx, 'songs')).status).toBe(401);
    const j = await call(ctx, 'join', {}, { name: 'Иван' });
    expect(j.json.state).toBe('ok');
    const r = await call(ctx, 'songs', { g: j.json.gid });
    expect(r.json.songs.map((s) => s.title)).toEqual(['Аве', 'Вечер', 'Личная']); // по алфавиту, без удалённых
    expect(r.json.songs.find((s) => s.id === 's1').audio).toBe(1); // дорожки разделения не считаются
    expect(allowedOf(ctx.rt)).toEqual([j.json.gid]);
  });

  it('закрытый вход — только с токеном QR-кода и после подтверждения', async () => {
    ctx.cfg.mode = 'closed';
    expect((await call(ctx, 'join', {}, { name: 'Пётр' })).status).toBe(403);
    const j = await call(ctx, 'join', {}, { name: 'Пётр', t: 'tok123' });
    expect(j.json.state).toBe('wait');
    expect((await call(ctx, 'me', { g: j.json.gid })).json.state).toBe('wait');
    expect((await call(ctx, 'songs', { g: j.json.gid })).status).toBe(401);
    ctx.rt.guests.get(j.json.gid).ok = true; // хозяин впустил
    expect((await call(ctx, 'songs', { g: j.json.gid })).status).toBe(200);
  });

  it('сет-лист: только его песни, по порядку, со сдвигом; записи других песен не отдаются', async () => {
    ctx.cfg.scope = 'set'; ctx.cfg.set = 'e1';
    expect(sharedSongs(ctx.app.store.state, ctx.cfg).map((s) => s.id)).toEqual(['s2', 's1']);
    const { gid } = (await call(ctx, 'join', {}, { name: 'А' })).json;
    const set = (await call(ctx, 'set', { g: gid })).json;
    expect(set.items).toEqual([{ id: 's2', tr: 0, capo: 0 }, { id: 's1', tr: 2, capo: 0 }]);
    expect((await call(ctx, 'song', { g: gid, id: 's9' })).status).toBe(404);
    expect((await call(ctx, 'audio', { g: gid, id: 'a9' })).status).toBe(404);
    const a = await call(ctx, 'audio', { g: gid, id: 'a1' });
    expect(a.cache).toBe(true); expect([...a.bytes]).toEqual([1, 2, 3]);
    ctx.cfg.audio = false;
    expect((await call(ctx, 'audio', { g: gid, id: 'a1' })).status).toBe(403);
    expect((await call(ctx, 'song', { g: gid, id: 's1' })).json.files).toEqual([]);
  });

  it('песня: текст с аккордами и тональность; личного нет', async () => {
    const { gid } = (await call(ctx, 'join', {}, { name: 'А' })).json;
    const s = (await call(ctx, 'song', { g: gid, id: 's1' })).json;
    expect(s.notes).toContain('[Am]');
    expect(s.k).toMatchObject({ pc: 9, minor: true });
    expect(JSON.stringify(s)).not.toContain('sessions');
  });

  it('ведёт только тот, кому передали', async () => {
    const a = (await call(ctx, 'join', {}, { name: 'А' })).json.gid, b = (await call(ctx, 'join', {}, { name: 'Б' })).json.gid;
    expect((await call(ctx, 'lead', { g: a }, { song: 's1' })).status).toBe(403);
    ctx.rt.leader = a;
    expect((await call(ctx, 'lead', { g: a }, { song: 's1', tr: 1 })).status).toBe(200);
    expect(ctx.rt.live).toMatchObject({ song: 's1', tr: 1, by: 'А', leader: 'А' });
    expect((await call(ctx, 'lead', { g: b }, { song: 's2' })).status).toBe(403);
    expect((await call(ctx, 'me', { g: a })).json.lead).toBe(true);
    ctx.rt.leader = 'host';
    expect(setLive(ctx.rt, { song: 's2' }, '').leader).toBe('');
  });
});
