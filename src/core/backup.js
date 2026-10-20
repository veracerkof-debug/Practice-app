// Резервная копия данных с подписью: кто сохранил (имя из профиля) и когда. Куда — по возможности:
// в папку Melete (Data/Backups, src/core/folder.js), иначе на Android — системное «Поделиться» (выбрать, куда
// положить файл: Документы, Telegram, почта), в браузере — скачивание файла.
// Что сохранить — по частям (backupparts.js): настройки, песни (по желанию — с файлами), профиль и статистика,
// план чтения, календарь. Без выбора (ежедневная копия в папку) — всё, кроме файлов.
import { PARTS, pickParts, applyParts, partsOf, mergeTools } from './backupparts.js';
import { fileSongs } from './files.js';
import { LS_T } from './device.js';

export const backupBy = (app) => ((app.store.state.settings.profile || {}).name || '').trim();
export const backupInfo = (app, at = Date.now()) => ({ by: backupBy(app), at, app: 'Melete' });
export const backupText = (app) => app.store.exportBackup(backupInfo(app));

// Подпись из файла копии → { by, at } | null
export const infoOf = (p) => (p && p.backupInfo && typeof p.backupInfo === 'object' ? { by: String(p.backupInfo.by || ''), at: +p.backupInfo.at || 0 } : null);

const readTools = () => { try { return JSON.parse(localStorage.getItem(LS_T)) || null; } catch { return null; } };

// Файлы песен (записи, табы и ноты, MIDI) — то, что привязано к живым песням; модули Библии — нет
export function songFiles(app) {
  const live = new Set(app.store.songs().map((s) => s.id)), F = app.files;
  if (!F) return [];
  return ['audio', 'tab', 'midi'].flatMap((k) => F.list(k)).filter((r) => r.blob && fileSongs(r).some((id) => live.has(id)));
}
export const filesSize = (list) => list.reduce((a, r) => a + (r.blob ? r.blob.size : r.size || 0), 0);

async function toB64(blob) {
  const u = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(s);
}
const fromB64 = (b) => { const s = atob(b), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };

// Текст копии из выбранных частей; files — с файлами песен
export async function backupData(app, parts = PARTS, { files = false } = {}) {
  const p = pickParts(app.store.state, parts, { tools: parts.includes('settings') ? readTools() : null });
  if (files && parts.includes('songs')) {
    p.files = [];
    for (const r of songFiles(app)) {
      const meta = { ...r };
      delete meta.blob; delete meta._busy;
      p.files.push({ ...meta, data: await toB64(r.blob) });
    }
  }
  return JSON.stringify({ backupInfo: backupInfo(app), ...p }, null, 1);
}

// Загрузить выбранные части копии p. → { sessions: новых занятий, files: добавлено файлов, tools: настройки инструментов изменились }
export async function restoreParts(app, p, parts) {
  const before = app.store.allSessions().length, use = parts.filter((k) => partsOf(p).includes(k));
  app.store.replaceState(applyParts(app.store.state, p, use));
  let files = 0, tools = false;
  if (use.includes('songs') && Array.isArray(p.files) && app.files) {
    for (const f of p.files) {
      if (!f || !f.id || !f.data || app.files.get(f.id)) continue;
      const { data, ...meta } = f;
      await app.files.add({ ...meta, blob: new Blob([fromB64(data)], { type: f.type || '' }) });
      files++;
    }
  }
  if (use.includes('settings') && p.tools) {
    try { localStorage.setItem(LS_T, JSON.stringify(mergeTools(readTools(), p.tools))); tools = true; } catch { /* нет места */ }
  }
  return { sessions: app.store.allSessions().length - before, files, tools };
}

// Сохранить копию. opts: { parts, files } — по частям; без них — всё (как раньше).
// → { where: 'folder' | 'shared' | 'saved' | 'cancel', name }
export async function saveBackup(app, opts = null) {
  const text = opts ? await backupData(app, opts.parts, opts) : backupText(app);
  const F = app.folder;
  if (F && F.state && F.state.ok && F.saveBackup) {
    const name = await F.saveBackup(text);
    if (name) return { where: 'folder', name };
  }
  const { backupName } = await import('./folder.js'), { sendFile } = await import('./screens/share.js');
  const name = backupName(backupBy(app)), where = await sendFile(new TextEncoder().encode(text), name, name, 'application/json');
  return { where, name };
}
