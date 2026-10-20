// Табы и ноты, текст: табулатуры Guitar Pro / MusicXML (alphaTab, локально) с воспроизведением (SONiVOX),
// ноты и табы в PDF (pdf.js, локально), текст песни с аккордами и транспонированием. Перенесено из legacy/practice.html (AT, ATP, notesHTML, tabSheet, lyricsEdit).
import './notes.css';
import ru from './i18n/ru.json';
import uz from './i18n/uz.json';
import en from './i18n/en.json';
import el from './i18n/el.json';
import { fileSongs, inSong } from '../../core/files.js';
import { lyricsHTML, chordsIn, degreesIn } from '../../music/lyrics.js';
import { tonicIsMinor } from '../../music/degrees.js';
import { detectKey, parseNote, shiftKey, keyLabel, shiftTo } from '../../music/transpose.js';
import { isPdf, openPdf, createPdfView, closePdfDoc, sniffPdf } from './pdf.js';
import { pinch } from '../../ui/gestures.js';
// Шрифт нот и звуковой банк — файлы проекта, никаких CDN
import BRAVURA from '@coderline/alphatab/font/Bravura.woff2?url';
import SONIVOX from '@coderline/alphatab/soundfont/sonivox.sf3?url';

const ICON = '<svg viewBox="0 0 24 24"><rect x="5" y="3.5" width="14" height="17" rx="2.5"/><path d="M8.5 8h7M8.5 12h7M8.5 16h4"/></svg>';
const I = {
  play: '<svg viewBox="0 0 24 24"><path d="M7 4.8v14.4c0 .8.9 1.3 1.6.9l11.3-7.2c.6-.4.6-1.4 0-1.8L8.6 3.9C7.9 3.5 7 4 7 4.8z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><rect x="6" y="5" width="4.2" height="14" rx="1.4"/><rect x="13.8" y="5" width="4.2" height="14" rx="1.4"/></svg>',
  stop: '<svg viewBox="0 0 24 24" class="f"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
  full: '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5M9 9l-4-4M15 9l4-4M9 15l-4 4M15 15l4 4"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  fit: '<svg viewBox="0 0 24 24"><path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4"/></svg>',
  up: '<svg viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  minus: '<svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg>',
  list: '<svg viewBox="0 0 24 24"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1.2" fill="currentColor"/><circle cx="4.5" cy="12" r="1.2" fill="currentColor"/><circle cx="4.5" cy="18" r="1.2" fill="currentColor"/></svg>',
  pen: '<svg viewBox="0 0 24 24"><path d="M15.5 5.5l3 3L9 18l-4 1 1-4z"/></svg>',
  metro: '<svg viewBox="0 0 24 24" style="width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2"><path d="M8 21h8l-3-17h-2zM12 14l5-7"/></svg>',
};
const ACCEPT = '.gp,.gp3,.gp4,.gp5,.gpx,.gp7,.gp8,.xml,.musicxml,.mxl,.pdf,application/pdf';

let dropped = null; // файлы, перетащенные в окно до того, как модуль открылся (src/core/drop.js)
let host = null, ctx = null, size = 'full', input = null, offs = [];
const st = () => ctx.store.all();
const tabs = () => ctx.files.list('tab');
const icb = (...a) => ctx.ui.icb(...a);
const esc = (s) => ctx.ui.esc(s);
const big = () => size === 'full' || size === 'half';

/* ---------- alphaTab: один экземпляр на приложение ---------- */

const AT = { lib: null, api: null, el: null, cur: null, score: null, track: 0, state: 'idle' };
const ATP = { on: false, sf: false, playing: false, want: false, speed: 1, metro: false, err: false, timer: 0 };

// Библиотека грузится только при открытии табулатуры (отдельный кусок сборки)
const loadLib = () => AT.lib || (AT.lib = import('@coderline/alphatab').catch((e) => { AT.lib = null; throw e; }));
const prof = (at) => (st().prof === 'both' ? at.StaveProfile.ScoreTab : at.StaveProfile.Tab);

/* ---------- PDF: один просмотр на приложение (как и alphaTab) ---------- */

const PDF = { view: null, rec: null, page: 1, pages: 0, zoom: 1, saveT: 0 };

// Страница и масштаб запоминаются в настройках модуля (не в записи файла: её сохранение переписало бы
// весь файл в базе — у тяжёлого PDF это десятки мегабайт на каждую перелистнутую страницу)
const posOf = (r) => (st().pdfPos || {})[r.id] || r.pos || {};
function savePdfPos() {
  const r = PDF.rec;
  if (!r || !ctx) return;
  const all = st().pdfPos || (st().pdfPos = {});
  delete all[r.id];
  all[r.id] = { page: PDF.page, zoom: PDF.zoom };
  // хранится место в 50 последних файлах
  const ids = Object.keys(all);
  ids.slice(0, Math.max(0, ids.length - 50)).forEach((id) => delete all[id]);
  ctx.store.save();
}

// Во весь экран (удобно с повёрнутым телефоном): только страницы и маленькая панель поверх
function pdfFull(on) {
  const { t } = ctx;
  let ov = document.querySelector('.pdffull');
  if (!on) {
    if (ov) ov.remove();
    PDF.full = false;
    render();
    return;
  }
  if (!PDF.view) return;
  PDF.full = true;
  if (!ov) {
    ov = document.createElement('div');
    ov.className = 'pdffull';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-label', AT.cur ? AT.cur.name : 'PDF');
    ov.innerHTML = '<div class="pdfbody"></div><div class="pdffbar">' + icb('data-x="pfull0"', I.close, t('pdf.exitFull'), 'sm') +
      icb('data-x="pzoom" data-d="-1"', I.minus, t('smaller'), 'sm') + icb('data-x="pzoom" data-d="1"', I.plus, t('bigger'), 'sm') + icb('data-x="pfit"', I.fit, t('pdf.fit'), 'sm') +
      '<span class="num pdfpn" id="pdfpgF">' + PDF.page + ' / ' + PDF.pages + '</span></div>';
    ov.addEventListener('click', (e) => { const x = e.target.closest('[data-x]'); if (x) act(x.dataset.x, x); });
    document.body.appendChild(ov);
  }
  PDF.view.moveTo(ov.querySelector('.pdfbody'));
}

function closePdf() {
  if (PDF.full) pdfFull(false);
  if (!PDF.view) return;
  savePdfPos();
  PDF.view.destroy();
  PDF.view = null;
  PDF.rec = null;
}

const mbOf = (n) => (n / 1048576).toFixed(1) + ' МБ';

// Почему PDF не открылся — словами; имя ошибки в скобках, чтобы по нему можно было разобраться
function pdfErr(e) {
  const n = (e && e.name) || 'Error';
  const k = n === 'InvalidPDFException' ? 'pdf.err.broken' : n === 'PasswordException' ? 'pdf.err.pw' : n === 'ReadError' ? 'pdf.err.read' : /memory|allocation/i.test(String(e && e.message)) ? 'pdf.err.mem' : 'pdf.err.other';
  return ctx.t(k) + (k === 'pdf.err.broken' ? '. ' + ctx.t('pdf.err.reupload') : '') + ' (' + n + ')';
}

// Пароль к файлу: окно с полем; null — отказались
function pwDialog(wrong) {
  const { t, ui } = ctx;
  return new Promise((resolve) => {
    const d = document.createElement('div');
    d.className = 'ask';
    d.innerHTML = '<div class="alert" role="dialog" aria-label="' + ui.esc(t('pdf.pw')) + '"><div class="ab"><h3>' + t('pdf.pw') + '</h3>' +
      (wrong ? '<p style="color:var(--red)">' + t('pdf.pwWrong') + '</p>' : '<p>' + t('pdf.pwText') + '</p>') +
      '<input class="inp" type="password" autocomplete="off" aria-label="' + ui.esc(t('pdf.pw')) + '" style="width:100%;margin-top:10px;padding:10px 12px;border:1px solid var(--sep);border-radius:12px;background:var(--fill);color:var(--ink)"></div>' +
      '<div class="abtns"><button data-k="no">' + t('ui.cancel') + '</button><button data-k="ok">' + t('pdf.pwOpen') + '</button></div></div>';
    document.body.appendChild(d);
    const inp = d.querySelector('input');
    setTimeout(() => inp.focus(), 50);
    const done = (v) => { ui.leave(d, 160); resolve(v); };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(inp.value); if (e.key === 'Escape') done(null); });
    d.addEventListener('click', (e) => { const k = e.target.closest('[data-k]'); if (k) done(k.dataset.k === 'ok' ? inp.value : null); });
  });
}

async function openPdfRec(rec) {
  closePdf();
  AT.cur = rec;
  AT.state = 'loading';
  render();
  let doc;
  const t0 = Date.now(), plog = (m, l) => ctx && ctx.log('pdf: ' + m, l);
  plog('открытие, ' + mbOf(rec.blob.size) + (rec.blob.type ? ', ' + rec.blob.type : ', без типа'));
  try { doc = await openPdf(rec.blob, { password: rec.pw, askPassword: pwDialog, log: plog }); } catch (e) {
    if (ctx) (e.name === 'PasswordCancel' ? plog('пароль не введён') : ctx.logErr(e));
    if (AT.cur !== rec) return;
    AT.state = 'error'; render();
    if (ctx && e.name !== 'PasswordCancel') ctx.ui.toast(pdfErr(e));
    return;
  }
  if (AT.cur !== rec) { closePdfDoc(doc); return; }
  plog('открыт за ' + (Date.now() - t0) + ' мс, страниц ' + doc.numPages + ', с ' + (posOf(rec).page || 1));
  if (doc._pw && doc._pw !== rec.pw) { rec.pw = doc._pw; ctx.files.save(rec); }
  const pos = posOf(rec);
  PDF.rec = rec;
  PDF.view = createPdfView(doc, {
    page: pos.page || 1, zoom: pos.zoom || 1, log: plog,
    onState: (s) => {
      Object.assign(PDF, { page: s.page, pages: s.pages, zoom: s.zoom });
      document.querySelectorAll('#pdfpg, #pdfpgF').forEach((pn) => { pn.textContent = s.page + ' / ' + s.pages; });
      clearTimeout(PDF.saveT);
      PDF.saveT = setTimeout(savePdfPos, 1500);
    },
  });
  Object.assign(PDF, { pages: doc.numPages, page: Math.min(doc.numPages, pos.page || 1) });
  AT.state = 'ready';
  render();
  PDF.view.mounted();
}

async function openTab(rec) {
  st().lastTab = rec.id; // при следующем запуске откроется он же, с того же места
  ctx.store.save();
  // загруженный раньше PDF без расширения и типа — узнать по содержимому (один раз, потом запомнено)
  if (!isPdf(rec) && rec.blob && (await sniffPdf(rec.blob))) { rec.fmt = 'pdf'; ctx.files.save(rec); }
  if (isPdf(rec)) { openPdfRec(rec); return; }
  closePdf();
  AT.state = 'loading';
  AT.cur = rec;
  AT.score = null;
  render();
  let at;
  try { at = await loadLib(); } catch (e) { ctx && ctx.logErr(e); AT.state = 'error'; render(); ctx && ctx.ui.toast(ctx.t('libFail')); return; }
  if (!AT.api) {
    AT.el = document.createElement('div');
    AT.el.className = 'atsurf';
    attach();
    AT.api = new at.AlphaTabApi(AT.el, {
      core: { smuflFontSources: new Map([[at.FontFileFormat.Woff2, BRAVURA]]), includeNoteBounds: true }, // границы цифр — для подсветки играемого места
      player: { enablePlayer: false },
      display: { scale: st().scale, layoutMode: at.LayoutMode.Page, staveProfile: prof(at) },
    });
    AT.api.scoreLoaded.on((sc) => { AT.score = sc; AT.track = 0; AT.state = 'ready'; hlHide(); render(); });
    // подсветка играемого места — заново после каждой отрисовки (масштаб, вид, дорожка)
    AT.api.renderFinished.on(() => { if (AT.beat) hlPlace(AT.beat, false); });
    playerSetup(); // звуковой банк грузится сразу: нажатие на такт переводит туда, «Играть» — без ожидания
    AT.api.error.on((e) => { if (ctx) ctx.log('alphaTab: ' + ((e && (e.message || e.type)) || 'ошибка'), 'e'); AT.state = 'error'; render(); if (ctx) ctx.ui.toast(ctx.t('openFail')); });
  }
  try { AT.api.load(new Uint8Array(await rec.blob.arrayBuffer())); } catch { AT.state = 'error'; render(); }
}

function restyle() {
  if (!AT.api) return;
  AT.lib.then((at) => {
    AT.api.settings.display.scale = st().scale;
    AT.api.settings.display.staveProfile = prof(at);
    AT.api.updateSettings();
    AT.api.render();
  });
}

function setTrack(i) {
  if (!AT.score) return;
  AT.track = i;
  AT.api.renderTracks([AT.score.tracks[i]]);
}

// Поверхность alphaTab живёт между перерисовками окна: переносим её в новое место
function attach() {
  const slot = host && host.querySelector('#atSlot');
  if (slot && AT.el && AT.el.parentNode !== slot) slot.appendChild(AT.el);
  // прокрутка за играемым местом — в текущем окне (разметка окна пересоздаётся при каждой перерисовке)
  if (slot && AT.api && ATP.on && AT.api.settings.player.scrollElement !== slot) { AT.api.settings.player.scrollElement = slot; AT.api.updateSettings(); }
  const ps = host && host.querySelector('#pdfSlot');
  if (ps && PDF.view && !PDF.full) PDF.view.moveTo(ps);
}

/* ---------- воспроизведение табулатуры (звуковой банк SONiVOX) ---------- */

const vol = () => Math.min(1, ctx.audio.mixer.elementVolume('media'));

function playerSetup() {
  const api = AT.api;
  if (!api || ATP.on) return;
  ATP.on = true;
  ATP.err = false;
  try {
    api.soundFontLoaded.on(() => {
      ATP.sf = true;
      clearTimeout(ATP.timer);
      api.masterVolume = ctx ? vol() : 1;
      api.playbackSpeed = ATP.speed;
      api.metronomeVolume = ATP.metro ? 1 : 0;
      if (ATP.want) { ATP.want = false; api.play(); }
      render();
    });
    api.playerStateChanged.on((e) => {
      ATP.playing = e.state === 1;
      const b = host && host.querySelector('#atplay');
      if (b) b.innerHTML = ATP.playing ? I.pause : I.play;
      if (AT.hl) AT.hl.classList.toggle('play', ATP.playing);
    });
    // играемое место: рамка вокруг цифр текущего удара; нажатие на ноту — переход туда
    api.playedBeatChanged.on((beat) => hlPlace(beat, true));
    api.beatMouseDown.on((beat) => hlPlace(beat, false));
    const s = api.settings;
    s.player.enablePlayer = true;
    s.player.enableCursor = true; // свои полосы alphaTab скрыты (notes.css), нужны для перехода по нажатию
    s.player.enableAnimatedBeatCursor = false;
    s.player.enableUserInteraction = true;
    s.player.soundFont = SONIVOX;
    const sc = host && host.querySelector('#atSlot');
    if (sc) s.player.scrollElement = sc;
    api.updateSettings();
  } catch { ATP.err = true; }
  ATP.timer = setTimeout(() => { if (!ATP.sf) { ATP.err = true; render(); if (ctx && ATP.want) ctx.ui.toast(ctx.t('sfFail')); } }, 15000);
}

/* ---------- подсветка играемого места (как в Songsterr): полупрозрачная рамка только вокруг цифр удара ---------- */

function hlHide() { AT.beat = null; if (AT.hl) AT.hl.style.opacity = '0'; }

function hlPlace(beat, anim) {
  const api = AT.api, lk = api && api.renderer && api.renderer.boundsLookup;
  if (!beat || !lk || !AT.el) return;
  AT.beat = beat;
  const all = (lk.findBeats && lk.findBeats(beat)) || [lk.findBeat(beat)].filter(Boolean);
  if (!all.length) return;
  // с нотами и табом — нижний нотоносец (таб); рамка — по цифрам, у паузы — узкая полоса по высоте такта
  const bb = all[all.length - 1], notes = (bb.notes || []).map((n) => n.noteHeadBounds).filter(Boolean);
  let x, y, w, h;
  if (notes.length) {
    const x0 = Math.min(...notes.map((r) => r.x)), x1 = Math.max(...notes.map((r) => r.x + r.w));
    const y0 = Math.min(...notes.map((r) => r.y)), y1 = Math.max(...notes.map((r) => r.y + r.h));
    const p = 4;
    x = x0 - p; y = y0 - p; w = Math.max(x1 - x0 + 2 * p, 16); h = y1 - y0 + 2 * p;
    if (w === 16) x = (x0 + x1) / 2 - 8;
  } else {
    const r = bb.barBounds.visualBounds, cx = bb.onNotesX || bb.visualBounds.x + bb.visualBounds.w / 2;
    x = cx - 3; y = r.y; w = 6; h = r.h;
  }
  if (!AT.hl || AT.hl.parentNode !== AT.el) {
    AT.hl = document.createElement('i');
    AT.hl.className = 'athl';
    AT.el.appendChild(AT.hl);
  }
  const el = AT.hl, jump = !anim || Math.abs((+el.dataset.y || 0) - y) > 30; // новая строка — без скольжения
  el.style.transition = jump ? 'none' : '';
  el.style.transform = 'translate(' + x + 'px,' + y + 'px)';
  el.style.width = w + 'px';
  el.style.height = h + 'px';
  el.style.opacity = '1';
  el.dataset.y = y;
  el.classList.toggle('play', ATP.playing);
}

function togglePlay() {
  if (!AT.api || !AT.score) return;
  if (!ATP.on) playerSetup();
  if (!ATP.sf) { ATP.want = true; ctx.ui.toast(ctx.t('sfLoading')); render(); return; }
  AT.api.masterVolume = vol();
  AT.api.playPause();
}

/* ---------- разметка ---------- */

function tabRow(x) {
  const songs = ctx.songs(), so = fileSongs(x).map((id) => songs.find((s) => s.id === id)).find(Boolean);
  return '<div class="cell"><button class="grow" data-x="topen" data-id="' + x.id + '" style="text-align:left;min-width:0"><div class="ttl">' + esc(x.name) + '</div><div class="st">' +
    (isPdf(x) ? 'PDF · ' : '') + ctx.t('kb', { n: ctx.num((x.size || 0) / 1024, 0) }) + (so ? ', ' + esc(so.title) : '') + '</div></button>' +
    '<button class="ic sm" data-x="tdel" data-id="' + x.id + '" aria-label="' + esc(ctx.t('deleteX', { name: x.name })) + '" style="color:var(--red)">' + I.minus + '</button></div>';
}

function barHTML() {
  const { t } = ctx;
  const note = ATP.err ? '<span class="l2" style="font-size:12px">' + t('playNA') + '</span>' : ATP.want && !ATP.sf ? '<span class="l2" style="font-size:12px">' + t('sfLoadingShort') + '</span>' : '';
  return '<div class="atbar"><button class="bigplay atpl" id="atplay" data-x="atplay" aria-label="' + t('playTab') + '">' + (ATP.playing ? I.pause : I.play) + '</button>' +
    icb('data-x="atstop"', I.stop, t('stop'), 'sm') +
    '<div class="vrow tight">' + icb('data-x="atspd" data-d="-1"', I.minus, t('slower'), 'sm') + '<button class="ratev num" data-x="atspd" data-d="0" aria-label="' + t('speed') + '">' +
    Math.round(ATP.speed * 100) + '%</button>' + icb('data-x="atspd" data-d="1"', I.plus, t('faster'), 'sm') + '</div>' +
    '<button class="ic txt sm' + (ATP.metro ? ' act' : '') + '" data-x="atmet" aria-pressed="' + ATP.metro + '" aria-label="' + t('metro') + '">' + I.metro + '</button>' + note + '</div>';
}

function tabsBody() {
  const { t } = ctx, song = ctx.song(), all = tabs();
  if (!AT.cur || AT.state === 'error') {
    const mine = song ? all.filter((x) => inSong(x, song.id)) : [];
    const rest = all.filter((x) => !mine.includes(x));
    return '<div class="tablist">' + (all.length
      ? (mine.length ? '<div class="hdr" style="margin-top:4px">' + t('thisSong') + '</div><div class="group">' + mine.map(tabRow).join('') + '</div>' : '') +
        (rest.length ? '<div class="hdr">' + t(mine.length ? 'others' : 'allTabs') + '</div><div class="group">' + rest.map(tabRow).join('') + '</div>' : '')
      : '<p class="l2" style="font-size:14px;text-align:center;margin:18px 8px">' + t('uploadHint') + '</p>') +
      '<div class="vrow" style="margin-top:12px"><button class="btn sm" data-x="tadd">' + I.plus.replace('<svg', '<svg style="width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2.4"') + ' ' + t('uploadTab') + '</button></div>' +
      (AT.state === 'error' ? '<p class="ftr" style="text-align:center">' + t('openFailShort') + '</p>' : '') + '</div>';
  }
  if (isPdf(AT.cur)) {
    return '<div class="ntools">' + icb('data-x="tlist"', I.list, t('tabFiles'), 'sm') +
      '<span class="sgrow aname" style="text-align:left">' + esc(AT.cur.name) + '</span>' +
      (PDF.pages > 1 ? icb('data-x="pgo" data-d="-1"', I.up, t('pdf.prev'), 'sm') + '<span class="num pdfpn" id="pdfpg">' + PDF.page + ' / ' + PDF.pages + '</span>' + icb('data-x="pgo" data-d="1"', I.down, t('pdf.next'), 'sm') : '') +
      icb('data-x="pzoom" data-d="-1"', I.minus, t('smaller'), 'sm') + icb('data-x="pzoom" data-d="1"', I.plus, t('bigger'), 'sm') + icb('data-x="pfit"', I.fit, t('pdf.fit'), 'sm') + icb('data-x="pfull"', I.full, t('pdf.full'), 'sm') + '</div>' +
      '<div class="pdfwrap" id="pdfSlot">' + (AT.state === 'loading' ? '<div class="atload">' + ctx.ui.loader('book', AT.cur.name) + '</div>' : '') + '</div>';
  }
  const tr = AT.score ? AT.score.tracks : [];
  return '<div class="ntools">' + icb('data-x="tlist"', I.list, t('tabFiles'), 'sm') +
    (tr.length > 1
      ? '<div class="chips nowrap sgrow">' + tr.map((x, i) => '<button class="chip' + (i === AT.track ? ' on' : '') + '" data-x="ttrack" data-i="' + i + '">' + esc(x.name || t('trackN', { n: i + 1 })) + '</button>').join('') + '</div>'
      : '<span class="sgrow aname" style="text-align:left">' + esc(AT.cur.name) + '</span>') +
    icb('data-x="tzoom" data-d="-1"', I.minus, t('smaller'), 'sm') + icb('data-x="tzoom" data-d="1"', I.plus, t('bigger'), 'sm') +
    '<button class="ic txt sm' + (st().prof === 'both' ? ' act' : '') + '" data-x="tprof" aria-pressed="' + (st().prof === 'both') + '" aria-label="' + t('scoreTab') + '">♪+T</button></div>' +
    (big() ? barHTML() : '') + '<div class="atwrap" id="atSlot">' + (AT.state === 'loading' ? '<div class="atload">' + ctx.ui.loader('beat', AT.cur.name) + '</div>' : '') + '</div>';
}

// Исходная тональность песни: из карточки песни, иначе — по аккордам текста
function songKey(song) {
  const k = song.key && parseNote(song.key);
  if (k) return { pc: k.pc, minor: /m$/.test(song.key), sharp: k.acc > 0 ? true : k.acc < 0 ? false : null, given: true };
  const det = detectKey(chordsIn(song.notes));
  if (det) return det;
  // текст записан ступенями — тональность не указана: до мажор или ля минор, сменить можно выбором тональности
  const d = degreesIn(song.notes);
  return d.length ? (tonicIsMinor(d) ? { pc: 9, minor: true, sharp: null, assumed: true } : { pc: 0, minor: false, sharp: null, assumed: true }) : null;
}
const viewOf = () => (st().view === 'degrees' ? 'degrees' : 'chords');
// Чей текст на экране: выбранный в библиотеке текстов (пока идёт та же сессия) или песни сессии
function textId() {
  const sess = ctx.session && ctx.session.songId, p = st().textPick;
  if (p && ctx.song(p.id) && (!sess || p.sess === sess)) return p.id;
  return sess || (p && ctx.song(p.id) ? p.id : null);
}
const curSong = () => { const id = textId(); return id ? ctx.song(id) : null; };
const updCur = (patch) => { const id = textId(); if (id) ctx.updateSong(patch, id); };

// Библиотека текстов и аккордов: все песни — сначала с текстом, потом без (добавить текст)
function textLibHTML(withTitle = true) {
  const { t } = ctx, all = ctx.songs(), cur = textId(), sess = ctx.session && ctx.session.songId;
  const row = (s) => '<button class="cell act" data-x="npick" data-id="' + esc(s.id) + '"' + (s.id === cur ? ' aria-current="true"' : '') + '><span class="grow" style="text-align:left"><span>' + esc(s.title) +
    (s.id === sess ? ' <span class="lchip sm off">' + t('lib.session') + '</span>' : '') + '</span><span class="st l2" style="display:block;font-size:12.5px">' + esc([s.artist, s.key].filter(Boolean).join(' · ')) + '</span></span></button>';
  const w = all.filter((s) => s.text), wo = all.filter((s) => !s.text);
  return (withTitle ? '' : '') + (w.length ? '<div class="hdr">' + t('lib.withText') + '</div><div class="group">' + w.map(row).join('') + '</div>' : '<p class="l2" style="font-size:14px;text-align:center;margin:14px 8px">' + t('lib.empty') + '</p>') +
    (wo.length ? '<div class="hdr">' + t('lib.noText') + '</div><div class="group">' + wo.map(row).join('') + '</div>' : '');
}
const dstyle = () => (st().dstyle === 'nash' ? 'nash' : 'roman');

function textBody() {
  const { t } = ctx, song = curSong();
  if (!song) return '<div class="tablist">' + (ctx.songs().length ? textLibHTML() : '<div class="vq l2" style="font-size:14px">' + t('textNeedsSong') + '</div>') + '</div>';
  const n = song.tr, key = songKey(song);
  const keyBtn = key ? '<button class="trkey num" data-x="nkey" aria-label="' + esc(t('tr.pick')) + '">' + esc(keyLabel(key)) + (n ? ' → <b>' + esc(keyLabel(shiftKey(key, n))) + '</b>' : '') + '</button>' : '';
  return '<div class="ntools">' + icb('data-x="nlib"', I.list, t('lib.title'), 'sm') + '<span class="sgrow aname" style="text-align:left">' + esc(song.title) + '</span></div><div class="ntools"><div class="vrow tight">' + icb('data-x="ntr" data-d="-1"', I.minus, t('trDown'), 'sm') + '<span class="num trv">' + (n > 0 ? '+' : '') + n + '</span>' +
    icb('data-x="ntr" data-d="1"', I.plus, t('trUp'), 'sm') + keyBtn +
    // вид: аккорды или ступени (римские цифры / нэшвиллская запись — в выборе тональности)
    (key ? '<button class="trview" data-x="nview" aria-pressed="' + (viewOf() === 'degrees') + '" aria-label="' + esc(t(viewOf() === 'degrees' ? 'deg.toChords' : 'deg.toDegrees')) + '">' +
      (viewOf() === 'degrees' ? (dstyle() === 'nash' ? '1 4 5' : 'I IV V') : 'C F G') + '</button>' : '') + '</div>' +
    (big() ? '<div class="vrow tight">' + icb('data-x="nfs" data-d="-1"', 'A−', t('smaller'), 'sm txt') + icb('data-x="nfs" data-d="1"', 'A+', t('bigger'), 'sm txt') + icb('data-x="nedit"', I.pen, t('editText'), 'sm') + '</div>' : '') + '</div>' +
    (song.notes
      ? '<div class="lyr" style="font-size:' + (st().fs || 15) + 'px">' + lyricsHTML(song.notes, n, key, { view: viewOf(), style: dstyle() }) + '</div>'
      : '<div class="vq l2" style="font-size:14px">' + t('textEmpty') + '<button class="btn sm" data-x="nedit" style="margin-top:8px">' + t('addText') + '</button></div>');
}

function html() {
  const { t } = ctx, sec = st().sec === 'text' ? 'text' : 'tabs';
  if (sec === 'tabs' && !big()) {
    return '<div class="comp ' + size + '"><div class="csw"><button class="cswb on txt" data-x="nsec" data-v="text" aria-label="' + t('toText') + '">' + t('tabsShort') + ' ›</button></div>' +
      '<div class="vq l2" style="font-size:13px">' + t('needsRoom') + '</div></div>';
  }
  const sw = '<div class="tsw" role="tablist">' + [['tabs', t('sec.tabs')], ['text', t('sec.text')]].map(([k, n]) =>
    '<button class="tswb' + (k === sec ? ' on' : '') + '" data-x="nsec" data-v="' + k + '" role="tab" aria-selected="' + (k === sec) + '">' + n + '</button>').join('') + '</div>';
  return '<div class="comp notes-root ' + size + '">' + (big() ? sw : '<div class="csw"><button class="cswb on txt" data-x="nsec" data-v="tabs" aria-label="' + t('toTabs') + '">' + t('textShort') + ' ›</button></div>') +
    '<div class="cbody">' + (sec === 'text' ? textBody() : tabsBody()) + '</div></div>';
}

function render() {
  if (!host || !ctx) return;
  host.innerHTML = html();
  attach();
}

/* ---------- шторки ---------- */

function tabSheet() {
  const { t, ui } = ctx;
  ui.sheet(() => ui.snav(t('tabFiles')) + '<div class="group">' + tabs().map(tabRow).join('') + '<button class="cell act" data-x="tadd">' + t('uploadTab') + '</button></div>',
    (el, sh) => el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-x]');
      if (!b) return;
      e.stopPropagation();
      sh.close();
      act(b.dataset.x, b);
    }, true));
}

// Выбор тональности напрямую: 12 вариантов того же наклонения, «Исходная» — сброс сдвига
function keySheet() {
  const { t, ui } = ctx, song = curSong(), key = song && songKey(song);
  if (!key) return;
  const opts = Array.from({ length: 12 }, (_, i) => { const d = shiftTo(key, (key.pc + i) % 12); return { d, label: keyLabel(shiftKey(key, d)) }; }).sort((a, b) => a.d - b.d);
  ui.sheet(() => ui.snav(t('tr.key')) + '<p class="ftr" style="margin-top:0">' + esc(t(key.given ? 'tr.fromSong' : key.assumed ? 'tr.fromAssumed' : 'tr.fromChords', { k: keyLabel(key) })) + '</p>' +
    '<div class="group"><div class="cellcol trgrid">' + opts.map((o) => '<button type="button" class="pill num" data-trd="' + o.d + '" aria-pressed="' + (o.d === song.tr) + '">' + esc(o.label) +
      '<small>' + (o.d > 0 ? '+' : '') + o.d + '</small></button>').join('') + '</div></div>' +
    '<p class="ftr">' + t('tr.hint') + '</p>' +
    '<div class="hdr">' + t('deg.title') + '</div><div class="group"><div class="cellcol">' +
    ui.seg('nview', [['chords', t('deg.chords')], ['roman', t('deg.roman')], ['nash', t('deg.nash')]], viewOf() === 'chords' ? 'chords' : dstyle(), t('deg.title')) + '</div></div>' +
    '<p class="ftr">' + t('deg.hint') + '</p>',
  (el, sh) => el.addEventListener('click', (e) => {
    const v = e.target.closest('[data-seg="nview"] [data-v]');
    if (v) {
      if (v.dataset.v === 'chords') st().view = 'chords'; else { st().view = 'degrees'; st().dstyle = v.dataset.v; }
      ctx.store.save(); sh.close(); render(); return;
    }
    const b = e.target.closest('[data-trd]');
    if (!b) return;
    updCur({ tr: +b.dataset.trd });
    sh.close();
    render();
  }));
}

// Шторка библиотеки текстов
function libSheet() {
  const { t, ui } = ctx;
  ui.sheet(() => ui.snav(t('lib.title')) + textLibHTML(), (el, sh) => el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-x="npick"]');
    if (!b) return;
    e.stopPropagation(); sh.close(); act('npick', b);
  }, true));
}

function lyricsEdit() {
  const { t, ui } = ctx, song = curSong();
  if (!song) return;
  ui.sheet(() => ui.snav(t('sec.text'), { left: '<button class="link l" data-close>' + t('cancel') + '</button>', right: '<button class="link b r" id="lsave">' + t('save') + '</button>' }) +
    '<div class="group"><textarea class="ta" id="lta" style="min-height:52vh" aria-label="' + t('sec.text') + '" placeholder="' + esc(t('textPh')) + '">' + esc(song.notes) + '</textarea></div><p class="ftr">' + t('textHint') + '</p>',
  (el, sh) => el.querySelector('#lsave').addEventListener('click', () => {
    updCur({ notes: el.querySelector('#lta').value });
    sh.close();
    render();
  }));
}

/* ---------- действия ---------- */

async function addFile() {
  if (ctx.uploadOk && ctx.uploadOk()) { input.click(); return; } // в том же нажатии: Safari открывает выбор файла только так
  if (await ctx.confirmUpload()) input.click();
}

// Сверка копии в хранилище с прочитанными байтами: начало, конец и четыре места между ними по 64 КБ.
// true — совпадает; false — копия испорчена; null — копию не прочитать
async function sameCopy(copy, bytes) {
  try {
    const n = bytes.length, W = 65536, at = [0, n - W, ...[1, 2, 3, 4].map((k) => Math.floor((n * k) / 5))].map((x) => Math.max(0, Math.min(x, n - W)));
    for (const o of at) {
      const c = new Uint8Array(await copy.slice(o, Math.min(n, o + W)).arrayBuffer()), b = bytes.subarray(o, Math.min(n, o + W));
      if (c.length !== b.length) return false;
      for (let i = 0; i < c.length; i++) if (c[i] !== b[i]) return false;
    }
    return true;
  } catch { return null; }
}

// Файл с устройства — сначала целиком в память и сохраняется уже из памяти: на Android выбранный файл часто
// приходит «ссылкой» на другое приложение, и копия в хранилище из такой ссылки бывала неполной или испорченной
// (большая книга потом не открывалась — «PDF повреждён»). Копия сверяется с байтами; не совпала — сохраняется
// ещё раз, а открывается файл из памяти
async function storeFile(rec, f) {
  let bytes = null;
  try { bytes = new Uint8Array(await f.arrayBuffer()); rec.blob = new Blob([bytes], { type: f.type || (rec.fmt === 'pdf' ? 'application/pdf' : '') }); }
  catch (err) { ctx.log('файл не читается целиком (' + (err && err.name) + ') — сохраняется как есть', 'w'); }
  const mem = rec.blob;
  const saved = await ctx.files.add(rec);
  let rr = saved && ctx.files.reread ? await ctx.files.reread(rec) : false, ok = null;
  if (rr && bytes) {
    ok = await sameCopy(rec.blob, bytes);
    if (ok === false) {
      ctx.log('копия на устройстве не совпала с файлом — сохраняется заново', 'w');
      rec.blob = mem;
      await ctx.files.save(rec);
      rr = await ctx.files.reread(rec);
      ok = rr ? await sameCopy(rec.blob, bytes) : null;
      if (ok !== true) { rec.blob = mem; rr = false; ctx.log('копия снова не совпала — файл открыт из памяти; после перезапуска может не открыться', 'w'); }
    }
  }
  return { saved, rr, ok };
}

// Файлы с устройства (можно сразу несколько): все сохраняются, открывается первый
async function onFile(e) {
  const list = [...e.target.files];
  e.target.value = '';
  if (!list.length) return;
  const song = ctx.song();
  let first = null, lost = false;
  for (const f of list) {
    const rec = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8), kind: 'tab', name: f.name.replace(/\.[^.]+$/, ''), ext: (/\.([^.]+)$/.exec(f.name) || [])[1] || '', size: f.size, type: f.type,
      fmt: /\.pdf$/i.test(f.name) || f.type === 'application/pdf' || (await sniffPdf(f)) ? 'pdf' : 'score',
      songs: song ? [song.id] : [], created: Date.now(), blob: f };
    const { saved, rr, ok } = await storeFile(rec, f);
    ctx.log('загрузка: ' + mbOf(f.size) + ', тип ' + (f.type || 'нет') + ', формат ' + rec.fmt + (saved ? ', сохранён' : ', НЕ сохранён') + (rr ? ', читается из копии' : '') +
      (ok === true ? ', копия сверена' : ok === false ? ', копия НЕ совпала' : ''), saved && ok !== false ? 'i' : 'w');
    if (!saved) lost = true;
    first = first || rec;
    if (!ctx) return;
  }
  if (lost) ctx.ui.toast(ctx.t('notSaved'));
  st().sec = 'tabs';
  ctx.store.save();
  openTab(first);
}

function act(a, el) {
  const { t, ui } = ctx, x = el.dataset.id ? ctx.files.get(el.dataset.id) : null;
  switch (a) {
    case 'nsec': st().sec = el.dataset.v; ctx.store.save(); render(); break;
    case 'ntr': { const s = curSong(); if (s) { updCur({ tr: s.tr + +el.dataset.d }); render(); } break; }
    case 'nlib': libSheet(); break;
    case 'npick': st().textPick = { id: el.dataset.id, sess: (ctx.session && ctx.session.songId) || null }; ctx.store.save(); render(); break;
    case 'nfs': st().fs = Math.max(11, Math.min(40, (st().fs || 15) + +el.dataset.d)); ctx.store.save(); render(); break;
    case 'nedit': lyricsEdit(); break;
    case 'nkey': keySheet(); break;
    case 'nview': st().view = viewOf() === 'degrees' ? 'chords' : 'degrees'; ctx.store.save(); render(); break;
    case 'tadd': addFile(); break;
    case 'topen': if (x) openTab(x); break;
    case 'tdel':
      if (x) ui.confirm(t('delTitle', { name: x.name }), t('delText'), t('delete')).then((ok) => {
        if (!ok) return;
        ctx.files.remove(x.id);
        if (AT.cur && AT.cur.id === x.id) { if (PDF.rec === x) closePdf(); else if (ATP.sf) AT.api.stop(); AT.cur = null; AT.state = 'idle'; }
        render();
      });
      break;
    case 'tlist': tabSheet(); break;
    case 'pzoom': if (PDF.view) PDF.view.zoomBy(+el.dataset.d); break;
    case 'pfit': if (PDF.view) PDF.view.fit(); break;
    case 'pgo': if (PDF.view) PDF.view.go(PDF.page + +el.dataset.d); break;
    case 'pfull': pdfFull(true); break;
    case 'pfull0': pdfFull(false); break;
    case 'ttrack': setTrack(+el.dataset.i); render(); break;
    case 'tzoom': st().scale = Math.max(0.5, Math.min(2, Math.round((st().scale + +el.dataset.d * 0.1) * 10) / 10)); ctx.store.save(); restyle(); break;
    case 'tprof': st().prof = st().prof === 'both' ? 'tab' : 'both'; ctx.store.save(); restyle(); render(); break;
    case 'atplay': togglePlay(); break;
    case 'atstop': if (AT.api && ATP.sf) AT.api.stop(); ATP.want = false; break;
    case 'atspd': {
      const d = +el.dataset.d;
      ATP.speed = d === 0 ? 1 : Math.max(0.25, Math.min(1.5, Math.round((ATP.speed + d * 0.1) * 100) / 100));
      if (AT.api && ATP.sf) AT.api.playbackSpeed = ATP.speed;
      render();
      break;
    }
    case 'atmet': ATP.metro = !ATP.metro; if (AT.api && ATP.sf) AT.api.metronomeVolume = ATP.metro ? 1 : 0; render(); break;
  }
}

/* ---------- манифест ---------- */

export default {
  id: 'notes',
  order: 90,
  name: { ru: ru.name, uz: uz.name, en: en.name, el: el.name },
  i18n: { ru, uz, en, el },
  icon: ICON,
  color: '#A2845E',
  sizes: ['full', 'half', 'quarter', 'strip'],
  pure: true, // полный экран: только табы, ноты или текст (src/core/pure.js)
  onPure() { requestAnimationFrame(() => { render(); if (AT.beat) hlPlace(AT.beat, false); }); },
  status(c) {
    const n = c.files.list('tab').length;
    return n ? c.tn('tabs', n) : c.t('statusIdle');
  },
  // Перетаскивание файлов в окно (веб-версия на компьютере): какие файлы модуль берёт и что с ними делать
  accepts: (f) => f.type === 'application/pdf' || /\.(gp[3-8x]?|xml|musicxml|mxl|pdf)$/i.test(f.name),
  drop(fs) { if (host) onFile({ target: { files: fs } }); else dropped = fs; },
  mount(el, c, sz = 'full') {
    host = el; ctx = c; size = sz;
    input = document.createElement('input');
    input.type = 'file';
    input.accept = ACCEPT;
    input.multiple = true;
    input.hidden = true;
    input.addEventListener('change', onFile);
    if (dropped) { const fs = dropped; dropped = null; c.files.ready.then(() => { if (host) onFile({ target: { files: fs } }); }); }
    document.body.appendChild(input);
    const click = (e) => { const x = e.target.closest('[data-x]'); if (x) act(x.dataset.x, x); };
    host.addEventListener('click', click);
    offs.push(() => host.removeEventListener('click', click));
    // текст с аккордами: щипок двумя пальцами — размер шрифта (как кнопки A− и A+)
    offs.push(pinch(host, { min: 11, max: 40, ok: (e) => !!e.target.closest('.lyr'), get: () => st().fs || 15,
      set: (v, live) => { st().fs = v; const l = host.querySelector('.lyr'); if (l) l.style.fontSize = v + 'px'; if (!live) ctx.store.save(); } }));
    // Громкость табов — шина медиатеки
    offs.push(c.audio.mixer.subscribe(() => { if (AT.api && ATP.sf) AT.api.masterVolume = vol(); }));
    if (!ATP.probed) { ATP.probed = true; c.audio.mixer.probe('media', () => ATP.playing); }
    offs.push(c.files.subscribe(() => { if (!AT.cur || AT.state === 'error') render(); }));
    c.files.ready.then(() => {
      // последний открытый файл (табы или ноты) открывается сам, с того же места
      const last = !AT.cur && st().lastTab && c.files.get(st().lastTab);
      if (last && host) openTab(last); else render();
    });
    render();
  },
  resize(sz) { size = sz; render(); },
  // Окно закрыто: табулатура останавливается, сама поверхность остаётся для быстрого повторного открытия
  unmount() {
    offs.splice(0).forEach((f) => (typeof f === 'function' ? f() : null));
    if (input) { input.remove(); input = null; }
    if (AT.api && ATP.sf && !ctx.session) AT.api.pause();
    if (AT.el) AT.el.remove();
    if (PDF.full) pdfFull(false);
    if (PDF.view) { savePdfPos(); PDF.view.el.remove(); }
    host = null;
  },
};
