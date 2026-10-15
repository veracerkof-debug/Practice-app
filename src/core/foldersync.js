// Папка Melete в приложении: когда синхронизировать и что делать с находками (логика — src/core/folder.js).
// Синхронизация — при запуске, при возвращении в приложение и через несколько секунд после изменений.
// Память о папке (какие файлы уже выгружены, тексты песен) — на этом устройстве (localStorage), не в копии данных.
import { folderAvailable, nativeDriver, syncFolder, readBackup } from './folder.js';
import { fromChordPro } from './songimport.js';
import { saveSong, emptySong } from './library.js';
import { normKey } from './share.js';
import { uid } from './time.js';
import { log, logErr } from './log.js';

const KEY = 'practice.v1.folder';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
const keep = (m) => { try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* без памяти — выгрузит заново */ } };

export function initFolder(app) {
  const avail = folderAvailable();
  let busy = false, timer = 0, state = { ok: false, name: '' }, last = 0;
  const subs = new Set(), emit = () => subs.forEach((fn) => fn());
  const st = () => app.store.state.settings;

  const api = {
    files: () => [...app.files.list('audio'), ...app.files.list('tab')],
    addFile: async (r) => { r.id = 'fd' + uid(); await app.files.add(r); return r.id; },
    songs: () => app.store.songs(),
    addSong: (p) => saveSong(app.store, null, { ...emptySong(st()), title: p.title || 'Melete', artist: p.artist || '', key: normKey(p.key), targetBpm: p.bpm || '', notes: p.notes || '' }),
    setNotes: (id, notes) => { const s = app.store.songById(id); if (!s) return; s.notes = notes; s.updatedAt = app.store.now(); app.store.save(); },
    parseText: (name, u8) => { try { return fromChordPro(new TextDecoder().decode(u8).replace(/^﻿/, ''), name); } catch { return null; } },
    backup: () => app.store.exportBackup(),
  };

  async function status() {
    if (!avail) return state;
    try { const r = await nativeDriver.status(); state = { ok: !!r.ok, name: r.name || '' }; } catch { state = { ok: false, name: '' }; }
    emit();
    return state;
  }

  async function sync() {
    if (!avail || busy) return null;
    if (!state.ok && !(await status()).ok) return null;
    busy = true; emit();
    try {
      const mem = load(), r = await syncFolder(nativeDriver, mem, api);
      keep(mem); last = Date.now();
      if (r.wrote || r.read || r.songs || r.texts || r.sorted) log('folder', 'синхронизация: выгружено ' + r.wrote + ', принято файлов ' + r.read + ', песен ' + r.songs + ', текстов ' + r.texts + ', разложено ' + r.sorted);
      if ((r.read || r.songs || r.texts) && app.render && !app.openTool) app.render();
      return r;
    } catch (e) { logErr('folder', e); return null; }
    finally { busy = false; emit(); }
  }
  const schedule = (ms = 8000) => { if (!avail) return; clearTimeout(timer); timer = setTimeout(sync, ms); };

  const folder = {
    available: avail,
    get state() { return state; },
    get busy() { return busy; },
    get last() { return last; },
    subscribe: (fn) => { subs.add(fn); return () => subs.delete(fn); },
    status, sync, schedule,
    // выбрать папку (системный выбор) и сразу разложить данные
    async pick() {
      if (!avail) return false;
      try { const r = await nativeDriver.pick(); state = { ok: !!r.ok, name: r.name || '' }; } catch { return false; }
      keep({}); // новая папка — выгружается заново
      emit();
      await sync();
      return true;
    },
    // убрать из папки копии файлов (id записей) и тексты песен (id песен) — например, демо-набора
    async drop({ files = [], songs = [] } = {}) {
      const mem = load();
      let n = 0;
      const rm = async (path) => { if (!avail || !state.ok) return; try { await nativeDriver.remove(path); n++; } catch { /* уже нет */ } };
      for (const id of files) { const path = mem.files && mem.files[id]; if (path) { await rm(path); delete mem.files[id]; if (mem.seen) delete mem.seen[path]; } }
      for (const id of songs) { const m = mem.texts && mem.texts[id]; if (m) { await rm(m.path); delete mem.texts[id]; } }
      keep(mem);
      return n;
    },
    async forget() { if (!avail) return; try { await nativeDriver.forget(); } catch { /* уже нет */ } keep({}); state = { ok: false, name: '' }; emit(); },
    // данные из папки (Data/melete-data.json) — слиянием с текущими, как «Загрузить копию»
    async restore() {
      const p = await readBackup(nativeDriver);
      if (!p) return null;
      return app.store.importBackup(p);
    },
  };

  if (avail) {
    status().then((s) => { if (s.ok) app.files.ready.then(() => schedule(3000)); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && state.ok && Date.now() - last > 60000) schedule(1500); });
    app.files.subscribe(() => { if (state.ok) schedule(10000); });
    app.store.subscribe(() => { if (state.ok) schedule(15000); });
  }
  return folder;
}
