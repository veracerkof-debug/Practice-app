// Студия — своя вкладка внизу (не инструмент), по форме FL Studio Mobile: плейлист на весь экран (playlist.js —
// линейка тактов, колонка дорожек, клипы на таймлайне; жестами: перенос, длина, обрезка, меню), внизу полоса
// транспорта (проекты, микшер, настройки | в начало, играть, темп, клик | отмена, помощь).
// Касание клипа — редактор на всё окно: ударные — шаговый секвенсор (steps.js), ноты — пиано-ролл (roll.js),
// аккорды — такты с аккордами (chords.js), запись — выбор файла. В редакторе играет этот клип по кругу.
// Проект — src/music/project.js, звук — src/audio/sequencer.js. Сохраняется после каждой правки (ctx.projects),
// отмена — по снимкам проекта. Экспорт — .mid (в медиатеку и для DAW) и MusicXML.
import './studio.css';
import ru from './i18n/ru.json';
import uz from './i18n/uz.json';
import en from './i18n/en.json';
import el from './i18n/el.json';
import { newProject, newTrack, newData, normalizeProject, normalizeData, INSTRUMENTS, COLORS, GRIDS, BARS_MAX, projectEvents, songBars, addClip, dupClip, removeClip, splitClip, clipById, trackOf, clipsOf, dataBeats, isEmptyProject, projectTracks } from '../../music/project.js';
import { createSequencer } from '../../audio/sequencer.js';
import { createRoll } from './roll.js';
import { createPlaylist } from './playlist.js';
import { chordsHTML, chordsAct, chordHold } from './chords.js';
import { stepsHTML, stepsBar, stepsPos, stepsGestures } from './steps.js';
import { writeMidi, writeMidiTracks, takeDur } from '../../music/midi.js';
import { projectXML } from '../../music/musicxml.js';
import { onHold, holdMenu } from '../../ui/hold.js';
import { keyLabel } from '../../music/transpose.js';

const ICON = '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="4" height="4" rx="1"/><rect x="10" y="4" width="4" height="4" rx="1"/><rect x="17" y="4" width="4" height="4" rx="1"/><rect x="3" y="11" width="4" height="4" rx="1"/><rect x="17" y="11" width="4" height="4" rx="1"/><rect x="3" y="18" width="18" height="2.5" rx="1"/></svg>';
const I = {
  play: '<svg viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z" style="fill:currentColor"/></svg>',
  stop: '<svg viewBox="0 0 24 24"><rect x="6.5" y="6.5" width="11" height="11" rx="2" style="fill:currentColor"/></svg>',
  rewind: '<svg viewBox="0 0 24 24"><path d="M7 6v12M18 6l-9 6 9 6z" style="fill:currentColor"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M14.5 6l-6 6 6 6"/></svg>',
  list: '<svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h10"/></svg>',
  share: '<svg viewBox="0 0 24 24"><path d="M12 15V4M8 7.5 12 3.5l4 4M6 11H5v9h14v-9h-1"/></svg>',
  mute: '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9l5 6M21 9l-5 6"/></svg>',
  vol: '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/></svg>',
  click: '<svg viewBox="0 0 24 24"><path d="M9 4h6l3 16H6zM12 17V8M12 8l5-3"/></svg>',
  undo: '<svg viewBox="0 0 24 24"><path d="M8 7H4v4"/><path d="M4.5 10.5A8 8 0 1 1 6 17"/></svg>',
  pen: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
  del: '<svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13"/></svg>',
  copy: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  help: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.5V14M12 17h.01"/></svg>',
  up: '<svg viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>',
  solo: '<svg viewBox="0 0 24 24"><path d="M7 9h10M7 15h10M9 5l-1 14M16 5l-1 14"/></svg>',
  cut: '<svg viewBox="0 0 24 24"><circle cx="7" cy="17" r="3"/><circle cx="17" cy="17" r="3"/><path d="M9.5 15 19 4M14.5 15 5 4"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2.5v2.6M12 18.9v2.6M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M2.5 12h2.6M18.9 12h2.6M4.6 19.4l1.8-1.8M17.6 6.4l1.8-1.8"/></svg>',
  mixer: '<svg viewBox="0 0 24 24"><path d="M6 4v16M12 4v16M18 4v16"/><circle cx="6" cy="14" r="2.5" style="fill:currentColor"/><circle cx="12" cy="8" r="2.5" style="fill:currentColor"/><circle cx="18" cy="16" r="2.5" style="fill:currentColor"/></svg>',
  file: '<svg viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/></svg>',
};
const UNDO_MAX = 40;

let host = null, ctx = null, size = 'full', seq = null, roll = null, pl = null, offs = [], raf = 0, offSteps = null;
// экран: { view: 'list' | 'song' | 'clip', pid, cid, bar }; отмена: снимки проекта (JSON) до каждой правки
const V = { view: 'list', pid: null, cid: null, bar: 0 };
const undo = { pid: null, last: '', stack: [] };
const st = () => ctx.store.all();
const grid = () => (GRIDS.includes(st().grid) ? st().grid : 0.5);
const proj = () => (V.pid ? ctx.projects.get(V.pid) : null);
const clip = () => { const p = proj(); return p && V.cid ? clipById(p, V.cid) : null; };
const ctrack = () => { const p = proj(), c = clip(); return p && c ? trackOf(p, c) : null; };
const snap = (p) => JSON.stringify(p, (k, v) => (k === 'updatedAt' ? undefined : v));
// Сохранить проект; прежнее состояние — в стопку отмены (новый проект — стопка с нуля)
function save() {
  const p = proj();
  if (!p) return;
  if (undo.pid !== p.id) { undo.pid = p.id; undo.stack = []; undo.last = ''; }
  const now = snap(p);
  if (undo.last && undo.last !== now) { undo.stack.push(undo.last); if (undo.stack.length > UNDO_MAX) undo.stack.shift(); }
  undo.last = now;
  ctx.projects.save(p);
  const u = host && host.querySelector('[data-x="undo"]'); if (u) u.disabled = !undo.stack.length;
}
function undoStep() {
  const p = proj();
  if (!p || undo.pid !== p.id || !undo.stack.length) return;
  const prev = JSON.parse(undo.stack.pop());
  prev.createdAt = p.createdAt;
  undo.last = snap(prev);
  ctx.projects.save(normalizeProject(prev));
  if (V.cid && !clip()) { V.view = 'song'; V.cid = null; }
  render();
}
const trName = (tr) => tr.name || ctx.t('tr.' + tr.kind) + ' ' + (proj().tracks.filter((t) => t.kind === tr.kind).indexOf(tr) + 1);
const fileName = (id) => { const r = id && ctx.files.get(id); return r ? r.name : ctx.t('tr.noFile'); };
const filePeaks = (id) => { const r = id && ctx.files.get(id); if (!r || !r.peaks || !r.peaks.length) return null; const a = Float32Array.from(r.peaks); a.dur = r.dur || 1; return a; };
const instName = (id) => ctx.t('inst.' + id);
// Элемент-якорь для меню в точке касания холста (удаляется при следующей перерисовке)
function anchorAt(x, y) {
  const a = document.createElement('span');
  a.className = 'stanchor'; a.style.left = x + 'px'; a.style.top = y + 'px';
  document.body.appendChild(a);
  setTimeout(() => a.remove(), 60000);
  return a;
}

/* ---------- разметка ---------- */

function listHTML() {
  const { t, ui } = ctx, L = ctx.projects.list().sort((a, b) => b.updatedAt - a.updatedAt);
  return '<div class="stlist"><div class="sthdr"><h2>' + ui.esc(t('name')) + '</h2>' + ui.icb('data-x="help"', I.help, t('help.open'), 'sm') + '</div>' +
    (L.length ? '<div class="group">' + L.map((p) => '<button class="cell stproj" data-open="' + p.id + '"><span class="grow"><b>' + ui.esc(p.name || t('untitled')) + '</b><span class="bksub">' +
      ui.esc(p.bpm + ' bpm · ' + keyLabel(p.key) + ' · ' + ctx.tn('tracks', p.tracks.length) + ' · ' + ctx.tn('bars', songBars(p))) + '</span></span>' + ui.icons.chev + '</button>').join('') + '</div>' : '<p class="ftr">' + ui.esc(t('empty')) + '</p>') +
    '<div class="group" style="margin-top:14px"><button class="cell act center b" data-x="new">' + ui.esc(t('new')) + '</button></div></div>';
}
// Полоса транспорта внизу (как в FL Studio Mobile): проекты, микшер, настройки | в начало, играть, темп, клик | отмена, помощь
function transportHTML(p) {
  const { t, ui } = ctx, playing = seq && seq.playing;
  return '<div class="sttop">' +
    '<div class="stgrp">' + ui.icb('data-x="back"', I.list, t('toList'), 'sm plain') + ui.icb('data-x="mixer"', I.mixer, t('mixer'), 'sm plain') + ui.icb('data-x="settings"', I.gear, t('settings'), 'sm plain') + '</div>' +
    '<div class="stgrp mid">' + ui.icb('data-x="rewind"', I.rewind, t('rewind'), 'sm plain') +
    '<button class="stplay' + (playing ? ' on' : '') + '" data-x="play" aria-label="' + ui.esc(t(playing ? 'stop' : 'play')) + '">' + (playing ? I.stop : I.play) + '</button>' +
    '<button class="stinfo" data-x="settings" aria-label="' + ui.esc(t('settings')) + '"><b class="num">' + p.bpm + '</b><span>' + ui.esc(keyLabel(p.key) + ' · ' + p.num + '/' + p.den) + '</span><i class="num" id="stpos">1.1</i></button>' +
    ui.icb('data-x="click"', I.click, t('click'), 'sm plain' + (seq && seq.click ? ' on' : '')) + '</div>' +
    '<div class="stgrp">' + ui.icb('data-x="undo"' + (undo.pid === p.id && undo.stack.length ? '' : ' disabled'), I.undo, t('undo'), 'sm plain') + '</div></div>';
}
// Шапка редактора клипа: назад, дорожка · такты куска (−/+), сетка (ноты), файл (запись)
function clipHeadHTML(p, c, tr) {
  const { t, ui } = ctx, d = c.data;
  const stepper = tr.kind === 'audio' ? '' : '<span class="stepper" role="group" aria-label="' + ui.esc(t('clip.bars')) + '"><button type="button" data-cb="-1" aria-label="' + ui.esc(t('clip.bars') + ' −') + '">−</button><b class="num stv">' + d.bars + '</b><button type="button" data-cb="1" aria-label="' + ui.esc(t('clip.bars') + ' +') + '">+</button></span>';
  return '<div class="sthead" style="--c:' + tr.color + '">' + ui.icb('data-x="toSong"', I.back, t('toSong'), 'sm plain') + '<i class="sttrdot"></i><button class="grow sttitle" data-x="trackMenu"><b>' + ui.esc(trName(tr)) + '</b><span>' + ui.esc((tr.kind === 'audio' ? fileName(d.fileId) + ' · ' : tr.kind === 'drums' ? '' : instName(tr.inst) + ' · ') + ctx.tn('bars', Math.round(c.len / p.num * 10) / 10)) + '</span></button>' +
    stepper + (tr.kind === 'notes' ? ui.seg('stgrid', [['1', '♩'], ['0.5', '♪'], ['0.25', '♬']], String(grid()), t('grid')) : '') +
    (tr.kind === 'audio' ? ui.icb('data-x="pickFile"', I.file, t('tr.pickFile'), 'sm plain') : '') + '</div>';
}
function view() {
  const p = proj();
  if (!p || V.view === 'list') return listHTML();
  const c = V.view === 'clip' && clip(), tr = c && ctrack();
  if (c && tr) {
    const body = tr.kind === 'drums' ? stepsHTML(ctx, p, c.data, V.bar, tr.color) : tr.kind === 'chords' ? chordsHTML(ctx, p, tr, c.data) : tr.kind === 'notes' ? '<div class="stroll" id="stroll"></div>' :
      '<div class="staudio"><div class="group"><button class="cell" data-x="pickFile"><span class="grow">' + ctx.ui.esc(fileName(c.data.fileId)) + '<span class="bksub">' + ctx.ui.esc(ctx.t('tr.pickFile')) + '</span></span>' + ctx.ui.icons.chev + '</button></div><p class="ftr">' + ctx.ui.esc(ctx.t('tr.audioHint')) + '</p></div>';
    return '<div class="stwrap">' + clipHeadHTML(p, c, tr) + body + transportHTML(p) + '</div>';
  }
  return '<div class="stwrap"><div class="stpl" id="stpl"></div>' + transportHTML(p) + '</div>';
}

function render() {
  if (!host) return;
  if (roll) { roll.destroy(); roll = null; }
  if (pl) { pl.destroy(); pl = null; }
  if (offSteps) { offSteps(); offSteps = null; }
  document.querySelectorAll('.stanchor').forEach((a) => a.remove());
  host.innerHTML = view();
  const p = proj();
  if (seq) seq.focus = V.view === 'clip' && clip() ? V.cid : null;
  const rh = host.querySelector('#stroll');
  if (rh) {
    roll = createRoll(rh, () => { const c = clip(); return { p: proj(), total: dataBeats(proj(), c.data), tr: ctrack(), d: c.data, grid: grid() }; }, { change: () => save(), audition: (m) => seq.audition(ctrack(), m) });
    rh.addEventListener('contextmenu', (e) => e.preventDefault());
    if (V.bar) roll.follow(V.bar * p.num);
  }
  const rk = host.querySelector('.rack');
  if (rk) offSteps = stepsGestures(rk, () => clip().data, { change: () => save(), audition: (lane) => seq.audition(ctrack(), lane) });
  const ph = host.querySelector('#stpl');
  if (ph) {
    pl = createPlaylist(ph, () => ({ p: proj(), names: trName, fileName, peaks: filePeaks }), {
      open: (c) => openClip(c),
      menu: (c, x, y) => clipMenu(anchorAt(x, y), c),
      track: (tr, x, y) => trackMenu(anchorAt(x, y), tr),
      addTrack: (x, y) => addTrackMenu(anchorAt(x, y)),
      create: (tr, beat) => createClip(tr, beat),
      seek: (beat) => { if (seq.playing) seq.start(beat); },
      change: () => save(),
    });
    pl.select(V.cid);
  }
  tickPos();
}
// Ход: такт.доля в транспорте; плейлист — линия; секвенсор ударных — такт идёт сам, шаг подсвечен; ролл — линия
function tickPos() {
  cancelAnimationFrame(raf);
  if (!host || !seq) return;
  const p = proj(), el = host.querySelector('#stpos'), b = seq.pos();
  if (p && el) el.textContent = b < 0 ? '1.1' : (Math.floor(b / p.num) + 1) + '.' + (Math.floor(b % p.num) + 1);
  if (pl) { pl.pos(b); if (b >= 0) pl.follow(b); }
  if (V.view === 'clip' && clip()) {
    const per = dataBeats(p, clip().data), inData = b >= 0 && per ? b % per : -1;
    if (roll) { roll.pos(inData); if (inData >= 0) roll.follow(inData); }
    if (host.querySelector('.rack')) {
      if (inData >= 0) { V.bar = Math.floor(inData / p.num); stepsBar(host, V.bar); }
      stepsPos(host, inData >= 0 ? Math.floor(inData * 4) : -1);
    }
  }
  if (seq.playing) raf = requestAnimationFrame(tickPos);
}

/* ---------- настройки проекта, меню клипа и дорожки ---------- */

function settingsSheet() {
  const { t, ui } = ctx, p = proj();
  const NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
  const row = (lab, right) => '<div class="cell"><span class="grow">' + ui.esc(lab) + '</span>' + right + '</div>';
  const step = (k, v, lab) => '<span class="stepper"><button type="button" data-st="' + k + '" data-d="-1" aria-label="' + ui.esc(lab + ' −') + '">−</button><b class="num stv">' + v + '</b><button type="button" data-st="' + k + '" data-d="1" aria-label="' + ui.esc(lab + ' +') + '">+</button></span>';
  const body = () => ui.snav(t('settings')) +
    '<div class="group"><label class="cell"><input class="inp left" data-name maxlength="40" placeholder="' + ui.esc(t('nameHint')) + '" value="' + ui.esc(p.name) + '" aria-label="' + ui.esc(t('pname')) + '"></label></div>' +
    '<div class="hdr">' + ui.esc(t('tempo')) + '</div><div class="group">' + row(t('bpm'), step('bpm', p.bpm, t('bpm'))) + row(t('meter'), ui.seg('stnum', [['3', '3/4'], ['4', '4/4'], ['6', '6/8']], String(p.num), t('meter'))) +
    '<label class="cell"><span class="grow">' + ui.esc(t('swing')) + '<span class="bksub">' + ui.esc(t('swingHint')) + '</span></span><b class="num" style="min-width:4ch;text-align:right">' + Math.round(p.swing * 100) + '%</b></label><div class="cell"><input type="range" class="strange" min="0" max="1" step="0.05" value="' + p.swing + '" data-swing aria-label="' + ui.esc(t('swing')) + '"></div></div>' +
    '<div class="hdr">' + ui.esc(t('key')) + '</div><div class="hscroll" style="padding:0 4px">' + NAMES.map((n, pc) => '<button class="pill sm" data-key="' + pc + '" aria-pressed="' + (pc === p.key.pc) + '">' + n + '</button>').join('') + '</div>' +
    '<div class="group" style="margin-top:8px"><div class="cellcol">' + ui.seg('stmin', [['0', t('maj')], ['1', t('min')]], p.key.minor ? '1' : '0', t('key')) + '</div></div>' +
    '<div class="group" style="margin-top:16px"><button class="cell" data-x2="export"><span class="grow">' + ui.esc(t('export')) + '</span>' + ui.icons.chev + '</button><button class="cell danger center" data-delproj>' + ui.esc(t('delete')) + '</button></div>';
  ui.sheet(body, (el, sh) => {
    el.addEventListener('input', (e) => { if (e.target.matches('[data-name]')) { p.name = e.target.value; save(); } else if (e.target.matches('[data-swing]')) { p.swing = +e.target.value; p.updatedAt = Date.now(); } });
    el.addEventListener('change', (e) => { if (e.target.matches('[data-swing]')) { save(); sh.update(); } });
    el.addEventListener('click', (e) => {
      let b;
      if ((b = e.target.closest('[data-st]'))) { p.bpm = Math.max(20, Math.min(300, p.bpm + +b.dataset.d * (e.shiftKey ? 10 : 1))); save(); sh.update(); }
      else if ((b = e.target.closest('[data-seg="stnum"] [data-v]'))) { p.num = +b.dataset.v; p.den = p.num === 6 ? 8 : 4; normalizeProject(p); save(); sh.update(); }
      else if ((b = e.target.closest('[data-key]'))) { p.key.pc = +b.dataset.key; save(); sh.update(); }
      else if ((b = e.target.closest('[data-seg="stmin"] [data-v]'))) { p.key.minor = b.dataset.v === '1'; save(); sh.update(); }
      else if ((b = e.target.closest('[data-x2="export"]'))) { sh.close(); setTimeout(() => exportMenu(host.querySelector('.stinfo') || host), 200); }
      else if (e.target.closest('[data-delproj]')) ui.confirm(t('delTitle'), t('delText'), t('delete')).then((ok) => { if (!ok) return; seq.stop(); ctx.projects.remove(p.id); V.view = 'list'; V.pid = null; sh.close(); render(); });
    });
  }, { onClose: render });
}
// Меню клипа: править, повторить (копия следом), разрезать по курсору, запись — другой файл, убрать
function clipMenu(anchor, c) {
  const { t } = ctx, p = proj(), tr = trackOf(p, c), cur = pl ? pl.cursor : 0;
  holdMenu(anchor, [
    { icon: I.pen, label: t('clip.edit'), run: () => openClip(c) },
    { icon: I.copy, label: t('clip.dup'), run: () => { if (dupClip(p, c)) { save(); render(); } } },
    ...(cur > c.at && cur < c.at + c.len ? [{ icon: I.cut, label: t('clip.split'), run: () => { if (splitClip(p, c, cur, 1)) { save(); render(); } } }] : []),
    ...(tr.kind === 'audio' ? [{ icon: I.file, label: t('tr.pickFile'), run: () => filePicker(c) }] : []),
    { icon: I.del, label: t('clip.delete'), danger: true, run: () => { removeClip(p, c); if (V.cid === c.id) V.cid = null; save(); render(); } },
  ], trName(tr) + ' · ' + (Math.floor(c.at / p.num) + 1));
}
// Звук, октава, громкость, цвет и эффекты дорожки — одной шторкой
function trackSheet(tr) {
  const { t, ui } = ctx;
  // эффекты дорожки — общая панель приложения; правка слышна сразу (цепочка дорожки в секвенсоре), сохраняется при закрытии
  const pm = ctx.fxPanel({ get: () => tr.fx, set: (fx) => { if (seq) seq.setTrackFx(tr, fx); else tr.fx = fx; proj().updatedAt = Date.now(); return fx; } });
  let pmb = null;
  ui.sheet(() => ui.snav(trName(tr)) +
    '<div class="group"><label class="cell"><span class="grow">' + ui.esc(t('vol')) + '</span><b class="num" style="min-width:4ch;text-align:right">' + Math.round(tr.vol * 100) + '%</b></label><div class="cell"><input type="range" class="strange" style="accent-color:' + tr.color + '" min="0" max="1.5" step="0.01" value="' + tr.vol + '" data-vol aria-label="' + ui.esc(t('vol')) + '"></div></div>' +
    (tr.kind === 'drums' || tr.kind === 'audio' ? '' : '<div class="hdr">' + ui.esc(t('tr.inst')) + '</div><div class="group">' + INSTRUMENTS.map((id) => '<button class="cell" data-inst="' + id + '"><span class="grow">' + ui.esc(instName(id)) + '</span>' + (tr.inst === id ? ui.icons.check : '') + '</button>').join('') + '</div>' +
      '<div class="hdr">' + ui.esc(t('tr.oct')) + '</div><div class="group"><div class="cellcol">' + ui.seg('stoct', [['-1', '−1'], ['0', '0'], ['1', '+1']], String(tr.oct || 0), t('tr.oct')) + '</div></div>') +
    '<div class="hdr">' + ui.esc(t('tr.color')) + '</div><div class="stcolors">' + COLORS.map((c) => '<button class="stcol' + (tr.color === c ? ' on' : '') + '" data-col="' + c + '" style="--c:' + c + '" aria-label="' + c + '"></button>').join('') + '</div>' +
    '<div class="hdr">' + ui.esc(t('tr.fx')) + '</div>' + pm.html(),
  (el, sh) => {
    pmb = pm.bind(el, sh);
    el.addEventListener('input', (e) => { if (e.target.matches('[data-vol]')) { tr.vol = +e.target.value; proj().updatedAt = Date.now(); const b = el.querySelector('label b'); if (b) b.textContent = Math.round(tr.vol * 100) + '%'; } });
    el.addEventListener('change', (e) => { if (e.target.matches('[data-vol]')) save(); });
    el.addEventListener('click', (e) => { let b; if ((b = e.target.closest('[data-inst]'))) { tr.inst = b.dataset.inst; seq.audition(tr, 60); } else if ((b = e.target.closest('[data-seg="stoct"] [data-v]'))) tr.oct = +b.dataset.v; else if ((b = e.target.closest('[data-col]'))) tr.color = b.dataset.col; else return; save(); sh.update(); pmb && pmb.mount(); });
  }, { onClose: () => { save(); render(); } });
}
function trackMenu(anchor, tr) {
  const { t, ui } = ctx, p = proj(), i = p.tracks.indexOf(tr);
  const move = (d) => { const j = i + d; if (j < 0 || j >= p.tracks.length) return; p.tracks.splice(i, 1); p.tracks.splice(j, 0, tr); save(); render(); };
  holdMenu(anchor, [
    { icon: I.mute, label: t(tr.mute ? 'unmute' : 'mute'), run: () => { tr.mute = !tr.mute; save(); render(); } },
    { icon: I.solo, label: t(tr.solo ? 'soloOff' : 'solo'), run: () => { tr.solo = !tr.solo; save(); render(); } },
    { icon: I.vol, label: t('tr.sound'), run: () => trackSheet(tr) },
    { icon: I.pen, label: t('tr.rename'), run: () => ui.sheet(() => ui.snav(t('tr.rename')) + '<div class="group"><label class="cell"><input class="inp left" data-trn maxlength="30" value="' + ui.esc(tr.name) + '" placeholder="' + ui.esc(trName(tr)) + '" aria-label="' + ui.esc(t('tr.rename')) + '"></label></div>', (el) => { const inp = el.querySelector('[data-trn]'); setTimeout(() => inp.focus(), 80); inp.addEventListener('input', () => { tr.name = inp.value; save(); }); }, { onClose: render }) },
    ...(i > 0 ? [{ icon: I.up, label: t('tr.up'), run: () => move(-1) }] : []),
    ...(i < p.tracks.length - 1 ? [{ icon: I.down, label: t('tr.down'), run: () => move(1) }] : []),
    { icon: I.copy, label: t('tr.dup'), run: () => { const c = JSON.parse(JSON.stringify(tr)); c.id = newTrack().id; c.name = trName(tr) + ' 2'; p.tracks.splice(i + 1, 0, c); clipsOf(p, tr).forEach((cl) => { p.clips.push({ ...cl, id: newTrack().id.replace('tr', 'cl'), tr: c.id, data: JSON.parse(JSON.stringify(cl.data)) }); }); save(); render(); } },
    { icon: I.del, label: t('tr.delete'), danger: true, run: () => { p.tracks.splice(i, 1); p.clips = p.clips.filter((cl) => cl.tr !== tr.id); if (V.cid && !clip()) { V.view = 'song'; V.cid = null; } save(); render(); } },
  ], trName(tr));
}
function addTrackMenu(anchor) {
  const { t } = ctx, p = proj();
  holdMenu(anchor, ['drums', 'notes', 'chords', 'audio'].map((k) => ({ icon: I.plus, label: t('tr.' + k), run: () => { const tr = newTrack(k, p.tracks.length); p.tracks.push(tr); save(); render(); } })), t('tr.add'));
}

/* ---------- действия ---------- */

// Новый клип на дорожке в такте: кусок в 1 такт на 1 такт; запись — выбор файла; дальше — редактор
function createClip(tr, beat) {
  const p = proj(), c = addClip(p, tr, beat, p.num, newData(tr.kind, 1));
  if (!c) { ctx.ui.toast(ctx.t('clip.max')); return; }
  save();
  if (tr.kind === 'audio') { V.cid = c.id; render(); filePicker(c); } else openClip(c);
}
function openClip(c) { V.cid = c.id; V.view = 'clip'; V.bar = 0; render(); }
// Запись для клипа: аудио из медиатеки (сведение лупера — первым); длина клипа — по записи
function filePicker(c) {
  const { t, ui } = ctx, p = proj(), L = ctx.files.list('audio').slice().sort((a, b) => (b.created || 0) - (a.created || 0));
  ui.sheet(() => ui.snav(t('tr.pickFile')) + (L.length ? '<div class="group">' + L.map((r) => '<button class="cell" data-file="' + r.id + '"><span class="grow">' + ui.esc(r.name) + '<span class="bksub">' + (r.dur ? Math.round(r.dur) + ' s' : '') + '</span></span>' + (c.data.fileId === r.id ? ui.icons.check : '') + '</button>').join('') + '</div>'
    : '<p class="ftr">' + ui.esc(t('tr.noAudio')) + '</p>') + '<p class="ftr">' + ui.esc(t('tr.audioHint')) + '</p>',
  (el, sh) => el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-file]'); if (!b) return;
    const r = ctx.files.get(b.dataset.file);
    c.data.fileId = b.dataset.file; c.data.off = 0;
    if (r && r.dur) c.len = Math.max(p.num, Math.ceil(r.dur / (60 / p.bpm) / p.num - 1e-6) * p.num);
    save(); sh.close();
  }), { onClose: render });
}
// Экспорт песни целиком: для DAW, .mid в медиатеку, MusicXML в «Табы»
function exportMenu(anchor) {
  const { t } = ctx;
  holdMenu(anchor, [{ icon: I.share, label: t('exportDaw'), run: exportDaw }, { icon: I.share, label: t('exportMidi'), run: exportMidi }, { icon: I.share, label: t('exportXml'), run: exportXml }], t('export'));
}
async function exportDaw() {
  const { t } = ctx, p = proj();
  if (isEmptyProject(p)) { ctx.ui.toast(t('err.empty')); return; }
  let ch = 0;
  const tracks = projectTracks(p).map((tr) => ({ name: tr.name, ch: tr.drums ? 9 : (ch === 9 ? ch += 2 : ch++) % 16, program: tr.program, notes: tr.notes }));
  const name = (p.name || t('untitled')) + ' (DAW).mid', u8 = writeMidiTracks({ bpm: p.bpm, num: p.num, den: p.den, key: p.key, name: p.name || '', tracks });
  const ev = projectEvents(p), rec = { id: 'sd' + Date.now().toString(36), name, size: u8.length, type: 'audio/midi', songs: p.songId ? [p.songId] : [], created: Date.now(), blob: new Blob([u8], { type: 'audio/midi' }), kind: 'midi', tool: 'piano', take: { v: 1, ev }, dur: takeDur(ev) };
  try { await ctx.files.add(rec); } catch (e) { ctx.logErr(e); ctx.ui.toast(t('err.fail')); return; }
  const loops = p.clips.some((c) => c.data.fileId);
  ctx.ui.toast(t(loops ? 'exportedDawLoops' : 'exportedDaw'));
  try { await ctx.midi.share(rec); } catch { /* отменили */ }
}
async function exportXml() {
  const { t } = ctx, p = proj();
  if (isEmptyProject(p)) { ctx.ui.toast(t('err.empty')); return; }
  const xml = projectXML(p, { title: p.name || t('untitled'), trackName: trName }), name = p.name || t('untitled'), u8 = new TextEncoder().encode(xml);
  const rec = { id: 'sx' + Date.now().toString(36), kind: 'tab', name, ext: 'musicxml', size: u8.length, type: 'application/vnd.recordare.musicxml+xml', fmt: 'score', songs: p.songId ? [p.songId] : [], created: Date.now(), blob: new Blob([u8], { type: 'application/vnd.recordare.musicxml+xml' }) };
  try { await ctx.files.add(rec); ctx.ui.toast(t('exportedXml')); } catch (e) { ctx.logErr(e); ctx.ui.toast(t('err.fail')); }
}
async function exportMidi() {
  const { t } = ctx, p = proj(), ev = projectEvents(p);
  if (!ev.length) { ctx.ui.toast(t('err.empty')); return; }
  const name = (p.name || t('untitled')) + '.mid', u8 = writeMidi(ev, { name: p.name || '' }), blob = new Blob([u8], { type: 'audio/midi' });
  const rec = { id: 'st' + Date.now().toString(36), name, size: u8.length, type: 'audio/midi', songs: p.songId ? [p.songId] : [], created: Date.now(), blob, kind: 'midi', tool: 'piano', take: { v: 1, ev }, dur: takeDur(ev) };
  try { await ctx.files.add(rec); ctx.ui.toast(t('exported')); } catch (e) { ctx.logErr(e); ctx.ui.toast(t('err.fail')); }
  holdMenu(host.querySelector('.stinfo') || host, [{ icon: I.share, label: t('share'), run: () => ctx.midi.share(rec) }], name);
}

function act(x, el) {
  const p = proj();
  switch (x) {
    case 'new': { const np = newProject({ songId: ctx.session && ctx.session.songId || null }); ctx.projects.save(np); V.pid = np.id; V.view = 'song'; V.cid = null; V.bar = 0; render(); break; }
    case 'back': seq.stop(); V.view = 'list'; V.pid = null; V.cid = null; render(); break;
    case 'toSong': V.view = 'song'; render(); break;
    case 'play': if (!ctx.audio.unlock()) { ctx.ui.toast(ctx.t('err.sound')); return; } seq.toggle(V.view === 'song' && pl ? pl.cursor : 0); render(); break;
    case 'rewind': if (seq.playing) seq.start(0); else if (pl) { pl.cursor = 0; } tickPos(); break;
    case 'click': seq.click = !seq.click; render(); break;
    case 'undo': undoStep(); break;
    case 'settings': settingsSheet(); break;
    case 'mixer': if (ctx.openMixer) ctx.openMixer(); break;
    case 'help': if (ctx.help) ctx.help(); break;
    case 'trackMenu': trackMenu(el, ctrack()); break;
    case 'pickFile': { const c = clip(); if (c) filePicker(c); break; }
  }
}
function onClick(e) {
  const p = proj(), g = (s) => e.target.closest(s);
  let b;
  if ((b = g('[data-x]'))) { act(b.dataset.x, b); return; }
  if ((b = g('[data-open]'))) { V.pid = b.dataset.open; V.view = 'song'; V.cid = null; V.bar = 0; render(); return; }
  if (!p) return;
  if ((b = g('[data-rkbar]'))) { V.bar = +b.dataset.rkbar; stepsBar(host, V.bar); return; }
  if ((b = g('.rkname[data-lane]'))) { seq.audition(ctrack(), b.dataset.lane); return; }
  if ((b = g('[data-cb]'))) { // такты куска: длина клипа — не короче куска
    const c = clip(); if (!c) return;
    c.data.bars = Math.max(1, Math.min(BARS_MAX, c.data.bars + +b.dataset.cb)); c.data = normalizeData(p, ctrack(), c.data);
    const per = dataBeats(p, c.data); if (c.len < per) c.len = per;
    V.bar = Math.min(V.bar, c.data.bars - 1); save(); render(); return;
  }
  if ((b = g('[data-seg="stgrid"] [data-v]'))) { st().grid = +b.dataset.v; ctx.store.save(); render(); return; }
  const c = clip(), tr = ctrack();
  if (c && tr && tr.kind === 'chords' && chordsAct(ctx, p, tr, c.data, e, () => { save(); render(); })) return;
}

export default {
  id: 'studio',
  order: 47,
  name: { ru: ru.name, uz: uz.name, en: en.name, el: el.name },
  i18n: { ru, uz, en, el },
  icon: ICON,
  color: '#3E8C8C',
  tab: true, // своя вкладка внизу, не инструмент: в «Инструментах», быстром доступе и окнах сессии её нет
  sizes: ['full'],
  status(c) { const n = (c.projects ? c.projects.list() : []).length; return c.tn('projects', n); },
  mount(el, c, sz = 'full') {
    host = el; ctx = c; size = sz;
    if (!seq) seq = createSequencer({ mixer: c.audio.mixer, synth: c.audio.synth, getProject: proj, getFile: (id) => c.files.get(id) });
    (c.projects.list() || []).forEach(normalizeProject);
    if (V.pid && !proj()) { V.view = 'list'; V.pid = null; }
    if (V.view === 'clip' && !clip()) V.view = 'song';
    const on = (t, ev, fn) => { t.addEventListener(ev, fn); offs.push(() => t.removeEventListener(ev, fn)); };
    on(host, 'click', onClick);
    // удержания: название ряда ударных — очистить ряд; аккорд — убрать; проект в списке — удалить
    onHold(host, '.rkname[data-lane]', (el2) => { const cl = clip(); if (!cl) return; const lane = el2.dataset.lane; if (!cl.data.steps[lane]) return; holdMenu(el2, [{ icon: I.del, label: c.t('drum.clear'), danger: true, run: () => { delete cl.data.steps[lane]; save(); render(); } }], c.t('drum.' + lane)); });
    onHold(host, '.scch', (el2) => { const p = proj(), cl = clip(); if (cl) chordHold(ctx, p, cl.data, el2, () => { save(); render(); }); });
    onHold(host, '.stproj', (b) => { const id = b.dataset.open; holdMenu(b, [{ icon: I.del, label: c.t('delete'), danger: true, run: () => c.ui.confirm(c.t('delTitle'), c.t('delText'), c.t('delete')).then((ok) => { if (ok) { c.projects.remove(id); render(); } }) }], (c.projects.get(id) || {}).name || c.t('untitled')); });
    render();
  },
  resize(sz) { size = sz; render(); },
  // Вкладка закрыта: проигрывание останавливается (черновик — не фон для занятия)
  unmount() {
    cancelAnimationFrame(raf);
    if (seq) seq.stop();
    if (roll) { roll.destroy(); roll = null; }
    if (pl) { pl.destroy(); pl = null; }
    if (offSteps) { offSteps(); offSteps = null; }
    offs.splice(0).forEach((f) => f());
    document.querySelectorAll('.stanchor').forEach((a) => a.remove());
    host = null;
  },
};
