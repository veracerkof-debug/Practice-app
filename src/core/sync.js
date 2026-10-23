// Связь телефона и компьютера: синхронизация в своей сети Wi-Fi. Компьютер (Windows) — сервер (посредник в Rust:
// src-tauri/src/sync.rs, порт 53319), телефон — клиент. Сопряжение один раз: на компьютере включается «Связь с
// телефоном» — виден адрес и код из 6 цифр; на телефоне вводятся адрес и код, компьютер выдаёт ключ. Дальше —
// кнопка «Синхронизировать» на телефоне (сеть — только по нажатию).
// Что синхронизируется: песни с метками и проекты студии, занятия и профиль, чтение, календарь — части резервной копии
// (backupparts.js: слияние по записям, побеждает более свежая, ничего не теряется); файлы песен и медиатеки —
// записи, табы, ноты, MIDI, дорожки разделения и очищенные записи (без модулей Библии). Дорожки одной записи, посчитанные
// на обоих устройствах, не задваиваются (ключ «запись + часть + режим + версия»). Сведения о записи, посчитанные позже
// (тональность, доли и аккорды rec.ana, текст rec.lyr, отсутствующие части, песни), сливаются, даже если сам файл уже на обоих.
// Удаление файла переносится: телефон помнит, какие файлы были на обоих после прошлой синхронизации (3-стороннее
// сравнение). Настройки и оформление у каждого устройства свои. Ключи сопряжения — не в резервной копии.
// «Считать на компьютере» (settings.pcWork, вкл): телефон не считает дорожки и разбор записей, которые посчитает
// компьютер (он сообщает, что умеет), а сам синхронизируется в фоне (settings.syncAuto, вкл) — только в тишине;
// компьютер берёт записи телефона в свою фоновую очередь (autostems.js, режим — как просил телефон: rec.want) и
// результаты приходят при следующей синхронизации. Компьютера нет дольше суток — телефон считает сам.
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { pickParts, applyParts } from './backupparts.js';
import { log } from './log.js';

export const PORT = 53319;
export const SYNC_PARTS = ['songs', 'profile', 'reading', 'calendar'];
export const CHUNK = 2 << 20; // кусок файла — 2 МБ (в base64 ~2,7 МБ на запрос)
const LS_KEY = 'melete.sync'; // { peers: { ключ: { name, at } } } на компьютере; { pc: { addr, key, name, last, ids } } на телефоне

/* ---------- чистые функции ---------- */

// Файлы, которые синхронизируются: с содержимым, не модули Библии
export const syncable = (r) => !!r && !!r.id && r.kind !== 'bible' && (r.blob || r.size);
// Ключ производного файла: два устройства посчитали одно и то же — второй экземпляр не переносится
export function derivedKey(r) {
  if (r.stem) return 's:' + r.stem.src + ':' + r.stem.part + ':' + (r.stem.mode || '4') + ':' + (r.stem.hq ? 1 : 0);
  if (r.trans) return 'n:' + r.trans.src;
  if (r.dn) return 'd:' + r.dn.src;
  return '';
}
// Сведения записи, которые сливаются между устройствами
const sortObj = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? Object.keys(o).sort().map((k) => [k, o[k]]) : o || 0);
function hashStr(str) { let h = 5381; for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
export const metaHash = (r) => hashStr(JSON.stringify([r.ana ? [r.ana.v || 1, r.ana.at || 0] : 0, r.lyr ? r.lyr.at || 1 : 0, sortObj(r.stemsAbsent), [...(r.songs || [])].sort(), r.want ? [r.want.stems, !!r.want.hq] : 0]));
// Что взять записи a от записи b → изменения или null. Слияние одинаково на обеих сторонах, поэтому сходится:
// разбор — новее по версии и времени, текст — новее, отсутствующие части и песни — объединение, пожелание — если своего нет
export function mergeMeta(a, b) {
  if (!a || !b) return null;
  const p = {}, A = a.ana, B = b.ana;
  if (B && (!A || (B.v || 1) > (A.v || 1) || ((B.v || 1) === (A.v || 1) && (B.at || 0) > (A.at || 0)))) p.ana = B;
  if (b.lyr && (!a.lyr || (b.lyr.at || 0) > (a.lyr.at || 0))) p.lyr = b.lyr;
  const sa = a.stemsAbsent && !Array.isArray(a.stemsAbsent) ? a.stemsAbsent : {}, sb = b.stemsAbsent && !Array.isArray(b.stemsAbsent) ? b.stemsAbsent : {};
  if (Object.keys(sb).some((k) => !(k in sa))) p.stemsAbsent = { ...sb, ...sa };
  const songs = new Set(a.songs || []);
  if ((b.songs || []).some((x) => !songs.has(x))) p.songs = [...songs, ...(b.songs || []).filter((x) => !songs.has(x))];
  if (b.want && !a.want) p.want = b.want;
  return Object.keys(p).length ? p : null;
}
const metaFields = (r) => { const o = { id: r.id }; ['ana', 'lyr', 'stemsAbsent', 'songs', 'want'].forEach((k) => { if (r[k] != null) o[k] = r[k]; }); return o; };
export const manifestOf = (list) => list.filter(syncable).map((r) => { const k = derivedKey(r); return { id: r.id, size: r.size || (r.blob && r.blob.size) || 0, name: r.name || '', h: metaHash(r), ...(k ? { k } : {}) }; });
// Без содержимого и служебного — то, что уходит вместе с файлом
export function metaOf(r) { const m = { ...r }; delete m.blob; delete m._busy; return m; }

// План обмена файлами. mine, theirs — манифесты; last — id, которые были на обоих после прошлой синхронизации.
// Нет у них, но было у обоих — там удалили: удалить у себя. Нет у меня, но было у обоих — я удалил: удалить у них.
// Производный файл (дорожка, ноты), у которого на другой стороне есть свой с тем же ключом, не переносится; ключи
// считаются по тому, что останется после удалений (пересчитанные дорожки заменяют старые). meta — файлы на обоих с разными сведениями
export function planFiles(mine, theirs, last = []) {
  const A = new Set(mine.map((x) => x.id)), B = new Set(theirs.map((x) => x.id)), L = new Set(last);
  const out = { upload: [], download: [], delMine: [], delTheirs: [], meta: [] };
  mine.forEach((x) => { if (!B.has(x.id) && L.has(x.id)) out.delMine.push(x.id); });
  theirs.forEach((x) => { if (!A.has(x.id) && L.has(x.id)) out.delTheirs.push(x.id); });
  const dm = new Set(out.delMine), dt = new Set(out.delTheirs);
  const kA = new Set(mine.filter((x) => x.k && !dm.has(x.id)).map((x) => x.k)), kB = new Set(theirs.filter((x) => x.k && !dt.has(x.id)).map((x) => x.k));
  mine.forEach((x) => { if (!B.has(x.id) && !L.has(x.id) && !(x.k && kB.has(x.k))) out.upload.push(x.id); });
  theirs.forEach((x) => { if (!A.has(x.id) && !L.has(x.id) && !(x.k && kA.has(x.k))) out.download.push(x.id); });
  const hB = new Map(theirs.map((x) => [x.id, x.h]));
  mine.forEach((x) => { if (hB.has(x.id) && x.h && hB.get(x.id) && hB.get(x.id) !== x.h) out.meta.push(x.id); });
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
  // фоновая синхронизация телефона ждёт, пока на компьютере звучит музыка или идёт занятие: приём файлов нагружает окно
  if ((req.query.auto || (req.json && req.json.auto)) && ctx.busy && ctx.busy()) return { status: 503, json: { error: 'busy' } };
  const F = app.files;
  // ансамбль (ensemble.js): опрос участника и сверка часов — без ожидания тишины
  if (req.path === '/melete/v1/ens') return ctx.ens ? ctx.ens.poll(req.key, peer.name, req.json || {}) : { status: 409, json: { error: 'off' } };
  if (req.path === '/melete/v1/sync') {
    const p = req.json && req.json.data;
    if (p) app.store.replaceState(applyParts(app.store.state, p, SYNC_PARTS));
    peer.at = Date.now();
    return { status: 200, json: { data: pickParts(app.store.state, SYNC_PARTS), files: manifestOf(allFiles(F)), work: ctx.work ? ctx.work() : null } };
  }
  if (req.path === '/melete/v1/setmeta') {
    const m = (req.json && req.json.meta) || {}, r = F && F.get(m.id);
    if (!r) return { status: 404, json: {} };
    const p = mergeMeta(r, m);
    if (p) { Object.assign(r, p); await F.save(r); }
    return { status: 200, json: { h: metaHash(r) } };
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
    if (F.get(meta.id)) { if (meta.ens && ctx.ens) ctx.ens.gotFile(req.key, meta); return { status: 200, json: { done: true, have: true } }; }
    const cur = incoming.get(meta.id) || { meta, parts: [], got: 0 };
    if ((+j.off || 0) !== cur.got) return { status: 200, json: { got: cur.got } }; // кусок не по порядку (прерванная передача) — с какого продолжить
    const u8 = b64.to(j.b64 || '');
    cur.parts.push(u8); cur.got += u8.length;
    incoming.set(meta.id, cur);
    if (cur.got >= (meta.size || 0)) {
      incoming.delete(meta.id);
      await F.add({ ...meta, blob: new Blob(cur.parts, { type: meta.type || '' }) });
      if (meta.ens && ctx.ens) ctx.ens.gotFile(req.key, meta);
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
      res = await handleRequest({ app, mem, ens: app.ens && app.ens.active ? app.ens : null, code: state.on ? state.code : '', name: state.name, busy: () => !!(app.auto && app.auto.playing && app.auto.playing()), work: () => (app.auto && app.auto.caps ? app.auto.caps() : null) }, { method: r.method, path: u.pathname, query: Object.fromEntries(u.searchParams), key: r.key, json }, incoming);
      writeLS({ peers: mem.peers, on: mem.on });
      if (u.pathname === '/melete/v1/sync' || u.pathname === '/melete/v1/put' || u.pathname === '/melete/v1/setmeta') { if (app.render) app.render(); emit(); }
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
export async function http(method, url, { key = '', json = null, bin = false, timeout = 60000 } = {}) {
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

// Синхронизировать с сопряжённым компьютером. onStep({ stage, done, total }) — ход. opts: auto — фоновая (компьютер
// может отказать, если у него звучит музыка), stop() — прервать между кусками (у телефона зазвучало), want — какие
// дорожки нужны телефону (уходит с записью). → итог { songs, sessions, up, down, removed, meta }
export async function syncNow(app, onStep = () => {}, H = http, opts = {}) {
  const m = readLS(), pc = m.pc;
  if (!pc) throw Object.assign(new Error('no pc'), { reason: 'nopc' });
  const base = pc.addr, key = pc.key, F = app.files, auto = !!opts.auto, q = auto ? '&auto=1' : '';
  const halt = () => { if (opts.stop && opts.stop()) throw Object.assign(new Error('stopped'), { reason: 'stopped' }); };
  const fail = (e) => Object.assign(new Error('sync'), { reason: e.status === 401 ? 'key' : e.status === 503 ? 'busy' : e.status ? 'off' : 'unreachable' });
  const call = (method, path, o = {}) => H(method, base + path, { key, ...o }).catch((e) => { throw e.reason ? e : fail(e); });
  const before = { songs: app.store.songs().length, sessions: app.store.allSessions().length };
  onStep({ stage: 'data' });
  const r = await call('POST', '/melete/v1/sync', { json: { data: pickParts(app.store.state, SYNC_PARTS), auto }, timeout: 120000 });
  app.store.replaceState(applyParts(app.store.state, r.data, SYNC_PARTS));
  pc.work = r.work || null; m.pc = { ...pc }; writeLS(m); // что компьютер считает сам — для «Считать на компьютере»
  const mine = manifestOf(allFiles(F)), plan = planFiles(mine, r.files || [], pc.ids || []);
  const out = { songs: app.store.songs().length - before.songs, sessions: app.store.allSessions().length - before.sessions, up: 0, down: 0, removed: 0, meta: 0 };
  // удаления в обе стороны
  for (const id of plan.delMine) { if (F.get(id)) { await F.remove(id); out.removed++; } }
  if (plan.delTheirs.length) { await call('POST', '/melete/v1/delete', { json: { ids: plan.delTheirs, auto } }); out.removed += plan.delTheirs.length; }
  // сведения файлов, которые уже на обоих: разбор, текст, песни — в обе стороны
  for (const id of plan.meta) {
    halt();
    const rec = F.get(id);
    if (!rec) continue;
    const theirs = await call('GET', '/melete/v1/meta?id=' + encodeURIComponent(id) + q);
    const p = mergeMeta(rec, theirs);
    if (p) { Object.assign(rec, p); await F.save(rec); }
    if (metaHash(rec) !== metaHash(theirs)) await call('POST', '/melete/v1/setmeta', { json: { meta: metaFields(rec), auto } });
    out.meta++;
  }
  const total = plan.upload.length + plan.download.length;
  let done = 0;
  // на компьютер — кусками; запись без дорожек уходит с пожеланием, какие дорожки нужны
  for (const id of plan.upload) {
    halt();
    const rec = F.get(id);
    onStep({ stage: 'up', name: rec && rec.name, done, total });
    if (!rec || !rec.blob) { done++; continue; }
    const meta = { ...metaOf(rec), size: rec.blob.size, ...(opts.want && !rec.stem && rec.kind !== 'midi' && rec.kind !== 'tab' && rec.kind !== 'daw' && !rec.want ? { want: opts.want } : {}) };
    let off = 0;
    do {
      halt();
      const u8 = new Uint8Array(await rec.blob.slice(off, off + CHUNK).arrayBuffer());
      const res = await call('POST', '/melete/v1/put', { json: { meta, off, b64: b64.from(u8), auto }, timeout: 120000 });
      if (res.done) break;
      off = res.got != null ? res.got : off + u8.length;
    } while (off < meta.size);
    out.up++; done++;
  }
  // с компьютера — кусками
  for (const id of plan.download) {
    halt();
    const meta = await call('GET', '/melete/v1/meta?id=' + encodeURIComponent(id) + q);
    onStep({ stage: 'down', name: meta && meta.name, done, total });
    const parts = [];
    for (let off = 0; off < (meta.size || 0); off += CHUNK) { halt(); parts.push(await call('GET', '/melete/v1/get?id=' + encodeURIComponent(id) + '&off=' + off + '&len=' + CHUNK + q, { bin: true, timeout: 120000 })); }
    await F.add({ ...meta, blob: new Blob(parts, { type: meta.type || '' }) });
    out.down++; done++;
  }
  // что теперь на обоих — для следующего раза (удаление переносится)
  const now = new Set(manifestOf(allFiles(F)).map((x) => x.id)), theirs = new Set((r.files || []).map((x) => x.id));
  plan.upload.forEach((id) => theirs.add(id)); plan.download.forEach((id) => theirs.add(id)); plan.delTheirs.forEach((id) => theirs.delete(id));
  m.pc = { ...readLS().pc, last: Date.now(), ids: [...now].filter((id) => theirs.has(id)) };
  writeLS(m);
  if (out.songs || out.sessions || out.up || out.down || out.removed || out.meta || !auto) log('sync', (auto ? 'фоновая ' : '') + 'синхронизация: песен +' + out.songs + ', занятий +' + out.sessions + ', на компьютер ' + out.up + ', с компьютера ' + out.down + ', сведений ' + out.meta + ', удалено ' + out.removed);
  if (app.render && (out.songs || out.sessions || out.down || out.removed || out.meta)) app.render();
  return out;
}

const DAY = 86400000, MIN = 60000;
// Телефон: «Считать на компьютере» и фоновая синхронизация. Раз в минуту — проверка: есть сопряжённый компьютер, тихо
// (ничего не звучит, нет занятия и записи, человек не трогает экран — autostems.quiet), пора? Пора: новые записи на
// телефоне — через минуту, ждём результатов от компьютера — раз в 5 минут, иначе — раз в 30; неудачи — реже (до 30 мин).
// Зазвучало — синхронизация прерывается между кусками и продолжится позже. Ручная кнопка — через run (одна за раз).
export function createSyncClient(app, { H = http, now = () => Date.now() } = {}) {
  const S = () => app.store.state.settings, subs = new Set();
  const emit = () => subs.forEach((fn) => { try { fn(); } catch { /* */ } });
  let busy = false, lastTry = 0, fails = 0, last = null, timer = 0;
  const pcWork = () => S().pcWork !== false, syncAuto = () => S().syncAuto !== false;
  const quiet = () => !app.auto || !app.auto.quiet || app.auto.quiet();
  // компьютер «рядом»: синхронизировались за последние трое суток
  const near = () => { const pc = pcOf(); return !!pc && !!pc.last && now() - pc.last < 3 * DAY; };
  // Ждать ли компьютер для записи r: kind — 'stems' | 'ana'. Свежая запись (сутки) или уже на компьютере (трое суток)
  function waits(r, kind) {
    if (!pcWork() || !near()) return false;
    const pc = pcOf(), w = pc.work || {};
    if (kind === 'stems' && (!w.stems || w.stems === 'off')) return false;
    if (kind === 'ana' && !w.ana) return false;
    const age = now() - (r.created || 0);
    return age < DAY || ((pc.ids || []).includes(r.id) && age < 3 * DAY);
  }
  const fresh = () => { const pc = pcOf(), ids = new Set((pc && pc.ids) || []); return manifestOf(allFiles(app.files)).some((x) => !ids.has(x.id)); };
  // записей, которые ждут результатов от компьютера
  const waiting = () => (app.files ? app.files.list('audio').filter((r) => !r.stem && !r.dn && !r.noAuto && ((waits(r, 'stems') && !hasAnyStems(app.files, r.id)) || (waits(r, 'ana') && !r.ana))).length : 0);
  const interval = () => (fails ? Math.min(30 * MIN, 2 * MIN * 2 ** (fails - 1)) : fresh() ? MIN : waiting() ? 5 * MIN : 30 * MIN);
  async function run(onStep = () => {}, opts = {}) {
    if (busy) throw Object.assign(new Error('busy'), { reason: 'running' });
    busy = true; lastTry = now(); emit();
    try {
      const r = await syncNow(app, onStep, H, { want: app.auto && app.auto.want ? app.auto.want() : null, ...opts });
      fails = 0; last = { at: now(), ok: true, r };
      if (app.auto && app.auto.kick) app.auto.kick();
      return r;
    } catch (e) {
      if (e.reason !== 'stopped' && e.reason !== 'busy') fails++;
      last = { at: now(), ok: false, reason: e.reason };
      throw e;
    } finally { busy = false; emit(); }
  }
  async function tick() {
    if (busy || !pcOf() || !syncAuto() || !quiet()) return;
    if (now() - lastTry < interval()) return;
    try { await run(() => {}, { auto: true, stop: () => !quiet() }); } catch { /* повторится */ }
  }
  return {
    waits, run, tick, quiet,
    get busy() { return busy; },
    get last() { return last; },
    waiting,
    start() { if (!timer) timer = setInterval(tick, MIN); setTimeout(tick, 20000); },
    stop() { clearInterval(timer); timer = 0; },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
}
const hasAnyStems = (F, id) => F.list('audio').some((x) => x.stem && x.stem.src === id);
