// Напоминания о практике — уведомления телефона (Android, плагин локальных уведомлений; без интернета и серверов).
// Расписание — на неделю вперёд по дням практики (settings.days), пересчитывается при открытии приложения, смене
// настроек и после каждого занятия: в день, когда уже занимались, оставшиеся напоминания этого дня снимаются.
// Характер Мелеты (он же — характер маскота на главной), выбирается при регистрации и в «Уведомлениях»:
// - «Классика»: перед занятием — за час («сегодня практика») и за 5 минут («пора доставать инструмент»);
//   какие именно — выбор человека (за 5 мин, 1, 2, 3 ч);
// - «Навязчивая»: весь день — утром, перед обедом, днём, перед ужином, за час и за 5 минут до занятия, после него
//   и поздно вечером (6–8 раз), тексты в стиле «пикми»; громкий канал с вибрацией;
// - «Без уведомлений»: напоминаний нет совсем, Мелета спокойна.
// Тихие часы — без напоминаний. Тексты — src/core/remindtexts.js.
import { Capacitor } from '@capacitor/core';
import { dayKey, weekday } from './time.js';

export const STYLES = ['classic', 'pushy', 'quiet'];
export const LEADS = [5, 60, 120, 180]; // минуты до времени занятий
export const DEFAULT_REMIND = { mode: 'classic', time: '19:00', leads: [60, 5], byName: false, quietFrom: 22, quietTo: 8 };
const CHANNELS = { classic: 'remind', pushy: 'remind-loud' };
const ID0 = 7000, ID_N = 60, ID_TEST = 7099; // свои номера уведомлений: 7000…7059, проверка — 7099
const DAY = 86400000, MIN = 60000, PUSHY_MAX = 8;
// Навязчивая: точки дня (кроме привязанных к занятию)
const PUSHY_SLOTS = [['morning', '08:30'], ['lunch', '12:40'], ['afternoon', '15:30'], ['dinner', '18:40'], ['late', '21:30']];

// Прежние настройки: { on, style: soft|normal|insistent|minimal|classic|pushy } → mode
const OLD = { soft: 'classic', minimal: 'classic', normal: 'classic', insistent: 'pushy', classic: 'classic', pushy: 'pushy' };
export function remindOf(settings) {
  const raw = settings.remind || {}, r = { ...DEFAULT_REMIND, ...raw };
  if (!STYLES.includes(raw.mode)) r.mode = raw.on ? OLD[raw.style] || 'classic' : 'quiet';
  r.style = r.mode; // старое имя поля — для совместимости
  r.on = r.mode !== 'quiet';
  r.leads = (Array.isArray(r.leads) ? r.leads : DEFAULT_REMIND.leads).filter((m) => LEADS.includes(m));
  if (!r.leads.length) r.leads = DEFAULT_REMIND.leads.slice();
  if (!/^\d\d:\d\d$/.test(r.time)) r.time = DEFAULT_REMIND.time;
  return r;
}
// Сохранить выбор (settings.remind): только поля нового вида
export function setRemind(settings, patch) {
  const r = { ...remindOf(settings), ...patch };
  settings.remind = { mode: r.mode, time: r.time, leads: r.leads, byName: !!r.byName, quietFrom: r.quietFrom, quietTo: r.quietTo };
  return remindOf(settings);
}

const at = (d, hhmm) => { const [h, m] = String(hhmm || '19:00').split(':').map((x) => +x || 0); return d + (h * 60 + m) * MIN; };

// Напоминания дня d (полночь) → [{ ts, slot }] по возрастанию. slot: 'lead:<мин>' — до занятия, 'after' — после,
// 'morning' | 'lunch' | 'afternoon' | 'dinner' | 'late' — точки дня навязчивой Мелеты
export function remindTimes(r, d) {
  r = r.leads && r.mode ? r : remindOf({ remind: r });
  if (r.mode === 'quiet') return [];
  const quiet = (ts) => { const hr = new Date(ts).getHours(); return r.quietFrom > r.quietTo ? hr >= r.quietFrom || hr < r.quietTo : hr >= r.quietFrom && hr < r.quietTo; };
  const t0 = at(d, r.time);
  let list = (r.mode === 'pushy' ? [60, 5] : r.leads).map((m) => ({ ts: t0 - m * MIN, slot: 'lead:' + m }));
  if (r.mode === 'pushy') {
    list.push({ ts: t0 + 60 * MIN, slot: 'after' });
    // точки дня — если не слишком близко (20 мин) к напоминаниям у занятия
    PUSHY_SLOTS.forEach(([slot, hm]) => { const ts = at(d, hm); if (!list.some((x) => Math.abs(x.ts - ts) < 20 * MIN)) list.push({ ts, slot }); });
  }
  list = list.filter((x) => x.ts >= d && x.ts < d + DAY && !quiet(x.ts)).sort((a, b) => a.ts - b.ts);
  return r.mode === 'pushy' ? list.slice(0, PUSHY_MAX) : list;
}

// Расписание на 7 дней: только дни практики; сегодня — только если ещё не занимались и время не прошло → [{ ts, slot, n }]
// n — номер напоминания в этот день
export function plan(settings, practicedToday, now = Date.now()) {
  const r = remindOf(settings);
  if (!r.on) return [];
  const out = [], d0 = new Date(now); d0.setHours(0, 0, 0, 0);
  for (let i = 0; i < 7; i++) {
    const d = new Date(d0.getTime() + i * DAY + 3600000); d.setHours(0, 0, 0, 0); // переход на летнее время
    if (!settings.days[weekday(d.getTime())]) continue;
    if (i === 0 && practicedToday) continue;
    remindTimes(r, d.getTime()).forEach((x, n) => { if (x.ts > now + MIN) out.push({ ...x, n }); });
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
  await mk(CHANNELS.classic, 'Melete', 3, true, false);
  await mk(CHANNELS.pushy, 'Melete · навязчиво', 4, true, true);
}

// Пересчитать расписание. texts({ i, ts, n, slot, mode }) → { title, body } — текст напоминания (маскот, цитаты)
export async function reschedule(state, texts, now = Date.now()) {
  const P = await plugin();
  if (!P) return 0;
  try {
    await P.cancel({ notifications: Array.from({ length: ID_N }, (_, i) => ({ id: ID0 + i })) });
    const st = state.settings, today = dayKey(now);
    const practiced = (state.sessions || []).some((x) => !x.deleted && dayKey(x.start) === today);
    const list = plan(st, practiced, now);
    if (!list.length) return 0;
    if (!(await P.checkPermissions().then((p) => p.display === 'granted').catch(() => false))) return 0;
    await channels(P);
    const mode = remindOf(st).mode;
    await P.schedule({
      notifications: list.map((x, i) => ({ id: ID0 + i, ...texts({ i, ts: x.ts, n: x.n, slot: x.slot, mode }), schedule: { at: new Date(x.ts), allowWhileIdle: true }, channelId: CHANNELS[mode], autoCancel: true })),
    });
    return list.length;
  } catch { return 0; }
}

// Проверка: напоминание через 5 секунд (slot — какое именно показать)
export async function remindTest(texts, mode = 'classic', slot = 'lead:60') {
  const P = await plugin();
  if (!P || mode === 'quiet' || !(await remindPermission())) return false;
  await channels(P);
  try {
    await P.schedule({ notifications: [{ id: ID_TEST, ...texts({ i: 0, ts: Date.now(), n: 0, slot, mode }), schedule: { at: new Date(Date.now() + 5000), allowWhileIdle: true }, channelId: CHANNELS[mode], autoCancel: true }] });
    return true;
  } catch { return false; }
}
