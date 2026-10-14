// Напоминания о практике — уведомления телефона (Android, плагин локальных уведомлений; без интернета и серверов).
// Расписание — на неделю вперёд по дням практики (settings.days), пересчитывается при открытии приложения, смене
// настроек и после каждого занятия: в день, когда уже занимались, оставшиеся напоминания этого дня снимаются.
// Характер Мелеты (он же — характер маскота на главной):
// - «Классика» (по умолчанию): к времени занятий — напоминания в срок и/или за 1, 2, 3 часа (выбор человека);
// - «Настойчивая»: то же, плюс после времени занятий — каждый час, пока не позанимались (до тихих часов, до 8 в день),
//   тексты давят на эмоции; громкий канал с вибрацией;
// - «Минимал»: только в выбранное время, один-два раза в день, тихо.
// Тихие часы — без напоминаний.
import { Capacitor } from '@capacitor/core';
import { dayKey, weekday } from './time.js';

export const STYLES = ['classic', 'pushy', 'minimal'];
export const LEADS = [0, 60, 120, 180]; // минуты до времени занятий
export const DEFAULT_REMIND = { on: false, style: 'classic', time: '19:00', leads: [0], times: ['19:00'], quietFrom: 22, quietTo: 8 };
const CHANNELS = { minimal: 'remind-soft', classic: 'remind', pushy: 'remind-loud' };
const ID0 = 7000, ID_N = 60, ID_TEST = 7099; // свои номера уведомлений: 7000…7059, проверка — 7099
const DAY = 86400000, HOUR = 3600000, PUSHY_MAX = 8;
// прежние характеры (мягко/обычно/настойчиво) → новые
const OLD = { soft: 'minimal', normal: 'classic', insistent: 'pushy' };

export function remindOf(settings) {
  const r = { ...DEFAULT_REMIND, ...(settings.remind || {}) };
  r.style = OLD[r.style] || (STYLES.includes(r.style) ? r.style : 'classic');
  r.leads = (Array.isArray(r.leads) ? r.leads : [0]).filter((m) => LEADS.includes(m));
  if (!r.leads.length) r.leads = [0];
  r.times = (Array.isArray(r.times) && r.times.length ? r.times : [r.time]).filter((x) => /^\d\d:\d\d$/.test(x)).slice(0, 2);
  if (!r.times.length) r.times = [r.time];
  return r;
}

const at = (d, hhmm) => { const [h, m] = String(hhmm || '19:00').split(':').map((x) => +x || 0); return d + (h * 60 + m) * 60000; };

// Время напоминаний дня d (полночь) по характеру и тихим часам → [мс], по возрастанию
export function remindTimes(r, d) {
  const quiet = (ts) => { const hr = new Date(ts).getHours(); return r.quietFrom > r.quietTo ? hr >= r.quietFrom || hr < r.quietTo : hr >= r.quietFrom && hr < r.quietTo; };
  let list;
  if (r.style === 'minimal') list = r.times.map((x) => at(d, x));
  else {
    const t0 = at(d, r.time);
    list = r.leads.map((m) => t0 - m * 60000);
    if (r.style === 'pushy') {
      // настойчивая: ещё за полчаса, в срок и потом каждый час до тихих часов
      list.push(t0 - 30 * 60000, t0);
      for (let k = 1; k < 8; k++) list.push(t0 + k * HOUR);
    }
  }
  list = [...new Set(list)].filter((ts) => ts >= d && ts < d + DAY && !quiet(ts)).sort((a, b) => a - b);
  return r.style === 'pushy' ? list.slice(0, PUSHY_MAX) : list;
}

// Расписание на 7 дней: только дни практики; сегодня — только если ещё не занимались и время не прошло
export function plan(settings, practicedToday, now = Date.now()) {
  const r = remindOf(settings);
  if (!r.on) return [];
  const out = [], d0 = new Date(now); d0.setHours(0, 0, 0, 0);
  for (let i = 0; i < 7; i++) {
    const d = new Date(d0.getTime() + i * DAY + HOUR); d.setHours(0, 0, 0, 0); // переход на летнее время
    if (!settings.days[weekday(d.getTime())]) continue;
    if (i === 0 && practicedToday) continue;
    remindTimes(r, d.getTime()).forEach((ts) => { if (ts > now + 60000) out.push(ts); });
  }
  return out.slice(0, ID_N);
}

let LN = null;
const native = () => Capacitor.isNativePlatform();
async function plugin() {
  if (!native()) return null;
  if (!LN) LN = (await import('@capacitor/local-notifications')).LocalNotifications;
  return LN;
}
export const remindAvailable = native;

// Разрешение на уведомления (Android 13+ спрашивает). → true, если можно
export async function remindPermission() {
  const P = await plugin();
  if (!P) return false;
  try {
    let st = await P.checkPermissions();
    if (st.display !== 'granted') st = await P.requestPermissions();
    return st.display === 'granted';
  } catch { return false; }
}

let channelsDone = false;
async function channels(P) {
  if (channelsDone || Capacitor.getPlatform() !== 'android') return;
  channelsDone = true;
  const mk = (id, name, importance, sound, vibration) => P.createChannel({ id, name, importance, visibility: 1, vibration, ...(sound ? {} : { sound: null }) }).catch(() => {});
  await mk(CHANNELS.minimal, 'Melete · тихо', 2, false, false);
  await mk(CHANNELS.classic, 'Melete', 3, true, false);
  await mk(CHANNELS.pushy, 'Melete · настойчиво', 4, true, true);
}

// Пересчитать расписание. texts(i) → { title, body } — текст i-го напоминания (маскот, цитаты)
export async function reschedule(state, texts, now = Date.now()) {
  const P = await plugin();
  if (!P) return 0;
  try {
    await P.cancel({ notifications: Array.from({ length: ID_N }, (_, i) => ({ id: ID0 + i })) });
    const st = state.settings, today = dayKey(now);
    const practiced = (state.sessions || []).some((x) => !x.deleted && dayKey(x.start) === today);
    const ts = plan(st, practiced, now);
    if (!ts.length) return 0;
    if (!(await P.checkPermissions().then((p) => p.display === 'granted').catch(() => false))) return 0;
    await channels(P);
    const r = remindOf(st);
    // texts(i, at, n, style): n — номер напоминания в этот день (настойчивая давит сильнее с каждым)
    const nth = ts.map((x, i) => ts.slice(0, i).filter((y) => dayKey(y) === dayKey(x)).length);
    await P.schedule({
      notifications: ts.map((x, i) => ({ id: ID0 + i, ...texts(i, x, nth[i], r.style), schedule: { at: new Date(x), allowWhileIdle: true }, channelId: CHANNELS[r.style] || CHANNELS.classic, autoCancel: true })),
    });
    return ts.length;
  } catch { return 0; }
}

// Проверка: напоминание через 5 секунд
export async function remindTest(texts, style = 'classic') {
  const P = await plugin();
  if (!P || !(await remindPermission())) return false;
  await channels(P);
  try {
    await P.schedule({ notifications: [{ id: ID_TEST, ...texts(0, Date.now(), 0, style), schedule: { at: new Date(Date.now() + 5000), allowWhileIdle: true }, channelId: CHANNELS[style] || CHANNELS.classic, autoCancel: true }] });
    return true;
  } catch { return false; }
}
