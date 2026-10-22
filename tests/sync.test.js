import { describe, it, expect, beforeEach } from 'vitest';
import { planFiles, baseOf, manifestOf, handleRequest, pair, syncNow, pcOf, newCode, b64, mergeMeta, metaHash, createSyncClient } from '../src/core/sync.js';
import { createStore } from '../src/core/store.js';

// localStorage для node: и у телефона, и у компьютера своё — переключаем подменой
const mkLS = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

function mkFiles() {
  const all = new Map();
  return {
    list: (kind) => [...all.values()].filter((r) => (kind === 'audio' ? !r.kind || r.kind === 'audio' : r.kind === kind)),
    get: (id) => all.get(id),
    add: async (rec) => { const id = rec.id || 'f' + all.size; all.set(id, { ...rec, id, size: rec.blob ? rec.blob.size : rec.size }); return id; },
    remove: async (id) => { all.delete(id); },
    save: async () => {},
    all,
  };
}
function mkApp() {
  const storage = mkLS();
  return { store: createStore({ storage }), files: mkFiles() };
}
const song = (id, title, at) => ({ id, title, createdAt: at, updatedAt: at, difficulty: 1 });
const bytes = (n, v) => new Blob([new Uint8Array(n).fill(v)]);

// транспорт: запросы телефона идут прямо в обработчик компьютера
function link(pcCtx, incoming = new Map()) {
  return async (method, url, { key = '', json = null, bin = false } = {}) => {
    const u = new URL(url);
    if (u.pathname === '/melete/v1/hello') return { app: 'melete', v: 1, name: 'PC' };
    const r = await handleRequest(pcCtx, { method, path: u.pathname, query: Object.fromEntries(u.searchParams), key, json: json ? JSON.parse(JSON.stringify(json)) : null }, incoming);
    if (r.status >= 400) throw Object.assign(new Error('http ' + r.status), { status: r.status });
    return bin ? r.bytes : r.json;
  };
}

describe('связь телефона и компьютера: план файлов', () => {
  it('новые — в обе стороны, удалённые — переносятся', () => {
    const p = planFiles([{ id: 'a' }, { id: 'b' }, { id: 'c' }], [{ id: 'b' }, { id: 'd' }, { id: 'e' }], ['c', 'e']);
    expect(p.upload).toEqual(['a']);       // только у меня, раньше не было — отправить
    expect(p.delMine).toEqual(['c']);      // было у обоих, там удалили — удалить у меня
    expect(p.download).toEqual(['d']);     // только у них, новое — скачать
    expect(p.delTheirs).toEqual(['e']);    // было у обоих, я удалил — удалить у них
  });
  it('адрес с компьютера в любом виде', () => {
    expect(baseOf('192.168.1.5')).toBe('http://192.168.1.5:53319');
    expect(baseOf(' 192,168,1,5 ')).toBe('http://192.168.1.5:53319');
    expect(baseOf('http://10.0.0.2:8000/')).toBe('http://10.0.0.2:8000');
    expect(baseOf('')).toBeNull();
  });
  it('дорожки синхронизируются, модули Библии — нет', () => {
    const m = manifestOf([{ id: 'a', blob: bytes(3, 1) }, { id: 's', stem: { src: 'a', part: 'vocals', mode: '4' }, blob: bytes(3, 1) }, { id: 'b', kind: 'bible', size: 9 }]);
    expect(m.map((x) => x.id)).toEqual(['a', 's']);
    expect(m[1].k).toBe('s:a:vocals:4:0');
  });
  it('одна и та же дорожка с двух устройств не задваивается; пересчитанная заменяет старую', () => {
    const v = (id) => ({ id, k: 's:a:vocals:4:0' });
    expect(planFiles([v('s1')], [v('s2')], [])).toMatchObject({ upload: [], download: [] });
    // на компьютере пересчитали: старая s1 исчезла (была на обоих), пришла s2 с тем же ключом
    expect(planFiles([v('s1')], [v('s2')], ['s1'])).toMatchObject({ delMine: ['s1'], download: ['s2'], upload: [] });
  });
  it('сведения записи сливаются одинаково с обеих сторон', () => {
    const ph = { id: 'r', songs: ['x'], ana: { v: 1, at: 5, bpm: 100 }, want: { stems: '6' } };
    const pc = { id: 'r', songs: ['y'], ana: { v: 2, at: 3, bpm: 98 }, lyr: { at: 9, lines: [] }, stemsAbsent: { 4: ['other'] } };
    const a = { ...ph, ...mergeMeta(ph, pc) }, b = { ...pc, ...mergeMeta(pc, ph) };
    expect(a.ana.v).toBe(2); expect(a.lyr.at).toBe(9); expect(a.songs.sort()).toEqual(['x', 'y']); expect(b.want).toEqual({ stems: '6' });
    expect(metaHash(a)).toBe(metaHash(b));
    expect(mergeMeta(a, b)).toBeNull();
    expect(planFiles([{ id: 'r', h: metaHash(ph) }], [{ id: 'r', h: metaHash(pc) }]).meta).toEqual(['r']);
  });
  it('код — 6 цифр, base64 туда и обратно', () => {
    expect(newCode()).toMatch(/^\d{6}$/);
    const u = new Uint8Array([0, 1, 254, 255, 128]);
    expect([...b64.to(b64.from(u))]).toEqual([...u]);
  });
});

describe('связь телефона и компьютера: целиком', () => {
  let phone, pc, pcCtx, H;
  beforeEach(() => {
    globalThis.localStorage = mkLS(); // хранилище телефона (ключ сопряжения, что было на обоих)
    phone = mkApp(); pc = mkApp();
    pcCtx = { app: pc, mem: {}, code: '482913', name: 'PC' };
    H = link(pcCtx);
  });

  it('неверный код — отказ, верный — ключ', async () => {
    await expect(pair('192.168.1.5', '000000', 'Телефон', H)).rejects.toMatchObject({ reason: 'code' });
    const p = await pair('192.168.1.5', '482 913', 'Телефон', H);
    expect(p.key).toMatch(/^[0-9a-f]{32}$/);
    expect(pcOf().name).toBe('PC');
    expect(Object.keys(pcCtx.mem.peers)).toEqual([p.key]);
  });

  it('песни и файлы сходятся, правка новее побеждает, удаление переносится', async () => {
    phone.store.replaceState({ ...phone.store.state, songs: [song('s1', 'Калинка', 100), song('s2', 'Только на телефоне', 100)] });
    pc.store.replaceState({ ...pc.store.state, songs: [song('s1', 'Калинка (правка на ПК)', 200), song('s3', 'Только на ПК', 100)] });
    await phone.files.add({ id: 'fp', name: 'phone.wav', type: 'audio/wav', kind: 'audio', blob: bytes(5 << 20, 7) }); // 5 МБ — три куска
    await pc.files.add({ id: 'fc', name: 'pc.pdf', type: 'application/pdf', kind: 'tab', blob: bytes(1000, 3) });
    await pair('192.168.1.5', '482913', 'Телефон', H);

    const r = await syncNow(phone, () => {}, H);
    expect(r).toMatchObject({ up: 1, down: 1, removed: 0 });
    const titles = (a) => a.store.songs().map((s) => s.title).sort();
    expect(titles(phone)).toEqual(['Калинка (правка на ПК)', 'Только на ПК', 'Только на телефоне']);
    expect(titles(pc)).toEqual(titles(phone));
    expect(pc.files.get('fp').blob.size).toBe(5 << 20);
    const got = new Uint8Array(await pc.files.get('fp').blob.arrayBuffer());
    expect(got[0]).toBe(7); expect(got[(5 << 20) - 1]).toBe(7);
    expect(phone.files.get('fc').blob.size).toBe(1000);

    // повтор — ничего лишнего
    expect(await syncNow(phone, () => {}, H)).toMatchObject({ up: 0, down: 0, removed: 0 });

    // на телефоне удалили pdf — с компьютера тоже уходит; на ПК удалили запись — уходит с телефона
    await phone.files.remove('fc');
    await pc.files.remove('fp');
    const r3 = await syncNow(phone, () => {}, H);
    expect(r3.removed).toBe(2);
    expect(phone.files.get('fp')).toBeUndefined();
    expect(pc.files.get('fc')).toBeUndefined();
  });

  it('чужой ключ — отказ', async () => {
    await pair('192.168.1.5', '482913', 'Телефон', H);
    pcCtx.mem.peers = {}; // компьютер забыл телефон
    await expect(syncNow(phone, () => {}, H)).rejects.toMatchObject({ reason: 'key' });
  });

  it('компьютер посчитал дорожки, разбор и текст — всё приходит на телефон', async () => {
    await phone.files.add({ id: 'rec', name: 'song.wav', type: 'audio/wav', kind: 'audio', created: 1, blob: bytes(3000, 1) });
    await pair('192.168.1.5', '482913', 'Телефон', H);
    await syncNow(phone, () => {}, H, { want: { stems: '6', hq: false } });
    expect(pc.files.get('rec').want).toEqual({ stems: '6', hq: false }); // режим, который просил телефон
    // на компьютере фоновая очередь посчитала
    const r = pc.files.get('rec');
    r.ana = { v: 2, at: 10, bpm: 92, pc: 9, minor: true }; r.lyr = { v: 1, at: 11, lines: [{ t: 0, s: 'Ой' }] }; r.stemsAbsent = { 6: ['piano'] };
    for (const part of ['vocals', 'drums']) await pc.files.add({ id: 'sm' + part, name: part + '.wav', kind: 'audio', type: 'audio/wav', blob: bytes(500, 2), stem: { src: 'rec', part, mode: '6', hq: false } });
    const out = await syncNow(phone, () => {}, H);
    expect(out).toMatchObject({ down: 2, up: 0, meta: 1 });
    const p = phone.files.get('rec');
    expect(p.ana.bpm).toBe(92); expect(p.lyr.lines[0].s).toBe('Ой'); expect(p.stemsAbsent).toEqual({ 6: ['piano'] });
    expect(phone.files.get('smvocals').stem).toMatchObject({ src: 'rec', part: 'vocals' });
    // повтор — тихо
    expect(await syncNow(phone, () => {}, H)).toMatchObject({ down: 0, up: 0, meta: 0 });
  });

  it('у компьютера звучит музыка — фоновая синхронизация ждёт, ручная идёт', async () => {
    await pair('192.168.1.5', '482913', 'Телефон', H);
    pcCtx.busy = () => true;
    await expect(syncNow(phone, () => {}, H, { auto: true })).rejects.toMatchObject({ reason: 'busy' });
    await expect(syncNow(phone, () => {}, H)).resolves.toMatchObject({ up: 0 });
  });

  it('прерванная передача продолжается с того же места', async () => {
    await phone.files.add({ id: 'big', name: 'big.wav', kind: 'audio', type: 'audio/wav', blob: bytes(5 << 20, 4) });
    await pair('192.168.1.5', '482913', 'Телефон', H);
    let n = 0, puts = 0;
    const H2 = async (m, url, o) => { if (url.includes('/put')) puts++; return H(m, url, o); };
    await expect(syncNow(phone, () => {}, H2, { stop: () => puts >= 1 && ++n > 1 })).rejects.toMatchObject({ reason: 'stopped' });
    expect(pc.files.get('big')).toBeUndefined();
    puts = 0;
    await syncNow(phone, () => {}, H2);
    expect(pc.files.get('big').blob.size).toBe(5 << 20);
    expect(puts).toBe(2); // первый кусок уже был у компьютера: отказ «с какого» + два оставшихся без повтора первого
  });

  it('телефон ждёт компьютер только для свежих записей и того, что компьютер умеет', async () => {
    await pair('192.168.1.5', '482913', 'Телефон', H);
    pcCtx.work = () => ({ stems: '4', ana: true, lyr: true });
    await syncNow(phone, () => {}, H);
    let t = Date.now();
    const C = createSyncClient(phone, { H, now: () => t });
    phone.store.state.settings.pcWork = true;
    expect(C.waits({ id: 'n', created: t - 3600000 }, 'stems')).toBe(true);
    expect(C.waits({ id: 'o', created: t - 2 * 86400000 }, 'stems')).toBe(false); // старая и не на компьютере — считать самому
    phone.store.state.settings.pcWork = false;
    expect(C.waits({ id: 'n', created: t - 3600000 }, 'stems')).toBe(false);
    phone.store.state.settings.pcWork = true;
    t += 4 * 86400000; // компьютера не было четыре дня
    expect(C.waits({ id: 'n', created: t - 3600000 }, 'stems')).toBe(false);
  });
});
