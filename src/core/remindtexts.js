// Тексты напоминаний Мелеты по характеру и поводу (slot из src/core/reminders.js). Свои тексты — без «ты/вы»
// (правило проекта): Мелета говорит о себе, об инструменте и о дне. Обращение по имени — по желанию (byName):
// «Алекс, сегодня практика…».
import { quoteAt, dayIndex, setsOf } from './quotes.js';
import { remindOf } from './reminders.js';
import { getLang } from '../i18n/index.js';

const T = {
  ru: {
    lead: (m) => (m === 60 ? 'Сегодня практика — через час' : 'Сегодня практика — через ' + m / 60 + ' часа'),
    five: ['Пора доставать инструмент', 'Разминка, дела в сторону — через 5 минут занятие'],
    pushy: {
      morning: ['Доброе утро! Сегодня ведь будет практика? 🥺', 'Мелета проснулась раньше всех и уже ждёт у инструмента'],
      lunch: ['Обед — отличное время подумать о гаммах', 'Мелета просто напоминает. Ещё раз. На всякий случай 👉👈'],
      afternoon: ['Мелета совсем не навязывается…', '…просто инструмент сегодня ещё не открывали. Совсем-совсем'],
      dinner: ['Перед ужином — пятнадцать минут практики?', 'И Мелета будет самой счастливой на свете ✨'],
      'lead:60': ['Через час практика! Ура-ура', 'Мелета уже настроила камертон и сидит у инструмента'],
      'lead:5': ['Пять минут! Инструмент, разминка, телефон в сторону', '…кроме этого уведомления, конечно 🥺'],
      after: ['Время занятий прошло… Мелета не обижается', 'Совсем чуть-чуть. Но ещё можно всё исправить'],
      late: ['Ещё не поздно! Пять минут — и день спасён', 'Мелета будет ждать. Она всегда ждёт 🥺'],
    },
  },
  uz: {
    lead: (m) => 'Bugun mashg‘ulot — ' + m / 60 + ' soatdan keyin',
    five: ['Cholg‘uni olish vaqti', 'Qizish, ishlar chetga — 5 daqiqadan keyin mashg‘ulot'],
    pushy: {
      morning: ['Xayrli tong! Bugun mashg‘ulot bo‘ladi-ku? 🥺', 'Melete hammadan oldin uyg‘ondi va cholg‘u yonida kutyapti'],
      lunch: ['Tushlik — gammalar haqida o‘ylash uchun ajoyib vaqt', 'Melete shunchaki eslatyapti. Yana bir bor. Har ehtimolga qarshi 👉👈'],
      afternoon: ['Melete umuman majburlamayapti…', '…shunchaki cholg‘u bugun hali ochilmadi. Umuman'],
      dinner: ['Kechki ovqatdan oldin — o‘n besh daqiqa mashg‘ulot?', 'Shunda Melete dunyodagi eng baxtli bo‘ladi ✨'],
      'lead:60': ['Bir soatdan keyin mashg‘ulot! Ura-ura', 'Melete kamertonni sozlab, cholg‘u yonida o‘tiribdi'],
      'lead:5': ['Besh daqiqa! Cholg‘u, qizish, telefon chetga', '…bu bildirishnomadan tashqari, albatta 🥺'],
      after: ['Mashg‘ulot vaqti o‘tdi… Melete xafa emas', 'Ozgina xolos. Lekin hali hammasini tuzatish mumkin'],
      late: ['Hali kech emas! Besh daqiqa — va kun qutqarildi', 'Melete kutadi. U doim kutadi 🥺'],
    },
  },
  en: {
    lead: (m) => (m === 60 ? 'Practice today — in an hour' : 'Practice today — in ' + m / 60 + ' hours'),
    five: ['Time to get the instrument out', 'Warm-up, everything else aside — practice in 5 minutes'],
    pushy: {
      morning: ['Good morning! There will be practice today, right? 🥺', 'Melete woke up before everyone and is already waiting by the instrument'],
      lunch: ['Lunch is a great time to think about scales', 'Melete is just reminding. Again. Just in case 👉👈'],
      afternoon: ['Melete isn’t being pushy at all…', '…it’s just that the instrument hasn’t been opened today. Not even once'],
      dinner: ['Fifteen minutes of practice before dinner?', 'And Melete will be the happiest in the world ✨'],
      'lead:60': ['Practice in an hour! Yay', 'Melete has tuned the fork and is sitting by the instrument'],
      'lead:5': ['Five minutes! Instrument, warm-up, phone away', '…except for this notification, of course 🥺'],
      after: ['Practice time has passed… Melete isn’t upset', 'Just a tiny bit. But it can all still be fixed'],
      late: ['It’s not too late! Five minutes and the day is saved', 'Melete will wait. She always waits 🥺'],
    },
  },
};
const lowerFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);

// Текст напоминания: { i, ts, n, slot, mode } + язык, наборы слов, свои сборники, имя (если обращение по имени)
export function remindText({ i = 0, ts = Date.now(), slot = 'lead:60', mode = 'classic' }, { lang = 'ru', sets = true, books = [], name = '' } = {}) {
  const L = T[lang] || T.ru, d = dayIndex(ts);
  let title, body;
  if (mode === 'pushy') [title, body] = L.pushy[slot] || L.pushy.afternoon;
  else if (slot === 'lead:5') [title, body] = L.five;
  else {
    const m = +String(slot).split(':')[1] || 60, q = quoteAt(d * 3 + i, lang, sets, books);
    title = L.lead(m); body = q.text + (q.ref ? ' — ' + q.ref : '');
  }
  if (name) title = name + ', ' + lowerFirst(title);
  return { title, body };
}

// Строка навязчивой Мелеты для главной: по времени суток (утро → перед обедом → днём → перед ужином → вечер)
export function pleaLine(h, lang = 'ru') {
  const P = (T[lang] || T.ru).pushy;
  return (h < 12 ? P.morning : h < 15 ? P.lunch : h < 18 ? P.afternoon : h < 20 ? P.dinner : P.late)[0];
}
export const PUSHY_TEXTS = T;

// Язык, наборы и обращение — из настроек
export function remindCtx(settings, lang = getLang()) {
  const r = remindOf(settings), name = (settings.profile && settings.profile.name) || '';
  return { lang, sets: setsOf(settings), books: settings.quoteBooks || [], name: r.byName ? name : '' };
}
