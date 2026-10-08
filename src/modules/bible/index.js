// Библия (церковный режим): Синодальный перевод (66 книг) и модули MyBible (*.SQLite3). Текст главы занимает окно целиком; вверху — одна узкая
// полоса: соседние главы, книга и глава (выбор — шторкой), размер шрифта. В конце главы — «Прочитано»
// (отметка идёт в план чтения, ядро: ctx.bible) и переход к следующей главе.
// Текст и список книг — src/core/bible.js, планы и отметки — src/core/reading.js (в ядре: их видят главная и календарь).
import './bible.css';
import ru from './i18n/ru.json';
import uz from './i18n/uz.json';
import en from './i18n/en.json';
import el from './i18n/el.json';
import { BOOKS, ALL, bookOf, loadBook, chKey, parseKey, refText } from '../../core/bible.js';

// Переводы: встроенный Синодальный и модули MyBible (*.SQLite3), сохранённые на устройстве (ctx.files, вид 'bible')
const SYN = { id: 'synodal', short: 'СП', has: () => true, chapters: (c) => bookOf(c).chapters, book: loadBook, name: (c) => bookOf(c).name, abbr: (c) => bookOf(c).abbr };
const opened = new Map(); // id → модуль MyBible (держится открытым, пока выбран)
async function providerOf(id) {
  if (id === 'synodal' || !ctx.files.get(id)) return SYN;
  if (!opened.has(id)) {
    const rec = ctx.files.get(id), { openMyBible } = await import('../../core/mybible.js');
    const m = await openMyBible(new Uint8Array(await rec.blob.arrayBuffer()), rec.name);
    opened.forEach((x, k) => { if (k !== id) { x.close(); opened.delete(k); } }); // в памяти — один модуль
    opened.set(id, { id, short: shortOf(rec), has: (c) => !!m.meta.books[c], chapters: (c) => m.meta.books[c] || 0, book: (c) => m.book(c), name: (c) => m.meta.names[c] || bookOf(c).name,
      abbr: (c) => m.meta.shorts[c] || bookOf(c).abbr, close: () => m.close() });
  }
  return opened.get(id);
}
const shortOf = (rec) => String(rec.name || '').replace(/\.[^.]+$/, '').slice(0, 10);

const ICON = '<svg viewBox="0 0 24 24"><path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z"/><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19M12 6.5v6M9.5 8.8h5"/></svg>';
const I = {
  prev: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>',
  minus: '<svg viewBox="0 0 24 24"><path d="M6 12h12"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M6 12h12M12 6v12"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  del: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
};
const FS_MIN = 14, FS_MAX = 30;

let host = null, ctx = null, size = 'full', cur = { code: 'GEN', ch: 1 }, verses = null, failed = false, onClick = null, scrollT = 0, P = SYN;

const fs = () => ctx.store.get('fs', 18);
const isRead = () => ctx.bible.isRead(chKey(cur.code, cur.ch));
// соседняя глава; книги, которых нет в выбранном переводе, пропускаются
const step = (d) => { for (let i = ALL.indexOf(chKey(cur.code, cur.ch)) + d; i >= 0 && i < ALL.length; i += d) { const k = parseKey(ALL[i]); if (P.has(k.code) && k.ch <= P.chapters(k.code)) return k; } return null; };

function barHTML() {
  const { t, ui } = ctx, small = size === 'strip' || size === 'quarter';
  return '<div class="bbar">' + ui.icb('data-x="bprev"', I.prev, t('prev'), 'sm') +
    '<button class="bpick" data-x="bpick" aria-label="' + ui.esc(t('pick')) + '">' + ui.esc((small ? P.abbr(cur.code) : P.name(cur.code)) + ' ' + cur.ch) + '</button>' +
    ui.icb('data-x="bnext"', I.next, t('next'), 'sm') +
    (small ? '' : '<button class="btr" data-x="btr" aria-label="' + ui.esc(t('tr')) + '">' + ui.esc(P.short) + '</button><span class="bgrow"></span>' + ui.icb('data-x="bfs" data-d="-2"', I.minus, t('smaller'), 'sm') + ui.icb('data-x="bfs" data-d="2"', I.plus, t('bigger'), 'sm')) +
    '<button class="ic sm bmark' + (isRead() ? ' on' : '') + '" data-x="bmark" aria-pressed="' + isRead() + '" aria-label="' + ui.esc(t(isRead() ? 'unmark' : 'markRead')) + '">' + I.check + '</button></div>';
}

function textHTML() {
  const { t, ui } = ctx;
  if (failed) return '<p class="bfail l2">' + t('loadFail') + '</p>';
  if (!verses) return '<div class="bload">' + ui.loader('book', P.name(cur.code) + ' ' + cur.ch) + '</div>';
  const n = step(1);
  return '<h2 class="bhead">' + ui.esc(P.name(cur.code)) + ' <span>' + cur.ch + '</span></h2>' +
    '<p class="bverses">' + verses.map((v, i) => '<span class="bv" data-v="' + (i + 1) + '"><sup>' + (i + 1) + '</sup>' + ui.esc(v) + ' </span>').join('') + '</p>' +
    '<div class="bend">' + (isRead() ? '<button class="btn bdone" data-x="bmark">' + I.check + '<span>' + t('read') + '</span></button>' : '<button class="btn fill" data-x="bmark">' + t('read') + '</button>') +
    (n ? '<button class="btn" data-x="bnext">' + ui.esc(t('nextCh', { ref: P.abbr(n.code) + ' ' + n.ch })) + '</button>' : '') + '</div>';
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
  if (!P.has(code)) { const f = BOOKS.find((b) => P.has(b.code)); if (!f) return; code = f.code; ch = 1; y = 0; } // нет книги в переводе — первая, что есть
  if (ch > P.chapters(code)) { ch = P.chapters(code); y = 0; }
  cur = { code, ch };
  verses = null; failed = false;
  ctx.bible.setPos({ code, ch, y });
  render();
  const p = P;
  p.book(code).then((book) => {
    if (!host || cur.code !== code || cur.ch !== ch || P !== p) return;
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
    const r = ctx.bible.readIn(b.code) / b.chapters, has = P.has(b.code);
    return '<button class="bbook' + (b.code === cur.code ? ' cur' : '') + '" data-bk="' + b.code + '" style="--r:' + (r * 100).toFixed(1) + '%" aria-label="' + ui.esc(P.name(b.code)) + '"' + (has ? '' : ' disabled') + '>' + ui.esc(P.abbr(b.code)) + '</button>';
  }).join('') + '</div>';
  const chapters = (b) => '<div class="hdr">' + ui.esc(P.name(b.code)) + '</div><div class="bgrid ch">' + Array.from({ length: P.chapters(b.code) }, (_, k) => k + 1).map((c) =>
    '<button class="bch' + (ctx.bible.isRead(chKey(b.code, c)) ? ' read' : '') + (b.code === cur.code && c === cur.ch ? ' cur' : '') + '" data-ch="' + c + '" aria-label="' + ui.esc(t('chOf', { n: c })) + '">' + c + '</button>').join('') + '</div>';
  const api = ui.sheet(() => ui.snav(book ? P.name(book) : t('pick')) + (book ? chapters(bookOf(book)) : books(false) + books(true)), (el) => {
    el.addEventListener('click', (e) => {
      const bk = e.target.closest('[data-bk]'), c = e.target.closest('[data-ch]');
      if (bk) { const b = bookOf(bk.dataset.bk); if (P.chapters(b.code) === 1) { api.close(); open(b.code, 1); } else { book = b.code; api.update(); } }
      else if (c) { api.close(); open(book, +c.dataset.ch); }
    });
  });
}

// Переводы: Синодальный и модули MyBible; добавить — файл .SQLite3, удалить — крестик
function trSheet() {
  const { t, ui } = ctx;
  const cur0 = () => ctx.store.get('tr', 'synodal');
  const row = (id, title, sub, del) => '<div class="cell"><button class="grow btrrow" data-tr="' + id + '"><span>' + (cur0() === id ? '✓ ' : '') + ui.esc(title) + '</span><span class="st l2" style="display:block;font-size:12.5px">' + ui.esc(sub) + '</span></button>' +
    (del ? ui.icb('data-trdel="' + id + '"', I.del, t('trDel'), 'sm') : '') + '</div>';
  const api = ui.sheet(() => ui.snav(t('tr')) + '<div class="group">' + row('synodal', t('trSyn'), t('trSynSub'), false) +
    ctx.files.list('bible').map((r) => row(r.id, r.name, t('trSub', { n: r.meta ? r.meta.count : '?', mb: (r.size / 1048576).toFixed(1) }) + (r.meta && r.meta.lang ? ' · ' + r.meta.lang : ''), true)).join('') + '</div>' +
    '<button class="btn" data-tradd style="width:100%;margin-top:14px">' + t('trAdd') + '</button><p class="ftr">' + t('trHint') + '</p>', (el) => {
    el.addEventListener('click', async (e) => {
      const r = e.target.closest('[data-tr]'), d = e.target.closest('[data-trdel]'), add = e.target.closest('[data-tradd]');
      if (r) { await switchTr(r.dataset.tr); api.close(); }
      else if (d) {
        if (!(await ui.confirm(t('trDelQ'), t('trDelText'), t('trDel')))) return;
        if (cur0() === d.dataset.trdel) await switchTr('synodal');
        const o = opened.get(d.dataset.trdel); if (o) { o.close(); opened.delete(d.dataset.trdel); }
        ctx.files.remove(d.dataset.trdel);
        api.update();
      } else if (add) addModule(() => api.update());
    });
  });
}

async function switchTr(id) {
  try { P = await providerOf(id); ctx.store.set('tr', P.id); ctx.log('перевод: ' + P.short); }
  catch (e) { ctx.logErr(e); ctx.ui.toast(ctx.t('trFail')); P = SYN; ctx.store.set('tr', 'synodal'); }
  open(cur.code, cur.ch);
}

// Добавить модуль MyBible: проверка (есть таблица verses и книги канона) → сохранение на устройстве → выбрать
function addModule(done) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.SQLite3,.sqlite3,.sqlite,.db';
  input.addEventListener('change', async () => {
    const f = input.files[0];
    if (!f) return;
    ctx.ui.toast(ctx.t('trReading'));
    try {
      const { openMyBible, bookCount } = await import('../../core/mybible.js');
      const m = await openMyBible(new Uint8Array(await f.arrayBuffer()), f.name);
      const meta = { lang: m.meta.lang, count: bookCount(m.meta) };
      m.close();
      const rec = { id: 'b' + Date.now().toString(36), kind: 'bible', name: m.meta.title, size: f.size, type: 'application/x-sqlite3', created: Date.now(), blob: f, meta, songs: [] };
      if (!(await ctx.files.add(rec))) ctx.ui.toast(ctx.t('trNotSaved'));
      else if (ctx.files.reread) await ctx.files.reread(rec);
      ctx.log('модуль MyBible: ' + m.meta.title + ', книг ' + meta.count + ', ' + (f.size / 1048576).toFixed(1) + ' МБ');
      await switchTr(rec.id);
      done();
    } catch (e) {
      ctx.logErr(e);
      ctx.ui.toast(ctx.t(e && e.reason === 'notbible' ? 'trNotBible' : e && e.reason === 'nobooks' ? 'trNoBooks' : 'trFail'));
    }
  });
  input.click();
}

function bind() {
  onClick = (e) => {
    const x = e.target.closest('[data-x]');
    if (!x) return;
    const a = x.dataset.x;
    if (a === 'bprev' || a === 'bnext') { const n = step(a === 'bnext' ? 1 : -1); if (n) open(n.code, n.ch); }
    else if (a === 'bpick') pickSheet();
    else if (a === 'btr') trSheet();
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
    const go = () => open(bookOf(p.code) ? p.code : 'GEN', p.ch || 1, p.y || 0);
    (ctx.files.ready || Promise.resolve()).then(() => providerOf(ctx.store.get('tr', 'synodal'))).then((x) => { P = x; }, (e) => { ctx.logErr(e); P = SYN; }).then(() => { if (host) go(); });
  },
  resize(sz) { size = sz; render(); },
  unmount() {
    clearTimeout(scrollT);
    opened.forEach((x) => x.close()); opened.clear(); P = SYN; // модуль MyBible в памяти — только пока Библия открыта
    if (host && onClick) host.removeEventListener('click', onClick);
    host = null; ctx = null; verses = null;
  },
};
