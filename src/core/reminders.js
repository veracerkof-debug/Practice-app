// Напоминания о практике — уведомления телефона (Android, плагин локальных уведомлений; без интернета и серверов).
// Расписание — на неделю вперёд по дням практики (settings.days), пересчитывается при открытии приложения, смене
// настроек и после каждого занятия: в день, когда уже занимались, оставшиеся напоминания этого дня снимаются.
// Характер Мелеты (он же — характер маскота на главной), выбирается при регистрации и в настройках маскота:
// - «Классика»: перед занятием — за час («сегодня практика») и за 5 минут («пора доставать инструмент»);
//   какие именно — выбор человека (за 5 мин, 1, 2, 3 ч);
// - «Навязчивая»: весь день — утром, перед обедом, днём, перед ужином, за час и за 5 минут до занятия, после него
//   и поздно вечером (6–8 раз), тексты в стиле «пикми»; громкий канал с вибрацией;
// - «Своё»: человек сам собирает список — до занятия, после или в точное время, каждое в своём стиле (до 10 в день);
// - «Без уведомлений»: напоминаний нет совсем, Мелета спокойна.
// Тихие часы — без напоминаний. Тексты — src/core/remindtexts.js.
import { Capacitor } from '@capacitor/core';
import { dayKey, weekday } from './time.js';
import { log, errText } from './log.js';

export const STYLES = ['classic', 'pushy', 'custom', 'quiet'];
export const LEADS = [5, 60, 120, 180]; // минуты до времени занятий
// «Своё»: смещения от времени занятий (минуты; минус — до, плюс — после) и тон текста
export const OFFSETS = [-180, -120, -60, -30, -15, -5, 0, 30, 60, 120];
export const TONES = ['classic', 'pushy'];
export const CUSTOM_MAX = 10;
export const DEFAULT_REMIND = { mode: 'classic', time: '19:00', leads: [60, 5], byName: false, quietFrom: 22, quietTo: 8,
  custom: [{ min: -60, tone: 'classic' }, { min: -5, tone: 'classic' }] };
// Пункт своего списка: { min, tone } — относительно занятия, или { at: 'ЧЧ:ММ', tone } — точное время
export function cleanItem(x) {
  if (!x || typeof x !== 'object') return null;
  const tone = TONES.includes(x.tone) ? x.tone : 'classic';
  if (typeof x.at === 'string' && /^\d\d:\d\d$/.test(x.at)) return { at: x.at, tone };
  const m = Math.round(+x.min);
  return Number.isFinite(m) && m >= -720 && m <= 720 ? { min: m, tone } : null;
}
// Каналы — новые имена: у прежних («remind», «remind-loud») могла остаться неудачная настройка (каналы Android не меняются)
const CHANNELS = { classic: 'melete-remind', pushy: 'melete-remind-loud' };
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
  r.custom = (Array.isArray(r.custom) ? r.custom : DEFAULT_REMIND.custom).map(cleanItem).filter(Boolean).slice(0, CUSTOM_MAX);
  return r;
}
// Сохранить выбор (settings.remind): только поля нового вида
export function setRemind(settings, patch) {
  const r = { ...remindOf(settings), ...patch };
  settings.remind = { mode: r.mode, time: r.time, leads: r.leads, custom: (r.custom || []).map(cleanItem).filter(Boolean).slice(0, CUSTOM_MAX), byName: !!r.byName, quietFrom: r.quietFrom, quietTo: r.quietTo };
  return remindOf(settings);
}

const at = (d, hhmm) => { const [h, m] = String(hhmm || '19:00').split(':').map((x) => +x || 0); return d + (h * 60 + m) * MIN; };

// Напоминания дня d (полночь) → [{ ts, slot, tone? }] по возрастанию. slot: 'lead:<мин>' — до занятия, 'after' — после,
// 'morning' | 'lunch' | 'afternoon' | 'dinner' | 'late' — точки дня навязчивой Мелеты; у «Своего» —
// 'rel:<мин>' (относительно занятия) или 'abs' (точное время) и tone — стиль текста
export function remindTimes(r, d) {
  r = r.leads && r.mode ? r : remindOf({ remind: r });
  if (r.mode === 'quiet') return [];
  const quiet = (ts) => { const hr = new Date(ts).getHours(); return r.quietFrom > r.quietTo ? hr >= r.quietFrom || hr < r.quietTo : hr >= r.quietFrom && hr < r.quietTo; };
  const t0 = at(d, r.time);
  if (r.mode === 'custom') {
    const seen = new Set();
    return r.custom.map((x) => (x.at ? { ts: at(d, x.at), slot: 'abs', tone: x.tone } : { ts: t0 + x.min * MIN, slot: 'rel:' + x.min, tone: x.tone }))
      .filter((x) => x.ts >= d && x.ts < d + DAY && !quiet(x.ts) && !seen.has(x.ts) && seen.add(x.ts)).sort((a, b) => a.ts - b.ts);
  }
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
// Плагин — в обёртке { P }: сам объект плагина Capacitor нельзя возвращать из async-функции — обещание ищет у него
// .then(), и плагин падает «LocalNotifications.then() is not implemented» (из-за этого напоминания не ставились вовсе)
async function plugin() {
  if (!native()) return { P: null };
  if (!LN) LN = (await import('@capacitor/local-notifications')).LocalNotifications;
  return { P: LN };
}
export const remindAvailable = native;

// Разрешение на уведомления (Android 13+ спрашивает). → true, если можно
export async function remindPermission() {
  const { P } = await plugin();
  if (!P) return false;
  try {
    let st = await P.checkPermissions();
    if (st.display !== 'granted') st = await P.requestPermissions();
    return st.display === 'granted';
  } catch { return false; }
}

// Каналы создаются каждый раз (это дёшево и не сбрасывает выбор человека): если прошлый раз не вышло — выйдет сейчас
async function channels(P) {
  if (Capacitor.getPlatform() !== 'android') return;
  const mk = (id, name, importance, vibration) => P.createChannel({ id, name, importance, visibility: 1, vibration }).catch((e) => log('remind', 'канал ' + id + ': ' + errText(e), 'w'));
  ['remind', 'remind-loud'].forEach((id) => P.deleteChannel({ id }).catch(() => {})); // прежние каналы
  await mk(CHANNELS.classic, 'Melete', 4, false);
  await mk(CHANNELS.pushy, 'Melete · навязчиво', 4, true);
}

// Точные будильники (Android 12+): разрешены — напоминания приходят минута в минуту; нет — обычным способом
// (система может сдвинуть на несколько минут). Экран настроек сам не открывается — только по кнопке
export async function exactAllowed() {
  const { P } = await plugin();
  if (!P || !P.checkExactNotificationSetting) return true;
  try { const r = await P.checkExactNotificationSetting(); return r.exact_alarm === 'granted'; } catch { return true; }
}
export async function openExactSettings() {
  const { P } = await plugin();
  if (P && P.changeExactNotificationSetting) { try { await P.changeExactNotificationSetting(); } catch { /* нет экрана */ } }
}

// Уведомление из текста: { title, body, icon } → поля плагина. Значок в строке состояния — монохромное лицо маскота
// (res/drawable/ic_stat_melete.xml), большая картинка — маскот с лицом по поводу (icon, remindtexts.js: notifyIcon)
const note = ({ title, body, icon }) => ({ title, body, smallIcon: 'ic_stat_melete', iconColor: '#9C7242', ...(icon ? { largeIcon: icon } : {}) });

// Пересчитать расписание. texts({ i, ts, n, slot, mode }) → { title, body, icon } — текст напоминания (маскот, цитаты)
export async function reschedule(state, texts, now = Date.now()) {
  const { P } = await plugin();
  if (!P) return 0;
  try {
    await P.cancel({ notifications: Array.from({ length: ID_N }, (_, i) => ({ id: ID0 + i })) });
    const st = state.settings, today = dayKey(now);
    const practiced = (state.sessions || []).some((x) => !x.deleted && dayKey(x.start) === today);
    const list = plan(st, practiced, now);
    if (!list.length) { log('remind', 'расписание пустое (режим ' + remindOf(st).mode + ')'); return 0; }
    if (!(await P.checkPermissions().then((p) => p.display === 'granted').catch(() => false))) { log('remind', 'уведомления не разрешены', 'w'); return 0; }
    await channels(P);
    const mode = remindOf(st).mode, exact = await exactAllowed();
    await P.schedule({
      notifications: list.map((x, i) => ({ id: ID0 + i, ...note(texts({ i, ts: x.ts, n: x.n, slot: x.slot, mode, tone: x.tone })), schedule: { at: new Date(x.ts), allowWhileIdle: true },
        channelId: CHANNELS[x.tone || mode] || CHANNELS.classic, autoCancel: true, isExactNotification: exact })),
    });
    log('remind', 'запланировано ' + list.length + (exact ? ', точно' : ', приблизительно') + ', первое — ' + new Date(list[0].ts).toLocaleString());
    return list.length;
  } catch (e) { log('remind', 'не запланировалось: ' + errText(e), 'e'); return 0; }
}

// Напоминания о событиях календаря — свой канал и свои номера (7100…7159), не зависят от характера маскота:
// напоминание у события человек ставит сам. list — [{ ts, title, body }] (calendar.js: eventReminders + тексты)
const EV_CH = 'melete-events', EV0 = 7100, EV_N = 60;
export async function rescheduleEvents(list) {
  const { P } = await plugin();
  if (!P) return 0;
  try {
    await P.cancel({ notifications: Array.from({ length: EV_N }, (_, i) => ({ id: EV0 + i })) });
    if (!list.length) return 0;
    if (!(await P.checkPermissions().then((p) => p.display === 'granted').catch(() => false))) { log('remind', 'события: уведомления не разрешены', 'w'); return 0; }
    if (Capacitor.getPlatform() === 'android') await P.createChannel({ id: EV_CH, name: 'Melete · календарь', importance: 4, visibility: 1, vibration: true }).catch(() => {});
    const exact = await exactAllowed();
    await P.schedule({ notifications: list.slice(0, EV_N).map((x, i) => ({ id: EV0 + i, ...note({ title: x.title, body: x.body }), schedule: { at: new Date(x.ts), allowWhileIdle: true },
      channelId: EV_CH, autoCancel: true, isExactNotification: exact })) });
    log('remind', 'события: запланировано ' + Math.min(EV_N, list.length));
    return list.length;
  } catch (e) { log('remind', 'события не запланировались: ' + errText(e), 'e'); return 0; }
}

// Ближайшее запланированное напоминание о практике (для строки в настройках): время или null
export async function remindNext() {
  const { P } = await plugin();
  if (!P || !P.getPending) return null;
  try {
    const r = await P.getPending(), ts = (r.notifications || []).filter((x) => x.id >= ID0 && x.id < ID0 + ID_N)
      .map((x) => new Date(x.schedule && x.schedule.at).getTime()).filter((x) => x > Date.now());
    return ts.length ? Math.min(...ts) : null;
  } catch { return null; }
}

// Проверка: напоминание сразу (как оно будет выглядеть). → 'ok' | 'denied' | 'off' | 'fail'
export async function remindTest(texts, mode = 'classic', slot = 'lead:60', tone) {
  const { P } = await plugin();
  if (!P) return 'fail';
  if (mode === 'quiet') return 'off';
  if (!(await remindPermission())) return 'denied';
  await channels(P);
  try {
    await P.schedule({ notifications: [{ id: ID_TEST, ...note(texts({ i: 0, ts: Date.now(), n: 0, slot, mode, tone })), channelId: CHANNELS[tone || mode] || CHANNELS.classic, autoCancel: true, isExactNotification: false }] });
    log('remind', 'проверка показана');
    return 'ok';
  } catch (e) { log('remind', 'проверка не показалась: ' + errText(e), 'e'); return 'fail'; }
}
