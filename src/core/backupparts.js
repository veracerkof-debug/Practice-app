// Резервная копия по частям: что сохранить и что загрузить — выбирает человек. Без DOM.
// Части: settings — настройки приложения и инструментов (оформление, цель недели, напоминания, звуки, пресеты…);
// songs — песни, их метки и жанры (settings.lib), проекты студии, по желанию — их файлы (записи, табы, ноты: backup.js);
// profile — профиль и статистика (все занятия); reading — план чтения и отметки прочитанного;
// calendar — события и сет-листы, типы событий.
// Формат — прежний JSON (version: 1) с полем parts; копии без parts (прежние) содержат всё.
export const PARTS = ['settings', 'songs', 'profile', 'reading', 'calendar'];

// Поля settings, которые принадлежат другим частям
const OWN = { songs: ['lib'], profile: ['profile', 'leagueSeen'], reading: ['bible'], calendar: ['cal'] };
const OWNED = new Set(Object.values(OWN).flat());
// Служебное этого устройства — не переносится никогда
const LOCAL = new Set(['configured', 'sealed', 'updatedAt', 'folder']);

const clone = (o) => JSON.parse(JSON.stringify(o));
const byId = (x, y) => {
  const m = new Map();
  [...(x || []), ...(y || [])].forEach((it) => {
    if (!it || !it.id) return;
    const c = m.get(it.id);
    if (!c || (it.updatedAt || 0) > (c.updatedAt || 0)) m.set(it.id, it);
  });
  return [...m.values()];
};
// списки по id: свои остаются, новые добавляются (метки, типы событий, свои планы)
const unionById = (a = [], b = []) => [...a, ...b.filter((x) => x && !a.some((y) => y.id === x.id || (y.name && y.name === x.name)))];

// Сколько чего в состоянии (для подписей в выборе)
export function partCounts(state) {
  const live = (l) => (l || []).filter((x) => !x.deleted).length;
  const b = (state.settings && state.settings.bible) || {};
  return { songs: live(state.songs), profile: live(state.sessions), reading: Object.keys(b.read || {}).length, calendar: live(state.events), settings: 1 };
}

// Какие части есть в копии
export function partsOf(p) {
  if (!p || typeof p !== 'object') return [];
  if (Array.isArray(p.parts)) return PARTS.filter((k) => p.parts.includes(k));
  const s = p.settings || {}, has = [];
  if (Object.keys(s).some((k) => !OWNED.has(k) && !LOCAL.has(k))) has.push('settings');
  if ((p.songs || []).length || s.lib) has.push('songs');
  if ((p.sessions || []).length || s.profile) has.push('profile');
  if (s.bible) has.push('reading');
  if ((p.events || []).length || s.cal) has.push('calendar');
  return has;
}

// Собрать копию из выбранных частей. tools — настройки инструментов этого устройства (practice.v1.tools)
export function pickParts(state, parts, { tools = null } = {}) {
  const on = new Set(parts), S = state.settings || {}, out = { version: 1, parts: PARTS.filter((k) => on.has(k)), songs: [], sessions: [], settings: {}, updatedAt: state.updatedAt || 0 };
  if (on.has('settings')) {
    Object.keys(S).forEach((k) => { if (!OWNED.has(k) && !LOCAL.has(k)) out.settings[k] = S[k]; });
    if (tools) out.tools = tools;
  }
  Object.entries(OWN).forEach(([part, keys]) => { if (on.has(part)) keys.forEach((k) => { if (S[k] != null) out.settings[k] = S[k]; }); });
  if (on.has('songs')) out.songs = state.songs || [];
  if (on.has('songs') && state.projects) out.projects = state.projects; // проекты студии — вместе с песнями
  if (on.has('profile')) out.sessions = state.sessions || [];
  if (on.has('calendar') && state.events) out.events = state.events;
  out.settings.updatedAt = S.updatedAt || 0;
  return clone(out);
}

// Загрузить выбранные части копии p в состояние → новое состояние. Ничего не удаляется: песни, занятия и события
// объединяются (по id побеждает более свежая запись), метки и свои планы добавляются; настройки и профиль — из копии
export function applyParts(state, p, parts) {
  const on = new Set(parts.filter((k) => partsOf(p).includes(k))), out = clone(state), S = out.settings, P = p.settings || {};
  if (on.has('settings')) Object.keys(P).forEach((k) => { if (!OWNED.has(k) && !LOCAL.has(k)) S[k] = clone(P[k]); });
  if (on.has('songs')) {
    out.songs = byId(out.songs, p.songs);
    if (p.projects) out.projects = byId(out.projects, p.projects);
    if (P.lib) {
      S.lib = S.lib || {};
      Object.keys(P.lib).forEach((k) => { S.lib[k] = Array.isArray(P.lib[k]) ? unionById(S.lib[k], P.lib[k]) : P.lib[k]; });
    }
  }
  if (on.has('profile')) {
    out.sessions = byId(out.sessions, p.sessions);
    if (P.profile) S.profile = clone(P.profile);
    if (P.leagueSeen != null) S.leagueSeen = Math.max(+S.leagueSeen || 0, +P.leagueSeen || 0) || P.leagueSeen;
  }
  if (on.has('reading') && P.bible) {
    const a = S.bible || {}, b = P.bible, read = { ...(a.read || {}) };
    Object.entries(b.read || {}).forEach(([k, ts]) => { read[k] = Math.max(read[k] || 0, +ts || 1); });
    S.bible = { ...a, read, custom: unionById(a.custom, b.custom), ...(b.plan ? { plan: b.plan, start: b.start } : {}), pos: a.pos || b.pos || null };
  }
  if (on.has('calendar')) {
    if (p.events) out.events = byId(out.events, p.events);
    if (P.cal) S.cal = { ...(S.cal || {}), ...P.cal, kinds: unionById((S.cal || {}).kinds, P.cal.kinds) };
  }
  S.updatedAt = Math.max(S.updatedAt || 0, P.updatedAt || 0);
  out.updatedAt = Math.max(out.updatedAt || 0, p.updatedAt || 0);
  return out;
}

// Настройки инструментов из копии поверх своих (разделы целиком — из копии)
export function mergeTools(mine, theirs) {
  const out = { ...(mine || {}) };
  if (theirs && typeof theirs === 'object') Object.keys(theirs).forEach((k) => { if (theirs[k] && typeof theirs[k] === 'object') out[k] = theirs[k]; });
  return out;
}
