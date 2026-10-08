// Модули Библии MyBible (файлы *.SQLite3): таблица verses (book_number, chapter, verse, text), books (номер,
// short_name, long_name), info (name, value: description, language…). Номера книг MyBible — по 10:
// 10 — Бытие … 460 — Малахия, 470 — Матфей … 730 — Откровение. Подключаются 66 канонических книг; второканонические
// и прочие таблицы (комментарии, словари) — пропускаются. В тексте убирается разметка: номера Стронга <S>,
// морфология <m>, сноски <f>, примечания <n>, заголовки <h>; слова Христа <J> и курсив остаются текстом.
// Нумерация псалмов — как в самом модуле (в русских — синодальная, в английских — по еврейскому тексту).
import { BOOKS } from './bible.js';
import { sqlite } from './songimport.js';

const NUMS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 190, 220, 230, 240, 250, 260, 290, 300, 310, 330, 340, 350,
  360, 370, 380, 390, 400, 410, 420, 430, 440, 450, 460, 470, 480, 490, 500, 510, 520, 530, 540, 550, 560, 570, 580, 590, 600, 610, 620,
  630, 640, 650, 660, 670, 680, 690, 700, 710, 720, 730];
const ORDER = ['GEN', 'EXO', 'LEV', 'NUM', 'DEU', 'JOS', 'JDG', 'RUT', '1SA', '2SA', '1KI', '2KI', '1CH', '2CH', 'EZR', 'NEH', 'EST', 'JOB', 'PSA', 'PRO',
  'ECC', 'SOL', 'ISA', 'JER', 'LAM', 'EZE', 'DAN', 'HOS', 'JOE', 'AMO', 'OBA', 'JON', 'MIC', 'NAH', 'HAB', 'ZEP', 'HAG', 'ZEC', 'MAL',
  'MAT', 'MAR', 'LUK', 'JOH', 'ACT', 'ROM', '1CO', '2CO', 'GAL', 'EPH', 'PHI', 'COL', '1TH', '2TH', '1TI', '2TI', 'TIT', 'PHM', 'HEB',
  'JAM', '1PE', '2PE', '1JO', '2JO', '3JO', 'JUD', 'REV'];
export const NUM_OF = Object.fromEntries(ORDER.map((c, i) => [c, NUMS[i]]));
export const CODE_OF = Object.fromEntries(ORDER.map((c, i) => [NUMS[i], c]));

// Текст стиха без разметки MyBible
export function cleanVerse(s) {
  return String(s || '')
    .replace(/<(S|m|f|n|h)>[\s\S]*?<\/\1>/gi, '')
    .replace(/<(br|pb)\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/\s+([,.;:!?])/g, '$1').replace(/\s+/g, ' ').trim();
}

const all = (db, sql, args = []) => { const st = db.prepare(sql); st.bind(args); const out = []; while (st.step()) out.push(st.getAsObject()); st.free(); return out; };

// Модуль из файла: { meta: { title, lang, books: { код: глав }, names/shorts: { код: название } }, book(код) → главы, close() }
export async function openMyBible(u8, fileName = '') {
  const db = await sqlite(u8);
  const tables = all(db, "SELECT name FROM sqlite_master WHERE type='table'").map((r) => String(r.name).toLowerCase());
  if (!tables.includes('verses')) { db.close(); throw Object.assign(new Error('not a Bible module'), { reason: 'notbible' }); }
  const info = tables.includes('info') ? Object.fromEntries(all(db, 'SELECT name, value FROM info').map((r) => [String(r.name).toLowerCase(), r.value])) : {};
  const books = {}, names = {}, shorts = {};
  all(db, 'SELECT book_number AS b, MAX(chapter) AS n FROM verses GROUP BY book_number').forEach((r) => { const c = CODE_OF[r.b]; if (c) books[c] = r.n; });
  if (!Object.keys(books).length) { db.close(); throw Object.assign(new Error('no canonical books'), { reason: 'nobooks' }); }
  const btab = tables.includes('books') ? 'books' : tables.includes('books_all') ? 'books_all' : null;
  if (btab) all(db, 'SELECT * FROM ' + btab).forEach((r) => { const c = CODE_OF[r.book_number]; if (!c) return; if (r.long_name || r.short_name) names[c] = String(r.long_name || r.short_name).trim(); if (r.short_name) shorts[c] = String(r.short_name).trim(); });
  const title = String(info.description || info.name || fileName.replace(/\.[^.]+$/, '') || 'MyBible').trim();
  const cache = new Map();
  return {
    meta: { title, lang: info.language || '', books, names, shorts },
    book(code) {
      if (!cache.has(code)) {
        const ch = [];
        all(db, 'SELECT chapter AS c, verse AS v, text AS t FROM verses WHERE book_number = ? ORDER BY chapter, verse', [NUM_OF[code]])
          .forEach((r) => { (ch[r.c - 1] ??= []).push(cleanVerse(r.t)); });
        cache.set(code, Array.from({ length: ch.length }, (_, i) => ch[i] || []));
      }
      return Promise.resolve(cache.get(code));
    },
    close() { cache.clear(); db.close(); },
  };
}

// Сколько из 66 книг есть в модуле — для подписи в списке переводов
export const bookCount = (meta) => BOOKS.filter((b) => meta.books[b.code]).length;
