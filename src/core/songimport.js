// Импорт песен из программ для вывода текста: ProPresenter 6 (.pro6) и 7 (.pro, .proBundle), PowerPoint (.pptx),
// EasyWorship (Songs.db + SongWords.db, .ewsx), OpenLyrics (.xml — OpenLP и др.), ChordPro и OnSong (.cho, .chordpro,
// .onsong), простой текст (.txt). Несколько файлов и zip-архивы — сразу (групповой импорт). Без DOM и без сети.
// Результат — песни в формате приложения: { title, artist, key, bpm, notes } — текст в notes: части песни
// («Куплет 1», «Припев») — строкой-заголовком, между частями — пустая строка, аккорды — [C] в тексте (как в ChordPro).
import { unzipSync, strFromU8 } from 'fflate';

const ext = (name) => (/\.([^.\\/]+)$/.exec(name || '') || [])[1]?.toLowerCase() || '';
const base = (name) => String(name || '').split(/[\\/]/).pop().replace(/\.[^.]+$/, '').trim();
const clean = (s) => String(s || '').replace(/\r\n?/g, '\n').replace(/[ \t ]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
const utf8 = (u8) => new TextDecoder('utf-8').decode(u8);
const isZip = (u8) => u8.length > 4 && u8[0] === 0x50 && u8[1] === 0x4b && u8[2] === 0x03 && u8[3] === 0x04;
const isSqlite = (u8) => u8.length > 16 && utf8(u8.subarray(0, 15)) === 'SQLite format 3';

/* ---------- маленький разбор XML (элементы, атрибуты, текст, CDATA, сущности) ---------- */

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
export const unent = (s) => String(s).replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) =>
  e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e] ?? m);

export function parseXML(src) {
  const root = { name: '#root', attrs: {}, kids: [], text: '' }, stack = [root];
  const re = /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<\/([^\s>]+)\s*>|<([^\s/>]+)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'))?)*)\s*(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(src))) {
    const top = stack.at(-1);
    if (m[1] != null) top.text += m[1];
    else if (m[2]) { if (stack.length > 1) stack.pop(); }
    else if (m[3]) {
      const attrs = {};
      (m[4] || '').replace(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g, (x, k, a, b) => { attrs[k] = unent(a ?? b); });
      const el = { name: m[3], attrs, kids: [], text: '' };
      top.kids.push(el);
      el.parent = top;
      if (!m[5]) stack.push(el);
    } else if (m[6] != null) { top.text += unent(m[6]); top.kids.push({ name: '#text', text: unent(m[6]), kids: [], attrs: {} }); }
  }
  return root;
}
const local = (n) => n.split(':').pop();
export const find = (el, name, out = []) => { el.kids.forEach((k) => { if (local(k.name) === name) out.push(k); find(k, name, out); }); return out; };
const first = (el, name) => find(el, name)[0] || null;
const textOf = (el) => (el.name === '#text' ? el.text : el.kids.map(textOf).join(''));

/* ---------- RTF → текст (кириллица: \uN и \'hh в кодировке документа) ---------- */

export function rtfToText(rtf) {
  const cp = +((/\\ansicpg(\d+)/.exec(rtf) || [])[1] || 1252);
  let dec;
  try { dec = new TextDecoder('windows-' + cp); } catch { dec = new TextDecoder('windows-1252'); }
  let out = '', i = 0, depth = 0, skipDepth = -1, uc = 1, bytes = [];
  const flush = () => { if (bytes.length) { out += dec.decode(new Uint8Array(bytes)); bytes = []; } };
  const SKIP = /^(fonttbl|colortbl|stylesheet|info|pict|header|footer|expandedcolortbl|listtable|listoverridetable|rsidtbl|generator|\*)$/;
  while (i < rtf.length) {
    const c = rtf[i];
    if (c === '{') { flush(); depth++; i++; continue; }
    if (c === '}') { flush(); if (depth === skipDepth) skipDepth = -1; depth--; i++; continue; }
    if (c === '\\') {
      const n = rtf[i + 1];
      if (n === '\\' || n === '{' || n === '}') { flush(); if (skipDepth < 0) out += n; i += 2; continue; }
      if (n === "'") { const h = parseInt(rtf.substr(i + 2, 2), 16); if (skipDepth < 0 && !isNaN(h)) bytes.push(h); i += 4; continue; }
      if (n === '*') { if (skipDepth < 0) skipDepth = depth; i += 2; continue; }
      const m = /^\\([a-zA-Z]+)(-?\d+)? ?/.exec(rtf.slice(i, i + 40));
      if (!m) { i += 2; continue; }
      i += m[0].length;
      const w = m[1], arg = m[2] != null ? +m[2] : null;
      if (SKIP.test(w) && skipDepth < 0) { skipDepth = depth; continue; }
      if (skipDepth >= 0) continue;
      flush();
      if (w === 'par' || w === 'line' || w === 'sect' || w === 'page') out += '\n';
      else if (w === 'tab') out += '\t';
      else if (w === 'uc') uc = arg ?? 1;
      else if (w === 'u') { out += String.fromCharCode(arg < 0 ? arg + 65536 : arg); // \uN и следом uc знаков-заменителей
        for (let k = 0; k < uc && i < rtf.length; k++) { if (rtf[i] === '\\' && rtf[i + 1] === "'") i += 4; else i++; } }
      else if (w === 'emdash') out += '—'; else if (w === 'endash') out += '–';
      else if (w === 'lquote') out += '‘'; else if (w === 'rquote') out += '’';
      else if (w === 'ldblquote') out += '«'; else if (w === 'rdblquote') out += '»';
      continue;
    }
    if (c === '\r' || c === '\n') { i++; continue; }
    if (skipDepth < 0) { flush(); out += c; }
    i++;
  }
  flush();
  return clean(out);
}

/* ---------- форматы ---------- */

const song = (o) => ({ title: String(o.title || '').trim(), artist: String(o.artist || '').trim(), key: o.key || null, bpm: o.bpm || null, notes: clean(o.notes) });
const sections = (list) => list.filter((s) => s.text && s.text.trim()).map((s) => (s.name ? s.name.trim() + '\n' : '') + clean(s.text)).join('\n\n');

// ChordPro / OnSong / простой текст: {title:}, {artist:}, {key:}, {tempo:}, {start_of_chorus}…; [C] — аккорды как есть
export function fromChordPro(txt, name) {
  const o = { title: '', artist: '', key: null, bpm: null }, body = [];
  clean(txt).split('\n').forEach((line) => {
    const d = /^\{\s*([a-z_]+)\s*(?::\s*(.*?))?\s*\}$/i.exec(line.trim());
    if (d) {
      const k = d[1].toLowerCase(), v = d[2] || '';
      if (k === 'title' || k === 't') o.title = v;
      else if (k === 'artist' || k === 'subtitle' || k === 'st' || k === 'composer') o.artist ||= v;
      else if (k === 'key') o.key = v;
      else if (k === 'tempo') o.bpm = parseInt(v, 10) || null;
      else if (/^(soc|start_of_chorus)$/.test(k)) body.push('', v || 'Припев');
      else if (/^(sov|start_of_verse)$/.test(k)) body.push('', v || 'Куплет');
      else if (/^(sob|start_of_bridge)$/.test(k)) body.push('', v || 'Бридж');
      else if (/^(c|comment|ci|comment_italic)$/.test(k)) body.push(v);
      return;
    }
    const meta = /^(Title|Artist|Key|Tempo|Author)\s*:\s*(.+)$/i.exec(line); // OnSong: шапка «Ключ: значение»
    if (meta && body.length < 6) { const k = meta[1].toLowerCase(); if (k === 'title') o.title = meta[2]; else if (k === 'key') o.key = meta[2]; else if (k === 'tempo') o.bpm = parseInt(meta[2], 10) || null; else o.artist ||= meta[2]; return; }
    body.push(line);
  });
  return song({ ...o, title: o.title || base(name), notes: body.join('\n') });
}

// OpenLyrics: <properties> (title, authors, key, tempo) и <lyrics><verse name><lines> с <br/> и <chord name/>
export function fromOpenLyrics(xml, name) {
  const doc = parseXML(xml), props = first(doc, 'properties') || doc;
  const title = first(props, 'title'), author = first(props, 'author'), key = first(props, 'key'), tempo = first(props, 'tempo');
  const NAMES = { v: 'Куплет', c: 'Припев', b: 'Бридж', p: 'Предприпев', e: 'Кода', i: 'Вступление', o: 'Окончание' };
  const order = (first(props, 'verseOrder') ? textOf(first(props, 'verseOrder')) : '').trim().split(/\s+/).filter(Boolean);
  const verses = find(doc, 'verse').map((v) => {
    const id = v.attrs.name || '';
    const lines = find(v, 'lines').map((ln) => {
      let s = '';
      const walk = (el) => el.kids.forEach((k) => {
        if (k.name === '#text') s += k.text.replace(/\s*\n\s*/g, ' ');
        else if (local(k.name) === 'br') s += '\n';
        else if (local(k.name) === 'chord') { s += '[' + (k.attrs.name || k.attrs.root || '') + ']'; walk(k); }
        else if (local(k.name) !== 'comment') walk(k);
      });
      walk(ln);
      return s.trim();
    }).join('\n');
    const m = /^([a-z])(\d*)/i.exec(id);
    return { id, name: m ? (NAMES[m[1].toLowerCase()] || id) + (m[2] ? ' ' + m[2] : '') : id, text: lines };
  });
  const list = order.length ? order.map((id) => verses.find((v) => v.id === id)).filter(Boolean) : verses;
  return song({ title: title ? textOf(title) : base(name), artist: author ? textOf(author) : '', key: key ? textOf(key).trim() : null,
    bpm: tempo ? parseInt(textOf(tempo), 10) || null : null, notes: sections(list) });
}

// ProPresenter 6 (.pro6, XML): группы слайдов RVSlideGrouping (name) → текст элементов (PlainText или RTFData, base64)
const b64 = (s) => { const bin = atob(String(s).replace(/\s+/g, '')); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
export function fromPro6(xml, name) {
  const doc = parseXML(xml), pres = first(doc, 'RVPresentationDocument') || doc;
  const slideText = (sl) => find(sl, 'RVTextElement').map((te) => {
    const plain = find(te, 'NSString').find((n) => n.attrs.rvXMLIvarName === 'PlainText');
    if (plain && textOf(plain).trim()) return clean(utf8(b64(textOf(plain))));
    const rtf = find(te, 'NSString').find((n) => n.attrs.rvXMLIvarName === 'RTFData') || (te.attrs.RTFData ? { attr: te.attrs.RTFData } : null);
    if (rtf) return rtfToText(utf8(b64(rtf.attr || textOf(rtf))));
    return te.attrs.PlainText ? clean(utf8(b64(te.attrs.PlainText))) : '';
  }).filter(Boolean).join('\n');
  const groups = find(doc, 'RVSlideGrouping').map((g) => ({ name: g.attrs.name || '', text: find(g, 'RVDisplaySlide').map(slideText).filter(Boolean).join('\n\n') }));
  return song({ title: pres.attrs.CCLISongTitle || base(name), artist: pres.attrs.CCLIArtistCredits || pres.attrs.CCLIAuthor || '', notes: sections(groups) });
}

// ProPresenter 7 (.pro, protobuf). Без схемы: обход всех вложенных сообщений; тексты слайдов — RTF ({\rtf…})
// по порядку в файле; название — строка поля 3 верхнего уровня (Presentation.name), иначе имя файла
function pbFields(u8, from = 0, to = u8.length) {
  const out = [];
  let i = from;
  const varint = () => { let x = 0, s = 0, b; do { if (i >= to) throw new Error('pb'); b = u8[i++]; x += (b & 0x7f) * 2 ** s; s += 7; } while (b & 0x80 && s < 64); return x; };
  while (i < to) {
    const key = varint(), f = Math.floor(key / 8), wt = key % 8;
    if (f === 0) throw new Error('pb');
    if (wt === 0) varint();
    else if (wt === 1) i += 8;
    else if (wt === 5) i += 4;
    else if (wt === 2) { const len = varint(); if (i + len > to) throw new Error('pb'); out.push({ f, a: i, b: i + len }); i += len; }
    else throw new Error('pb');
  }
  return out;
}
export function fromPro7(u8, name) {
  const texts = [];
  let title = '';
  const walk = (a, b, depth) => {
    let fields;
    try { fields = pbFields(u8, a, b); } catch { return false; }
    fields.forEach((fl) => {
      const head = utf8(u8.subarray(fl.a, Math.min(fl.b, fl.a + 6)));
      if (head.startsWith('{\\rtf')) { texts.push(rtfToText(utf8(u8.subarray(fl.a, fl.b)))); return; }
      if (depth === 0 && fl.f === 3 && !title) { const s = utf8(u8.subarray(fl.a, fl.b)); if (/^[^\u0000-\u0008]{1,200}$/.test(s)) title = s; }
      if (depth < 24 && fl.b - fl.a > 1) walk(fl.a, fl.b, depth + 1);
    });
    return true;
  };
  walk(0, u8.length, 0);
  const slides = texts.filter((t, k) => t && t !== texts[k - 1]);
  return song({ title: title || base(name), notes: slides.join('\n\n') });
}

// PowerPoint (.pptx): текст слайдов по порядку (абзацы <a:p> из <a:t>); название — имя файла
export function fromPptx(files, name) {
  const nums = Object.keys(files).map((p) => /^ppt\/slides\/slide(\d+)\.xml$/.exec(p)).filter(Boolean).map((m) => +m[1]).sort((a, b) => a - b);
  const slides = nums.map((n) => {
    const doc = parseXML(strFromU8(files['ppt/slides/slide' + n + '.xml']));
    return find(doc, 'p').map((p) => find(p, 't').map(textOf).join('')).filter((s) => s.trim()).join('\n');
  }).filter(Boolean);
  return song({ title: base(name), notes: slides.join('\n\n') });
}

// EasyWorship 6/7: Songs.db (таблица song: rowid, title, author) + SongWords.db (word: song_id, words — RTF);
// .ewsx — zip с main.db: таблицы с RTF-текстом ищутся сами
let wasmPath = null; // путь к sql-wasm.wasm — для тестов вне браузера
export const setSqlWasm = (p) => { wasmPath = p; };
export async function sqlite(u8) {
  const [{ default: init }, wasm] = await Promise.all([import('sql.js'), wasmPath || import('sql.js/dist/sql-wasm.wasm?url').then((m) => m.default)]);
  const SQL = await init({ locateFile: () => wasm });
  return new SQL.Database(u8);
}
const rows = (db, sql) => { try { const r = db.exec(sql)[0]; return r ? r.values.map((v) => Object.fromEntries(r.columns.map((c, i) => [c.toLowerCase(), v[i]]))) : []; } catch { return []; } };
export async function fromEasyWorship(dbs) {
  const out = [];
  const opened = await Promise.all(dbs.map(async (d) => ({ name: d.name, db: await sqlite(d.u8) })));
  const songsDb = opened.find((d) => rows(d.db, "SELECT name FROM sqlite_master WHERE type='table' AND name='song'").length);
  const wordsDb = opened.find((d) => rows(d.db, "SELECT name FROM sqlite_master WHERE type='table' AND name='word'").length);
  if (songsDb) {
    const words = new Map(wordsDb ? rows(wordsDb.db, 'SELECT song_id, words FROM word').map((r) => [r.song_id, r.words]) : []);
    rows(songsDb.db, 'SELECT rowid, * FROM song').forEach((r) => {
      const w = words.get(r.rowid) ?? words.get(r.id) ?? r.words ?? '';
      out.push(song({ title: r.title || '', artist: r.author || '', notes: String(w).startsWith('{\\rtf') ? rtfToText(String(w)) : clean(w) }));
    });
  } else {
    // ewsx и прочие базы: любые строки, где есть RTF, — песни; название — столбец title / name
    opened.forEach(({ db }) => rows(db, "SELECT name FROM sqlite_master WHERE type='table'").forEach(({ name: tb }) => {
      rows(db, 'SELECT * FROM "' + tb.replace(/"/g, '') + '"').forEach((r) => {
        const rtf = Object.values(r).find((v) => typeof v === 'string' && v.startsWith('{\\rtf'));
        if (rtf) out.push(song({ title: r.title || r.name || '', artist: r.author || '', notes: rtfToText(rtf) }));
      });
    }));
  }
  opened.forEach((d) => d.db.close());
  return out.filter((s) => s.title || s.notes);
}

/* ---------- всё вместе: файлы → песни ---------- */

const TEXT_EXT = ['txt', 'cho', 'chordpro', 'chopro', 'crd', 'onsong', 'pro6', 'xml'];
export const ACCEPT = '.pro,.pro6,.probundle,.pptx,.db,.ewsx,.xml,.txt,.cho,.chordpro,.chopro,.crd,.onsong,.zip';

// files — [{ name, u8 }]; → { songs, errors: [{ name, error }] }
export async function importSongs(files) {
  const songs = [], errors = [], dbs = [];
  const one = async (name, u8, depth = 0) => {
    const e = ext(name);
    try {
      if (isSqlite(u8)) { dbs.push({ name, u8 }); return; }
      if (isZip(u8)) {
        const z = unzipSync(u8);
        if (z['[Content_Types].xml'] && Object.keys(z).some((p) => p.startsWith('ppt/slides/'))) { songs.push(fromPptx(z, name)); return; }
        if (depth > 2) return;
        for (const [p, data] of Object.entries(z)) if (!p.endsWith('/') && !/(^|\/)(__MACOSX|\.)/.test(p)) await one(p, data, depth + 1);
        return;
      }
      if (e === 'pro') { songs.push(fromPro7(u8, name)); return; }
      if (!TEXT_EXT.includes(e) && depth > 0) return; // внутри архива — картинки и прочее пропускаются
      const txt = utf8(u8).replace(/^﻿/, '');
      if (e === 'pro6' || /<RVPresentationDocument/.test(txt)) songs.push(fromPro6(txt, name));
      else if (/<song[\s>][\s\S]*openlyrics/i.test(txt.slice(0, 2000)) || (e === 'xml' && /<lyrics/.test(txt))) songs.push(fromOpenLyrics(txt, name));
      else if (e === 'xml') throw new Error('unknown xml');
      else songs.push(fromChordPro(txt, name));
    } catch (err) { errors.push({ name, error: String((err && err.message) || err) }); }
  };
  for (const f of files) await one(f.name, f.u8);
  if (dbs.length) { try { songs.push(...(await fromEasyWorship(dbs))); } catch (err) { errors.push({ name: dbs.map((d) => d.name).join(', '), error: String(err && err.message) }); } }
  return { songs: songs.filter((s) => s.title || s.notes), errors };
}
