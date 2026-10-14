// Обмен с командой: файл .melete — песни (название, исполнитель, жанр, тональность, темп, текст с аккордами, метроном),
// их табы и ноты (по желанию — и записи) и сет-лист репетиции (событие календаря). Без серверов: файл уходит через
// «Поделиться» (Telegram, WhatsApp, почта), принимается кнопкой «Принять файл» или открытием файла в Melete.
// Личное не отправляется: выученность, сложность, текущий темп, метки, время занятий.
// Формат — zip: melete.json (описание, версия v) + files/… (см. docs/share-format.md). Без DOM.
// Тот же melete.json можно принять и без zip — простым файлом JSON (его собирает нейросеть по инструкции
// src/core/aidoc.js): песни, сборники цитат (quotes) и профиль (profile). Часы и занятия формат не принимает никогда.
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { uid } from './time.js';
import { INSTRUMENTS, LEVELS, saveProfile, priorHours } from './profile.js';
import { GOAL_MIN, GOAL_MAX } from './settings.js';
import { setsOf } from './quotes.js';

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
  let z = {}, m;
  // простой JSON (без zip): первый значимый символ — «{»
  const head = strFromU8(u8.subarray(0, 64)).replace(/^\uFEFF/, '').trimStart();
  if (head[0] === '{') {
    try { m = JSON.parse(strFromU8(u8).replace(/^\uFEFF/, '')); } catch { throw new Error('notMelete'); }
  } else {
    try { z = unzipSync(u8); } catch { throw new Error('notMelete'); }
    try { m = JSON.parse(strFromU8(z['melete.json'])); } catch { throw new Error('notMelete'); }
  }
  if (!m || typeof m !== 'object' || m.format !== SHARE_FORMAT) throw new Error('notMelete');
  if (m.v > SHARE_V) throw new Error('newer');
  m.songs = (Array.isArray(m.songs) ? m.songs : []).map(cleanSong).filter(Boolean);
  m.files = (m.files || []).filter((f) => f && f.path && z[f.path]);
  m.quotes = (Array.isArray(m.quotes) ? m.quotes : m.quotes ? [m.quotes] : []).map(cleanBook).filter(Boolean);
  m.profile = cleanProfile(m.profile);
  if (!m.songs.length && !m.quotes.length && !m.profile) throw new Error('empty');
  return { manifest: m, data: (p) => z[p] || null };
}

/* ---------- проверка присланного (особенно — собранного нейросетью) ---------- */

const str = (v, n) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim().slice(0, n) : '');
// Тональность: «C#m», «Bb», «C♯m» → как в приложении (♯/♭); неизвестная — без тональности
const KEY_RE = /^([A-G])([#♯b♭]?)(m?)$/;
export function normKey(k) {
  const m = KEY_RE.exec(String(k || '').trim().replace(/\s*(minor|min)$/i, 'm').replace(/\s*(major|maj)$/i, ''));
  return m ? m[1] + (m[2] === '#' ? '♯' : m[2] === 'b' ? '♭' : m[2]) + m[3] : null;
}
function cleanSong(x, i) {
  if (!x || typeof x !== 'object') return null;
  const title = str(x.title, 120);
  if (!title) return null;
  const bpm = Math.round(+x.targetBpm || +x.bpm || 0);
  const s = { ref: str(x.ref, 60) || 'ai' + i + '-' + title, title, artist: str(x.artist, 120), genre: str(x.genre, 40), notes: str(x.notes, 20000) };
  const key = normKey(x.key);
  if (key) s.key = key;
  if (bpm >= 20 && bpm <= 400) s.targetBpm = bpm;
  if (x.metro && typeof x.metro === 'object') {
    const num = Math.round(+x.metro.num || 0), den = Math.round(+x.metro.den || 0), mb = Math.round(+x.metro.bpm || 0);
    if (num >= 1 && num <= 16 && [2, 4, 8, 16].includes(den)) s.metro = { ...(mb >= 20 && mb <= 400 ? { bpm: mb } : bpm ? { bpm } : {}), num, den };
  }
  Object.keys(s).forEach((k) => { if (s[k] === '') delete s[k]; });
  return s;
}
// Сборник цитат: { title, items: [{ text, by?, src? }] } — до 1000 цитат
export function cleanBook(b) {
  if (!b || typeof b !== 'object') return null;
  const items = (Array.isArray(b.items) ? b.items : []).slice(0, 1000).map((q) => (typeof q === 'string' ? { text: q } : q || {}))
    .map((q) => ({ text: str(q.text, 500), by: str(q.by || q.author, 100), src: str(q.src || q.source, 200) }))
    .filter((q) => q.text).map((q) => { if (!q.by) delete q.by; if (!q.src) delete q.src; return q; });
  if (!items.length) return null;
  return { title: str(b.title, 60) || 'Melete', items };
}
// Профиль: имя, инструменты, уровень, дни практики, цель недели. Часов и опыта до приложения здесь нет и быть не может
export function cleanProfile(p) {
  if (!p || typeof p !== 'object') return null;
  const out = {};
  if (str(p.name, 40)) out.name = str(p.name, 40);
  if (Array.isArray(p.instruments)) { const v = INSTRUMENTS.filter((k) => p.instruments.includes(k)); if (v.length) out.instruments = v; }
  if (LEVELS.includes(p.level)) out.level = p.level;
  if (Array.isArray(p.days) && p.days.length === 7) out.days = p.days.map((d) => (d ? 1 : 0));
  const g = Math.round(+p.goalMin || 0);
  if (g >= GOAL_MIN && g <= GOAL_MAX) out.goalMin = g;
  return Object.keys(out).length ? out : null;
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
export async function applyImport({ store, files, unpacked, plan, set = true, base = {}, quotes = true, profile = true }) {
  const { manifest, data } = unpacked, now = store.now ? store.now() : Date.now();
  const st = store.state, local = new Map(), out = { added: 0, updated: 0, files: 0, event: null, books: 0, profile: false };
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
  // сборники цитат → свои наборы Мелеты (тот же сборник по названию — заменяется), сразу включены
  if (quotes && manifest.quotes && manifest.quotes.length) {
    const S = st.settings, books = S.quoteBooks || (S.quoteBooks = []);
    for (const b of manifest.quotes) {
      const old = books.find((x) => x.title === b.title);
      if (old) old.items = b.items; else books.push({ id: 'q' + uid(), ...b });
      const id = 'own:' + (old || books.at(-1)).id;
      S.qsets = [...new Set([...setsOf(S), id])];
      out.books++;
    }
  }
  // профиль: только имя, инструменты, уровень, дни и цель. Опыт до приложения (часы) остаётся как был
  if (profile && manifest.profile) {
    const p = manifest.profile, S = st.settings, old = S.profile || {};
    if (p.name || p.instruments || p.level) saveProfile(store, { ...old, ...(p.name ? { name: p.name } : {}), ...(p.instruments ? { instruments: p.instruments } : {}), ...(p.level ? { level: p.level } : {}), priorHours: priorHours(S) });
    if (p.days) S.days = p.days;
    if (p.goalMin) S.goalMin = p.goalMin;
    if (p.days || p.goalMin) S.configured = true;
    out.profile = true;
  }
  store.save();
  if ((out.books || out.profile) && store.settingsChanged) store.settingsChanged();
  return out;
}

// Имя файла: melete-<название>-<дата>.melete (буквы любого языка; без знаков, которые не любят файловые системы)
export function shareName(title, now = Date.now()) {
  const d = new Date(now), p = (n) => String(n).padStart(2, '0');
  const slug = String(title || 'songs').trim().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 40) || 'songs';
  return 'melete-' + slug + '-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + SHARE_EXT;
}
