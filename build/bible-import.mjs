// Импорт текста Библии в приложение (запускается вручную, результат — в репозитории):
//   node build/bible-import.mjs <путь к russyn_vpl.txt>
// Источник — eBible.org, «russyn_vpl.zip»: Синодальный перевод (1876), общественное достояние.
// Пишет public/bible/synodal/<КОД>.json — массив глав, глава — массив стихов (текст без нумерации).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { BOOKS } from '../src/core/bible.js';

const src = process.argv[2];
if (!src) { console.error('нужен путь к russyn_vpl.txt'); process.exit(1); }
const by = {};
readFileSync(src, 'utf8').split('\n').forEach((line) => {
  const m = /^(\w{3}) (\d+):(\d+) (.*)$/.exec(line.trim());
  if (!m) return;
  const [, b, c, v, text] = m;
  ((by[b] ??= [])[+c - 1] ??= [])[+v - 1] = text.trim().replace(/\s+/g, ' ');
});
mkdirSync('public/bible/synodal', { recursive: true });
const counts = {};
BOOKS.forEach((bk) => {
  const ch = by[bk.code];
  if (!ch) throw new Error('нет книги ' + bk.code);
  const clean = ch.map((vs) => (vs || []).map((x) => x || ''));
  writeFileSync('public/bible/synodal/' + bk.code + '.json', JSON.stringify(clean));
  counts[bk.code] = clean.length;
});
console.log(JSON.stringify(counts));
