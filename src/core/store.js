// Хранение состояния: песни, сессии, события календаря, настройки. Local-first, формат совместим с прототипом (version: 1).
import { seal, splitVerified, profileSeal } from './integrity.js';
export const LS = 'practice.v1';

export const METRO_DEF = {
  bpm: 90, num: 4, den: 4, sub: 1, swing: false, sound: 'click',
  accents: [3, 1, 1, 1],
  trainer: { on: false, step: 2, every: 4, max: 140 },
  gap: { on: false, play: 2, mute: 2 },
};

const clone = (o) => JSON.parse(JSON.stringify(o));

export function blank() {
  return {
    version: 1,
    songs: [],
    sessions: [],
    settings: {
      goalMin: 300,                 // цель недели, минуты
      days: [1, 1, 1, 1, 1, 0, 0],  // дни практики, Пн…Вс
      theme: 'system',
      scale: '5',                   // шкала выученности: '5' | '10' | '100'
      configured: false,
      updatedAt: 0,
      metro: clone(METRO_DEF),
    },
    updatedAt: 0,
  };
}

// Дополняет настройки значениями по умолчанию (прототип: fixSettings)
export function normalize(state) {
  const s = Object.assign(blank(), state);
  s.settings = Object.assign(blank().settings, s.settings || {});
  s.settings.metro = Object.assign(clone(METRO_DEF), s.settings.metro || {});
  return s;
}

export const isBackup = (p) => !!p && p.version === 1 && Array.isArray(p.sessions);

// Слияние двух состояний: по id побеждает запись с бóльшим updatedAt; настройки — целиком более свежие
export function merge(a, b) {
  const out = blank();
  const byId = (x, y) => {
    const m = new Map();
    [...(x || []), ...(y || [])].forEach((it) => {
      if (!it || !it.id) return;
      const c = m.get(it.id);
      if (!c || (it.updatedAt || 0) > (c.updatedAt || 0)) m.set(it.id, it);
    });
    return [...m.values()];
  };
  out.songs = byId(a.songs, b.songs);
  out.sessions = byId(a.sessions, b.sessions);
  // События календаря (src/core/calendar.js) — поле новее прототипа, появляется с первым событием
  if (a.events || b.events) out.events = byId(a.events, b.events);
  const sa = a.settings || {}, sb = b.settings || {};
  out.settings = Object.assign({}, blank().settings, (sa.updatedAt || 0) >= (sb.updatedAt || 0) ? sa : sb);
  out.updatedAt = Math.max(a.updatedAt || 0, b.updatedAt || 0);
  return out;
}

export const liveSongs = (state) => state.songs.filter((s) => !s.deleted);
export const liveSessions = (state) => state.sessions.filter((s) => !s.deleted);

function safeStorage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

// clockBad() — часы устройства сбиты (src/core/clock.js): записи в это время не подтверждаются
export function createStore({ storage = safeStorage(), now = Date.now, clockBad = () => false } = {}) {
  const subs = new Set();
  let state = blank();
  try {
    const raw = storage && storage.getItem(LS);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && p.version === 1) state = p;
    }
  } catch { /* повреждённые данные — начинаем с пустого */ }
  state = normalize(state);
  // Переход на печати: всё, что записано до них, — подтверждено (один раз; позже записи без печати — нет)
  if (!state.settings.sealed) {
    state.sessions.forEach((r) => { if (!r.sig) seal(r); });
    const pr = state.settings.profile;
    if (pr && !pr.sig) pr.sig = profileSeal(pr);
    state.settings.sealed = 1;
    try { storage && storage.setItem(LS, JSON.stringify(state)); } catch { /* */ }
  }
  // Подтверждённые и нет — считаются один раз на каждое изменение списка
  let vKey = '', vCache = { ok: [], bad: [] };
  const verified = () => {
    const live = liveSessions(state), key = live.length + ':' + state.updatedAt;
    if (key !== vKey) { vKey = key; vCache = splitVerified(live, now()); }
    return vCache;
  };

  const write = () => {
    try { storage && storage.setItem(LS, JSON.stringify(state)); } catch { /* нет места или запрещено */ }
  };
  const emit = () => subs.forEach((fn) => fn(state));

  const store = {
    get state() { return state; },
    now,

    save() {
      state.updatedAt = now();
      write();
      emit();
    },
    // Записать без смены updatedAt (прототип: saveMetro — частые правки метронома)
    persist() { write(); },
    settingsChanged() {
      state.settings.updatedAt = now();
      store.save();
    },

    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },

    songs: () => liveSongs(state),
    // Для статистики, недели, камня и звания — только подтверждённые записи
    sessions: () => verified().ok,
    // Неподтверждённые: видны только в истории
    unverified: () => verified().bad,
    allSessions: () => liveSessions(state),
    // Новая запись о занятии — с печатью; при сбитых часах — с пометкой и потому не подтверждённая
    addSession(rec) {
      if (clockBad()) rec.clk = 'bad';
      seal(rec);
      state.sessions.push(rec);
      store.save();
      return rec;
    },
    songById: (id) => state.songs.find((s) => s.id === id && !s.deleted),

    // Импорт резервной копии; возвращает число новых сессий
    importBackup(p) {
      if (!isBackup(p)) throw new Error('not a backup');
      const before = store.allSessions().length;
      state = normalize(merge(state, p));
      store.save();
      return store.allSessions().length - before;
    },
    exportBackup: () => JSON.stringify(state, null, 1),

    // Удалить все данные, сохранив тему
    reset() {
      const keep = state.settings.theme;
      state = blank();
      state.settings.theme = keep;
      store.save();
    },
  };
  return store;
}
