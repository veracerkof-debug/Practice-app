// Напоминания о практике — уведомления телефона (Android, плагин локальных уведомлений; без интернета и серверов).
// Расписание — на неделю вперёд по дням практики (settings.days), пересчитывается при открытии приложения, смене
// настроек и после каждого занятия: в день, когда уже занимались, оставшиеся напоминания этого дня снимаются.
// Характер: «мягко» — одно тихое напоминание в день; «обычно» — одно, со звуком; «настойчиво» — до трёх в день
// (через 2 часа, пока не позанимались), со звуком и вибрацией. Тихие часы — без напоминаний.
import { Capacitor } from '@capacitor/core';
import { dayKey, weekday } from './time.js';

export const STYLES = ['soft', 'normal', 'insistent'];
export const DEFAULT_REMIND = { on: false, style: 'normal', time: '19:00', quietFrom: 22, quietTo: 8 };
const CHANNELS = { soft: 'remind-soft', normal: 'remind', insistent: 'remind-loud' };
const ID0 = 7000, ID_N = 30; // свои номера уведомлений: 7000…7029
const DAY = 86400000;

export const remindOf = (settings) => ({ ...DEFAULT_REMIND, ...(settings.remind || {}) });

// Время напоминаний дня d (полночь) по характеру и тихим часам → [мс]
export function remindTimes(r, d) {
  const [h, m] = String(r.time || '19:00').split(':').map((x) => +x || 0);
  const first = d + (h * 60 + m) * 60000, n = r.style === 'insistent' ? 3 : 1;
  const quiet = (ts) => { const hr = new Date(ts).getHours(); return r.quietFrom > r.quietTo ? hr >= r.quietFrom || hr < r.quietTo : hr >= r.quietFrom && hr < r.quietTo; };
  return Array.from({ length: n }, (_, i) => first + i * 2 * 3600000).filter((ts) => !quiet(ts));
}

// Расписание на 7 дней: только дни практики; сегодня — только если ещё не занимались и время не прошло
export function plan(settings, practicedToday, now = Date.now()) {
  const r = remindOf(settings);
  if (!r.on) return [];
  const out = [], d0 = new Date(now); d0.setHours(0, 0, 0, 0);
  for (let i = 0; i < 7; i++) {
    const d = new Date(d0.getTime() + i * DAY + 3600000); d.setHours(0, 0, 0, 0); // переход на летнее время
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
  await mk(CHANNELS.soft, 'Melete · мягко', 2, false, false);
  await mk(CHANNELS.normal, 'Melete', 3, true, false);
  await mk(CHANNELS.insistent, 'Melete · настойчиво', 4, true, true);
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
    await P.schedule({
      notifications: ts.map((at, i) => ({ id: ID0 + i, ...texts(i, at), schedule: { at: new Date(at), allowWhileIdle: true }, channelId: CHANNELS[r.style] || CHANNELS.normal, autoCancel: true })),
    });
    return ts.length;
  } catch { return 0; }
}

// Проверка: напоминание через 5 секунд
export async function remindTest(texts, style = 'normal') {
  const P = await plugin();
  if (!P || !(await remindPermission())) return false;
  await channels(P);
  try {
    await P.schedule({ notifications: [{ id: ID0 + ID_N, ...texts(0, Date.now()), schedule: { at: new Date(Date.now() + 5000), allowWhileIdle: true }, channelId: CHANNELS[style], autoCancel: true }] });
    return true;
  } catch { return false; }
}
