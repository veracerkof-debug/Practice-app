// Секундомер «сколько я играю»: идёт и при закрытом окне, переживает перезагрузку (состояние — device.watch).
// Его время можно записать в статистику как свободную практику; время, которое уже записала сессия или
// инструмент, второй раз не засчитывается (вычитается пересечение по времени).
import { uid } from './time.js';
import { MIN_SESSION_S } from './session.js';

// Сумма пересечения отрезков segs [[a, b], …] с отрезками busy [[a, b], …], мс
export function overlapMs(segs, busy) {
  let sum = 0;
  segs.forEach(([a, b]) => busy.forEach(([c, d]) => { const lo = Math.max(a, c), hi = Math.min(b, d); if (hi > lo) sum += hi - lo; }));
  return sum;
}

// Объединить пересекающиеся отрезки (чтобы одно и то же время не вычиталось дважды)
export function mergeSegs(list) {
  const s = list.filter(([a, b]) => b > a).map(([a, b]) => [a, b]).sort((x, y) => x[0] - y[0]), out = [];
  s.forEach(([a, b]) => { const last = out.at(-1); if (last && a <= last[1]) last[1] = Math.max(last[1], b); else out.push([a, b]); });
  return out;
}

// Время, которое уже учтено: записанные занятия и идущая сессия
export function busySegs(sessions, active = null, now = Date.now()) {
  const list = sessions.filter((s) => s.start != null && (s.end || s.dur)).map((s) => [s.start, s.end || s.start + s.dur * 1000]);
  if (active) list.push([active.startedAt, now]);
  return mergeSegs(list);
}

export function createStopwatch(state, { now = Date.now, onChange = () => {} } = {}) {
  // state: { running, since, segs: [[start, end], …] } — отрезки, когда секундомер шёл
  state.segs ??= [];
  state.running ??= false;
  const changed = () => onChange();
  const sw = {
    state,
    get running() { return state.running; },
    segments: (t = now()) => (state.running ? [...state.segs, [state.since, t]] : state.segs.slice()),
    elapsed: (t = now()) => sw.segments(t).reduce((s, [a, b]) => s + (b - a), 0) / 1000,
    // Что-то накоплено (идёт или на паузе с ненулевым временем)
    active: () => state.running || state.segs.length > 0,
    start() { if (state.running) return; state.running = true; state.since = now(); changed(); },
    // at — задним числом (бездействие, фон без звука): время после него не засчитывается
    pause(at = now()) {
      if (!state.running) return;
      const end = Math.min(at, now());
      if (end > state.since) state.segs.push([state.since, end]);
      state.running = false; state.since = null; changed();
    },
    toggle() { if (state.running) sw.pause(); else sw.start(); },
    reset() { state.running = false; state.since = null; state.segs = []; changed(); },
    // Сколько секунд попадёт в статистику: время секундомера минус уже учтённое
    credit(sessions, active = null, t = now()) {
      const segs = sw.segments(t), total = segs.reduce((s, [a, b]) => s + (b - a), 0);
      return Math.max(0, Math.round((total - overlapMs(segs, busySegs(sessions, active, t))) / 1000));
    },
    // Записать в статистику как свободную практику; возвращает запись или null (меньше минуты)
    commit(store, active, { tag = '', note = '' } = {}, t = now()) {
      const segs = sw.segments(t), dur = sw.credit(store.sessions(), active, t);
      if (dur < MIN_SESSION_S) return null;
      const rec = { id: uid(), type: 'free', songId: null, tool: null, start: segs[0][0], end: t, dur, bpm: null, tag: tag || null,
        note: (note || '').trim() || null, src: 'stopwatch', mode: 'normal', updatedAt: t };
      store.state.sessions.push(rec);
      store.save();
      sw.reset();
      return rec;
    },
  };
  return sw;
}
