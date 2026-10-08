// MyBible для изучения (только вид «Минимал»): номера Стронга, словари и лексиконы, комментарии и сноски,
// перекрёстные ссылки, подзаголовки — по спецификации формата MyBible (ред. 2025-06-15).
// Здесь — без DOM: отрисовка тегов стиха в HTML, очистка HTML статей из модулей (модули чужие — только безопасное),
// ссылки B:/S:/C:@, открытие модулей всех типов. Показ и жесты — модуль «Библия».
import { sqlite } from './songimport.js';
import { CODE_OF, NUM_OF, cleanVerse } from './mybible.js';
import { bookOf } from './bible.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const unesc = (s) => String(s).replace(/&nbsp;/g, '\u00a0').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const all = (db, sql, args = []) => { const st = db.prepare(sql); st.bind(args); const out = []; while (st.step()) out.push(st.getAsObject()); st.free(); return out; };

// Буква номера Стронга: Ветхий Завет — H (еврейский), Новый — G (греческий), если модуль не задал свою
export const strongPrefix = (code, fixed = '') => fixed || (bookOf(code) && bookOf(code).nt ? 'G' : 'H');

/* ---------- стих: теги MyBible → HTML ---------- */
// <S>n</S> — номер Стронга после слова; <m> — морфология; <f>[1]</f> — метка сноски; <n> — примечание; <h> — подзаголовок
// внутри стиха; <J> — слова Христа (и Бога в Ветхом Завете); <i> — добавленные слова; <e> — выделение; <t> — цитата
// с отступом; <br/>, <pb/> — переносы. Всё прочее — текст (экранируется).
export function renderVerse(raw, { prefix = 'H', strong = true } = {}) {
  let out = '';
  const re = /<(S|m|f|n|h)>([\s\S]*?)<\/\1>|<(\/?)(J|i|e|t)>|<(br|pb)\s*\/?>|<[^>]*>|([^<]+)/gi;
  let m;
  while ((m = re.exec(String(raw || '')))) {
    if (m[1]) {
      const tag = m[1].toUpperCase() === 'S' ? 'S' : m[1].toLowerCase(), body = unesc(m[2]).trim();
      if (tag === 'S') { if (strong && /^\d{1,5}$/.test(body)) out += '<sup class="bs" data-s="' + prefix + body + '">' + body + '</sup>'; }
      else if (tag === 'm') { if (strong) out += '<sup class="bmo">' + esc(body) + '</sup>'; }
      else if (tag === 'f') out += '<sup class="bfn" data-fn="' + esc(body) + '">' + esc(body) + '</sup>';
      else if (tag === 'n') out += ' <span class="bnote">' + esc(body) + '</span>';
      else if (tag === 'h') out += '<span class="bhd">' + esc(body) + '</span>';
    } else if (m[4]) {
      const t = m[4].toLowerCase(), cls = { j: 'bj', i: 'bins', e: 'bem', t: 'bq' }[t];
      out += m[3] ? '</span>' : '<span class="' + cls + '">';
    } else if (m[5]) out += m[5].toLowerCase() === 'pb' ? '<span class="bpb"></span>' : '<br>';
    else if (m[6] != null) out += esc(unesc(m[6]));
  }
  // незакрытые <J>/<i>/<e>/<t> закрываются
  const open = (out.match(/<span class="(bj|bins|bem|bq)">/g) || []).length - (out.match(/<\/span>/g) || []).length + (out.match(/<span class="(bnote|bhd|bpb)">/g) || []).length;
  return out + '</span>'.repeat(Math.max(0, open));
}

/* ---------- HTML статей словарей и комментариев: только безопасное ---------- */
const TAGS = new Set(['b', 'strong', 'i', 'em', 'u', 'p', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'sup', 'sub', 'span', 'div', 'font', 'a', 'blockquote', 'hr', 'small', 'big', 'table', 'tr', 'td', 'th', 'tbody']);
const COLORS = { '0': 0, '%COLOR_TEXT%': 0, '1': 1, '%COLOR_RED%': 1, '2': 2, '%COLOR_GREEN%': 2, '3': 3, '%COLOR_BLUE%': 3, '4': 4, '%COLOR_PURPLE%': 4, '5': 5, '%COLOR_GREY%': 5 };
export function sanitizeHTML(html) {
  const src = String(html || '').replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style|iframe|object|embed|svg|math)[\s\S]*?<\/\1>/gi, '');
  return src.replace(/<\/?([a-zA-Z0-9]+)([^>]*)>|([^<]+)|</g, (m, name, attrs, text) => {
    if (text != null) return text.replace(/>/g, '&gt;');
    if (!name) return '&lt;';
    const n = name.toLowerCase(), close = m[1] === '/';
    if (!TAGS.has(n)) return '';
    if (close) return n === 'br' || n === 'hr' ? '' : '</' + (n === 'font' ? 'span' : n) + '>';
    if (n === 'a') {
      const href = (/href\s*=\s*['"‘’]?\s*([^'"‘’>\s][^'"‘’>]*)/i.exec(attrs) || [])[1] || '';
      return /^(B:|S:|C:@)/.test(href.trim()) ? '<a class="blink" data-href="' + esc(href.trim()) + '">' : '<a class="bext">';
    }
    if (n === 'font') {
      const c = (/color\s*=\s*['"‘’\s]*([^'"‘’>]+?)['"‘’\s]*(?:\s|$|>)/i.exec(attrs) || [])[1];
      return '<span class="fc' + (COLORS[String(c || '').trim()] ?? 0) + '">';
    }
    return '<' + n + (n === 'br' || n === 'hr' ? '>' : '>');
  });
}

// Ссылка B: на место Писания: «B:10 3:8», «B:10 3:8-12», «B:10 3:8-4:2», «B:10 3:8,10», «B:10 3», «B:10 3-5»
export function parseBRef(href) {
  const m = /^B:(\d+)\s+(\d+)(?::(\d+))?(?:([-,])(\d+)(?::(\d+))?)?/.exec(String(href || '').trim());
  if (!m) return null;
  const code = CODE_OF[+m[1]];
  if (!code) return null;
  return { code, ch: +m[2], v: m[3] ? +m[3] : null };
}
export const parseCRef = (href) => { const m = /^C:@(\d+)\s+(\d+):(\d+)/.exec(String(href || '')); return m && CODE_OF[+m[1]] ? { code: CODE_OF[+m[1]], ch: +m[2], v: +m[3] } : null; };

/* ---------- модули ---------- */
const infoOf = (db, tables) => (tables.includes('info') ? Object.fromEntries(all(db, 'SELECT name, value FROM info').map((r) => [String(r.name).toLowerCase(), r.value])) : {});
const truthy = (v) => String(v || '').toLowerCase() === 'true';

// Тип по таблицам (как MyBible по суффиксу имени файла): bible | dictionary | commentaries | crossreferences | subheadings
export function typeOf(tables) {
  if (tables.includes('verses')) return 'bible';
  if (tables.includes('dictionary')) return 'dictionary';
  if (tables.includes('commentaries')) return 'commentaries';
  if (tables.includes('cross_references')) return 'crossreferences';
  if (tables.includes('subheadings')) return 'subheadings';
  return null;
}
// Сокращение модуля — имя файла без «.SQLite3» и суффикса типа (по нему сноски находят свой перевод)
export const abbrOf = (fileName) => String(fileName || '').split(/[\\/]/).pop().replace(/\.sqlite3?$/i, '').replace(/\.(dictionary|commentaries|crossreferences|subheadings|plan|devotions|bundle)$/i, '');

// Открыть любой модуль: { type, title, info, … }
export async function openModule(u8, fileName = '') {
  const db = await sqlite(u8);
  const tables = all(db, "SELECT name FROM sqlite_master WHERE type IN ('table','view')").map((r) => String(r.name).toLowerCase());
  const type = typeOf(tables), info = infoOf(db, tables);
  if (!type) { db.close(); throw Object.assign(new Error('not a MyBible module'), { reason: 'unknown' }); }
  const title = String(info.description || info.name || abbrOf(fileName) || 'MyBible').trim();
  const base = { type, title, info, abbr: abbrOf(fileName), close: () => db.close() };

  if (type === 'dictionary') {
    const t = String(info.type || '').toLowerCase(), strong = t ? t === 'strong lexicon' : info.is_strong == null ? true : truthy(info.is_strong);
    return { ...base, strong,
      // статья по теме: точно, затем без учёта регистра
      get(topic) {
        const q = String(topic || '').trim();
        if (!q) return null;
        return all(db, 'SELECT * FROM dictionary WHERE topic = ? LIMIT 1', [q])[0] || all(db, 'SELECT * FROM dictionary WHERE topic = ? COLLATE NOCASE LIMIT 1', [q])[0] || null;
      },
      // слово: точное совпадение темы, затем начало слова (для лексиконов без Стронга и обычных словарей)
      find(word) {
        const w = String(word || '').trim();
        if (w.length < 2) return [];
        const exact = all(db, 'SELECT topic, definition FROM dictionary WHERE topic = ? COLLATE NOCASE LIMIT 5', [w]);
        return exact.length ? exact : all(db, 'SELECT topic, definition FROM dictionary WHERE topic LIKE ? LIMIT 5', [w.slice(0, Math.max(3, w.length - 2)) + '%']);
      } };
  }
  if (type === 'commentaries') {
    const fn = truthy(info.is_footnotes), cols = all(db, 'PRAGMA table_info(commentaries)').map((r) => r.name);
    const sel = 'SELECT chapter_number_from AS cf, verse_number_from AS vf, chapter_number_to AS ct, verse_number_to AS vt, ' +
      (cols.includes('is_preceding') ? 'is_preceding' : '0') + ' AS pre, ' + (cols.includes('marker') ? 'marker' : "''") + ' AS mk, text FROM commentaries';
    return { ...base, footnotes: fn,
      // статьи главы: к какому стиху привязана метка (начало или конец отрывка), сам отрывок
      chapter(code, ch) {
        return all(db, sel + ' WHERE book_number = ? AND (chapter_number_from = ? OR (chapter_number_from < ? AND chapter_number_to >= ?)) ORDER BY chapter_number_from, verse_number_from', [NUM_OF[code], ch, ch, ch])
          .map((r) => {
            const ct = r.ct || r.cf, vt = r.vt || (r.ct ? 999 : r.vf), from = r.cf === ch ? r.vf : 1, to = ct === ch ? vt : 999;
            return { at: r.pre ? from : to, from: r.cf + ':' + r.vf, to: ct + ':' + (r.vt || ''), marker: r.mk || '', text: r.text || '' };
          });
      },
      // статьи к стиху (сравнение комментариев)
      verse(code, ch, v) {
        return all(db, sel + ' WHERE book_number = ? AND chapter_number_from <= ? ', [NUM_OF[code], ch])
          .filter((r) => { const ct = r.ct || r.cf, vt = r.vt || (r.ct ? 999 : r.vf); const a = r.cf * 1000 + r.vf, b = ct * 1000 + vt, x = ch * 1000 + v; return r.cf > 0 ? x >= a && x <= b : false; })
          .map((r) => ({ marker: r.mk || '', text: r.text || '', from: r.cf + ':' + r.vf }));
      },
      // вступление к книге (chapter_number_from = 0)
      book(code) { return all(db, sel + ' WHERE book_number = ? AND chapter_number_from = 0', [NUM_OF[code]]).map((r) => ({ text: r.text })); } };
  }
  if (type === 'crossreferences') {
    const rev = truthy(info.requires_reverse_processing);
    return { ...base,
      chapter(code, ch) {
        const n = NUM_OF[code], map = new Map();
        const add = (v, r) => { if (!CODE_OF[r.b]) return; const k = r.b + ' ' + r.c + ':' + r.v1 + '-' + (r.v2 || 0); const list = map.get(v) || map.set(v, []).get(v); if (!list.some((x) => x.k === k)) list.push({ k, code: CODE_OF[r.b], ch: r.c, v1: r.v1, v2: r.v2 || 0, votes: r.votes || 0 }); };
        all(db, 'SELECT verse AS v, book_to AS b, chapter_to AS c, verse_to_start AS v1, verse_to_end AS v2, votes FROM cross_references WHERE book = ? AND chapter = ?', [n, ch]).forEach((r) => add(r.v, r));
        if (rev) all(db, 'SELECT verse_to_start AS v, book AS b, chapter AS c, verse AS v1, verse_end AS v2, votes FROM cross_references WHERE book_to = ? AND chapter_to = ?', [n, ch]).forEach((r) => add(r.v, r));
        map.forEach((l) => l.sort((a, b) => b.votes - a.votes));
        return map;
      } };
  }
  if (type === 'subheadings') {
    return { ...base,
      chapter(code, ch) {
        const map = new Map();
        all(db, 'SELECT verse AS v, subheading AS s FROM subheadings WHERE book_number = ? AND chapter = ? ORDER BY verse, order_if_several', [NUM_OF[code], ch])
          .forEach((r) => (map.get(r.v) || map.set(r.v, []).get(r.v)).push(String(r.s || '')));
        return map;
      } };
  }
  // перевод: сырые стихи (с тегами), подзаголовки из таблицы stories, названия книг модуля
  const books = {}, names = {}, shorts = {};
  all(db, 'SELECT book_number AS b, MAX(chapter) AS n FROM verses GROUP BY book_number').forEach((r) => { if (CODE_OF[r.b]) books[CODE_OF[r.b]] = r.n; });
  const btab = tables.includes('books') ? 'books' : tables.includes('books_all') ? 'books_all' : null;
  if (btab) all(db, 'SELECT * FROM ' + btab).forEach((r) => { const c = CODE_OF[r.book_number]; if (!c) return; if (r.long_name || r.short_name) names[c] = String(r.long_name || r.short_name).trim(); if (r.short_name) shorts[c] = String(r.short_name).trim(); });
  return { ...base, books, names, shorts, strong: truthy(info.strong_numbers), prefix: String(info.strong_numbers_prefix || '').toUpperCase(),
    raw(code, ch) { return all(db, 'SELECT verse AS v, text AS t FROM verses WHERE book_number = ? AND chapter = ? ORDER BY verse', [NUM_OF[code], ch]); },
    stories(code, ch) {
      const map = new Map();
      if (tables.includes('stories')) all(db, 'SELECT verse AS v, title AS s FROM stories WHERE book_number = ? AND chapter = ? ORDER BY verse, order_if_several', [NUM_OF[code], ch]).forEach((r) => (map.get(r.v) || map.set(r.v, []).get(r.v)).push(String(r.s || '')));
      return map;
    },
    plain: (t) => cleanVerse(t) };
}

// Подзаголовок с <x>480 3:5</x> → текст и ссылки «Мк 3:5»
export function subheadingHTML(s) {
  return String(s || '').split(/(<x>[^<]*<\/x>)/).map((part) => {
    const m = /^<x>(\d+)\s+(\d+)(?::(\d+))?[^<]*<\/x>$/.exec(part);
    if (!m) return esc(part.replace(/<[^>]+>/g, ''));
    const code = CODE_OF[+m[1]];
    return code ? '<a class="blink" data-href="B:' + m[1] + ' ' + m[2] + (m[3] ? ':' + m[3] : '') + '">' + esc(bookOf(code).abbr + ' ' + m[2] + (m[3] ? ':' + m[3] : '')) + '</a>' : '';
  }).join('');
}
