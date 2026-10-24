// Копии на устройстве — страховка без папки Melete: раз в сутки при запуске и перед каждым обновлением приложение
// само кладёт копию данных (всё, кроме файлов: песни, занятия, календарь, чтение, профиль, настройки) во внутреннюю
// базу IndexedDB. Хранятся последние 7 суточных и 3 «перед обновлением». Защищают от неудачного обновления и ошибки;
// от потери телефона защищает папка Melete (там копия с подписью — тоже раз в сутки, folder.js) или копия «Поделиться».
// Загрузка — Профиль → Данные и копии → «Копии на устройстве» (выбор частей — backupsheet.js).
import { backupText } from './backup.js';
import { log, logErr } from './log.js';

export const KEEP_DAY = 7, KEEP_UPD = 3;
const DB = 'melete-snap', ST = 'snaps';
const dayOf = (t) => { const d = new Date(t), p = (n) => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); };

// Что убрать: суточные — сверх 7 самых свежих, «перед обновлением» — сверх 3. list — [{ id, at, kind }]
export function toPrune(list, keepDay = KEEP_DAY, keepUpd = KEEP_UPD) {
  const by = (k) => list.filter((x) => x.kind === k).sort((a, b) => b.at - a.at);
  return [...by('day').slice(keepDay), ...by('update').slice(keepUpd)].map((x) => x.id);
}
export const dayId = (t) => 'day-' + dayOf(t);

function open() {
  return new Promise((res, rej) => {
    if (typeof indexedDB === 'undefined') { rej(new Error('no indexedDB')); return; }
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(ST)) r.result.createObjectStore(ST, { keyPath: 'id' }); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
const tx = async (mode, fn) => { const db = await open(); return new Promise((res, rej) => { const t = db.transaction(ST, mode), s = t.objectStore(ST); const out = fn(s); t.oncomplete = () => { db.close(); res(out && out.result !== undefined ? out.result : out); }; t.onerror = () => { db.close(); rej(t.error); }; }); };

export function createSnapshots(app) {
  // список без текста копии — для экрана
  async function list() {
    const all = await tx('readonly', (s) => s.getAll());
    return (all || []).map(({ id, at, kind, build, size }) => ({ id, at, kind, build, size })).sort((a, b) => b.at - a.at);
  }
  async function take(kind = 'day', { build = 0 } = {}) {
    try {
      const text = backupText(app), at = Date.now(), id = kind === 'day' ? dayId(at) : 'upd-' + at + '-' + Math.random().toString(36).slice(2, 6);
      await tx('readwrite', (s) => s.put({ id, at, kind, build, size: text.length, text }));
      const old = toPrune(await list());
      if (old.length) await tx('readwrite', (s) => old.forEach((k) => s.delete(k)));
      log('snap', 'копия на устройстве: ' + (kind === 'day' ? 'суточная' : 'перед обновлением') + ', ' + Math.round(text.length / 1024) + ' КБ');
      return id;
    } catch (e) { logErr('snap', e); return null; }
  }
  async function read(id) { const r = await tx('readonly', (s) => s.get(id)); return r && r.text ? JSON.parse(r.text) : null; }
  return {
    list, take, read,
    // при запуске: суточная — если сегодня ещё нет (через минуту: не мешать старту и звуку)
    auto() { setTimeout(async () => { try { if (!(await list()).some((x) => x.id === dayId(Date.now()))) await take('day'); } catch (e) { logErr('snap', e); } }, 60000); },
  };
}
