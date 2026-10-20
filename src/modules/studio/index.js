// Студия по образцу FL Studio: дорожки (инструменты) × паттерны (куски на несколько тактов), песня — плейлист из
// паттернов. Проект — src/music/project.js. Экраны: список проектов → проект (транспорт полосой сверху, ряд паттернов,
// в режиме песни — плейлист, дорожки списком) → редактор дорожки в текущем паттерне на всё окно (пиано-ролл — roll.js,
// аккорды — chords.js, ударные — drums.js). Проигрывание — src/audio/sequencer.js: паттерн по кругу или песня целиком.
// Сохраняется после каждой правки (ctx.projects), отмена — по снимкам проекта. Экспорт — .mid в медиатеку и MusicXML в «Табы».
import './studio.css';
import ru from './i18n/ru.json';
import uz from './i18n/uz.json';
import en from './i18n/en.json';
import el from './i18n/el.json';
import { newProject, newTrack, normalizeProject, INSTRUMENTS, COLORS, GRIDS, BARS_MAX, projectEvents, curPattern, patById, cellOf, countOf, songList, songBeats, patBeats, addPattern, clonePattern, removePattern, songAdd, songRemoveAt, isEmptyProject, projectTracks } from '../../music/project.js';
import { createSequencer } from '../../audio/sequencer.js';
import { createRoll } from './roll.js';
import { chordsHTML, chordsAct, chordHold } from './chords.js';
import { drumsHTML, drumsGestures, drumHold, showBar } from './drums.js';
import { writeMidi, writeMidiTracks, takeDur } from '../../music/midi.js';
import { projectXML } from '../../music/musicxml.js';
import { onHold, holdMenu, sortable, dragSort } from '../../ui/hold.js';
import { keyLabel } from '../../music/transpose.js';

const ICON = '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="4" rx="1.5"/><rect x="3" y="11" width="11" height="4" rx="1.5"/><rect x="3" y="17" width="15" height="3" rx="1.5"/></svg>';
const I = {
  play: '<svg viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z" style="fill:currentColor"/></svg>',
  stop: '<svg viewBox="0 0 24 24"><rect x="6.5" y="6.5" width="11" height="11" rx="2" style="fill:currentColor"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M14.5 6l-6 6 6 6"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></svg>',
  share: '<svg viewBox="0 0 24 24"><path d="M12 15V4M8 7.5 12 3.5l4 4M6 11H5v9h14v-9h-1"/></svg>',
  mute: '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9l5 6M21 9l-5 6"/></svg>',
  vol: '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/></svg>',
  click: '<svg viewBox="0 0 24 24"><path d="M9 4h6l3 16H6zM12 17V8M12 8l5-3"/></svg>',
  undo: '<svg viewBox="0 0 24 24"><path d="M8 7H4v4"/><path d="M4.5 10.5A8 8 0 1 1 6 17"/></svg>',
  pen: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
  del: '<svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13"/></svg>',
  copy: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  list: '<svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h10"/></svg>',
};
const UNDO_MAX = 40;

let host = null, ctx = null, size = 'full', seq = null, roll = null, offs = [], raf = 0, offDrums = null;
// экран: { view: 'list' | 'project' | 'track', pid, tid }; отмена: снимки проекта (JSON) до каждой правки
const V = { view: 'list', pid: null, tid: null, bar: 0 }; // bar — такт в сетке ударных
const undo = { pid: null, last: '', stack: [] };
const st = () => ctx.store.all();
const grid = () => (GRIDS.includes(st().grid) ? st().grid : 0.5);
const proj = () => (V.pid ? ctx.projects.get(V.pid) : null);
const track = () => { const p = proj(); return p && V.tid ? p.tracks.find((t) => t.id === V.tid) || null : null; };
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
const lenText = (p) => (seq && seq.mode === 'song' ? ctx.t('song') + ' · ' + ctx.tn('bars', songBeats(p) / p.num) : pat().name + ' · ' + ctx.tn('bars', pat().bars));
const countText = (p, tr) => {
  if (tr.kind === 'audio') return '♪ ' + fileName(tr.fileId);
  const n = countOf(pat(), tr), base = instName(tr.inst) + ' · ';
  return tr.kind === 'chords' ? base + ctx.tn('chordsN', n) + ' · ' + ctx.t('mode.' + tr.mode) : tr.kind === 'drums' ? ctx.tn('hitsN', n) : base + ctx.tn('notesN', n);
};

/* ---------- разметка ---------- */

function listHTML() {
  const { t, ui } = ctx, L = ctx.projects.list().sort((a, b) => b.updatedAt - a.updatedAt);
  return '<div class="stlist">' + (L.length ? '<div class="group">' + L.map((p) => '<button class="cell stproj" data-open="' + p.id + '"><span class="grow"><b>' + ui.esc(p.name || t('untitled')) + '</b><span class="bksub">' +
    ui.esc(p.bpm + ' bpm · ' + keyLabel(p.key) + ' · ' + ctx.tn('patternsN', p.patterns.length) + ' · ' + ctx.tn('bars', songBeats(p) / p.num)) + '</span></span>' + ui.icons.chev + '</button>').join('') + '</div>' : '<p class="ftr">' + ui.esc(t('empty')) + '</p>') +
    '<div class="group" style="margin-top:14px"><button class="cell act center b" data-x="new">' + ui.esc(t('new')) + '</button></div></div>';
}
function transportHTML(p) {
  const { t, ui } = ctx, playing = seq && seq.playing, sm = small();
  return '<div class="sttop' + (sm ? ' sm' : '') + '">' +
    (sm ? '' : ui.icb('data-x="back"', I.back, t('toList'), 'sm')) +
    '<button class="stplay' + (playing ? ' on' : '') + '" data-x="play" aria-label="' + ui.esc(t(playing ? 'stop' : 'play')) + '">' + (playing ? I.stop : I.play) + '</button>' +
    '<button class="stinfo" data-x="settings"><b class="num">' + p.bpm + '</b><span>' + ui.esc(keyLabel(p.key) + ' · ' + p.num + '/' + p.den + ' · ' + lenText(p)) + '</span></button>' +
    '<span class="stpos num" id="stpos">1.1</span>' +
    (sm ? '' : ui.icb('data-x="click"', I.click, t('click'), 'sm' + (seq && seq.click ? ' on' : '')) + ui.icb('data-x="undo"' + (undo.pid === p.id && undo.stack.length ? '' : ' disabled'), I.undo, t('undo'), 'sm')) + '</div>';
}
// Ряд паттернов: переключатель «паттерн | песня» и фишки A B C ＋ (касание — текущий, удержание — меню, вести — порядок)
function patternsHTML(p) {
  const { t, ui } = ctx, song = seq.mode === 'song';
  return '<div class="stpats">' + ui.seg('stmode', [['pattern', t('mode.pattern')], ['song', t('mode.song')]], seq.mode, t('modeLab')) +
    '<div class="hscroll stchips">' + p.patterns.map((x) => '<button class="stpat' + (x.id === p.cur ? ' on' : '') + '" data-pat="' + x.id + '" aria-pressed="' + (x.id === p.cur) + '">' + ui.esc(x.name) + '<small class="num">' + x.bars + '</small></button>').join('') +
    '<button class="stpat add" data-x="addPat" aria-label="' + ui.esc(t('pat.add')) + '">' + I.plus + '</button></div></div>' +
    (song ? '<div class="stsong"><span class="stsongn">' + ui.esc(t('playlist')) + '</span><div class="hscroll stseq" id="stseq">' + p.song.map((id, i) => { const x = patById(p, id); return '<button class="stpat sq" data-sq="' + i + '" style="flex:' + x.bars + '">' + ui.esc(x.name) + '</button>'; }).join('') +
      '<button class="stpat add" data-x="songAdd" aria-label="' + ui.esc(t('song.add')) + '">' + I.plus + '</button></div></div>' : '');
}
function tracksHTML(p) {
  const { t, ui } = ctx;
  return '<div class="sttracks">' + p.tracks.map((tr, i) => '<div class="sttr' + (tr.mute ? ' muted' : '') + (tr.solo ? ' solo' : '') + '" data-tr="' + tr.id + '" style="--c:' + tr.color + '">' +
    '<button class="sttrmain" data-edit="' + tr.id + '"><i class="sttrdot"></i><span class="grow"><b>' + ui.esc(trName(tr, i)) + '</b><span class="bksub">' + ui.esc(countText(p, tr)) + '</span></span></button>' +
    '<button class="ic sm plain' + (tr.solo ? ' on' : '') + '" data-solo="' + tr.id + '" aria-pressed="' + tr.solo + '" aria-label="' + ui.esc(t('solo')) + '">S</button>' +
    '<button class="ic sm plain" data-mute="' + tr.id + '" aria-pressed="' + tr.mute + '" aria-label="' + ui.esc(t(tr.mute ? 'unmute' : 'mute')) + '">' + (tr.mute ? I.mute : I.vol) + '</button>' +
    '<input type="range" class="sttrvol" min="0" max="1.5" step="0.01" value="' + tr.vol + '" data-vol="' + tr.id + '" aria-label="' + ui.esc(t('vol')) + '"></div>').join('') +
    '<div class="stadd">' + ['drums', 'chords', 'notes', 'audio'].map((k) => '<button class="lchip pick" data-add="' + k + '">＋ ' + ui.esc(t('tr.' + k)) + '</button>').join('') +
    '<button class="lchip pick" data-x="export">' + ui.esc(t('export')) + '</button></div></div>';
}
function trackHeadHTML(p, tr) {
  const { t, ui } = ctx, i = p.tracks.indexOf(tr);
  return '<div class="sthead" style="--c:' + tr.color + '">' + ui.icb('data-x="toProject"', I.back, t('toProject'), 'sm') + '<i class="sttrdot"></i><button class="grow sttitle" data-x="trackMenu"><b>' + ui.esc(trName(tr, i)) + '</b><span>' + ui.esc(pat().name + ' · ' + (tr.kind === 'drums' ? ctx.tn('bars', pat().bars) : instName(tr.inst))) + '</span></button>' +
    '<div class="hscroll stchips sm">' + p.patterns.map((x) => '<button class="stpat sm' + (x.id === p.cur ? ' on' : '') + '" data-pat="' + x.id + '" aria-pressed="' + (x.id === p.cur) + '">' + ui.esc(x.name) + '</button>').join('') + '</div>' +
    (tr.kind === 'notes' ? ui.seg('stgrid', [['1', '♩'], ['0.5', '♪'], ['0.25', '♬']], String(grid()), t('grid')) : '') + '</div>';
}
function view() {
  const p = proj();
  if (!p || V.view === 'list') return listHTML();
  if (small()) return '<div class="stwrap">' + transportHTML(p) + '</div>';
  const tr = V.view === 'track' && track();
  if (tr && tr.kind !== 'audio') {
    const d = cellOf(pat(), tr);
    return '<div class="stwrap">' + transportHTML(p) + trackHeadHTML(p, tr) + (tr.kind === 'chords' ? chordsHTML(ctx, p, pat(), tr, d) : tr.kind === 'drums' ? drumsHTML(ctx, p, pat(), tr, d, V.bar) : '<div class="stroll" id="stroll"></div>') + '</div>';
  }
  return '<div class="stwrap">' + transportHTML(p) + patternsHTML(p) + tracksHTML(p) + '</div>';
}

function render() {
  if (!host) return;
  if (roll) { roll.destroy(); roll = null; }
  if (offDrums) { offDrums(); offDrums = null; }
  const y = host.querySelector('.sttracks, .scbars, .sdwrap'), sy = y ? y.scrollTop : 0;
  host.innerHTML = view();
  const y2 = host.querySelector('.sttracks, .scbars, .sdwrap');
  if (y2 && sy) y2.scrollTop = sy;
  const rh = host.querySelector('#stroll');
  if (rh) {
    roll = createRoll(rh, () => ({ p: proj(), pat: pat(), tr: track(), d: cellOf(pat(), track()), grid: grid() }), { change: () => save(), audition: (m) => seq.audition(track(), m) });
    rh.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  const dh = host.querySelector('.sdwrap');
  if (dh) offDrums = drumsGestures(dh, () => ({ d: cellOf(pat(), track()) }), { change: () => save(), audition: (lane) => seq.audition(track(), lane) });
  const on = host.querySelector('.stpat.on'); if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  tickPos();
}
// Ход: такт.доля в транспорте; линия в пиано-ролле — если в песне сейчас звучит именно этот паттерн; фишка звучащего паттерна
function tickPos() {
  cancelAnimationFrame(raf);
  if (!host || !seq) return;
  const p = proj(), el = host.querySelector('#stpos'), b = seq.pos();
  if (p && el) el.textContent = b < 0 ? '1.1' : (Math.floor(b / p.num) + 1) + '.' + (Math.floor(b % p.num) + 1);
  if (p && b >= 0 && seq.mode === 'song') {
    const list = songList(p), k = list.findIndex((x) => b >= x.off && b < x.off + x.beats), cur = list[k];
    host.querySelectorAll('.stseq .stpat').forEach((c, i) => c.classList.toggle('now', i === k));
    if (roll) { const inPat = cur && cur.pat === pat() ? b - cur.off : -1; roll.pos(inPat); if (inPat >= 0) roll.follow(inPat); }
    drumPos(p, cur && cur.pat === pat() ? b - cur.off : -1);
  } else {
    if (roll) { roll.pos(b); if (b >= 0) roll.follow(b); }
    drumPos(p, b);
  }
  if (seq.playing) raf = requestAnimationFrame(tickPos);
}

// Сетка ударных: такт идёт за проигрыванием, клетка хода подсвечена
function drumPos(p, b) {
  if (!host.querySelector('.sdwrap')) return;
  if (b >= 0) { V.bar = Math.floor(b / p.num); showBar(host, V.bar); }
  const i = b >= 0 ? Math.floor(b * 4) : -1;
  host.querySelectorAll('.sdc.now').forEach((c) => { if (+c.dataset.i !== i) c.classList.remove('now'); });
  if (i >= 0) { const c = host.querySelector('.sdc[data-i="' + i + '"]'); if (c) c.classList.add('now'); }
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
    '<label class="cell"><span class="grow">' + ui.esc(t('swing')) + '<span class="bksub">' + ui.esc(t('swingHint')) + '</span></span><b class="num" style="min-width:4ch;text-align:right">' + Math.round(p.swing * 100) + '%</b></label><div class="cell"><input type="range" class="sttrvol" style="flex:1" min="0" max="1" step="0.05" value="' + p.swing + '" data-swing aria-label="' + ui.esc(t('swing')) + '"></div></div>' +
    '<div class="hdr">' + ui.esc(t('key')) + '</div><div class="hscroll" style="padding:0 4px">' + NAMES.map((n, pc) => '<button class="pill sm" data-key="' + pc + '" aria-pressed="' + (pc === p.key.pc) + '">' + n + '</button>').join('') + '</div>' +
    '<div class="group" style="margin-top:8px"><div class="cellcol">' + ui.seg('stmin', [['0', t('maj')], ['1', t('min')]], p.key.minor ? '1' : '0', t('key')) + '</div></div>' +
    '<div class="group" style="margin-top:16px"><button class="cell danger center" data-delproj>' + ui.esc(t('delete')) + '</button></div>';
  ui.sheet(body, (el, sh) => {
    el.addEventListener('input', (e) => { if (e.target.matches('[data-name]')) { p.name = e.target.value; save(); } else if (e.target.matches('[data-swing]')) { p.swing = +e.target.value; p.updatedAt = Date.now(); } });
    el.addEventListener('change', (e) => { if (e.target.matches('[data-swing]')) { save(); sh.update(); } });
    el.addEventListener('click', (e) => {
      let b;
      if ((b = e.target.closest('[data-st]'))) { p.bpm = Math.max(20, Math.min(300, p.bpm + +b.dataset.d * (e.shiftKey ? 10 : 1))); save(); sh.update(); }
      else if ((b = e.target.closest('[data-seg="stnum"] [data-v]'))) { p.num = +b.dataset.v; p.den = p.num === 6 ? 8 : 4; normalizeProject(p); save(); sh.update(); }
      else if ((b = e.target.closest('[data-key]'))) { p.key.pc = +b.dataset.key; save(); sh.update(); }
      else if ((b = e.target.closest('[data-seg="stmin"] [data-v]'))) { p.key.minor = b.dataset.v === '1'; save(); sh.update(); }
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
function trackMenu(anchor, tr) {
  const { t, ui } = ctx, p = proj(), i = p.tracks.indexOf(tr);
  holdMenu(anchor, [
    { icon: I.pen, label: t('tr.rename'), run: () => ui.sheet(() => ui.snav(t('tr.rename')) + '<div class="group"><label class="cell"><input class="inp left" data-trn maxlength="30" value="' + ui.esc(tr.name) + '" placeholder="' + ui.esc(trName(tr, i)) + '" aria-label="' + ui.esc(t('tr.rename')) + '"></label></div>', (el) => { const inp = el.querySelector('[data-trn]'); setTimeout(() => inp.focus(), 80); inp.addEventListener('input', () => { tr.name = inp.value; save(); }); }, { onClose: render }) },
    ...(tr.kind === 'audio' ? [{ icon: I.vol, label: t('tr.pickFile'), run: () => filePicker(tr) }] : [{ icon: I.vol, label: t('tr.inst'), run: () => ui.sheet(() => ui.snav(t('tr.inst')) + (tr.kind === 'drums' ? '' : '<div class="group">' + INSTRUMENTS.map((id) => '<button class="cell" data-inst="' + id + '"><span class="grow">' + ui.esc(instName(id)) + '</span>' + (tr.inst === id ? ui.icons.check : '') + '</button>').join('') + '</div>' +
      '<div class="hdr">' + ui.esc(t('tr.oct')) + '</div><div class="group"><div class="cellcol">' + ui.seg('stoct', [['-1', '−1'], ['0', '0'], ['1', '+1']], String(tr.oct || 0), t('tr.oct')) + '</div></div>') +
      '<div class="hdr">' + ui.esc(t('tr.color')) + '</div><div class="stcolors">' + COLORS.map((c) => '<button class="stcol' + (tr.color === c ? ' on' : '') + '" data-col="' + c + '" style="--c:' + c + '" aria-label="' + c + '"></button>').join('') + '</div>',
      (el, sh) => el.addEventListener('click', (e) => { let b; if ((b = e.target.closest('[data-inst]'))) { tr.inst = b.dataset.inst; seq.audition(tr, 60); } else if ((b = e.target.closest('[data-seg="stoct"] [data-v]'))) tr.oct = +b.dataset.v; else if ((b = e.target.closest('[data-col]'))) tr.color = b.dataset.col; else return; save(); sh.update(); }), { onClose: render }) }]),
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
// Экспорт песни целиком (плейлист; пустой — текущий паттерн): .mid (играется в пианино) или MusicXML (открывается в «Табах»)
function exportMenu(anchor) {
  const { t } = ctx;
  holdMenu(anchor, [{ icon: I.share, label: t('exportDaw'), run: exportDaw }, { icon: I.share, label: t('exportMidi'), run: exportMidi }, { icon: I.share, label: t('exportXml'), run: exportXml }], t('export'));
}
// Для чужой студии (FL Studio, Ableton, Reaper…): .mid формата 1 — дорожка на дорожку, ударные на 10-м канале,
// инструменты General MIDI, темп, размер, тональность; свинг запечён. Файл — в медиатеку и «Поделиться»
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
    { icon: I.del, label: t('song.remove'), danger: true, run: () => { songRemoveAt(p, i); save(); render(); } },
  ], x.name + ' · ' + (i + 1));
}

function act(x, el) {
  const p = proj();
  switch (x) {
    case 'new': { const np = newProject({ songId: ctx.session && ctx.session.songId || null }); ctx.projects.save(np); V.pid = np.id; V.view = 'project'; seq.mode = 'pattern'; render(); break; }
    case 'back': seq.stop(); V.view = 'list'; V.pid = null; render(); break;
    case 'toProject': V.view = 'project'; V.tid = null; render(); break;
    case 'play': if (!ctx.audio.unlock()) { ctx.ui.toast(ctx.t('err.sound')); return; } seq.toggle(); render(); break;
    case 'click': seq.click = !seq.click; render(); break;
    case 'undo': undoStep(); break;
    case 'settings': settingsSheet(); break;
    case 'export': exportMenu(el); break;
    case 'trackMenu': trackMenu(el, track()); break;
    case 'addPat': { if (addPattern(p)) { save(); render(); } else ctx.ui.toast(ctx.t('pat.max')); break; }
    case 'songAdd': songAddMenu(el); break;
  }
}
function onClick(e) {
  const p = proj(), g = (s) => e.target.closest(s);
  let b;
  if ((b = g('[data-x]'))) { act(b.dataset.x, b); return; }
  if ((b = g('[data-open]'))) { V.pid = b.dataset.open; V.view = 'project'; seq.mode = 'pattern'; render(); return; }
  if (!p) return;
  if ((b = g('[data-pat]'))) { if (p.cur !== b.dataset.pat) { p.cur = b.dataset.pat; save(); render(); } return; }
  if ((b = g('[data-sq]'))) { seqMenu(b, +b.dataset.sq); return; }
  if ((b = g('[data-seg="stmode"] [data-v]'))) { seq.mode = b.dataset.v; render(); return; }
  if ((b = g('[data-add]'))) { const tr = newTrack(b.dataset.add, p.tracks.length); p.tracks.push(tr); save(); if (tr.kind === 'audio') { render(); filePicker(tr); } else { V.tid = tr.id; V.view = 'track'; render(); } return; }
  if ((b = g('[data-edit]'))) { const tr = p.tracks.find((t) => t.id === b.dataset.edit); if (tr.kind === 'audio') { filePicker(tr); return; } V.tid = b.dataset.edit; V.view = 'track'; render(); return; }
  if ((b = g('[data-mute]'))) { const tr = p.tracks.find((t) => t.id === b.dataset.mute); tr.mute = !tr.mute; save(); render(); return; }
  if ((b = g('[data-solo]'))) { const tr = p.tracks.find((t) => t.id === b.dataset.solo); tr.solo = !tr.solo; save(); render(); return; }
  if ((b = g('[data-seg="stgrid"] [data-v]'))) { st().grid = +b.dataset.v; ctx.store.save(); render(); return; }
  if ((b = g('[data-sdname]'))) { seq.audition(track(), b.dataset.sdname); return; }
  if ((b = g('[data-sdbar]'))) { V.bar = +b.dataset.sdbar; showBar(host, V.bar); return; }
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
  sizes: ['full', 'half', 'quarter', 'strip'],
  status(c) { const n = (c.projects ? c.projects.list() : []).length; return c.tn('projects', n); },
  mount(el, c, sz = 'full') {
    host = el; ctx = c; size = sz;
    if (!seq) seq = createSequencer({ mixer: c.audio.mixer, synth: c.audio.synth, getProject: proj, getFile: (id) => c.files.get(id) });
    (c.projects.list() || []).forEach(normalizeProject);
    if (V.pid && !proj()) { V.view = 'list'; V.pid = null; }
    const on = (t, ev, fn) => { t.addEventListener(ev, fn); offs.push(() => t.removeEventListener(ev, fn)); };
    on(host, 'click', onClick);
    on(host, 'input', (e) => { const p = proj(); if (p && e.target.dataset.vol) { const tr = p.tracks.find((t) => t.id === e.target.dataset.vol); tr.vol = +e.target.value; p.updatedAt = Date.now(); } });
    on(host, 'change', (e) => { if (e.target.dataset.vol) save(); });
    onHold(host, '.sttr', (row) => trackMenu(row, proj().tracks.find((t) => t.id === row.dataset.tr)));
    onHold(host, '.scch', (el2) => { const p = proj(), tr = track(); if (tr) chordHold(ctx, p, cellOf(pat(), tr), el2, () => { save(); render(); }); });
    onHold(host, '[data-sdname]', (el2) => { const tr = track(); if (tr) drumHold(ctx, cellOf(pat(), tr), el2, () => { save(); render(); }); });
    onHold(host, '.stproj', (b) => { const id = b.dataset.open; holdMenu(b, [{ icon: I.del, label: c.t('delete'), danger: true, run: () => c.ui.confirm(c.t('delTitle'), c.t('delText'), c.t('delete')).then((ok) => { if (ok) { c.projects.remove(id); render(); } }) }], (c.projects.get(id) || {}).name || c.t('untitled')); });
    sortable(host, '.sttr', 'data-tr', (ids) => { const p = proj(); p.tracks = ids.map((id) => p.tracks.find((t) => t.id === id)).filter(Boolean).concat(p.tracks.filter((t) => !ids.includes(t.id))); save(); render(); });
    // фишки паттернов и плейлиста: удержать — меню, удержать и вести — порядок
    dragSort(host, '.stchips:not(.sm) .stpat[data-pat]', 'data-pat', { onDrop: (ids) => { const p = proj(); p.patterns = ids.map((id) => patById(p, id)).filter(Boolean).concat(p.patterns.filter((x) => !ids.includes(x.id))); save(); render(); }, onStill: (el2) => patMenu(el2, patById(proj(), el2.dataset.pat)) });
    dragSort(host, '.stseq .stpat[data-sq]', 'data-sq', { onDrop: (ids) => { const p = proj(); p.song = ids.map((i) => p.song[+i]).filter(Boolean); save(); render(); }, onStill: (el2) => seqMenu(el2, +el2.dataset.sq) });
    render();
  },
  resize(sz) { size = sz; render(); },
  // Окно закрыто: проигрывание останавливается (черновик — не фон для занятия)
  unmount() {
    cancelAnimationFrame(raf);
    if (seq) seq.stop();
    if (roll) { roll.destroy(); roll = null; }
    if (offDrums) { offDrums(); offDrums = null; }
    offs.splice(0).forEach((f) => f());
    host = null;
  },
};
