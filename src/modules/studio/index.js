// Студия — своя вкладка внизу (не инструмент), по форме FL Studio: сверху полоса транспорта (проекты, играть, темп,
// «паттерн | песня», клик, отмена), ряд паттернов, рэк каналов с шагами одного такта (rack.js: ударные — каждый барабан
// своим каналом, ноты и аккорды — заполненность шагов, касание — в редактор), внизу — плейлист: песня из паттернов лентой.
// Редакторы на всё окно: пиано-ролл (roll.js) и аккорды (chords.js). Проект — src/music/project.js, звук — src/audio/sequencer.js.
// Сохраняется после каждой правки (ctx.projects), отмена — по снимкам проекта. Экспорт — .mid (в медиатеку и для DAW) и MusicXML.
import './studio.css';
import ru from './i18n/ru.json';
import uz from './i18n/uz.json';
import en from './i18n/en.json';
import el from './i18n/el.json';
import { newProject, newTrack, normalizeProject, INSTRUMENTS, COLORS, GRIDS, BARS_MAX, projectEvents, curPattern, patById, cellOf, countOf, songList, songBeats, patBeats, addPattern, clonePattern, removePattern, songAdd, songRemoveAt, isEmptyProject, projectTracks, DRUMS } from '../../music/project.js';
import { createSequencer } from '../../audio/sequencer.js';
import { createRoll } from './roll.js';
import { chordsHTML, chordsAct, chordHold } from './chords.js';
import { rackHTML, rackBar, rackPos, rackGestures } from './rack.js';
import { writeMidi, writeMidiTracks, takeDur } from '../../music/midi.js';
import { projectXML } from '../../music/musicxml.js';
import { onHold, holdMenu, dragSort } from '../../ui/hold.js';
import { keyLabel } from '../../music/transpose.js';

const ICON = '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="4" height="4" rx="1"/><rect x="10" y="4" width="4" height="4" rx="1"/><rect x="17" y="4" width="4" height="4" rx="1"/><rect x="3" y="11" width="4" height="4" rx="1"/><rect x="17" y="11" width="4" height="4" rx="1"/><rect x="3" y="18" width="18" height="2.5" rx="1"/></svg>';
const I = {
  play: '<svg viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z" style="fill:currentColor"/></svg>',
  stop: '<svg viewBox="0 0 24 24"><rect x="6.5" y="6.5" width="11" height="11" rx="2" style="fill:currentColor"/></svg>',
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
};
const UNDO_MAX = 40;

let host = null, ctx = null, size = 'full', seq = null, roll = null, offs = [], raf = 0, offRack = null;
// экран: { view: 'list' | 'project' | 'track', pid, tid, bar }; отмена: снимки проекта (JSON) до каждой правки
const V = { view: 'list', pid: null, tid: null, bar: 0 };
const undo = { pid: null, last: '', stack: [] };
const st = () => ctx.store.all();
const grid = () => (GRIDS.includes(st().grid) ? st().grid : 0.5);
const proj = () => (V.pid ? ctx.projects.get(V.pid) : null);
const track = () => { const p = proj(); return p && V.tid ? p.tracks.find((t) => t.id === V.tid) || null : null; };
const trById = (id) => { const p = proj(); return p ? p.tracks.find((t) => t.id === id) || null : null; };
const pat = () => { const p = proj(); return p ? curPattern(p) : null; };
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
}
function undoStep() {
  const p = proj();
  if (!p || undo.pid !== p.id || !undo.stack.length) return;
  const prev = JSON.parse(undo.stack.pop());
  prev.createdAt = p.createdAt;
  undo.last = snap(prev);
  ctx.projects.save(normalizeProject(prev));
  if (V.tid && !track()) { V.view = 'project'; V.tid = null; }
  render();
}
const trName = (tr, i) => tr.name || ctx.t('tr.' + tr.kind) + ' ' + (i + 1);
const fileName = (id) => { const r = id && ctx.files.get(id); return r ? r.name : ctx.t('tr.noFile'); };
const instName = (id) => ctx.t('inst.' + id);
const small = () => size === 'quarter' || size === 'strip';

/* ---------- разметка ---------- */

function listHTML() {
  const { t, ui } = ctx, L = ctx.projects.list().sort((a, b) => b.updatedAt - a.updatedAt);
  return '<div class="stlist"><div class="sthdr"><h2>' + ui.esc(t('name')) + '</h2>' + ui.icb('data-x="help"', I.help, t('help.open'), 'sm') + '</div>' +
    (L.length ? '<div class="group">' + L.map((p) => '<button class="cell stproj" data-open="' + p.id + '"><span class="grow"><b>' + ui.esc(p.name || t('untitled')) + '</b><span class="bksub">' +
      ui.esc(p.bpm + ' bpm · ' + keyLabel(p.key) + ' · ' + ctx.tn('patternsN', p.patterns.length) + ' · ' + ctx.tn('bars', songBeats(p) / p.num)) + '</span></span>' + ui.icons.chev + '</button>').join('') + '</div>' : '<p class="ftr">' + ui.esc(t('empty')) + '</p>') +
    '<div class="group" style="margin-top:14px"><button class="cell act center b" data-x="new">' + ui.esc(t('new')) + '</button></div></div>';
}
// Полоса транспорта: проекты, играть, темп (касание — настройки), паттерн | песня, клик, отмена
function transportHTML(p) {
  const { t, ui } = ctx, playing = seq && seq.playing, sm = small();
  return '<div class="sttop' + (sm ? ' sm' : '') + '">' +
    (sm ? '' : ui.icb('data-x="back"', I.list, t('toList'), 'sm')) +
    '<button class="stplay' + (playing ? ' on' : '') + '" data-x="play" aria-label="' + ui.esc(t(playing ? 'stop' : 'play')) + '">' + (playing ? I.stop : I.play) + '</button>' +
    '<button class="stinfo" data-x="settings" aria-label="' + ui.esc(t('settings')) + '"><b class="num">' + p.bpm + '</b><span>' + ui.esc(keyLabel(p.key) + ' · ' + p.num + '/' + p.den) + '</span><i class="num" id="stpos">1.1</i></button>' +
    // «паттерн | песня» — один переключатель, как PAT/SONG в FL Studio: касание меняет, что играет
    '<button class="stmode' + (seq.mode === 'song' ? ' song' : '') + '" data-x="mode" aria-label="' + ui.esc(t('modeLab')) + '"><span>' + ui.esc(t('mode.pat')) + '</span><span>' + ui.esc(t('mode.song')) + '</span></button>' +
    (sm ? '' : ui.icb('data-x="click"', I.click, t('click'), 'sm' + (seq && seq.click ? ' on' : '')) + ui.icb('data-x="undo"' + (undo.pid === p.id && undo.stack.length ? '' : ' disabled'), I.undo, t('undo'), 'sm')) + '</div>';
}
// Ряд паттернов: фишки A B C ＋ (касание — текущий, удержание — меню, вести — порядок)
function patternsHTML(p) {
  const { ui, t } = ctx;
  return '<div class="hscroll stchips">' + p.patterns.map((x) => '<button class="stpat' + (x.id === p.cur ? ' on' : '') + '" data-pat="' + x.id + '" aria-pressed="' + (x.id === p.cur) + '">' + ui.esc(x.name) + '<small class="num">' + x.bars + '</small></button>').join('') +
    '<button class="stpat add" data-x="addPat" aria-label="' + ui.esc(t('pat.add')) + '">' + I.plus + '</button></div>';
}
// Плейлист: песня из паттернов лентой (ширина — такты), касание — меню, удержать и вести — порядок, ＋ — добавить
function playlistHTML(p) {
  const { ui, t } = ctx, list = songList(p), total = Math.max(1, songBeats(p));
  // ширина блока — по тактам (не меньше 44px); над блоками — номера тактов, как линейка плейлиста
  const w = (beats) => Math.max(44, Math.round(Math.min(48, 320 / Math.max(1, total / p.num)) * beats / p.num)) + 'px';
  return '<div class="stpl"><div class="stplhd"><span class="stpln">' + ui.esc(t('playlist')) + '</span><span class="stplsum num">' + ui.esc(ctx.tn('bars', total / p.num)) + '</span></div><div class="hscroll stseq" id="stseq">' +
    (p.song.length ? list.map((x, i) => '<button class="stblk" data-sq="' + i + '" style="--c:' + COLORS[(p.patterns.indexOf(x.pat)) % COLORS.length] + ';width:' + w(x.beats) + '"><small class="num">' + (x.off / p.num + 1) + '</small><b>' + ui.esc(x.pat.name) + '</b><i class="stplh"></i></button>').join('')
      : '<span class="stplempty">' + ui.esc(t('song.empty')) + '</span>') +
    '<button class="stpat add" data-x="songAdd" aria-label="' + ui.esc(t('song.add')) + '">' + I.plus + '</button></div></div>';
}
function addRowHTML() {
  const { t, ui } = ctx;
  return '<div class="stadd">' + ['drums', 'chords', 'notes', 'audio'].map((k) => '<button class="lchip pick" data-add="' + k + '">＋ ' + ui.esc(t('tr.' + k)) + '</button>').join('') +
    '<button class="lchip pick" data-x="export">' + ui.esc(t('export')) + '</button></div>';
}
function trackHeadHTML(p, tr) {
  const { t, ui } = ctx, i = p.tracks.indexOf(tr);
  return '<div class="sthead" style="--c:' + tr.color + '">' + ui.icb('data-x="toProject"', I.back, t('toProject'), 'sm') + '<i class="sttrdot"></i><button class="grow sttitle" data-x="trackMenu"><b>' + ui.esc(trName(tr, i)) + '</b><span>' + ui.esc(pat().name + ' · ' + instName(tr.inst)) + '</span></button>' +
    '<div class="hscroll stchips sm">' + p.patterns.map((x) => '<button class="stpat sm' + (x.id === p.cur ? ' on' : '') + '" data-pat="' + x.id + '" aria-pressed="' + (x.id === p.cur) + '">' + ui.esc(x.name) + '</button>').join('') + '</div>' +
    (tr.kind === 'notes' ? ui.seg('stgrid', [['1', '♩'], ['0.5', '♪'], ['0.25', '♬']], String(grid()), t('grid')) : '') + '</div>';
}
function view() {
  const p = proj();
  if (!p || V.view === 'list') return listHTML();
  if (small()) return '<div class="stwrap">' + transportHTML(p) + '</div>';
  const tr = V.view === 'track' && track();
  if (tr && (tr.kind === 'notes' || tr.kind === 'chords')) {
    const d = cellOf(pat(), tr);
    return '<div class="stwrap">' + transportHTML(p) + trackHeadHTML(p, tr) + (tr.kind === 'chords' ? chordsHTML(ctx, p, pat(), tr, d) : '<div class="stroll" id="stroll"></div>') + '</div>';
  }
  return '<div class="stwrap">' + transportHTML(p) + patternsHTML(p) + '<div class="strack">' + rackHTML(ctx, p, pat(), V.bar, trName) + addRowHTML() + '</div>' + playlistHTML(p) + '</div>';
}

function render() {
  if (!host) return;
  if (roll) { roll.destroy(); roll = null; }
  if (offRack) { offRack(); offRack = null; }
  const y = host.querySelector('.strack, .scbars'), sy = y ? y.scrollTop : 0;
  host.innerHTML = view();
  const y2 = host.querySelector('.strack, .scbars');
  if (y2 && sy) y2.scrollTop = sy;
  const rh = host.querySelector('#stroll');
  if (rh) {
    roll = createRoll(rh, () => ({ p: proj(), pat: pat(), tr: track(), d: cellOf(pat(), track()), grid: grid() }), { change: () => save(), audition: (m) => seq.audition(track(), m) });
    rh.addEventListener('contextmenu', (e) => e.preventDefault());
    const p = proj(); if (V.bar) roll.follow(V.bar * p.num);
  }
  const rk = host.querySelector('.rack');
  if (rk) offRack = rackGestures(rk, () => ({ cell: (id) => cellOf(pat(), trById(id)) }), { change: () => save(), audition: (id, lane) => seq.audition(trById(id), lane) });
  const on = host.querySelector('.stchips .stpat.on'); if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  tickPos();
}
// Ход: такт.доля в транспорте; рэк — такт идёт сам и звучащий шаг подсвечен; ролл — линия; плейлист — звучащий паттерн
function tickPos() {
  cancelAnimationFrame(raf);
  if (!host || !seq) return;
  const p = proj(), el = host.querySelector('#stpos'), b = seq.pos();
  if (p && el) el.textContent = b < 0 ? '1.1' : (Math.floor(b / p.num) + 1) + '.' + (Math.floor(b % p.num) + 1);
  let inPat = b;
  if (p && b >= 0 && seq.mode === 'song') {
    const list = songList(p), k = list.findIndex((x) => b >= x.off && b < x.off + x.beats), cur = list[k];
    host.querySelectorAll('.stseq .stblk').forEach((c, i) => { c.classList.toggle('now', i === k); if (i === k) c.style.setProperty('--ph', ((b - cur.off) / cur.beats * 100).toFixed(1) + '%'); });
    inPat = cur && cur.pat === pat() ? b - cur.off : -1;
  } else host.querySelectorAll('.stseq .stblk.now').forEach((c) => c.classList.remove('now'));
  if (roll) { roll.pos(inPat); if (inPat >= 0) roll.follow(inPat); }
  if (host.querySelector('.rack')) {
    if (inPat >= 0 && p) { V.bar = Math.floor(inPat / p.num); rackBar(host, V.bar); }
    rackPos(host, inPat >= 0 ? Math.floor(inPat * 4) : -1);
  }
  if (seq.playing) raf = requestAnimationFrame(tickPos);
}

/* ---------- настройки проекта, меню паттерна и дорожки ---------- */

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
// Паттерн: название и такты — шторкой; дубликат, в песню, удалить — меню
function patSheet(x) {
  const { t, ui } = ctx, p = proj();
  ui.sheet(() => ui.snav(t('pat.one')) + '<div class="group"><label class="cell"><input class="inp left" data-ptn maxlength="12" value="' + ui.esc(x.name) + '" aria-label="' + ui.esc(t('tr.rename')) + '"></label>' +
    '<div class="cell"><span class="grow">' + ui.esc(t('barsLab')) + '</span><span class="stepper"><button type="button" data-pb="-1" aria-label="' + ui.esc(t('barsLab') + ' −') + '">−</button><b class="num stv">' + x.bars + '</b><button type="button" data-pb="1" aria-label="' + ui.esc(t('barsLab') + ' +') + '">+</button></span></div></div>',
  (el, sh) => {
    el.querySelector('[data-ptn]').addEventListener('input', (e) => { x.name = e.target.value.slice(0, 12) || x.name; save(); });
    el.addEventListener('click', (e) => { const b = e.target.closest('[data-pb]'); if (!b) return; x.bars = Math.max(1, Math.min(BARS_MAX, x.bars + +b.dataset.pb)); normalizeProject(p); save(); sh.update(); });
  }, { onClose: render });
}
function patMenu(anchor, x) {
  const { t } = ctx, p = proj();
  holdMenu(anchor, [
    { icon: I.pen, label: t('pat.edit'), run: () => patSheet(x) },
    { icon: I.copy, label: t('pat.clone'), run: () => { if (clonePattern(p, x)) { save(); render(); } } },
    { icon: I.list, label: t('song.add'), run: () => { if (songAdd(p, x)) { save(); render(); } } },
    ...(p.patterns.length > 1 ? [{ icon: I.del, label: t('pat.delete'), danger: true, run: () => { removePattern(p, x); save(); render(); } }] : []),
  ], x.name + ' · ' + ctx.tn('bars', x.bars));
}
// Звук, октава, громкость и цвет дорожки — одной шторкой
function trackSheet(tr) {
  const { t, ui } = ctx;
  // эффекты дорожки — общая панель приложения; правка слышна сразу (цепочка дорожки в секвенсоре), сохраняется при закрытии
  const pm = ctx.fxPanel({ get: () => tr.fx, set: (fx) => { if (seq) seq.setTrackFx(tr, fx); else tr.fx = fx; proj().updatedAt = Date.now(); return fx; } });
  let pmb = null;
  ui.sheet(() => ui.snav(trName(tr, proj().tracks.indexOf(tr))) +
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
function trackMenu(anchor, tr, extra = []) {
  const { t, ui } = ctx, p = proj(), i = p.tracks.indexOf(tr);
  const move = (d) => { const j = i + d; if (j < 0 || j >= p.tracks.length) return; p.tracks.splice(i, 1); p.tracks.splice(j, 0, tr); save(); render(); };
  holdMenu(anchor, [
    ...extra,
    { icon: I.solo, label: t(tr.solo ? 'soloOff' : 'solo'), run: () => { tr.solo = !tr.solo; save(); render(); } },
    { icon: I.vol, label: t(tr.kind === 'audio' ? 'tr.pickFile' : 'tr.sound'), run: () => (tr.kind === 'audio' ? filePicker(tr) : trackSheet(tr)) },
    { icon: I.pen, label: t('tr.rename'), run: () => ui.sheet(() => ui.snav(t('tr.rename')) + '<div class="group"><label class="cell"><input class="inp left" data-trn maxlength="30" value="' + ui.esc(tr.name) + '" placeholder="' + ui.esc(trName(tr, i)) + '" aria-label="' + ui.esc(t('tr.rename')) + '"></label></div>', (el) => { const inp = el.querySelector('[data-trn]'); setTimeout(() => inp.focus(), 80); inp.addEventListener('input', () => { tr.name = inp.value; save(); }); }, { onClose: render }) },
    ...(i > 0 ? [{ icon: I.up, label: t('tr.up'), run: () => move(-1) }] : []),
    ...(i < p.tracks.length - 1 ? [{ icon: I.down, label: t('tr.down'), run: () => move(1) }] : []),
    { icon: I.copy, label: t('tr.dup'), run: () => { const c = JSON.parse(JSON.stringify(tr)); c.id = newTrack().id; c.name = (tr.name || trName(tr, i)) + ' 2'; p.tracks.splice(i + 1, 0, c); p.patterns.forEach((x) => { if (x.data[tr.id]) x.data[c.id] = JSON.parse(JSON.stringify(x.data[tr.id])); }); save(); render(); } },
    { icon: I.del, label: t('tr.delete'), danger: true, run: () => { p.tracks.splice(i, 1); p.patterns.forEach((x) => { delete x.data[tr.id]; }); if (V.tid === tr.id) { V.view = 'project'; V.tid = null; } save(); render(); } },
  ], trName(tr, i));
}

/* ---------- действия ---------- */

// Запись для дорожки-петли: аудио из медиатеки (сведение лупера — первым)
function filePicker(tr) {
  const { t, ui } = ctx, L = ctx.files.list('audio').slice().sort((a, b) => (b.created || 0) - (a.created || 0));
  ui.sheet(() => ui.snav(t('tr.pickFile')) + (L.length ? '<div class="group">' + L.map((r) => '<button class="cell" data-file="' + r.id + '"><span class="grow">' + ui.esc(r.name) + '<span class="bksub">' + (r.dur ? Math.round(r.dur) + ' s' : '') + '</span></span>' + (tr.fileId === r.id ? ui.icons.check : '') + '</button>').join('') + '</div>'
    : '<p class="ftr">' + ui.esc(t('tr.noAudio')) + '</p>') + '<p class="ftr">' + ui.esc(t('tr.audioHint')) + '</p>',
  (el, sh) => el.addEventListener('click', (e) => { const b = e.target.closest('[data-file]'); if (!b) return; tr.fileId = b.dataset.file; save(); sh.close(); }), { onClose: render });
}
// Экспорт песни целиком (плейлист; пустой — текущий паттерн): для DAW, .mid в медиатеку, MusicXML в «Табы»
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
  const loops = p.tracks.filter((tr) => tr.kind === 'audio' && tr.fileId).length;
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
  holdMenu(host.querySelector('[data-x="export"]') || host, [{ icon: I.share, label: t('share'), run: () => ctx.midi.share(rec) }], name);
}
// Добавить в плейлист: выбор паттерна
function songAddMenu(anchor) {
  const p = proj();
  holdMenu(anchor, p.patterns.map((x) => ({ icon: I.plus, label: x.name + ' · ' + ctx.tn('bars', x.bars), run: () => { if (songAdd(p, x)) { save(); render(); } } })), ctx.t('song.add'));
}
function seqMenu(anchor, i) {
  const { t } = ctx, p = proj(), x = patById(p, p.song[i]);
  holdMenu(anchor, [
    { icon: I.pen, label: t('song.edit'), run: () => { p.cur = x.id; seq.mode = 'pattern'; save(); render(); } },
    { icon: I.copy, label: t('song.dup'), run: () => { if (songAdd(p, x, i + 1)) { save(); render(); } } },
    { icon: I.del, label: t('song.remove'), danger: true, run: () => { songRemoveAt(p, i); save(); render(); } },
  ], x.name + ' · ' + (i + 1));
}
// Открыть дорожку: ноты — пиано-ролл, аккорды — такты с аккордами, петля — выбор записи, ударные — меню
function openTrack(tr, bar = V.bar) {
  if (!tr) return;
  if (tr.kind === 'audio') { filePicker(tr); return; }
  if (tr.kind === 'drums') { trackMenu(host.querySelector('.rkrow[data-tr="' + tr.id + '"] .rkname') || host, tr); return; }
  V.tid = tr.id; V.view = 'track'; V.bar = bar; render();
}

function act(x, el) {
  const p = proj();
  switch (x) {
    case 'new': { const np = newProject({ songId: ctx.session && ctx.session.songId || null }); ctx.projects.save(np); V.pid = np.id; V.view = 'project'; V.bar = 0; seq.mode = 'pattern'; render(); break; }
    case 'back': seq.stop(); V.view = 'list'; V.pid = null; render(); break;
    case 'toProject': V.view = 'project'; V.tid = null; render(); break;
    case 'play': if (!ctx.audio.unlock()) { ctx.ui.toast(ctx.t('err.sound')); return; } seq.toggle(); render(); break;
    case 'click': seq.click = !seq.click; render(); break;
    case 'mode': seq.mode = seq.mode === 'song' ? 'pattern' : 'song'; render(); break;
    case 'undo': undoStep(); break;
    case 'settings': settingsSheet(); break;
    case 'export': exportMenu(el); break;
    case 'help': if (ctx.help) ctx.help(); break;
    case 'trackMenu': trackMenu(el, track()); break;
    case 'addPat': { if (addPattern(p)) { save(); render(); } else ctx.ui.toast(ctx.t('pat.max')); break; }
    case 'songAdd': songAddMenu(el); break;
  }
}
function onClick(e) {
  const p = proj(), g = (s) => e.target.closest(s);
  let b;
  if ((b = g('[data-x]'))) { act(b.dataset.x, b); return; }
  if ((b = g('[data-open]'))) { V.pid = b.dataset.open; V.view = 'project'; V.bar = 0; seq.mode = 'pattern'; render(); return; }
  if (!p) return;
  if ((b = g('[data-pat]'))) { if (p.cur !== b.dataset.pat) { p.cur = b.dataset.pat; V.bar = 0; save(); render(); } return; }
  if ((b = g('[data-sq]'))) { seqMenu(b, +b.dataset.sq); return; }
  if ((b = g('[data-rkbar]'))) { V.bar = +b.dataset.rkbar; rackBar(host, V.bar); return; }
  if ((b = g('[data-rkmute]'))) { const tr = trById(b.dataset.rkmute); tr.mute = !tr.mute; save(); render(); return; }
  if ((b = g('[data-rkopen]'))) { openTrack(trById(b.dataset.rkopen)); return; }
  if ((b = g('.rkc[data-edit]'))) { const row = b.closest('.rkrow'); openTrack(trById(row.dataset.tr), Math.floor(+b.dataset.i / (p.num * 4))); return; }
  if ((b = g('[data-add]'))) { const tr = newTrack(b.dataset.add, p.tracks.length); p.tracks.push(tr); save(); render(); if (tr.kind === 'audio') filePicker(tr); else if (tr.kind !== 'drums') openTrack(tr, 0); return; }
  if ((b = g('[data-seg="stgrid"] [data-v]'))) { st().grid = +b.dataset.v; ctx.store.save(); render(); return; }
  const tr = track();
  if (tr && tr.kind === 'chords' && chordsAct(ctx, p, pat(), tr, cellOf(pat(), tr), e, () => { save(); render(); })) return;
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
    const on = (t, ev, fn) => { t.addEventListener(ev, fn); offs.push(() => t.removeEventListener(ev, fn)); };
    on(host, 'click', onClick);
    // удержания: название канала — меню дорожки (у барабана — ещё «очистить ряд»), огонёк — соло, аккорд — убрать
    onHold(host, '.rkname', (el2) => { const row = el2.closest('.rkrow'), tr = trById(row.dataset.tr); if (!tr) return; const lane = row.dataset.lane, d = lane && cellOf(pat(), tr), extra = lane && d && d.steps[lane] ? [{ icon: I.del, label: c.t('drum.clear') + ' · ' + c.t('drum.' + lane), run: () => { delete d.steps[lane]; save(); render(); } }] : []; trackMenu(el2, tr, extra); });
    onHold(host, '.rklight', (el2) => { const tr = trById(el2.dataset.rkmute); if (tr) { tr.solo = !tr.solo; save(); render(); } });
    onHold(host, '.scch', (el2) => { const p = proj(), tr = track(); if (tr) chordHold(ctx, p, cellOf(pat(), tr), el2, () => { save(); render(); }); });
    onHold(host, '.stproj', (b) => { const id = b.dataset.open; holdMenu(b, [{ icon: I.del, label: c.t('delete'), danger: true, run: () => c.ui.confirm(c.t('delTitle'), c.t('delText'), c.t('delete')).then((ok) => { if (ok) { c.projects.remove(id); render(); } }) }], (c.projects.get(id) || {}).name || c.t('untitled')); });
    // фишки паттернов и плейлиста: удержать — меню, удержать и вести — порядок
    dragSort(host, '.stchips:not(.sm) .stpat[data-pat]', 'data-pat', { onDrop: (ids) => { const p = proj(); p.patterns = ids.map((id) => patById(p, id)).filter(Boolean).concat(p.patterns.filter((x) => !ids.includes(x.id))); save(); render(); }, onStill: (el2) => patMenu(el2, patById(proj(), el2.dataset.pat)) });
    dragSort(host, '.stseq .stblk[data-sq]', 'data-sq', { onDrop: (ids) => { const p = proj(); p.song = ids.map((i) => p.song[+i]).filter(Boolean); save(); render(); }, onStill: (el2) => seqMenu(el2, +el2.dataset.sq) });
    render();
  },
  resize(sz) { size = sz; render(); },
  // Вкладка закрыта: проигрывание останавливается (черновик — не фон для занятия)
  unmount() {
    cancelAnimationFrame(raf);
    if (seq) seq.stop();
    if (roll) { roll.destroy(); roll = null; }
    if (offRack) { offRack(); offRack = null; }
    offs.splice(0).forEach((f) => f());
    host = null;
  },
};
