// Поиск песни в открытой базе MusicBrainz (musicbrainz.org): название, исполнитель, год, жанр.
// Только по явному нажатию «Найти в интернете»; уходит лишь текст запроса, ключей и учётных записей нет.
// Темп и тональность в MusicBrainz не хранятся — их определяет анализ записи на устройстве (src/music/analyze.js).
import { MAJ_NAMES, MIN_NAMES, pcOf } from '../music/notes.js';

export const MB_URL = 'https://musicbrainz.org/ws/2/recording';

// Спецсимволы поискового языка (Lucene) экранируются, чтобы текст искался как есть
const esc = (s) => String(s).trim().replace(/([+\-&|!(){}[\]^"~*?:\\/])/g, '\\$1');

export function buildQuery(title, artist = '') {
  const tt = esc(title || ''), aa = esc(artist || '');
  if (tt && aa) return 'recording:(' + tt + ') AND artist:(' + aa + ')';
  if (tt) return 'recording:(' + tt + ')';
  return aa ? 'artist:(' + aa + ')' : '';
}

// Название без пометок в скобках: «Song (Remastered 2011)» и «Song» — одна песня
const bare = (s) => s.replace(/\s*[([].*?[)\]]/g, '').trim() || s;
const norm = (s) => bare(s).toLowerCase();

// Ответ MusicBrainz → песни: записи одной песни одного исполнителя собираются вместе. Оригинал обычно
// издавался много раз (переиздания, концерты), поэтому выше те, у кого больше записей и релизов.
export function parseResults(json, limit = 8) {
  const groups = new Map();
  (json && json.recordings || []).forEach((r) => {
    if ((r.score ?? 100) < 60 || !r.title) return;
    const artist = (r['artist-credit'] || []).map((a) => a.name + (a.joinphrase || '')).join('').trim();
    const k = norm(r.title) + '|' + artist.toLowerCase();
    const g = groups.get(k) || { title: bare(r.title), artist, year: null, tags: {}, n: 0, rel: 0 };
    g.n++;
    g.rel += (r.releases || []).length;
    const y = parseInt((r['first-release-date'] || '').slice(0, 4), 10);
    if (y && (!g.year || y < g.year)) g.year = y;
    (r.tags || []).forEach((tg) => { g.tags[tg.name] = (g.tags[tg.name] || 0) + (tg.count || 1); });
    groups.set(k, g);
  });
  return [...groups.values()]
    .sort((a, b) => b.n * 2 + b.rel - (a.n * 2 + a.rel))
    .slice(0, limit)
    .map(({ title, artist, year, tags }) => ({ title, artist, year, tags: Object.entries(tags).sort((a, b) => b[1] - a[1]).map(([n]) => n).slice(0, 5) }));
}

// Поиск; бросает ошибку с .reason: 'offline' | 'busy' (база просит подождать) | 'failed'
export async function lookup(title, artist = '', { fetch = globalThis.fetch, timeout = 12000 } = {}) {
  const q = buildQuery(title, artist);
  if (!q) return [];
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const tm = ctl && setTimeout(() => ctl.abort(), timeout);
  let res;
  try {
    res = await fetch(MB_URL + '?fmt=json&limit=100&query=' + encodeURIComponent(q), { signal: ctl?.signal, headers: { Accept: 'application/json' } });
  } catch {
    throw Object.assign(new Error('mb'), { reason: 'offline' });
  } finally { if (tm) clearTimeout(tm); }
  if (res.status === 503 || res.status === 429) throw Object.assign(new Error('mb'), { reason: 'busy' });
  if (!res.ok) throw Object.assign(new Error('mb'), { reason: 'failed' });
  return parseResults(await res.json());
}

/* ---------- тональность песни ---------- */
// Хранится строкой: «C», «F♯», «E♭» — мажор, «Am», «C♯m» — минор (написание — как в разделе «Теория»)

export const keyName = (pc, minor) => (minor ? MIN_NAMES[pc] + 'm' : MAJ_NAMES[pc]);
export const KEYS = [...MAJ_NAMES.map((_, pc) => keyName(pc, false)), ...MIN_NAMES.map((_, pc) => keyName(pc, true))];
export function parseKey(k) {
  if (!k || typeof k !== 'string') return null;
  const minor = k.endsWith('m'), n = minor ? k.slice(0, -1) : k;
  if (!/^[A-G][♯♭]?$/.test(n)) return null;
  return { pc: pcOf(n), minor };
}
