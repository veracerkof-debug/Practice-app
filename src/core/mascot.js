// Настроение Мелеты (маскот, src/ui/mascot.js) по состоянию занятий. Без DOM, без укоров: ритм недельный —
// «скучает» только после долгого перерыва, «ждёт» — вечером дня практики, если занятия ещё не было.
import { weekday, dayKey } from './time.js';

const DAY = 86400000;

// s: { now, active, pomoBreak, weekSec, goalSec, days[7], sessions[], mode }
// mode — характер: 'classic' | 'pushy' (навязчивая: ждёт → грустит → дуется в течение дня) | 'quiet' (только спокойные лица)
export function moodOf(s) {
  const m = baseMood(s);
  if (s.mode === 'quiet' || s.mode === 'minimal') return ['sleep', 'focus', 'rest', 'happy', 'glad'].includes(m) ? m : 'calm';
  if (s.mode === 'pushy' && ['calm', 'wait', 'sad'].includes(m) && !s.active) {
    const now = s.now ?? Date.now(), h = new Date(now).getHours(), list = s.sessions || [];
    if (list.some((x) => dayKey(x.start) === dayKey(now))) return m;
    if (s.days && !s.days[weekday(now)]) return m === 'sad' ? 'sad' : 'calm';
    return h < 12 ? 'wait' : h < 18 ? 'sad' : 'upset';
  }
  return m;
}

function baseMood(s) {
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
