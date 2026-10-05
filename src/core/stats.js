// Статистика и ударный режим. Чистые функции: (sessions, songs, settings, now) → данные для экранов.
// Длительности — в секундах.
import { DAY, dayKey, dayStart, weekStart, monthStart, weekday } from './time.js';

const sum = (arr) => arr.reduce((t, s) => t + s.dur, 0);
const inRange = (all, a, b) => all.filter((s) => s.start >= a && s.start < b);
const toList = (m) => Object.entries(m).map(([n, v]) => ({ n, v })).sort((a, b) => b.v - a.v);

export const DIFF_COUNT = 5;

// Время по дням текущей недели
export function weekData(sessions, now = Date.now()) {
  const ws = weekStart(now), we = ws + 7 * DAY;
  const per = Array(7).fill(0);
  let total = 0;
  sessions.forEach((s) => {
    if (s.start >= ws && s.start < we) {
      per[weekday(s.start)] += s.dur;
      total += s.dur;
    }
  });
  return { per, total, ws };
}

export function songStats(sessions, songId) {
  const ss = sessions.filter((x) => x.songId === songId).sort((a, b) => a.start - b.start);
  return {
    total: sum(ss),
    count: ss.length,
    last: ss.length ? ss[ss.length - 1].start : 0,
    tempo: ss.filter((x) => x.bpm).map((x) => ({ t: x.start, bpm: x.bpm })),
  };
}

// Цель на один день практики (для линии на графике недели)
export const goalPerDay = (settings) =>
  (settings.goalMin * 60) / Math.max(1, settings.days.filter(Boolean).length);

// Доля цели недели: 1 — выполнено, >1 — перевыполнено
export const goalProgress = (weekTotal, settings) => weekTotal / Math.max(1, settings.goalMin * 60);

/* ---------- ударный режим (по неделям) ---------- */

export function streakInfo(sessions, settings, now = Date.now()) {
  const goal = settings.goalMin * 60, ws = weekStart(now), wt = [];
  for (let i = 0; i < 104; i++) {
    const a = ws - i * 7 * DAY, b = a + 7 * DAY;
    wt.push(sum(inRange(sessions, a, b)));
  }
  const met = wt.map((v) => goal > 0 && v >= goal);
  let prev = 0;
  for (let i = 1; i < met.length; i++) {
    if (met[i]) prev++;
    else break;
  }
  const weeks = prev + (met[0] ? 1 : 0);
  let best = 0, run = 0;
  for (let i = met.length - 1; i >= 0; i--) {
    run = met[i] ? run + 1 : 0;
    if (run > best) best = run;
  }
  // Дни подряд с практикой; дни отдыха по плану серию не ломают
  const perDay = {};
  sessions.forEach((s) => {
    const k = dayKey(s.start);
    perDay[k] = (perDay[k] || 0) + s.dur;
  });
  let days = 0;
  const t0 = dayStart(now);
  for (let i = 0; i < 500; i++) {
    const t = t0 - i * DAY, did = perDay[dayKey(t)] > 0;
    if (did) days++;
    else if (settings.days[weekday(t)] && i > 0) break;
  }
  return {
    weeks,
    best: Math.max(best, weeks),
    curMet: met[0],
    atRisk: !met[0] && prev > 0,  // серия есть, но эта неделя ещё не закрыта
    days,
    met: met.slice(0, 12).reverse(),
    wt: wt.slice(0, 12).reverse(),
  };
}

/* ---------- экран статистики ---------- */

// Карта практики за 12 недель: 84 дня с понедельника
export function heatmap(sessions, now = Date.now()) {
  const ws0 = weekStart(now) - 11 * 7 * DAY, perDay = {};
  sessions.forEach((s) => {
    if (s.start >= ws0) {
      const k = dayKey(s.start);
      perDay[k] = (perDay[k] || 0) + s.dur;
    }
  });
  const max = Math.max(...Object.values(perDay), 1);
  let active = 0;
  const cells = [];
  for (let i = 0; i < 84; i++) {
    const t = ws0 + i * DAY, v = perDay[dayKey(t)] || 0;
    if (v) active++;
    cells.push({ t, v, level: v ? 0.3 + 0.7 * (v / max) : 0, future: t > now });
  }
  return { cells, active, max };
}

// Последние 8 недель (текущая — последняя); avg — среднее за 7 прошлых
export function weeklyTotals(sessions, now = Date.now()) {
  const weeks = [];
  for (let i = 7; i >= 0; i--) {
    const a = weekStart(now) - i * 7 * DAY;
    weeks.push({ a, v: sum(inRange(sessions, a, a + 7 * DAY)) });
  }
  return { weeks, avg: weeks.slice(0, 7).reduce((t, x) => t + x.v, 0) / 7 };
}

// Текущий месяц: свободная практика / песни / инструменты отдельно
export function monthSplit(sessions, now = Date.now()) {
  const month = sessions.filter((s) => s.start >= monthStart(now));
  const total = sum(month);
  const free = sum(month.filter((s) => s.type === 'free'));
  const tool = sum(month.filter((s) => s.type === 'tool'));
  return { total, free, tool, songs: total - free - tool };
}

export const totalTime = (sessions) => sum(sessions);

// Инструменты, открытые вне сессии: [{ n: id инструмента, v }]
export function byTool(sessions) {
  const m = {};
  sessions.filter((s) => s.type === 'tool').forEach((s) => { m[s.tool] = (m[s.tool] || 0) + s.dur; });
  return toList(m);
}

// Топ-8 песен по времени: [{ n: id песни, v }]
export function bySong(sessions, songs) {
  return songs
    .map((s) => ({ n: s.id, v: songStats(sessions, s.id).total }))
    .filter((x) => x.v > 0).sort((a, b) => b.v - a.v).slice(0, 8);
}

// По полю песни: 'genre' → название жанра ('' — без жанра), 'difficulty' → 1…5
export function bySongField(sessions, songs, key) {
  const m = {}, byId = new Map(songs.map((s) => [s.id, s]));
  sessions.filter((s) => s.songId).forEach((s) => {
    const so = byId.get(s.songId);
    if (!so) return;
    const k = so[key] || '';
    m[k] = (m[k] || 0) + s.dur;
  });
  return toList(m);
}

// Свободная практика по меткам ('' — без метки)
export function byFreeTag(sessions) {
  const m = {};
  sessions.filter((s) => s.type === 'free').forEach((s) => { const k = s.tag || ''; m[k] = (m[k] || 0) + s.dur; });
  return toList(m);
}
