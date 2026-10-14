// Обмен с командой: файл .melete — песни (название, исполнитель, жанр, тональность, темп, текст с аккордами, метроном),
// их табы и ноты (по желанию — и записи) и сет-лист репетиции (событие календаря). Без серверов: файл уходит через
// «Поделиться» (Telegram, WhatsApp, почта), принимается кнопкой «Принять файл» или открытием файла в Melete.
// Личное не отправляется: выученность, сложность, текущий темп, метки, время занятий.
// Формат — zip: melete.json (описание, версия v) + files/… (см. docs/share-format.md). Без DOM.
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { uid } from './time.js';

export const SHARE_FORMAT = 'melete', SHARE_V = 1, SHARE_EXT = '.melete', SHARE_MIME = 'application/octet-stream';

// Поля песни, которые уходят команде
const SONG_FIELDS = ['title', 'artist', 'genre', 'key', 'targetBpm', 'notes'];
// Поля события-сет-листа
const SET_FIELDS = ['title', 'kind', 'start', 'end', 'allDay', 'place', 'note'];

const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] != null && o[k] !== '').map((k) => [k, o[k]]));
const safe = (s) => String(s || 'file').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').slice(0, 80);
const fileSongs = (r) => r.songs || (r.songId ? [r.songId] : []);
// Уже сжатое (аудио, видео, PDF, картинки, zip) — без повторного сжатия
const packed = (r) => /^(audio|video|image)\//.test(r.type || '') || /pdf|zip/.test(r.type || '') || /\.(pdf|mp3|m4a|ogg|opus|mp4|webm|jpe?g|png|gp[x5]?|mxl)$/i.test(r.name || '');

// Какие файлы песни уходят: табы и ноты — всегда (если withTabs), записи — только по выбору
export function filesFor(files, songIds, { tabs = true, audio = false } = {}) {
  const ids = new Set(songIds);
  return files.filter((r) => r.blob && r.kind !== 'bible' && fileSongs(r).some((id) => ids.has(id)) && (r.kind === 'tab' ? tabs : audio));
}

// Упаковать: songs — песни приложения; files — записи файлов (с blob); set — событие календаря или null.
// → Uint8Array (zip)
export async function pack({ songs, files = [], set = null, title = '', now = Date.now() }) {
  const ids = new Set(songs.map((s) => s.id));
  const zip = {}, fl = [];
  for (const r of files) {
    const path = 'files/' + (fl.length + 1) + '-' + safe(r.name);
    const u8 = new Uint8Array(await r.blob.arrayBuffer());
    zip[path] = packed(r) ? [u8, { level: 0 }] : u8;
    fl.push({ ref: r.id, path, ...pick(r, ['name', 'type', 'kind', 'fmt', 'dur']), size: u8.length, songs: fileSongs(r).filter((id) => ids.has(id)) });
  }
  const manifest = {
    format: SHARE_FORMAT, v: SHARE_V, created: now, title: title || (set && set.title) || (songs.length === 1 ? songs[0].title : ''),
    songs: songs.map((s) => ({ ref: s.from || s.id, ...pick(s, SONG_FIELDS), ...(s.metro ? { metro: s.metro } : {}) })),
    set: set ? { ref: set.from || set.id, ...pick(set, SET_FIELDS), songs: (set.songs || []).filter((id) => ids.has(id)).map((id) => { const s = songs.find((x) => x.id === id); return s.from || s.id; }) } : null,
    files: fl,
  };
  // песни в файле — по ref; у файлов — ref песен
  const refOf = new Map(songs.map((s) => [s.id, s.from || s.id]));
  manifest.files.forEach((f) => { f.songs = f.songs.map((id) => refOf.get(id)); });
  zip['melete.json'] = strToU8(JSON.stringify(manifest, null, 1));
  return zipSync(zip, { level: 6 });
}

// Распаковать и проверить. → { manifest, data(path) → Uint8Array|null } или бросает Error('notMelete' | 'newer')
export function unpack(u8) {
  let z;
  try { z = unzipSync(u8); } catch { throw new Error('notMelete'); }
  let m;
  try { m = JSON.parse(strFromU8(z['melete.json'])); } catch { throw new Error('notMelete'); }
  if (!m || m.format !== SHARE_FORMAT || !Array.isArray(m.songs)) throw new Error('notMelete');
  if (m.v > SHARE_V) throw new Error('newer');
  m.files = (m.files || []).filter((f) => f && f.path && z[f.path]);
  return { manifest: m, data: (p) => z[p] || null };
}

const norm = (s) => String(s || '').trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');

// Совпадение с песней на устройстве: та же песня, полученная раньше (from), своя (id), или то же название и исполнитель
export function matchSong(songs, x) {
  return songs.find((s) => s.from === x.ref || s.id === x.ref) ||
    songs.find((s) => norm(s.title) === norm(x.title) && norm(s.artist) === norm(x.artist)) || null;
}

// План импорта: для каждой песни — что сделать. 'add' (новая), 'update' (обновить совпавшую), 'skip'
export function planImport(songs, manifest) {
  return manifest.songs.map((x) => { const m = matchSong(songs, x); return { x, match: m, action: m ? 'update' : 'add' }; });
}

// Изменится ли совпавшая песня (чтобы показать «без изменений»)
export function differs(s, x) {
  return SONG_FIELDS.some((k) => (x[k] ?? '') !== '' && String(x[k]) !== String(s[k] ?? '')) || (!!x.metro && JSON.stringify(x.metro) !== JSON.stringify(s.metro || null));
}

// Применить. store — хранилище ядра; files — app.files (или null); plan — из planImport (действия выбраны);
// opts.set — добавить сет-лист в календарь; base — поля новой песни по умолчанию (emptySong).
// → { added, updated, files, event }
export async function applyImport({ store, files, unpacked, plan, set = true, base = {} }) {
  const { manifest, data } = unpacked, now = store.now ? store.now() : Date.now();
  const st = store.state, local = new Map(), out = { added: 0, updated: 0, files: 0, event: null };
  for (const p of plan) {
    if (p.action === 'skip') { if (p.match) local.set(p.x.ref, p.match.id); continue; }
    const f = { ...pick(p.x, SONG_FIELDS), ...(p.x.metro ? { metro: p.x.metro } : {}) };
    if (p.action === 'update' && p.match) {
      Object.assign(p.match, f, { updatedAt: now });
      if (!p.match.from && p.match.id !== p.x.ref) p.match.from = p.x.ref;
      local.set(p.x.ref, p.match.id);
      out.updated++;
    } else {
      const s = { ...base, ...f, id: uid(), from: p.x.ref, createdAt: now, updatedAt: now };
      s.targetBpm = +s.targetBpm || null;
      s.currentBpm = +s.currentBpm || null;
      st.songs.push(s);
      local.set(p.x.ref, s.id);
      out.added++;
    }
  }
  // файлы: тот же файл (имя и размер) не дублируется — только привязывается к песне
  if (files) {
    for (const fd of manifest.files) {
      const ids = (fd.songs || []).map((r) => local.get(r)).filter(Boolean);
      if (!ids.length) continue;
      const have = (files.list(fd.kind === 'tab' ? 'tab' : 'audio') || []).find((r) => r.name === fd.name && (r.size || (r.blob && r.blob.size)) === fd.size);
      if (have) {
        const s = new Set(fileSongs(have)); const n = s.size;
        ids.forEach((id) => s.add(id));
        if (s.size !== n) { have.songs = [...s]; delete have.songId; await files.save(have); }
        continue;
      }
      const u8 = data(fd.path);
      if (!u8) continue;
      const blob = new Blob([u8], { type: fd.type || '' });
      await files.add({ id: 'sh' + uid(), name: fd.name, size: u8.length, type: fd.type || '', kind: fd.kind === 'tab' ? 'tab' : 'audio', ...(fd.fmt ? { fmt: fd.fmt } : {}), ...(fd.dur ? { dur: fd.dur } : {}), songs: ids, blob, created: now });
      out.files++;
    }
  }
  // сет-лист → событие календаря (полученное раньше — обновляется)
  if (set && manifest.set && manifest.set.start) {
    const x = manifest.set, list = st.events || (st.events = []);
    const ev = list.find((e) => !e.deleted && (e.from === x.ref || e.id === x.ref));
    const kinds = (st.settings.cal && st.settings.cal.kinds) || [];
    const f = { ...pick(x, SET_FIELDS), kind: kinds.some((k) => k.id === x.kind) ? x.kind : 'rehearsal', songs: (x.songs || []).map((r) => local.get(r)).filter(Boolean), updatedAt: now };
    if (!f.end) f.end = f.start + 3600000;
    if (ev) { Object.assign(ev, f); out.event = ev; }
    else {
      const e = { id: 'e' + uid(), from: x.ref, title: '', repeat: 'none', days: null, until: null, place: '', note: '', color: null, skip: [], done: [], allDay: false, ...f };
      list.push(e);
      out.event = e;
    }
  }
  store.save();
  return out;
}

// Имя файла: melete-<название>-<дата>.melete (буквы любого языка; без знаков, которые не любят файловые системы)
export function shareName(title, now = Date.now()) {
  const d = new Date(now), p = (n) => String(n).padStart(2, '0');
  const slug = String(title || 'songs').trim().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 40) || 'songs';
  return 'melete-' + slug + '-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + SHARE_EXT;
}
