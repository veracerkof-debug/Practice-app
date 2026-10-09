// История занятий для проверки создателем (sandbox.js): живая на вид статистика с января 2025 года по песням
// демо-набора (demo.js). Только на время проверки: выход кодом создателя или бета-тестера возвращает прежние данные.
// ПЕРЕД ВЫПУСКОМ — удалить вместе с sandbox.js (см. ROADMAP.md).
import { seal, EARLIEST } from './integrity.js';
import { uid } from './time.js';
import { DEMO_PREFIX, DEMO_SONGS, isDemo, addDemo } from './demo.js';

/* ---------- история занятий ---------- */

// Повторяемый случайный ряд: одна и та же история при каждой загрузке
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const DAY = 86400000;
const TOOLS = [['metro', 5], ['tuner', 3], ['piano', 2], ['theory', 2], ['drone', 1], ['glider', 1]];
const pick = (r, list) => { const tot = list.reduce((a, x) => a + x[1], 0); let v = r() * tot; for (const x of list) { v -= x[1]; if (v <= 0) return x[0]; } return list[0][0]; };

// Сессии с from по to (мс). songs — [{ id, since (доля пути, когда начали учить), weight, targetBpm, currentBpm }]
export function demoSessions(songs, from, to, seed = 7) {
  const r = rng(seed), out = [], span = to - from;
  // отпуска и болезни: несколько пауз по 5–16 дней
  // (не в последние три недели: на главной и в неделе должно быть видно живое занятие)
  const gaps = Array.from({ length: Math.max(2, Math.round(span / DAY / 120)) }, () => { const a = from + r() * Math.max(0, span - 40 * DAY); return [a, a + (5 + r() * 11) * DAY]; });
  for (let d = new Date(from); d.getTime() < to; d = new Date(d.getTime() + DAY)) {
    const day = d.getTime(), wd = d.getDay(), month = d.getMonth(), prog = (day - from) / span;
    if (gaps.some(([a, b]) => day >= a && day < b)) continue;
    // охотнее в выходные, меньше летом и в декабрьскую суету; со временем — регулярнее
    let p = [0.72, 0.5, 0.58, 0.52, 0.6, 0.45, 0.75][wd];
    if (month === 6 || month === 7) p *= 0.7;
    if (month === 11) p *= 0.8;
    p *= 0.75 + 0.35 * prog;
    if (to - day < 16 * DAY) p = Math.max(p, 0.85); // последние две недели — почти каждый день
    if (r() > p) continue;
    // одно-три занятия в день: вечер чаще всего, иногда утро и обед
    const n = r() < 0.18 ? 2 + (r() < 0.25 ? 1 : 0) : 1;
    let busyTill = 0;
    for (let k = 0; k < n; k++) {
      const hour = k === 0 ? pick(r, [[7, 2], [8, 2], [12, 1], [13, 1], [17, 2], [18, 3], [19, 5], [20, 6], [21, 4], [22, 2]]) : 21 + r() * 1.5;
      let start = day + hour * 3600000 + Math.floor(r() * 50) * 60000;
      if (start < busyTill) start = busyTill + 20 * 60000;
      // длина: обычно 20–60 минут, иногда долгие репетиции; растёт с опытом
      const mins = Math.max(6, Math.min(170, Math.round(Math.exp(Math.log(28 + 22 * prog) + (r() - 0.5) * 1.1) + (wd === 0 || wd === 6 ? r() * 30 : 0))));
      const dur = mins * 60, end = start + dur * 1000 + Math.floor(r() * 4) * 60000;
      if (end > to) continue;
      busyTill = end;
      const learning = songs.filter((s) => prog >= s.since);
      const kind = r();
      let rec;
      if (learning.length && kind < 0.55) {
        const s = pick(r, learning.map((x) => [x, x.weight * (prog - x.since < 0.15 ? 1.8 : 1)]));
        // темп растёт от 70 % целевого к нынешнему
        const k2 = Math.min(1, (prog - s.since) / Math.max(0.05, 1 - s.since)), bpm = Math.round(s.targetBpm * 0.7 + (s.currentBpm - s.targetBpm * 0.7) * k2 + (r() - 0.5) * 4);
        rec = { type: 'song', songId: s.id, tool: null, bpm };
      } else if (kind < 0.8) rec = { type: 'tool', songId: null, tool: pick(r, TOOLS), bpm: null };
      else rec = { type: 'free', songId: null, tool: null, bpm: null, tag: null };
      out.push(seal({ id: DEMO_PREFIX + uid(), ...rec, start, end, dur: rec.type === 'tool' ? Math.min(dur, 40 * 60) : dur, mode: r() < 0.15 ? 'strict' : 'normal', updatedAt: end }));
    }
  }
  return out;
}

// Демо-набор (если его ещё нет) и история занятий по его песням
export async function loadDemoStats(app, t) {
  const store = app.store, st = store.state, now = Date.now();
  await addDemo(app, t);
  const songs = st.songs.filter((s) => isDemo(s.id) && !s.deleted);
  if (!songs.length || st.sessions.some((x) => isDemo(x.id))) return false;
  const from = Math.max(EARLIEST + DAY, new Date(2025, 0, 3).getTime());
  st.sessions.push(...demoSessions(songs.map((s, i) => ({ id: s.id, since: (DEMO_SONGS[i] || {}).since ?? 0.5, weight: (DEMO_SONGS[i] || {}).weight ?? 1, targetBpm: s.targetBpm, currentBpm: s.currentBpm })), from, now - 3600000));
  songs.forEach((s, i) => { s.createdAt = from + ((DEMO_SONGS[i] || {}).since ?? 0.5) * (now - from); });
  store.save();
  return true;
}
