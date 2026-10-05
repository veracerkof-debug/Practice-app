// Сессии практики: активная сессия (переживает перезагрузку и выключенный экран),
// завершение, запись в статистику; учёт инструментов, открытых вне сессии.
import { t } from '../i18n/index.js';
import { uid } from './time.js';
import { METRO_DEF } from './store.js';

export const LS_ACTIVE = 'practice.v1.active';
export const LS_TV = 'practice.v1.tv';

export const MIN_SESSION_S = 60;      // короче — не попадает в статистику
export const IDLE_MS = 45 * 60000;    // бездействие → «Ты ещё играешь?»
export const MIN_TOOL_S = 10;         // инструмент вне сессии считается, если открыт дольше
export const BPM_MIN_S = 15;          // темп засчитывается, если на нём играли не меньше

// Метки свободной практики — хранятся в сессиях как есть (значения данных, не строки интерфейса)
export const FREE_TAGS = ['Упражнения', 'Джем', 'Импровизация', 'Разогрев', 'Другое'];
// …и показываются на языке интерфейса
const FREE_TAG_KEYS = { 'Упражнения': 'exercises', 'Джем': 'jam', 'Импровизация': 'impro', 'Разогрев': 'warmup', 'Другое': 'other' };
export const freeTagName = (n) => (FREE_TAG_KEYS[n] ? t('freeTag.' + FREE_TAG_KEYS[n]) : n);

const clone = (o) => JSON.parse(JSON.stringify(o));

/* ---------- активная сессия ---------- */

// Режимы учёта: 'normal' — при погасшем экране время идёт, пока что-то звучит (метроном, пэды, аудио) или идёт
// помодоро; 'strict' — только пока экран включён и приложение открыто. Строгие часы показываются золотыми.
export const TRACK_MODES = ['normal', 'strict'];
export const trackMode = (settings) => (settings.trackMode === 'strict' ? 'strict' : 'normal');

// type: 'free' | 'song' | 'tool'; mode — режим учёта на момент старта (смена режима не влияет на идущую сессию)
export function createActive({ type, songId = null, tool = null, mode = 'normal' }, now = Date.now()) {
  return {
    id: uid(), type, songId: songId || null, tool: tool || null, mode,
    startedAt: now, pausedTotal: 0, pausedAt: null, awayTotal: 0, awaySince: null,
    bpmTime: {}, last: now, asked: false,
  };
}

// Та же ли это сессия, что запрошена (иначе — «Сначала заверши текущую сессию»)
export const isSameActive = (a, type, songId, tool) =>
  a.type === type && (type !== 'song' || a.songId === songId) && (type !== 'tool' || a.tool === tool);

// Не засчитанное время «вдали»: экран погас, а по режиму учёта время идти не должно
const away = (a, now) => (a.awayTotal || 0) + (a.awaySince ? now - a.awaySince : 0);

export const elapsed = (a, now = Date.now()) =>
  a ? ((a.pausedAt || now) - a.startedAt - a.pausedTotal - away(a, a.pausedAt || now)) / 1000 : 0;

export function awayStart(a, now = Date.now()) {
  if (!a.awaySince && !a.pausedAt) a.awaySince = now;
}

export function awayEnd(a, now = Date.now()) {
  if (a.awaySince) { a.awayTotal = (a.awayTotal || 0) + now - a.awaySince; a.awaySince = null; }
}

// Должно ли время идти, пока экран погашен: строгий режим — нет; обычный — пока что-то звучит
export const countsWhileHidden = (mode, sounding) => mode !== 'strict' && sounding;

export function pause(a, now = Date.now()) {
  awayEnd(a, now);
  if (!a.pausedAt) a.pausedAt = now;
}

export function resume(a, now = Date.now()) {
  if (a.pausedAt) {
    a.pausedTotal += now - a.pausedAt;
    a.pausedAt = null;
    a.pomoPaused = false;
  }
}

export const togglePause = (a, now = Date.now()) => (a.pausedAt ? resume(a, now) : pause(a, now));

// Любое касание в сессии
export function touch(a, now = Date.now()) {
  a.last = now;
}

export const shouldAskIdle = (a, { metroRunning = false } = {}, now = Date.now()) =>
  !!a && !a.asked && !metroRunning && !a.pausedAt && now - a.last > IDLE_MS;

// Ответ «Да, играю»
export function confirmPlaying(a, now = Date.now()) {
  a.last = now;
  a.asked = false;
}

// Учёт времени на темпе метронома
export function addBpmTime(a, bpm, sec) {
  const k = String(bpm);
  a.bpmTime[k] = (a.bpmTime[k] || 0) + sec;
}

// Самый быстрый темп, на котором играли не меньше BPM_MIN_S
export function bestBpm(bpmTime) {
  let best = null;
  Object.entries(bpmTime || {}).forEach(([k, v]) => {
    if (v >= BPM_MIN_S && (!best || +k > best)) best = +k;
  });
  return best;
}

// Итог перед экраном «Сессия завершена». endAt — при завершении по бездействию (время последнего касания)
export function summarize(a, { endAt = null, now = Date.now() } = {}) {
  const dur = endAt ? Math.max(0, (endAt - a.startedAt - a.pausedTotal - away(a, endAt)) / 1000) : elapsed(a, now);
  return { dur, best: bestBpm(a.bpmTime), short: dur < MIN_SESSION_S };
}

export function buildRecord(a, { dur, best, endAt = null, tag = '', note = '' }, now = Date.now()) {
  return {
    id: a.id, type: a.type, songId: a.songId, tool: a.tool || null,
    start: a.startedAt, end: endAt || now, dur: Math.round(dur),
    bpm: best, tag: tag || null, note: (note || '').trim() || null, mode: a.mode === 'strict' ? 'strict' : 'normal',
    updatedAt: now,
  };
}

/* ---------- метроном и песня ---------- */

// Настройки метронома на старте сессии. Возвращает settings.metro (общий объект) или копию для песни
export function metroForSession(song, settingsMetro) {
  if (song && song.metro) {
    const cfg = Object.assign(clone(METRO_DEF), clone(song.metro));
    if (song.currentBpm) cfg.bpm = song.currentBpm;
    return cfg;
  }
  const cfg = settingsMetro;
  if (song && song.currentBpm) cfg.bpm = song.currentBpm;
  else if (song && song.targetBpm) cfg.bpm = Math.round(song.targetBpm * 0.7);
  return cfg;
}

export const metroSnapshot = (c) => ({
  num: c.num, den: c.den, sub: c.sub, swing: c.swing, sound: c.sound,
  accents: c.accents.slice(), bpm: c.bpm,
  trainer: Object.assign({}, c.trainer), gap: Object.assign({}, c.gap),
});

/* ---------- работа со store ---------- */

export function loadActive(storage = globalThis.localStorage) {
  try {
    const r = storage && storage.getItem(LS_ACTIVE);
    return r ? JSON.parse(r) : null;
  } catch { return null; }
}

export function saveActive(a, storage = globalThis.localStorage) {
  try {
    if (!storage) return;
    a ? storage.setItem(LS_ACTIVE, JSON.stringify(a)) : storage.removeItem(LS_ACTIVE);
  } catch { /* ignore */ }
}

// Сохранить завершённую сессию. song: { masteryPct, confidentBpm, metro } — для сессии по песне
export function commitSession(store, rec, song = null) {
  const now = rec.updatedAt;
  const s = rec.songId ? store.songById(rec.songId) : null;
  if (s && song) {
    if (song.masteryPct != null) {
      s.masteryPct = song.masteryPct;
      s.mastery = Math.max(1, Math.round(s.masteryPct / 20));
    }
    if (song.confidentBpm > 0) {
      s.currentBpm = song.confidentBpm;
      rec.bpm = rec.bpm || song.confidentBpm;
    }
    if (song.metro) s.metro = metroSnapshot(song.metro);
    s.updatedAt = now;
  }
  store.state.sessions.push(rec);
  store.save();
  return rec;
}

/* ---------- инструмент вне сессии ---------- */

// Записывает время инструмента молча, без сессии. Возвращает true, если записано
// mode — режим учёта; overlapMs — сколько из этого времени уже записал секундомер (не засчитывается дважды)
export function recordToolTime(store, tool, start, ms, now = Date.now(), { mode = 'normal', overlapMs = 0 } = {}) {
  if (store.state.settings.autoTrack === false) return false;
  const dur = Math.round(Math.max(0, ms - overlapMs) / 1000);
  if (dur < MIN_TOOL_S) return false;
  store.state.sessions.push({ id: uid(), type: 'tool', tool, songId: null, start, end: now, dur, mode, updatedAt: now });
  store.save();
  return true;
}

// Учёт открытого инструмента: время идёт, пока страница видна (и в обычном режиме — пока что-то звучит)
export function createToolView(tool, { visible = true, now = Date.now() } = {}) {
  return { tool, start: now, acc: 0, seg: visible ? now : 0 };
}

export const toolViewMs = (tv, now = Date.now()) => (tv ? tv.acc + (tv.seg ? now - tv.seg : 0) : 0);

// counting — идёт ли время сейчас (страница видна, или погашена, но по режиму учёта время идёт)
export function toolViewVisibility(tv, visible, now = Date.now()) {
  if (!visible) {
    if (tv.seg) { tv.acc += now - tv.seg; tv.seg = 0; }
  } else if (!tv.seg) tv.seg = now;
}

export function saveToolView(tv, storage = globalThis.localStorage, now = Date.now()) {
  try {
    if (!storage) return;
    tv ? storage.setItem(LS_TV, JSON.stringify({ tool: tv.tool, start: tv.start, ms: toolViewMs(tv, now) }))
      : storage.removeItem(LS_TV);
  } catch { /* ignore */ }
}

// После перезапуска: дописать время инструмента, который был открыт, когда приложение закрыли
export function recoverToolView(store, storage = globalThis.localStorage) {
  try {
    const r = JSON.parse(storage.getItem(LS_TV));
    if (r && r.tool) {
      storage.removeItem(LS_TV);
      return recordToolTime(store, r.tool, r.start, r.ms);
    }
  } catch { /* ignore */ }
  return false;
}
