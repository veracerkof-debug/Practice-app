// Реплики Мелеты-тамагочи (src/core/tama.js) на трёх языках. Нейтрально, без «ты/вы», без укоров.
export const TAMA_TEXTS = {
  ru: {
    hello: ['Начали. Слушаю.', 'Занятие пошло — Мелета рядом.', 'Инструмент в руках — уже хорошо.'],
    brk: ['Перерыв: плечи вниз, вдох.', 'Отдых тоже часть занятия.', 'Пауза. Руки отдыхают.'],
    flow: ['Шесть минут без остановки — это поток.', 'Звучит ровно. Так и держать.', 'Слышно, что пошло.'],
    quiet: ['Тихо. Размышление — тоже практика.', 'Пауза затянулась — инструмент ждёт.', 'Тишина. Может, сыграть ещё раз медленно?'],
    back: ['Снова звук — с возвращением.', 'Продолжаем.', 'Вернулись к инструменту — отлично.'],
    m15: ['Пятнадцать минут. Хорошее начало.', 'Четверть часа позади.'],
    m30: ['Полчаса. Занятие состоялось.', 'Тридцать минут — уже настоящая практика.'],
    m60: ['Час занятий. Сильно.', 'Целый час. Лига растёт.'],
    m90: ['Полтора часа — не забыть про отдых для рук.', 'Девяносто минут. Пора дать рукам передышку.'],
    loud: ['Громко и смело! Тише тоже стоит попробовать.', 'Мощно звучит. А если на полтона тише?'],
    soft: ['Очень тихо и аккуратно — красиво.', 'Нежный звук. Можно и смелее.'],
  },
  uz: {
    hello: ['Boshladik. Tinglayapman.', 'Mashgʻulot boshlandi — Meleta yonida.', 'Cholgʻu qoʻlda — bu allaqachon yaxshi.'],
    brk: ['Tanaffus: yelkalarni tushirib, chuqur nafas.', 'Dam olish ham mashgʻulotning bir qismi.', 'Pauza. Qoʻllar dam oladi.'],
    flow: ['Olti daqiqa toʻxtovsiz — bu oqim.', 'Bir tekis yangrayapti. Shunday davom.', 'Ish ketgani eshitilib turibdi.'],
    quiet: ['Jimlik. Oʻylash ham mashq.', 'Pauza choʻzildi — cholgʻu kutmoqda.', 'Jimlik. Balki yana bir bor sekin chalinsa?'],
    back: ['Yana ovoz — xush kelibsiz.', 'Davom etamiz.', 'Cholgʻuga qaytildi — ajoyib.'],
    m15: ['Oʻn besh daqiqa. Yaxshi boshlanish.', 'Chorak soat ortda.'],
    m30: ['Yarim soat. Mashgʻulot boʻldi.', 'Oʻttiz daqiqa — bu haqiqiy mashq.'],
    m60: ['Bir soat mashgʻulot. Zoʻr.', 'Butun bir soat. Liga oʻsmoqda.'],
    m90: ['Bir yarim soat — qoʻllarga dam berishni unutmaslik kerak.', 'Toʻqson daqiqa. Qoʻllarga nafas rostlash vaqti.'],
    loud: ['Baland va dadil! Sekinroq ham sinab koʻrsa boʻladi.', 'Kuchli yangraydi. Yarim ton pastroq-chi?'],
    soft: ['Juda sokin va ehtiyotkor — chiroyli.', 'Nozik ovoz. Dadilroq ham boʻladi.'],
  },
  en: {
    hello: ['Here we go. Listening.', 'Practice is on — Melete is here.', 'Instrument in hand — already good.'],
    brk: ['Break: shoulders down, breathe in.', 'Rest is part of practice too.', 'Pause. Hands are resting.'],
    flow: ['Six minutes non-stop — that is flow.', 'Sounds steady. Keep it there.', 'It is clearly coming together.'],
    quiet: ['Quiet. Thinking is practice too.', 'A long pause — the instrument is waiting.', 'Silence. Maybe once more, slowly?'],
    back: ['Sound again — welcome back.', 'On we go.', 'Back at the instrument — great.'],
    m15: ['Fifteen minutes. A good start.', 'A quarter of an hour done.'],
    m30: ['Half an hour. That was a real session.', 'Thirty minutes — proper practice.'],
    m60: ['An hour of practice. Strong.', 'A whole hour. The league is growing.'],
    m90: ['An hour and a half — remember to rest the hands.', 'Ninety minutes. Time to give the hands a break.'],
    loud: ['Loud and bold! Softer is worth a try too.', 'Powerful sound. What about a notch quieter?'],
    soft: ['Very quiet and careful — beautiful.', 'A gentle sound. Bolder works too.'],
  },
};

let n = 0;
export function tamaLine(key, lang = 'ru') {
  const list = (TAMA_TEXTS[lang] || TAMA_TEXTS.ru)[key] || TAMA_TEXTS.ru[key] || [''];
  return list[n++ % list.length];
}
