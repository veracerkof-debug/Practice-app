import { describe, it, expect, beforeEach } from 'vitest';
import { planFiles, baseOf, manifestOf, handleRequest, pair, syncNow, pcOf, newCode, b64 } from '../src/core/sync.js';
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
  it('дорожки разделения и модули Библии не синхронизируются', () => {
    const m = manifestOf([{ id: 'a', blob: bytes(3, 1) }, { id: 's', stem: { src: 'a' }, blob: bytes(3, 1) }, { id: 'b', kind: 'bible', size: 9 }]);
    expect(m.map((x) => x.id)).toEqual(['a']);
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
});
