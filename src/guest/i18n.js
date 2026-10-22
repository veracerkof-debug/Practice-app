// Строки гостевой страницы (раздача в своей сети): язык — по языку браузера гостя. Отдельно от src/i18n — гостевая
// страница не тянет ядро. Тексты нейтральные, без обращения на «ты» и «вы» (CLAUDE.md, правило 6).
const S = {
  ru: {
    title: 'Melete', from: 'Песни: {name}', name: 'Имя', namePh: 'Как подписать в списке', join: 'Войти', wait: 'Ждём подтверждения на компьютере…',
    denied: 'Вход не подтверждён', needQr: 'Вход — только по QR-коду с экрана компьютера', lost: 'Нет связи с компьютером — повтор…', off: 'Раздача выключена',
    songs: 'Песни', set: 'Сет-лист', search: 'Поиск', empty: 'Песен нет', back: 'Назад', follow: 'За лидером', lead: 'Вы ведёте', leader: 'Ведёт: {name}', host: 'компьютер',
    tr: 'Тональность', inst: 'Строй', capo: 'Капо', size: 'Шрифт', listen: 'Слушать', noText: 'Текста нет', key: 'Тон.', bpm: '♩ {n}',
    'inst.C': 'C', 'inst.Bb': 'B♭', 'inst.Eb': 'E♭', 'inst.F': 'F',
  },
  en: {
    title: 'Melete', from: 'Songs: {name}', name: 'Name', namePh: 'Shown in the list', join: 'Join', wait: 'Waiting for approval on the computer…',
    denied: 'Not approved', needQr: 'Joining only via the QR code on the computer screen', lost: 'No connection to the computer — retrying…', off: 'Sharing is off',
    songs: 'Songs', set: 'Set list', search: 'Search', empty: 'No songs', back: 'Back', follow: 'Follow leader', lead: 'Leading', leader: 'Leading: {name}', host: 'computer',
    tr: 'Key', inst: 'Pitch', capo: 'Capo', size: 'Text', listen: 'Listen', noText: 'No text', key: 'Key', bpm: '♩ {n}',
    'inst.C': 'C', 'inst.Bb': 'B♭', 'inst.Eb': 'E♭', 'inst.F': 'F',
  },
  uz: {
    title: 'Melete', from: 'Qoʻshiqlar: {name}', name: 'Ism', namePh: 'Roʻyxatda koʻrinadi', join: 'Kirish', wait: 'Kompyuterda tasdiq kutilmoqda…',
    denied: 'Kirish tasdiqlanmadi', needQr: 'Faqat kompyuter ekranidagi QR-kod orqali', lost: 'Kompyuter bilan aloqa yoʻq — qayta urinish…', off: 'Tarqatish oʻchiq',
    songs: 'Qoʻshiqlar', set: 'Set-list', search: 'Qidiruv', empty: 'Qoʻshiq yoʻq', back: 'Orqaga', follow: 'Yetakchi ortidan', lead: 'Siz boshqaryapsiz', leader: 'Boshqaradi: {name}', host: 'kompyuter',
    tr: 'Tonallik', inst: 'Sozlash', capo: 'Kapo', size: 'Shrift', listen: 'Tinglash', noText: 'Matn yoʻq', key: 'Ton.', bpm: '♩ {n}',
    'inst.C': 'C', 'inst.Bb': 'B♭', 'inst.Eb': 'E♭', 'inst.F': 'F',
  },
};
const lang = (() => { const l = (navigator.language || 'ru').slice(0, 2).toLowerCase(); return S[l] ? l : 'ru'; })();
export const t = (k, p = {}) => String((S[lang] && S[lang][k]) ?? S.ru[k] ?? k).replace(/\{(\w+)\}/g, (m, x) => (p[x] != null ? p[x] : m));
export const LANG = lang;
export const STRINGS = S;
