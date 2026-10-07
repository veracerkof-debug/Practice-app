// Табы и ноты, текст: табулатуры Guitar Pro / MusicXML (alphaTab, локально) с воспроизведением (SONiVOX),
// ноты и табы в PDF (pdf.js, локально), текст песни с аккордами и транспонированием. Перенесено из legacy/practice.html (AT, ATP, notesHTML, tabSheet, lyricsEdit).
import './notes.css';
import ru from './i18n/ru.json';
import uz from './i18n/uz.json';
import en from './i18n/en.json';
import { fileSongs, inSong } from '../../core/files.js';
import { lyricsHTML, chordsIn } from '../../music/lyrics.js';
import { detectKey, parseNote, shiftKey, keyLabel, shiftTo } from '../../music/transpose.js';
import { isPdf, openPdf, createPdfView } from './pdf.js';
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

let host = null, ctx = null, size = 'full', input = null, offs = [];
const st = () => ctx.store.all();
const tabs = () => ctx.files.list('tab');
const icb = (...a) => ctx.ui.icb(...a);
const esc = (s) => ctx.ui.esc(s);
const big = () => size === 'full' || size === 'half';

/* ---------- alphaTab: один экземпляр на приложение ---------- */

const AT = { lib: null, api: null, el: null, cur: null, score: null, track: 0, state: 'idle' };
const ATP = { on: false, sf: false, playing: false, speed: 1, metro: false, err: false, timer: 0 };

// Библиотека грузится только при открытии табулатуры (отдельный кусок сборки)
const loadLib = () => AT.lib || (AT.lib = import('@coderline/alphatab').catch((e) => { AT.lib = null; throw e; }));
const prof = (at) => (st().prof === 'both' ? at.StaveProfile.ScoreTab : at.StaveProfile.Tab);

/* ---------- PDF: один просмотр на приложение (как и alphaTab) ---------- */

const PDF = { view: null, rec: null, page: 1, pages: 0, zoom: 1, saveT: 0 };

// Страница и масштаб запоминаются в записи файла — при следующем открытии с того же места
function savePdfPos() {
  const r = PDF.rec;
  if (!r || !ctx) return;
  r.pos = { page: PDF.page, zoom: PDF.zoom };
  ctx.files.save(r);
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

async function openPdfRec(rec) {
  closePdf();
  AT.cur = rec;
  AT.state = 'loading';
  render();
  let doc;
  try { doc = await openPdf(rec.blob); } catch { AT.state = 'error'; render(); if (ctx) ctx.ui.toast(ctx.t('openFail')); return; }
  if (AT.cur !== rec) { doc.destroy(); return; }
  const pos = rec.pos || {};
  PDF.rec = rec;
  PDF.view = createPdfView(doc, {
    page: pos.page || 1, zoom: pos.zoom || 1,
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
  if (isPdf(rec)) { openPdfRec(rec); return; }
  closePdf();
  AT.state = 'loading';
  AT.cur = rec;
  AT.score = null;
  render();
  let at;
  try { at = await loadLib(); } catch { AT.state = 'error'; render(); ctx && ctx.ui.toast(ctx.t('libFail')); return; }
  if (!AT.api) {
    AT.el = document.createElement('div');
    AT.el.className = 'atsurf';
    attach();
    AT.api = new at.AlphaTabApi(AT.el, {
      core: { smuflFontSources: new Map([[at.FontFileFormat.Woff2, BRAVURA]]) },
      player: { enablePlayer: false },
      display: { scale: st().scale, layoutMode: at.LayoutMode.Page, staveProfile: prof(at) },
    });
    AT.api.scoreLoaded.on((sc) => { AT.score = sc; AT.track = 0; AT.state = 'ready'; render(); });
    AT.api.error.on(() => { AT.state = 'error'; render(); if (ctx) ctx.ui.toast(ctx.t('openFail')); });
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
      api.masterVolume = vol();
      api.playbackSpeed = ATP.speed;
      api.metronomeVolume = ATP.metro ? 1 : 0;
      api.play();
      render();
    });
    api.playerStateChanged.on((e) => {
      ATP.playing = e.state === 1;
      const b = host && host.querySelector('#atplay');
      if (b) b.innerHTML = ATP.playing ? I.pause : I.play;
    });
    const s = api.settings;
    s.player.enablePlayer = true;
    s.player.enableCursor = true;
    s.player.enableAnimatedBeatCursor = true;
    s.player.enableUserInteraction = true;
    s.player.soundFont = SONIVOX;
    const sc = host && host.querySelector('#atSlot');
    if (sc) s.player.scrollElement = sc;
    api.updateSettings();
    api.render();
  } catch { ATP.err = true; }
  ATP.timer = setTimeout(() => { if (!ATP.sf) { ATP.err = true; render(); if (ctx) ctx.ui.toast(ctx.t('sfFail')); } }, 15000);
}

function togglePlay() {
  if (!AT.api || !AT.score) return;
  if (!ATP.on) { playerSetup(); ctx.ui.toast(ctx.t('sfLoading')); render(); return; }
  if (!ATP.sf) return;
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
  const note = ATP.err ? '<span class="l2" style="font-size:12px">' + t('playNA') + '</span>' : ATP.on && !ATP.sf ? '<span class="l2" style="font-size:12px">' + t('sfLoadingShort') + '</span>' : '';
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
      '<div class="pdfwrap" id="pdfSlot">' + (AT.state === 'loading' ? '<div class="atload l2">' + t('opening') + '</div>' : '') + '</div>';
  }
  const tr = AT.score ? AT.score.tracks : [];
  return '<div class="ntools">' + icb('data-x="tlist"', I.list, t('tabFiles'), 'sm') +
    (tr.length > 1
      ? '<div class="chips nowrap sgrow">' + tr.map((x, i) => '<button class="chip' + (i === AT.track ? ' on' : '') + '" data-x="ttrack" data-i="' + i + '">' + esc(x.name || t('trackN', { n: i + 1 })) + '</button>').join('') + '</div>'
      : '<span class="sgrow aname" style="text-align:left">' + esc(AT.cur.name) + '</span>') +
    icb('data-x="tzoom" data-d="-1"', I.minus, t('smaller'), 'sm') + icb('data-x="tzoom" data-d="1"', I.plus, t('bigger'), 'sm') +
    '<button class="ic txt sm' + (st().prof === 'both' ? ' act' : '') + '" data-x="tprof" aria-pressed="' + (st().prof === 'both') + '" aria-label="' + t('scoreTab') + '">♪+T</button></div>' +
    (big() ? barHTML() : '') + '<div class="atwrap" id="atSlot">' + (AT.state === 'loading' ? '<div class="atload l2">' + t('opening') + '</div>' : '') + '</div>';
}

// Исходная тональность песни: из карточки песни, иначе — по аккордам текста
function songKey(song) {
  const k = song.key && parseNote(song.key);
  if (k) return { pc: k.pc, minor: /m$/.test(song.key), sharp: k.acc > 0 ? true : k.acc < 0 ? false : null, given: true };
  return detectKey(chordsIn(song.notes));
}

function textBody() {
  const { t } = ctx, song = ctx.song();
  if (!song) return '<div class="vq l2" style="font-size:14px">' + t('textNeedsSong') + '</div>';
  const n = song.tr, key = songKey(song);
  const keyBtn = key ? '<button class="trkey num" data-x="nkey" aria-label="' + esc(t('tr.pick')) + '">' + esc(keyLabel(key)) + (n ? ' → <b>' + esc(keyLabel(shiftKey(key, n))) + '</b>' : '') + '</button>' : '';
  return '<div class="ntools"><div class="vrow tight">' + icb('data-x="ntr" data-d="-1"', I.minus, t('trDown'), 'sm') + '<span class="num trv">' + (n > 0 ? '+' : '') + n + '</span>' +
    icb('data-x="ntr" data-d="1"', I.plus, t('trUp'), 'sm') + keyBtn + '</div>' +
    (big() ? '<div class="vrow tight">' + icb('data-x="nfs" data-d="-1"', 'A−', t('smaller'), 'sm txt') + icb('data-x="nfs" data-d="1"', 'A+', t('bigger'), 'sm txt') + icb('data-x="nedit"', I.pen, t('editText'), 'sm') + '</div>' : '') + '</div>' +
    (song.notes
      ? '<div class="lyr" style="font-size:' + (st().fs || 15) + 'px">' + lyricsHTML(song.notes, n, key) + '</div>'
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
  return '<div class="comp ' + size + '">' + (big() ? sw : '<div class="csw"><button class="cswb on txt" data-x="nsec" data-v="tabs" aria-label="' + t('toTabs') + '">' + t('textShort') + ' ›</button></div>') +
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
  const { t, ui } = ctx, song = ctx.song(), key = song && songKey(song);
  if (!key) return;
  const opts = Array.from({ length: 12 }, (_, i) => { const d = shiftTo(key, (key.pc + i) % 12); return { d, label: keyLabel(shiftKey(key, d)) }; }).sort((a, b) => a.d - b.d);
  ui.sheet(() => ui.snav(t('tr.key')) + '<p class="ftr" style="margin-top:0">' + esc(t(key.given ? 'tr.fromSong' : 'tr.fromChords', { k: keyLabel(key) })) + '</p>' +
    '<div class="group"><div class="cellcol trgrid">' + opts.map((o) => '<button type="button" class="pill num" data-trd="' + o.d + '" aria-pressed="' + (o.d === song.tr) + '">' + esc(o.label) +
      '<small>' + (o.d > 0 ? '+' : '') + o.d + '</small></button>').join('') + '</div></div>' +
    '<p class="ftr">' + t('tr.hint') + '</p>',
  (el, sh) => el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-trd]');
    if (!b) return;
    ctx.updateSong({ tr: +b.dataset.trd });
    sh.close();
    render();
  }));
}

function lyricsEdit() {
  const { t, ui } = ctx, song = ctx.song();
  if (!song) return;
  ui.sheet(() => ui.snav(t('sec.text'), { left: '<button class="link l" data-close>' + t('cancel') + '</button>', right: '<button class="link b r" id="lsave">' + t('save') + '</button>' }) +
    '<div class="group"><textarea class="ta" id="lta" style="min-height:52vh" aria-label="' + t('sec.text') + '" placeholder="' + esc(t('textPh')) + '">' + esc(song.notes) + '</textarea></div><p class="ftr">' + t('textHint') + '</p>',
  (el, sh) => el.querySelector('#lsave').addEventListener('click', () => {
    ctx.updateSong({ notes: el.querySelector('#lta').value });
    sh.close();
    render();
  }));
}

/* ---------- действия ---------- */

async function addFile() {
  if (await ctx.confirmUpload()) input.click();
}

async function onFile(e) {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  const song = ctx.song();
  const rec = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8), kind: 'tab', name: f.name.replace(/\.[^.]+$/, ''), size: f.size, type: f.type,
    fmt: /\.pdf$/i.test(f.name) || f.type === 'application/pdf' ? 'pdf' : 'score',
    songs: song ? [song.id] : [], created: Date.now(), blob: f };
  if (!(await ctx.files.add(rec))) ctx.ui.toast(ctx.t('notSaved'));
  st().sec = 'tabs';
  ctx.store.save();
  openTab(rec);
}

function act(a, el) {
  const { t, ui } = ctx, x = el.dataset.id ? ctx.files.get(el.dataset.id) : null;
  switch (a) {
    case 'nsec': st().sec = el.dataset.v; ctx.store.save(); render(); break;
    case 'ntr': { const s = ctx.song(); if (s) { ctx.updateSong({ tr: s.tr + +el.dataset.d }); render(); } break; }
    case 'nfs': st().fs = Math.max(11, Math.min(26, (st().fs || 15) + +el.dataset.d)); ctx.store.save(); render(); break;
    case 'nedit': lyricsEdit(); break;
    case 'nkey': keySheet(); break;
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
    case 'atstop': if (AT.api && ATP.sf) AT.api.stop(); break;
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
  name: { ru: ru.name, uz: uz.name, en: en.name },
  i18n: { ru, uz, en },
  icon: ICON,
  color: '#A2845E',
  sizes: ['full', 'half', 'quarter', 'strip'],
  status(c) {
    const n = c.files.list('tab').length;
    return n ? c.tn('tabs', n) : c.t('statusIdle');
  },
  mount(el, c, sz = 'full') {
    host = el; ctx = c; size = sz;
    input = document.createElement('input');
    input.type = 'file';
    input.accept = ACCEPT;
    input.hidden = true;
    input.addEventListener('change', onFile);
    document.body.appendChild(input);
    const click = (e) => { const x = e.target.closest('[data-x]'); if (x) act(x.dataset.x, x); };
    host.addEventListener('click', click);
    offs.push(() => host.removeEventListener('click', click));
    // Громкость табов — шина медиатеки
    offs.push(c.audio.mixer.subscribe(() => { if (AT.api && ATP.sf) AT.api.masterVolume = vol(); }));
    if (!ATP.probed) { ATP.probed = true; c.audio.mixer.probe('media', () => ATP.playing); }
    offs.push(c.files.subscribe(() => { if (!AT.cur || AT.state === 'error') render(); }));
    c.files.ready.then(render);
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
