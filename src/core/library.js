// Библиотека: песни, категории, жанры, теги; шкала выученности; сортировка и фильтры.
import { forcedText } from './palettes.js';
import { uid } from './time.js';
import { songStats } from './stats.js';
import { parseKey } from './songinfo.js';

export const PALETTE = ['#A75750', '#9C7242', '#AE934D', '#5F8568', '#4A8681', '#548591', '#567198',
  '#646493', '#866B9D', '#A95E72', '#A2845E', '#8E8E93', '#3A3A3C', '#F2F2F7'];

// Метки по умолчанию; названия — ключи i18n (lib.<kind>.<key>), создаются один раз на языке пользователя
export const LIBDEF = {
  cats: [['work', '#567198'], ['church', '#866B9D'], ['growth', '#5F8568'], ['memes', '#9C7242']],
  genres: [['rock', '#A75750'], ['pop', '#A95E72'], ['classical', '#A2845E'], ['jazz', '#646493'],
    ['blues', '#567198'], ['metal', '#3A3A3C'], ['folk', '#5F8568'], ['hiphop', '#9C7242'],
    ['electronic', '#4A8681'], ['country', '#AE934D'], ['worship', '#866B9D'], ['indie', '#548591']],
  tags: [['stage', '#A75750'], ['warmup', '#9C7242'], ['exercise', '#5F8568'], ['learning', '#567198'], ['repeat', '#8E8E93']],
};
export const LIB_KINDS = Object.keys(LIBDEF);

const libId = () => uid().slice(-6) + Math.random().toString(36).slice(2, 5);

// Возвращает settings.lib, создавая его при первом обращении (прототип: LIB()).
// Жанры, которые есть у песен, но отсутствуют в списке, добавляются с цветом по хэшу названия.
export function ensureLib(state, t = (k) => k) {
  const st = state.settings;
  if (!st.lib) {
    st.lib = {};
    LIB_KINDS.forEach((k) => {
      st.lib[k] = LIBDEF[k].map(([key, color]) => ({ id: libId(), name: t('lib.' + k + '.' + key), color, text: '' }));
    });
  }
  const L = st.lib;
  LIB_KINDS.forEach((k) => { if (!L[k]) L[k] = []; });
  state.songs.filter((s) => !s.deleted).forEach((s) => {
    if (s.genre && !L.genres.some((g) => g.name.toLowerCase() === s.genre.toLowerCase())) {
      let h = 0;
      for (const ch of s.genre) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
      L.genres.push({ id: 'g' + uid(), name: s.genre, color: PALETTE[h % 12], text: '' });
    }
  });
  return L;
}

// Цвет надписи на плашке: тёмный на светлом, белый на тёмном
export function autoText(hex) {
  const f = forcedText();
  if (f) return f;
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
  if (!m) return '#fff';
  const [r, g, b] = [1, 2, 3].map((i) => parseInt(m[i], 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.62 ? '#1c1c1e' : '#ffffff';
}
// выбранный в «Оформлении» цвет текста на цветном — главнее своего у метки
export const textColor = (it) => forcedText() || it.text || autoText(it.color);

// Жанр песни хранится названием, категория и теги — по id
export const genreOf = (L, name) => (name ? L.genres.find((g) => g.name.toLowerCase() === String(name).toLowerCase()) : null);
export const catOf = (L, id) => (id ? L.cats.find((c) => c.id === id) : null);
export const tagOf = (L, id) => L.tags.find((t) => t.id === id);

export const newLibItem = (L, kind) => ({ id: 'i' + uid(), name: '', color: PALETTE[(L[kind].length * 5) % 12], text: '' });

// Сохранить метку (новую или изменённую). При переименовании жанра песни переезжают на новое название
export function saveLibItem(store, kind, item) {
  const L = ensureLib(store.state), now = store.now();
  const ex = L[kind].find((x) => x.id === item.id);
  if (kind === 'genres' && ex && ex.name !== item.name) {
    store.songs().forEach((s) => {
      if ((s.genre || '').toLowerCase() === ex.name.toLowerCase()) { s.genre = item.name; s.updatedAt = now; }
    });
  }
  if (ex) Object.assign(ex, item);
  else L[kind].push(item);
  store.settingsChanged();
}

// Удалить метку и снять её с песен
export function deleteLibItem(store, kind, id) {
  const L = ensureLib(store.state), now = store.now();
  L[kind] = L[kind].filter((x) => x.id !== id);
  if (kind === 'cats') store.songs().forEach((s) => { if (s.cat === id) { s.cat = null; s.updatedAt = now; } });
  if (kind === 'tags') store.songs().forEach((s) => {
    if ((s.tags || []).includes(id)) { s.tags = s.tags.filter((x) => x !== id); s.updatedAt = now; }
  });
  store.settingsChanged();
}

/* ---------- выученность ---------- */

export const MASTERY_LEVELS = 5; // разбираю, медленно, с ошибками, уверенно, выучена
export const getPct = (s) => (s.masteryPct != null ? s.masteryPct : (s.mastery || 1) * 20);
export const scaleOf = (settings) => +settings.scale || 5;
export function toScale(p, n) {
  return n === 100 ? Math.round(p) : Math.max(1, Math.round(p / (100 / n)));
}
export const fromScale = (v, n) => (n === 100 ? v : Math.round((v * 100) / n));
// 0…4 — индекс словесного уровня
export const masteryLevel = (p) => Math.min(4, Math.max(0, Math.ceil(p / 20) - 1));

/* ---------- песни ---------- */

export function emptySong(settings) {
  const n = scaleOf(settings);
  return { title: '', artist: '', genre: '', difficulty: 3, mastery: 1, masteryPct: n === 100 ? 0 : fromScale(1, n),
    targetBpm: '', currentBpm: '', notes: '', key: null };
}

const posInt = (v) => { const n = parseInt(v, 10); return n > 0 ? n : null; };

// Создать или обновить песню; возвращает её id
export function saveSong(store, id, f) {
  const now = store.now();
  const data = {
    title: String(f.title || '').trim(), artist: String(f.artist || '').trim(),
    genre: f.genre || '', cat: f.cat || null, tags: (f.tags || []).slice(),
    difficulty: f.difficulty, masteryPct: f.masteryPct, mastery: Math.max(1, Math.round(f.masteryPct / 20)),
    targetBpm: posInt(f.targetBpm), currentBpm: posInt(f.currentBpm), notes: f.notes || '',
    key: parseKey(f.key) ? f.key : null,
    updatedAt: now,
  };
  if (!data.title) return null;
  if (id) Object.assign(store.songById(id), data);
  else {
    const s = Object.assign({ id: uid(), createdAt: now }, data);
    store.state.songs.push(s);
    id = s.id;
  }
  store.save();
  return id;
}

// Песня помечается удалённой; время её сессий остаётся в общей статистике
export function deleteSong(store, id) {
  const s = store.songById(id);
  if (!s) return;
  s.deleted = true;
  s.updatedAt = store.now();
  store.save();
}

export const SORTS = ['recent', 'title', 'mastery', 'difficulty', 'time', 'forgotten'];

// Список песен с фильтрами экрана «Песни». f: { cat ('' | '_none' | id), q, genre, tag, sort }
export function listSongs(songs, sessions, L, f = {}, locale = 'ru') {
  let list = songs.map((s) => ({ s, st: songStats(sessions, s.id) }));
  if (f.cat) list = list.filter((x) => (f.cat === '_none' ? !x.s.cat : x.s.cat === f.cat));
  if (f.q) {
    const q = f.q.toLowerCase();
    list = list.filter((x) => (x.s.title + ' ' + (x.s.artist || '')).toLowerCase().includes(q));
  }
  // Жанры и теги, которые встречаются после фильтра по категории и поиску — для полосы фильтров
  const usedGenres = L.genres.filter((g) => list.some((x) => genreOf(L, x.s.genre) === g));
  const usedTags = L.tags.filter((t) => list.some((x) => (x.s.tags || []).includes(t.id)));
  if (f.genre) list = list.filter((x) => (x.s.genre || '').toLowerCase() === f.genre.toLowerCase());
  if (f.tag) list = list.filter((x) => (x.s.tags || []).includes(f.tag));
  const so = {
    recent: (a, b) => (b.st.last || b.s.createdAt) - (a.st.last || a.s.createdAt),
    title: (a, b) => a.s.title.localeCompare(b.s.title, locale),
    mastery: (a, b) => getPct(a.s) - getPct(b.s),
    difficulty: (a, b) => b.s.difficulty - a.s.difficulty,
    time: (a, b) => b.st.total - a.st.total,
    forgotten: (a, b) => (a.st.last || 0) - (b.st.last || 0),
  };
  list.sort(so[f.sort] || so.recent);
  return { list, usedGenres, usedTags };
}

// Число песен в категории ('' — без категории)
export const countInCat = (songs, id) => songs.filter((s) => (s.cat || '') === id).length;
