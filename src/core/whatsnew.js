// «Что нового» — список заметных изменений для людей (не для разработчиков): после обновления приложение один раз
// показывает новые записи (screens/whatsnew.js); те же строки идут в описание релиза на GitHub
// (build/whatsnew-notes.mjs). Новая заметная функция — запись сюда: n — следующий номер, d — дата, строки на трёх
// языках, коротко, без технических слов. Только данные: файл читает и Node при сборке.
export const NEWS = [
  { n: 1, d: '2026-10-23', ru: ['Учебник в «Теории»: 16 глав по гармонии с живыми схемами — касание термина ведёт к объяснению', 'Ансамбль: каждый записывает свою партию на телефон, компьютер собирает общую запись'],
    en: ['Textbook in Theory: 16 harmony chapters with live diagrams — tap a term for its explanation', 'Ensemble: everyone records their part on a phone, the computer assembles the take'],
    uz: ['«Nazariya»da darslik: jonli sxemali 16 bob — atamaga bosilsa, izohi ochiladi', 'Ansambl: har kim oʻz partiyasini telefonga yozadi, kompyuter umumiy yozuvni yigʻadi'] },
  { n: 2, d: '2026-10-24', ru: ['Телефон и компьютер — один раздел в профиле: подключение, ансамбль, раздача песен, приём файлов', 'Windows: связь с телефоном и раздача песен включаются; на слабых компьютерах звук легче', 'Обновления: новая версия скачивается сама, после обновления — окно «Что нового»'],
    en: ['Phone and computer — one section in the profile: connection, ensemble, song sharing, file transfer', 'Windows: phone link and song sharing now turn on; lighter sound on weaker computers', 'Updates: a new version downloads by itself; after updating — a “What’s new” window'],
    uz: ['Telefon va kompyuter — profilda bitta boʻlim: ulanish, ansambl, qoʻshiqlarni tarqatish, fayllarni qabul qilish', 'Windows: telefon bilan aloqa va qoʻshiqlarni tarqatish yoqiladi; kuchsiz kompyuterlarda ovoz yengilroq', 'Yangilanishlar: yangi versiya oʻzi yuklanadi; yangilangandan keyin — «Nima yangi» oynasi'] },
];

export const lastNews = () => NEWS.reduce((m, e) => Math.max(m, e.n), 0);
// Что показать: записи новее увиденной; первый запуск (seen === null) — ничего, только запомнить
export const unseen = (seen) => (seen == null ? [] : NEWS.filter((e) => e.n > seen).sort((a, b) => b.n - a.n));
