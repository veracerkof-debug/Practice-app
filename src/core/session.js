// Сессии практики: активная сессия (переживает перезагрузку и выключенный экран),
// завершение, запись в статистику; учёт инструментов, открытых вне сессии.
import { t } from '../i18n/index.js';
import { uid } from './time.js';
import { METRO_DEF } from './store.js';

export const LS_ACTIVE = 'practice.v1.active';
export const LS_TV = 'practice.v1.tv';

export const MIN_SESSION_S = 60;      // короче — не попадает в статистику
export const IDLE_MS = 45 * 60000;    // ни одного касания (даже под метроном или секундомером) → «Занятие продолжается?»
export const QUIET_MS = 10 * 60000;   // ничего не звучит и ни одного действия → сессия завершается
export const ASK_WAIT_MS = 5 * 60000; // вопрос без ответа → завершение по последнему действию
export const GEM_QUIET_MS = 5 * 60000; // при подтверждении игры звуком: тишина дольше не идёт в значок мастерства
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
    startedAt: now, pausedAt: null, awaySince: null, pauses: [], aways: [],
    bpmTime: {}, last: now, heard: 0, quiet: 0, askedAt: null, askEnd: null,
  };
}

// Та же ли это сессия, что запрошена (иначе — «Сначала заверши текущую сессию»)
export const isSameActive = (a, type, songId, tool) =>
  a.type === type && (type !== 'song' || a.songId === songId) && (type !== 'tool' || a.tool === tool);

// Пауза и время «вдали» (экран погас, а по режиму учёта время идти не должно) хранятся отрезками [от, до]:
// так завершение задним числом (по последнему действию) не вычитает то, что было уже после него.
// Сессии, начатые до появления отрезков, хранили только суммы — переводим их в отрезки от начала, друг за другом.
function segs(a) {
  const p = a.pausedTotal || 0;
  if (!a.pauses) a.pauses = p ? [[a.startedAt, a.startedAt + p]] : [];
  if (!a.aways) a.aways = a.awayTotal ? [[a.startedAt + p, a.startedAt + p + a.awayTotal]] : [];
  return a;
}
const clip = (list, open, from, to) => list.reduce((s, [x, y]) => s + Math.max(0, Math.min(y, to) - Math.max(x, from)), 0) +
  (open ? Math.max(0, to - Math.max(open, from)) : 0);

// Засчитанное время между from и to, мс: без пауз и без времени «вдали»
export function countedMs(a, from, to) {
  if (to <= from) return 0;
  segs(a);
  const pauses = clip(a.pauses, a.pausedAt, from, to);
  // «вдали» внутри паузы не вычитается второй раз
  const aways = clip(a.aways, a.awaySince, from, to) - a.aways.concat(a.awaySince ? [[a.awaySince, to]] : [])
    .reduce((s, [x, y]) => s + clip(a.pauses, a.pausedAt, Math.max(x, from), Math.min(y, to)), 0);
  return Math.max(0, to - from - pauses - aways);
}

export const elapsed = (a, now = Date.now()) => (a ? countedMs(a, a.startedAt, a.pausedAt || now) / 1000 : 0);

export function awayStart(a, now = Date.now()) {
  if (!a.awaySince && !a.pausedAt) a.awaySince = now;
}

export function awayEnd(a, now = Date.now()) {
  if (a.awaySince) { segs(a).aways.push([a.awaySince, Math.max(a.awaySince, now)]); a.awaySince = null; }
}

// Должно ли время идти, пока экран погашен: строгий режим — нет; обычный — пока что-то звучит
export const countsWhileHidden = (mode, sounding) => mode !== 'strict' && sounding;

export function pause(a, now = Date.now()) {
  awayEnd(a, now);
  if (!a.pausedAt) a.pausedAt = now;
}

export function resume(a, now = Date.now()) {
  if (a.pausedAt) {
    segs(a).pauses.push([a.pausedAt, Math.max(a.pausedAt, now)]);
    a.pausedAt = null;
    a.pomoPaused = false;
  }
}

export const togglePause = (a, now = Date.now()) => (a.pausedAt ? resume(a, now) : pause(a, now));

// Любое действие в сессии (касание, клавиша). Касание при открытом вопросе — ещё не ответ
export function touch(a, now = Date.now()) {
  a.last = now;
}

// Последний признак занятия: действие или звук (звучит приложение или микрофон слышит игру)
export const lastActivity = (a) => Math.max(a.last || a.startedAt, a.heard || 0);

// Слышен звук. mic — сессию слушает «подтверждение игры звуком»: паузы тишины дольше GEM_QUIET_MS
// копятся в a.quiet (мс) и не идут в значок мастерства
export function noteHeard(a, now = Date.now(), { mic = false } = {}) {
  if (!a || a.pausedAt) return;
  if (mic) {
    const from = Math.max(a.heard || 0, a.startedAt, a.micFrom || 0);
    if (now - from > GEM_QUIET_MS) a.quiet = (a.quiet || 0) + countedMs(a, from, now);
  }
  a.heard = now;
}

// Что делать с бездействием: null, { ask, endAt } — спросить «Занятие продолжается?», { end, endAt } — завершить.
// sounding — звучит приложение (метроном, пэды, запись); mic — микрофон слушает игру, и тишине можно верить.
// endAt — до какого момента засчитывается время, если ответа не будет.
// ask: false — вопросы выключены в «Уведомлениях»: вместо вопроса сразу завершение по последнему действию
export function idleAction(a, { sounding = false, mic = false, ask = true } = {}, now = Date.now()) {
  if (!a || a.pausedAt) return null;
  if (a.askedAt) return now - a.askedAt > ASK_WAIT_MS ? { end: true, endAt: a.askEnd || a.last } : null;
  const act = lastActivity(a);
  // тишина и ни одного действия: с микрофоном — точно никто не играет; без него — спросить
  if (!sounding && now - act > QUIET_MS) return mic || !ask ? { end: true, endAt: act } : { ask: true, endAt: act };
  // долго без касаний, даже если звучит метроном или идёт секундомер
  if (now - (a.last || a.startedAt) > IDLE_MS) return { [ask ? 'ask' : 'end']: true, endAt: a.last || a.startedAt };
  return null;
}

// Задан вопрос «Занятие продолжается?»
export function markAsked(a, endAt, now = Date.now()) {
  a.askedAt = now;
  a.askEnd = endAt;
}

// Ответ «Да, занятие продолжается»
export function confirmPlaying(a, now = Date.now()) {
  a.last = now;
  a.askedAt = null;
  a.askEnd = null;
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

// Итог перед экраном «Сессия завершена». endAt — при завершении по бездействию (время последнего действия):
// всё после него не засчитывается ни в статистику, ни в строгие часы.
// quiet — секунды тишины, которые не идут в значок мастерства (только при подтверждении игры звуком)
export function summarize(a, { endAt = null, now = Date.now(), mic = false } = {}) {
  const to = endAt ? Math.min(endAt, a.pausedAt || now) : a.pausedAt || now;
  const dur = countedMs(a, a.startedAt, Math.max(a.startedAt, to)) / 1000;
  let quiet = a.quiet || 0;
  if (mic) { const from = Math.max(a.heard || 0, a.startedAt, a.micFrom || 0); if (to - from > GEM_QUIET_MS) quiet += countedMs(a, from, to); }
  return { dur, best: bestBpm(a.bpmTime), short: dur < MIN_SESSION_S, quiet: Math.min(dur, Math.round(quiet / 1000)) };
}

export function buildRecord(a, { dur, best, quiet = 0, endAt = null, tag = '', note = '' }, now = Date.now()) {
  const rec = {
    id: a.id, type: a.type, songId: a.songId, tool: a.tool || null,
    start: a.startedAt, end: endAt || now, dur: Math.round(dur),
    bpm: best, tag: tag || null, note: (note || '').trim() || null, mode: a.mode === 'strict' ? 'strict' : 'normal',
    updatedAt: now,
  };
  if (quiet > 0) rec.quiet = Math.round(quiet);
  if (a.clk) rec.clk = a.clk; // во время сессии часы переводили — запись не подтверждается
  return rec;
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
  if (store.addSession) store.addSession(rec); else { store.state.sessions.push(rec); store.save(); }
  return rec;
}

/* ---------- инструмент вне сессии ---------- */

// Записывает время инструмента молча, без сессии. Возвращает true, если записано
// mode — режим учёта; overlapMs — сколько из этого времени уже записал секундомер (не засчитывается дважды)
export function recordToolTime(store, tool, start, ms, now = Date.now(), { mode = 'normal', overlapMs = 0, clk = '' } = {}) {
  if (store.state.settings.autoTrack === false || store.state.settings.toolsOnly) return false;
  const dur = Math.round(Math.max(0, ms - overlapMs) / 1000);
  if (dur < MIN_TOOL_S) return false;
  const rec = { id: uid(), type: 'tool', tool, songId: null, start, end: now, dur, mode, updatedAt: now };
  if (clk) rec.clk = clk;
  if (store.addSession) store.addSession(rec); else { store.state.sessions.push(rec); store.save(); }
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
