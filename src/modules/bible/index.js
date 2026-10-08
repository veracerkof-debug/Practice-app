// Библия (церковный режим): Синодальный перевод, 66 книг. Текст главы занимает окно целиком; вверху — одна узкая
// полоса: соседние главы, книга и глава (выбор — шторкой), размер шрифта. В конце главы — «Прочитано»
// (отметка идёт в план чтения, ядро: ctx.bible) и переход к следующей главе.
// Текст и список книг — src/core/bible.js, планы и отметки — src/core/reading.js (в ядре: их видят главная и календарь).
import './bible.css';
import ru from './i18n/ru.json';
import uz from './i18n/uz.json';
import en from './i18n/en.json';
import el from './i18n/el.json';
import { BOOKS, ALL, bookOf, loadBook, chKey, parseKey, refText } from '../../core/bible.js';

const ICON = '<svg viewBox="0 0 24 24"><path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z"/><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19M12 6.5v6M9.5 8.8h5"/></svg>';
const I = {
  prev: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>',
  minus: '<svg viewBox="0 0 24 24"><path d="M6 12h12"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M6 12h12M12 6v12"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
};
const FS_MIN = 14, FS_MAX = 30;

let host = null, ctx = null, size = 'full', cur = { code: 'GEN', ch: 1 }, verses = null, failed = false, onClick = null, scrollT = 0;

const fs = () => ctx.store.get('fs', 18);
const isRead = () => ctx.bible.isRead(chKey(cur.code, cur.ch));
const step = (d) => { const i = ALL.indexOf(chKey(cur.code, cur.ch)) + d; return i >= 0 && i < ALL.length ? parseKey(ALL[i]) : null; };

function barHTML() {
  const { t, ui } = ctx, b = bookOf(cur.code), small = size === 'strip' || size === 'quarter';
  return '<div class="bbar">' + ui.icb('data-x="bprev"', I.prev, t('prev'), 'sm') +
    '<button class="bpick" data-x="bpick" aria-label="' + ui.esc(t('pick')) + '">' + ui.esc((small ? b.abbr : b.name) + ' ' + cur.ch) + '</button>' +
    ui.icb('data-x="bnext"', I.next, t('next'), 'sm') +
    (small ? '' : '<span class="bgrow"></span>' + ui.icb('data-x="bfs" data-d="-2"', I.minus, t('smaller'), 'sm') + ui.icb('data-x="bfs" data-d="2"', I.plus, t('bigger'), 'sm')) +
    '<button class="ic sm bmark' + (isRead() ? ' on' : '') + '" data-x="bmark" aria-pressed="' + isRead() + '" aria-label="' + ui.esc(t(isRead() ? 'unmark' : 'markRead')) + '">' + I.check + '</button></div>';
}

function textHTML() {
  const { t, ui } = ctx;
  if (failed) return '<p class="bfail l2">' + t('loadFail') + '</p>';
  if (!verses) return '<div class="bload">' + ui.loader('book', bookOf(cur.code).name + ' ' + cur.ch) + '</div>';
  const n = step(1);
  return '<h2 class="bhead">' + ui.esc(bookOf(cur.code).name) + ' <span>' + cur.ch + '</span></h2>' +
    '<p class="bverses">' + verses.map((v, i) => '<span class="bv" data-v="' + (i + 1) + '"><sup>' + (i + 1) + '</sup>' + ui.esc(v) + ' </span>').join('') + '</p>' +
    '<div class="bend">' + (isRead() ? '<button class="btn bdone" data-x="bmark">' + I.check + '<span>' + t('read') + '</span></button>' : '<button class="btn fill" data-x="bmark">' + t('read') + '</button>') +
    (n ? '<button class="btn" data-x="bnext">' + ui.esc(t('nextCh', { ref: refText([chKey(n.code, n.ch)]) })) + '</button>' : '') + '</div>';
}

function render() {
  if (!host) return;
  const y = host.querySelector('.btext') ? host.querySelector('.btext').scrollTop : 0;
  host.innerHTML = '<div class="bwrap ' + size + '" style="--bfs:' + fs() + 'px">' + barHTML() + (size === 'strip' ? '' : '<div class="btext">' + textHTML() + '</div>') + '</div>';
  const tx = host.querySelector('.btext');
  if (tx) {
    tx.scrollTop = y;
    tx.addEventListener('scroll', () => { clearTimeout(scrollT); scrollT = setTimeout(() => ctx && ctx.bible.setPos({ ...cur, y: tx.scrollTop }), 400); }, { passive: true });
  }
}

// Открыть главу; y — где был текст (при возвращении к прочитанному месту)
function open(code, ch, y = 0) {
  cur = { code, ch };
  verses = null; failed = false;
  ctx.bible.setPos({ code, ch, y });
  render();
  loadBook(code).then((book) => {
    if (!host || cur.code !== code || cur.ch !== ch) return;
    verses = book[ch - 1] || [];
    render();
    const tx = host.querySelector('.btext');
    if (tx) tx.scrollTop = y;
  }, (e) => { ctx && ctx.logErr(e); failed = true; render(); });
}

// Шторка выбора: книги (с долей прочитанного) → главы (прочитанные отмечены)
function pickSheet() {
  const { t, ui } = ctx;
  let book = null;
  const books = (nt) => '<div class="hdr">' + t(nt ? 'nt' : 'ot') + '</div><div class="bgrid">' + BOOKS.filter((b) => b.nt === nt).map((b) => {
    const r = ctx.bible.readIn(b.code) / b.chapters;
    return '<button class="bbook' + (b.code === cur.code ? ' cur' : '') + '" data-bk="' + b.code + '" style="--r:' + (r * 100).toFixed(1) + '%" aria-label="' + ui.esc(b.name) + '">' + ui.esc(b.abbr) + '</button>';
  }).join('') + '</div>';
  const chapters = (b) => '<div class="hdr">' + ui.esc(b.name) + '</div><div class="bgrid ch">' + Array.from({ length: b.chapters }, (_, k) => k + 1).map((c) =>
    '<button class="bch' + (ctx.bible.isRead(chKey(b.code, c)) ? ' read' : '') + (b.code === cur.code && c === cur.ch ? ' cur' : '') + '" data-ch="' + c + '" aria-label="' + ui.esc(t('chOf', { n: c })) + '">' + c + '</button>').join('') + '</div>';
  const api = ui.sheet(() => ui.snav(book ? bookOf(book).name : t('pick')) + (book ? chapters(bookOf(book)) : books(false) + books(true)), (el) => {
    el.addEventListener('click', (e) => {
      const bk = e.target.closest('[data-bk]'), c = e.target.closest('[data-ch]');
      if (bk) { const b = bookOf(bk.dataset.bk); if (b.chapters === 1) { api.close(); open(b.code, 1); } else { book = b.code; api.update(); } }
      else if (c) { api.close(); open(book, +c.dataset.ch); }
    });
  });
}

function bind() {
  onClick = (e) => {
    const x = e.target.closest('[data-x]');
    if (!x) return;
    const a = x.dataset.x;
    if (a === 'bprev' || a === 'bnext') { const n = step(a === 'bnext' ? 1 : -1); if (n) open(n.code, n.ch); }
    else if (a === 'bpick') pickSheet();
    else if (a === 'bfs') { ctx.store.set('fs', Math.max(FS_MIN, Math.min(FS_MAX, fs() + +x.dataset.d))); host.querySelector('.bwrap').style.setProperty('--bfs', fs() + 'px'); }
    else if (a === 'bmark') { const k = chKey(cur.code, cur.ch), on = !ctx.bible.isRead(k); ctx.bible.mark(k, on); ctx.log('прочитано ' + k + ': ' + on); render(); }
  };
  host.addEventListener('click', onClick);
}

export default {
  id: 'bible',
  order: 5,
  church: true, // только в церковном режиме
  name: { ru: ru.name, uz: uz.name, en: en.name, el: el.name },
  i18n: { ru, uz, en, el },
  icon: ICON,
  color: '#A2845E',
  sizes: ['full', 'half', 'quarter', 'strip'],
  status(c) { const p = c.bible.pos(); return p ? refText([chKey(p.code, p.ch)]) : c.t('name'); },
  mount(el, c, sz = 'full') {
    host = el; ctx = c; size = sz;
    bind();
    const p = ctx.bible.pos() || { code: 'GEN', ch: 1, y: 0 };
    open(bookOf(p.code) ? p.code : 'GEN', p.ch || 1, p.y || 0);
  },
  resize(sz) { size = sz; render(); },
  unmount() {
    clearTimeout(scrollT);
    if (host && onClick) host.removeEventListener('click', onClick);
    host = null; ctx = null; verses = null;
  },
};
