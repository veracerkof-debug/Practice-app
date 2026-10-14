// Папка Melete на устройстве (Android; плагин FolderPlugin): человек выбирает папку (например «Документы/Melete»),
// приложение раскладывает в ней данные и следит за ней в обе стороны:
//   Data/melete-data.json — копия всех данных (песни, занятия, настройки): её можно перенести, заменить и восстановить;
//   Media/ — записи и видео медиатеки; Tabs/ — табы и ноты (Guitar Pro, MusicXML); PDF/ — ноты и книги в PDF;
//   Lyrics/ — тексты с аккордами (ChordPro .cho: {title}, {artist}, {key}, {tempo} и текст с [аккордами]).
// Файлы, положенные в папку (в любую подпапку или прямо в корень), приложение подхватывает: из корня — раскладывает.
// Правка текста песни в файле — переносится в песню, правка в приложении — в файл. Удаление файла из папки ничего
// в приложении не удаляет. Логика без DOM; ввод-вывод — через драйвер (нативный или тестовый).
import { Capacitor, registerPlugin } from '@capacitor/core';

export const DIRS = { data: 'Data', media: 'Media', tabs: 'Tabs', pdf: 'PDF', lyrics: 'Lyrics' };
export const DATA_FILE = 'Data/melete-data.json';
const CHUNK = 768 * 1024;

const ext = (n) => ((/\.([^.\\/]+)$/.exec(n || '') || [])[1] || '').toLowerCase();
const MEDIA = ['mp3', 'm4a', 'aac', 'wav', 'ogg', 'oga', 'opus', 'flac', 'mp4', 'm4v', 'mov', 'webm', '3gp', 'mkv'];
const TABS = ['gp', 'gp3', 'gp4', 'gp5', 'gpx', 'gp7', 'gp8', 'xml', 'musicxml', 'mxl'];
const LYRICS = ['cho', 'chordpro', 'chopro', 'crd', 'onsong', 'txt', 'pro'];
const MIME = { mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', flac: 'audio/flac',
  mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', '3gp': 'video/3gpp', mkv: 'video/x-matroska', pdf: 'application/pdf',
  xml: 'application/vnd.recordare.musicxml+xml', musicxml: 'application/vnd.recordare.musicxml+xml', mxl: 'application/vnd.recordare.musicxml', json: 'application/json' };
export const mimeOf = (name) => MIME[ext(name)] || (LYRICS.includes(ext(name)) ? 'text/plain' : 'application/octet-stream');

// Куда относится файл по имени: 'media' | 'tabs' | 'pdf' | 'lyrics' | null
export function kindOfName(name) {
  const e = ext(name);
  return e === 'pdf' ? 'pdf' : TABS.includes(e) ? 'tabs' : MEDIA.includes(e) ? 'media' : LYRICS.includes(e) ? 'lyrics' : null;
}
// Подпапка для записи файла приложения (files.js): табы и ноты — Tabs или PDF, модули Библии — не выгружаются
export function dirOfRec(r) {
  if (r.kind === 'bible') return null;
  if (r.kind === 'tab') return r.fmt === 'pdf' || r.type === 'application/pdf' || ext(r.name) === 'pdf' ? DIRS.pdf : DIRS.tabs;
  return DIRS.media;
}
// Имя файла для папки: у табов из приложения расширение отрезано при загрузке — вернуть (r.ext, формат, тип)
export function fileNameOf(r) {
  const n = String(r.name || 'file');
  if (kindOfName(n)) return n;
  const e = r.ext || (r.fmt === 'pdf' || r.type === 'application/pdf' ? 'pdf' : /xml/.test(r.type || '') ? 'musicxml' : r.kind === 'tab' ? 'gp' : (/^(audio|video)\/(\w+)/.exec(r.type || '') || [])[2] || 'bin');
  return n + '.' + String(e).replace(/^\./, '').toLowerCase().replace('mpeg', 'mp3').replace('quicktime', 'mov').replace('x-matroska', 'mkv');
}
export const safeName = (s) => String(s || 'file').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120) || 'file';
// Свободное имя в списке занятых: «Имя.ext» → «Имя (2).ext»
export function freeName(name, taken) {
  if (!taken.has(name)) return name;
  const m = /^(.*?)(\.[^.]*)?$/.exec(name);
  for (let i = 2; ; i++) { const n = m[1] + ' (' + i + ')' + (m[2] || ''); if (!taken.has(n)) return n; }
}

// Текст песни для файла (ChordPro): шапка и текст с аккордами
export function songText(s) {
  const head = [['title', s.title], ['artist', s.artist], ['key', s.key], ['tempo', s.targetBpm]].filter(([, v]) => v).map(([k, v]) => '{' + k + ': ' + v + '}');
  return head.join('\n') + '\n\n' + String(s.notes || '').replace(/\r\n?/g, '\n') + '\n';
}
// Короткий отпечаток текста (заметить правку)
export function hash(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36) + ':' + s.length; }

/* ---------- драйвер: нативный (Android) ---------- */

const Folder = Capacitor.isNativePlatform() ? registerPlugin('Folder') : null;
export const folderAvailable = () => !!Folder;
const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s) => { const b = atob(s), u8 = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u8[i] = b.charCodeAt(i); return u8; };
export const nativeDriver = Folder && {
  status: () => Folder.status(),
  pick: () => Folder.pick(),
  forget: () => Folder.forget(),
  list: async (dir) => (await Folder.list({ dir })).items || [],
  mkdirs: (dir) => Folder.mkdirs({ dir }),
  read: async (path, offset, length) => { const r = await Folder.read({ path, offset, length }); return { data: unb64(r.data || ''), size: r.size }; },
  write: (path, u8, append, mime) => Folder.write({ path, data: b64(u8), append, mime }),
  remove: (path) => Folder.remove({ path }),
};

// Прочитать файл целиком (частями) → Uint8Array
export async function readAll(drv, path, size) {
  const parts = [];
  let off = 0, total = size;
  do {
    const r = await drv.read(path, off, CHUNK);
    total = r.size; parts.push(r.data); off += r.data.length;
    if (!r.data.length) break;
  } while (off < total);
  const out = new Uint8Array(off);
  let p = 0; parts.forEach((x) => { out.set(x, p); p += x.length; });
  return out;
}
// Записать Blob или Uint8Array частями
export async function writeAll(drv, path, data, mime) {
  const blob = data instanceof Blob ? data : new Blob([data]);
  if (!blob.size) { await drv.write(path, new Uint8Array(0), false, mime); return; }
  for (let off = 0; off < blob.size; off += CHUNK) {
    await drv.write(path, new Uint8Array(await blob.slice(off, off + CHUNK).arrayBuffer()), off > 0, mime);
  }
}

/* ---------- синхронизация ---------- */

// mem — что помним о папке (settings.folder): files { recId: путь }, texts { songId: { path, hash, mtime } }, seen { путь: размер }
// api — то, что синхронизация делает в приложении:
//   files() → записи файлов (с blob), addFile(rec), songs() → песни, addSong({ title, artist, key, bpm, notes }) → id,
//   setNotes(id, notes), parseText(name, u8) → { title, artist, key, bpm, notes } | null, backup() → строка JSON
// → { wrote, read, songs, texts }
export async function syncFolder(drv, mem, api, now = Date.now()) {
  const out = { wrote: 0, read: 0, songs: 0, texts: 0, sorted: 0 };
  mem.files ??= {}; mem.texts ??= {}; mem.seen ??= {};
  for (const d of Object.values(DIRS)) await drv.mkdirs(d);
  const ls = {};
  for (const d of ['', ...Object.values(DIRS)]) ls[d] = (await drv.list(d)).filter((x) => !x.dir);
  const at = (path) => { const i = path.lastIndexOf('/'), d = i < 0 ? '' : path.slice(0, i), n = path.slice(i + 1); return (ls[d] || []).find((x) => x.name === n) || null; };
  const taken = (d) => new Set((ls[d] || []).map((x) => x.name));

  // 1. Копия данных — всегда свежая
  await writeAll(drv, DATA_FILE, new TextEncoder().encode(api.backup()), 'application/json');

  // 2. Файлы приложения → папка (один раз на файл; удалённый человеком из папки не возвращается)
  const recs = api.files().filter((r) => r.blob && dirOfRec(r));
  const known = new Set(recs.flatMap((r) => [r.name + '|' + (r.size || r.blob.size), fileNameOf(r) + '|' + (r.size || r.blob.size)]));
  for (const r of recs) {
    if (mem.files[r.id]) continue;
    const d = dirOfRec(r), fn = safeName(fileNameOf(r)), same = (ls[d] || []).find((x) => x.name === fn && x.size === (r.size || r.blob.size));
    const name = same ? same.name : freeName(fn, taken(d)), path = d + '/' + name;
    if (!same) { await writeAll(drv, path, r.blob, r.type || mimeOf(name)); (ls[d] ||= []).push({ name, size: r.blob.size, mtime: now }); out.wrote++; }
    mem.files[r.id] = path; mem.seen[path] = r.blob.size;
  }

  // 3. Новые файлы в папке → приложение. Из корня — ещё и раскладываются по подпапкам
  const mapped = new Set(Object.values(mem.files));
  for (const d of ['', DIRS.media, DIRS.tabs, DIRS.pdf]) {
    for (const f of ls[d] || []) {
      const kind = kindOfName(f.name), path = (d ? d + '/' : '') + f.name;
      if (!kind || kind === 'lyrics' || mapped.has(path) || (d && mem.seen[path] === f.size)) continue;
      const rec = known.has(f.name + '|' + f.size) ? null : { name: f.name, size: f.size, type: mimeOf(f.name), kind: kind === 'media' ? 'audio' : 'tab', ...(kind === 'pdf' ? { fmt: 'pdf' } : kind === 'tabs' ? { fmt: 'score' } : {}), songs: [], created: now };
      let u8 = null;
      if (rec || !d) u8 = await readAll(drv, path, f.size);
      if (rec) { rec.blob = new Blob([u8], { type: rec.type }); rec.id = await api.addFile(rec); known.add(f.name + '|' + f.size); out.read++; }
      let dest = path;
      if (!d) { // из корня — в свою подпапку
        const sub = DIRS[kind], name = freeName(f.name, taken(sub));
        dest = sub + '/' + name;
        await writeAll(drv, dest, u8, rec ? rec.type : mimeOf(f.name));
        (ls[sub] ||= []).push({ name, size: f.size, mtime: now });
        await drv.remove(path);
        out.sorted++;
      }
      if (rec && rec.id) mem.files[rec.id] = dest;
      mem.seen[dest] = f.size;
    }
  }

  // 4. Тексты песен ⇄ Lyrics/ (время правки файла — всегда по часам папки: после записи перечитывается)
  const songs = api.songs(), byPath = {}, wroteText = new Set();
  Object.entries(mem.texts).forEach(([id, x]) => { byPath[x.path] = id; });
  for (const s of songs) {
    if (!String(s.notes || '').trim()) continue;
    const m = mem.texts[s.id], text = songText(s), h = hash(text);
    const f = m && at(m.path);
    if (m && f && f.mtime > (m.mtime || 0) + 1000 && f.size !== undefined) {
      // файл менялся после прошлой синхронизации — его текст в песню
      const u8 = await readAll(drv, m.path, f.size), p = api.parseText(m.path, u8);
      if (p && p.notes != null && hash(songText({ ...s, notes: p.notes })) !== h) { api.setNotes(s.id, p.notes); out.texts++; }
      mem.texts[s.id] = { path: m.path, hash: hash(songText({ ...s, notes: p ? p.notes : s.notes })), mtime: f.mtime };
      continue;
    }
    if (m && f && m.hash === h) continue; // без изменений
    const path = m ? m.path : DIRS.lyrics + '/' + freeName(safeName(s.title + (s.artist ? ' — ' + s.artist : '')) + '.cho', taken(DIRS.lyrics));
    await writeAll(drv, path, new TextEncoder().encode(text), 'text/plain');
    const name = path.slice(path.lastIndexOf('/') + 1), cur = (ls[DIRS.lyrics] ||= []).find((x) => x.name === name);
    if (cur) cur.mtime = now; else ls[DIRS.lyrics].push({ name, size: text.length, mtime: now });
    mem.texts[s.id] = { path, hash: h, mtime: now };
    byPath[path] = s.id;
    wroteText.add(s.id);
    out.wrote++;
  }
  // текстовые файлы, которых нет у песен (положены человеком, в Lyrics или в корне) — новые песни
  for (const d of [DIRS.lyrics, '']) {
    for (const f of ls[d] || []) {
      const path = (d ? d + '/' : '') + f.name;
      if (kindOfName(f.name) !== 'lyrics' || byPath[path] || (d === '' && /^readme/i.test(f.name))) continue;
      const u8 = await readAll(drv, path, f.size), p = api.parseText(f.name, u8);
      if (!p || !(p.title || p.notes)) continue;
      const id = api.addSong(p);
      let dest = path;
      if (!d) { const name = freeName(f.name, taken(DIRS.lyrics)); dest = DIRS.lyrics + '/' + name; await writeAll(drv, dest, u8, 'text/plain'); (ls[DIRS.lyrics] ||= []).push({ name, size: f.size, mtime: now }); await drv.remove(path); out.sorted++; }
      mem.texts[id] = { path: dest, hash: '', mtime: now };
      wroteText.add(id);
      byPath[dest] = id;
      out.songs++;
    }
  }
  if (wroteText.size) {
    const fresh = await drv.list(DIRS.lyrics);
    wroteText.forEach((id) => { const m = mem.texts[id], n = m.path.slice(m.path.lastIndexOf('/') + 1), f = fresh.find((x) => x.name === n); if (f) m.mtime = f.mtime; });
  }
  mem.last = now;
  return out;
}

// Прочитать копию данных из папки → объект (для «Восстановить из папки»)
export async function readBackup(drv) {
  const f = (await drv.list(DIRS.data)).find((x) => x.name === 'melete-data.json');
  if (!f) return null;
  return JSON.parse(new TextDecoder().decode(await readAll(drv, DATA_FILE, f.size)));
}
