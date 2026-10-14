// Настроение Мелеты (маскот, src/ui/mascot.js) по состоянию занятий. Без DOM, без укоров: ритм недельный —
// «скучает» только после долгого перерыва, «ждёт» — вечером дня практики, если занятия ещё не было.
import { weekday, dayKey } from './time.js';

const DAY = 86400000;

// s: { now, active, pomoBreak, weekSec, goalSec, days[7], sessions[] }
export function moodOf(s) {
  const now = s.now ?? Date.now(), h = new Date(now).getHours();
  if (s.active) return s.pomoBreak ? 'rest' : 'focus';
  if (h >= 23 || h < 6) return 'sleep';
  const p = s.goalSec > 0 ? s.weekSec / s.goalSec : 0;
  if (p >= 1.2) return 'cool';
  if (p >= 1) return 'happy';
  const list = s.sessions || [], today = dayKey(now);
  if (list.some((x) => dayKey(x.start) === today)) return 'glad';
  const last = list.reduce((m, x) => Math.max(m, x.start || 0), 0);
  if (last && now - last > 5 * DAY) return 'sad';
  if (s.days && s.days[weekday(now)] && h >= 17) return 'wait';
  return 'calm';
}
