// Связь телефона и компьютера: синхронизация в своей сети Wi-Fi. Компьютер (Windows) — сервер (посредник в Rust:
// src-tauri/src/sync.rs, порт 53319), телефон — клиент. Сопряжение один раз: на компьютере включается «Связь с
// телефоном» — виден адрес и код из 6 цифр; на телефоне вводятся адрес и код, компьютер выдаёт ключ. Дальше —
// кнопка «Синхронизировать» на телефоне (сеть — только по нажатию).
// Что синхронизируется: песни с метками и проекты студии, занятия и профиль, чтение, календарь — части резервной копии
// (backupparts.js: слияние по записям, побеждает более свежая, ничего не теряется); файлы песен и медиатеки —
// записи, табы, ноты, MIDI (без дорожек разделения: их каждое устройство считает само, и без модулей Библии).
// Удаление файла переносится: телефон помнит, какие файлы были на обоих после прошлой синхронизации (3-стороннее
// сравнение). Настройки и оформление у каждого устройства свои. Ключи сопряжения — не в резервной копии.
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { pickParts, applyParts } from './backupparts.js';
import { log } from './log.js';

export const PORT = 53319;
export const SYNC_PARTS = ['songs', 'profile', 'reading', 'calendar'];
export const CHUNK = 2 << 20; // кусок файла — 2 МБ (в base64 ~2,7 МБ на запрос)
const LS_KEY = 'melete.sync'; // { peers: { ключ: { name, at } } } на компьютере; { pc: { addr, key, name, last, ids } } на телефоне

/* ---------- чистые функции ---------- */

// Файлы, которые синхронизируются: с содержимым, не дорожки разделения, не модули Библии
export const syncable = (r) => !!r && !!r.id && !r.stem && r.kind !== 'bible' && (r.blob || r.size);
export const manifestOf = (list) => list.filter(syncable).map((r) => ({ id: r.id, size: r.size || (r.blob && r.blob.size) || 0, name: r.name || '' }));
// Без содержимого и служебного — то, что уходит вместе с файлом
export function metaOf(r) { const m = { ...r }; delete m.blob; delete m._busy; return m; }

// План обмена файлами. mine, theirs — манифесты; last — id, которые были на обоих после прошлой синхронизации.
// Нет у них, но было у обоих — там удалили: удалить у себя. Нет у меня, но было у обоих — я удалил: удалить у них.
export function planFiles(mine, theirs, last = []) {
  const A = new Set(mine.map((x) => x.id)), B = new Set(theirs.map((x) => x.id)), L = new Set(last);
  const out = { upload: [], download: [], delMine: [], delTheirs: [] };
  mine.forEach((x) => { if (!B.has(x.id)) (L.has(x.id) ? out.delMine : out.upload).push(x.id); });
  theirs.forEach((x) => { if (!A.has(x.id)) (L.has(x.id) ? out.delTheirs : out.download).push(x.id); });
  return out;
}
// Адрес «192.168.1.5» / «192.168.1.5:53319» / с запятыми → http://192.168.1.5:53319
export function baseOf(addr) {
  let s = String(addr || '').trim().replace(/\s+/g, '').replace(/,/g, '.').replace(/\/+$/, '');
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = 'http://' + s;
  try { const u = new URL(s); if (!u.port) u.port = String(PORT); return u.origin; } catch { return null; }
}
export const newCode = (rnd = Math.random) => String(Math.floor(rnd() * 900000) + 100000);
export function newKey(rnd = Math.random) { let s = ''; while (s.length < 32) s += Math.floor(rnd() * 16).toString(16); return s; }

const b64 = {
  from(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); },
  to(str) { const s = atob(str), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; },
};
export { b64 };

const readLS = () => { try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch { return {}; } };
const writeLS = (v) => { try { localStorage.setItem(LS_KEY, JSON.stringify(v)); } catch { /* нет места */ } };

/* ---------- компьютер: обработка запросов телефона ---------- */

// Обработать запрос. req: { method, path, query, key, json, bytes }; → { status, json } | { status, bytes }.
// ctx: { app, mem, code, name } — mem: { peers }, code — текущий код сопряжения; incoming — недокачанные файлы
export async function handleRequest(ctx, req, incoming = new Map()) {
  const { app, mem } = ctx;
  if (req.path === '/melete/v1/pair') {
    const code = String((req.json && req.json.code) || '').replace(/\D/g, '');
    if (!ctx.code || code !== ctx.code) return { status: 403, json: { error: 'code' } };
    const key = newKey();
    mem.peers = { ...(mem.peers || {}), [key]: { name: String((req.json && req.json.name) || 'Телефон').slice(0, 60), at: Date.now() } };
    log('sync', 'сопряжение: ' + mem.peers[key].name);
    return { status: 200, json: { key, name: ctx.name || 'PC' } };
  }
  const peer = mem.peers && mem.peers[req.key];
  if (!peer) return { status: 401, json: { error: 'key' } };
  const F = app.files;
  if (req.path === '/melete/v1/sync') {
    const p = req.json && req.json.data;
    if (p) app.store.replaceState(applyParts(app.store.state, p, SYNC_PARTS));
    peer.at = Date.now();
    return { status: 200, json: { data: pickParts(app.store.state, SYNC_PARTS), files: manifestOf(allFiles(F)) } };
  }
  if (req.path === '/melete/v1/delete') {
    let n = 0;
    for (const id of (req.json && req.json.ids) || []) { const r = F && F.get(id); if (r && syncable(r)) { await F.remove(id); n++; } }
    return { status: 200, json: { removed: n } };
  }
  if (req.path === '/melete/v1/meta') {
    const r = F && F.get(req.query.id);
    return r ? { status: 200, json: metaOf(r) } : { status: 404, json: {} };
  }
  if (req.path === '/melete/v1/get') {
    const r = F && F.get(req.query.id);
    if (!r || !r.blob) return { status: 404, json: {} };
    const off = +req.query.off || 0, len = Math.min(+req.query.len || CHUNK, CHUNK);
    return { status: 200, bytes: new Uint8Array(await r.blob.slice(off, off + len).arrayBuffer()) };
  }
  if (req.path === '/melete/v1/put') {
    const j = req.json || {}, meta = j.meta || {};
    if (!meta.id || !syncable({ ...meta, size: meta.size || 1 })) return { status: 400, json: {} };
    if (F.get(meta.id)) return { status: 200, json: { done: true, have: true } };
    const cur = incoming.get(meta.id) || { meta, parts: [], got: 0 };
    if ((+j.off || 0) !== cur.got) return { status: 409, json: { got: cur.got } }; // кусок не по порядку — с какого продолжить
    const u8 = b64.to(j.b64 || '');
    cur.parts.push(u8); cur.got += u8.length;
    incoming.set(meta.id, cur);
    if (cur.got >= (meta.size || 0)) {
      incoming.delete(meta.id);
      await F.add({ ...meta, blob: new Blob(cur.parts, { type: meta.type || '' }) });
      return { status: 200, json: { done: true } };
    }
    return { status: 200, json: { got: cur.got } };
  }
  return { status: 404, json: {} };
}
const allFiles = (F) => (F ? ['audio', 'tab', 'midi', 'daw'].flatMap((k) => F.list(k)) : []);

// Компьютер: сервер в Rust ↔ этот обработчик. → { start, stop, state, forget(key), subscribe }
export function createSyncServer(app, { isDesktop }) {
  const avail = isDesktop();
  const subs = new Set(), emit = () => subs.forEach((fn) => { try { fn(); } catch { /* */ } });
  let state = { on: false, ips: [], name: '', code: '' }, un = null;
  const mem = readLS(), incoming = new Map();
  const core = () => import('@tauri-apps/api/core');
  async function onReq(e) {
    const r = e.payload || {}, { invoke } = await core();
    let res;
    try {
      const u = new URL(r.url, 'http://x'), raw = r.len ? new Uint8Array(await invoke('sync_body', { rid: r.rid })) : new Uint8Array();
      let json = null;
      if (raw.length) { try { json = JSON.parse(new TextDecoder().decode(raw)); } catch { json = null; } }
      res = await handleRequest({ app, mem, code: state.on ? state.code : '', name: state.name }, { method: r.method, path: u.pathname, query: Object.fromEntries(u.searchParams), key: r.key, json }, incoming);
      writeLS({ peers: mem.peers, on: mem.on });
      if (u.pathname === '/melete/v1/sync' || u.pathname === '/melete/v1/put') { if (app.render) app.render(); emit(); }
    } catch (err) { log('sync', 'ошибка: ' + (err && err.message), 'w'); res = { status: 500, json: { error: String(err && err.message) } }; }
    const body = res.bytes || new TextEncoder().encode(JSON.stringify(res.json || {}));
    await invoke('sync_reply', body, { headers: { rid: String(r.rid), status: String(res.status), ctype: res.bytes ? 'application/octet-stream' : 'application/json' } }).catch(() => {});
  }
  return {
    avail,
    get state() { return state; },
    get peers() { return Object.entries(mem.peers || {}).map(([key, p]) => ({ key, ...p })); },
    wasOn: () => !!mem.on,
    async start() {
      if (!avail) return state;
      const { invoke } = await core();
      if (!un) { const { listen } = await import('@tauri-apps/api/event'); un = await listen('sync-req', onReq); }
      const r = await invoke('sync_start');
      state = { on: !!r.on, ips: r.ips || [], name: r.name || '', code: newCode() };
      mem.on = true; writeLS({ peers: mem.peers, on: true });
      log('sync', 'связь с телефоном включена: ' + state.ips.join(', '));
      emit();
      return state;
    },
    async stop() {
      if (!avail) return;
      const { invoke } = await core();
      await invoke('sync_stop').catch(() => {});
      state = { ...state, on: false, code: '' };
      mem.on = false; writeLS({ peers: mem.peers, on: false });
      emit();
    },
    forget(key) { if (mem.peers) { delete mem.peers[key]; writeLS({ peers: mem.peers, on: mem.on }); emit(); } },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
}

/* ---------- телефон: клиент ---------- */

// HTTP: на телефоне — нативный (страница по https, компьютер — http в своей сети), в браузере — fetch
async function http(method, url, { key = '', json = null, bin = false, timeout = 60000 } = {}) {
  const headers = { 'Content-Type': 'application/json', ...(key ? { 'X-Melete-Key': key } : {}) };
  if (Capacitor.isNativePlatform()) {
    const r = await CapacitorHttp.request({ method, url, headers, data: json || undefined, responseType: bin ? 'arraybuffer' : 'json', connectTimeout: 6000, readTimeout: timeout });
    if (r.status >= 400) throw Object.assign(new Error('http ' + r.status), { status: r.status });
    return bin ? b64.to(typeof r.data === 'string' ? r.data : '') : (typeof r.data === 'string' ? JSON.parse(r.data || '{}') : r.data);
  }
  const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { method, headers, body: json ? JSON.stringify(json) : undefined, signal: ctl.signal });
    if (r.status >= 400) throw Object.assign(new Error('http ' + r.status), { status: r.status });
    return bin ? new Uint8Array(await r.arrayBuffer()) : r.json();
  } finally { clearTimeout(tm); }
}

export const pcOf = () => readLS().pc || null;
export const forgetPc = () => { const m = readLS(); delete m.pc; writeLS(m); };

// Сопряжение: адрес и код с экрана компьютера → ключ. → { name }
export async function pair(addr, code, myName = 'Телефон', H = http) {
  const base = baseOf(addr);
  if (!base) throw Object.assign(new Error('addr'), { reason: 'addr' });
  let hello;
  try { hello = await H('GET', base + '/melete/v1/hello', { timeout: 6000 }); } catch { throw Object.assign(new Error('unreachable'), { reason: 'unreachable' }); }
  if (!hello || hello.app !== 'melete') throw Object.assign(new Error('not melete'), { reason: 'unreachable' });
  let r;
  try { r = await H('POST', base + '/melete/v1/pair', { json: { code: String(code).replace(/\D/g, ''), name: myName } }); } catch (e) { throw Object.assign(new Error('pair'), { reason: e.status === 403 ? 'code' : 'off' }); }
  const m = readLS();
  m.pc = { addr: base, key: r.key, name: r.name || hello.name || 'PC', last: 0, ids: [] };
  writeLS(m);
  log('sync', 'сопряжено с ' + m.pc.name);
  return m.pc;
}

// Синхронизировать с сопряжённым компьютером. onStep({ stage, done, total }) — ход. → итог { songs, sessions, up, down, removed }
export async function syncNow(app, onStep = () => {}, H = http) {
  const m = readLS(), pc = m.pc;
  if (!pc) throw Object.assign(new Error('no pc'), { reason: 'nopc' });
  const base = pc.addr, key = pc.key, F = app.files;
  const before = { songs: app.store.songs().length, sessions: app.store.allSessions().length };
  onStep({ stage: 'data' });
  let r;
  try { r = await H('POST', base + '/melete/v1/sync', { key, json: { data: pickParts(app.store.state, SYNC_PARTS) }, timeout: 120000 }); }
  catch (e) { throw Object.assign(new Error('sync'), { reason: e.status === 401 ? 'key' : e.status ? 'off' : 'unreachable' }); }
  app.store.replaceState(applyParts(app.store.state, r.data, SYNC_PARTS));
  const mine = manifestOf(allFiles(F)), plan = planFiles(mine, r.files || [], pc.ids || []);
  const out = { songs: app.store.songs().length - before.songs, sessions: app.store.allSessions().length - before.sessions, up: 0, down: 0, removed: 0 };
  // удаления в обе стороны
  for (const id of plan.delMine) { if (F.get(id)) { await F.remove(id); out.removed++; } }
  if (plan.delTheirs.length) { await H('POST', base + '/melete/v1/delete', { key, json: { ids: plan.delTheirs } }); out.removed += plan.delTheirs.length; }
  const total = plan.upload.length + plan.download.length;
  let done = 0;
  // на компьютер — кусками
  for (const id of plan.upload) {
    const rec = F.get(id);
    onStep({ stage: 'up', name: rec && rec.name, done, total });
    if (!rec || !rec.blob) { done++; continue; }
    const meta = { ...metaOf(rec), size: rec.blob.size };
    let off = 0;
    do {
      const u8 = new Uint8Array(await rec.blob.slice(off, off + CHUNK).arrayBuffer());
      const res = await H('POST', base + '/melete/v1/put', { key, json: { meta, off, b64: b64.from(u8) }, timeout: 120000 });
      if (res.done) break;
      off = res.got != null ? res.got : off + u8.length;
    } while (off < meta.size);
    out.up++; done++;
  }
  // с компьютера — кусками
  for (const id of plan.download) {
    const meta = await H('GET', base + '/melete/v1/meta?id=' + encodeURIComponent(id), { key });
    onStep({ stage: 'down', name: meta && meta.name, done, total });
    const parts = [];
    for (let off = 0; off < (meta.size || 0); off += CHUNK) parts.push(await H('GET', base + '/melete/v1/get?id=' + encodeURIComponent(id) + '&off=' + off + '&len=' + CHUNK, { key, bin: true, timeout: 120000 }));
    await F.add({ ...meta, blob: new Blob(parts, { type: meta.type || '' }) });
    out.down++; done++;
  }
  // что теперь на обоих — для следующего раза (удаление переносится)
  const now = new Set(manifestOf(allFiles(F)).map((x) => x.id)), theirs = new Set((r.files || []).map((x) => x.id));
  plan.upload.forEach((id) => theirs.add(id)); plan.delTheirs.forEach((id) => theirs.delete(id));
  m.pc = { ...pc, last: Date.now(), ids: [...now].filter((id) => theirs.has(id)) };
  writeLS(m);
  log('sync', 'синхронизация: песен +' + out.songs + ', занятий +' + out.sessions + ', на компьютер ' + out.up + ', с компьютера ' + out.down + ', удалено ' + out.removed);
  if (app.render) app.render();
  return out;
}
