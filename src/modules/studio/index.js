// Студия-черновик: набросать песню — аккорды, бас, пэд, мелодия. Проект (src/music/project.js): темп, размер,
// тональность, такты, дорожки. Экраны: список проектов → проект (транспорт сверху, дорожки списком) → редактор
// дорожки на всё окно (пиано-ролл — roll.js, аккорды — chords.js). Проигрывание — src/audio/sequencer.js.
// Сохраняется после каждой правки (ctx.projects). Экспорт — .mid в медиатеку (играется в пианино) и «Поделиться».
import './studio.css';
import ru from './i18n/ru.json';
import uz from './i18n/uz.json';
import en from './i18n/en.json';
import el from './i18n/el.json';
import { newProject, newTrack, normalizeProject, INSTRUMENTS, COLORS, GRIDS, BARS_MAX, beatsOf, projectEvents } from '../../music/project.js';
import { createSequencer } from '../../audio/sequencer.js';
import { createRoll } from './roll.js';
import { chordsHTML, chordsAct, chordHold } from './chords.js';
import { writeMidi, takeDur } from '../../music/midi.js';
import { projectXML } from '../../music/musicxml.js';
import { onHold, holdMenu, sortable } from '../../ui/hold.js';
import { keyLabel } from '../../music/transpose.js';

const ICON = '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="4" rx="1.5"/><rect x="3" y="11" width="11" height="4" rx="1.5"/><rect x="3" y="17" width="15" height="3" rx="1.5"/></svg>';
const I = {
  play: '<svg viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z" style="fill:currentColor"/></svg>',
  stop: '<svg viewBox="0 0 24 24"><rect x="6.5" y="6.5" width="11" height="11" rx="2" style="fill:currentColor"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M14.5 6l-6 6 6 6"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></svg>',
  share: '<svg viewBox="0 0 24 24"><path d="M12 15V4M8 7.5 12 3.5l4 4M6 11H5v9h14v-9h-1"/></svg>',
  mute: '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9l5 6M21 9l-5 6"/></svg>',
  vol: '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/></svg>',
  click: '<svg viewBox="0 0 24 24"><path d="M9 4h6l3 16H6zM12 17V8M12 8l5-3"/></svg>',
  loop: '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 1 2.6 5.9"/><path d="M4 18.5V14h4.5"/></svg>',
  pen: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
  del: '<svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13"/></svg>',
  copy: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>',
};

let host = null, ctx = null, size = 'full', seq = null, roll = null, offs = [], raf = 0;
// экран: { view: 'list' | 'project' | 'track', pid, tid }
const V = { view: 'list', pid: null, tid: null };
const st = () => ctx.store.all();
const grid = () => (GRIDS.includes(st().grid) ? st().grid : 0.5);
const proj = () => (V.pid ? ctx.projects.get(V.pid) : null);
const track = () => { const p = proj(); return p && V.tid ? p.tracks.find((t) => t.id === V.tid) || null : null; };
const save = () => { const p = proj(); if (p) ctx.projects.save(p); };
const trName = (tr, i) => tr.name || ctx.t('tr.' + (tr.kind === 'chords' ? 'chords' : tr.kind === 'audio' ? 'audio' : 'notes')) + ' ' + (i + 1);
const fileName = (id) => { const r = id && ctx.files.get(id); return r ? r.name : ctx.t('tr.noFile'); };
const instName = (id) => ctx.t('inst.' + id);

/* ---------- разметка ---------- */

function listHTML() {
  const { t, ui } = ctx, L = ctx.projects.list().sort((a, b) => b.updatedAt - a.updatedAt);
  return '<div class="stlist">' + (L.length ? '<div class="group">' + L.map((p) => '<button class="cell stproj" data-open="' + p.id + '"><span class="grow"><b>' + ui.esc(p.name || t('untitled')) + '</b><span class="bksub">' +
    ui.esc(p.bpm + ' bpm · ' + keyLabel(p.key) + ' · ' + ctx.tn('bars', p.bars) + ' · ' + ctx.tn('tracks', p.tracks.length)) + '</span></span>' + ui.icons.chev + '</button>').join('') + '</div>' : '<p class="ftr">' + ui.esc(t('empty')) + '</p>') +
    '<div class="group" style="margin-top:14px"><button class="cell act center b" data-x="new">' + ui.esc(t('new')) + '</button></div></div>';
}
function transportHTML(p) {
  const { t, ui } = ctx, playing = seq && seq.playing, small = size === 'quarter' || size === 'strip';
  return '<div class="sttop' + (small ? ' sm' : '') + '">' +
    (small ? '' : ui.icb('data-x="back"', I.back, t('toList'), 'sm')) +
    '<button class="stplay' + (playing ? ' on' : '') + '" data-x="play" aria-label="' + ui.esc(t(playing ? 'stop' : 'play')) + '">' + (playing ? I.stop : I.play) + '</button>' +
    '<button class="stinfo" data-x="settings"><b class="num">' + p.bpm + '</b><span>' + ui.esc(keyLabel(p.key) + ' · ' + p.num + '/' + p.den + ' · ' + ctx.tn('bars', p.bars)) + '</span></button>' +
    '<span class="stpos num" id="stpos">1.1</span>' +
    (small ? '' : ui.icb('data-x="click"', I.click, t('click'), 'sm' + (seq && seq.click ? ' on' : '')) + ui.icb('data-x="loop"', I.loop, t('loop'), 'sm' + (p.loop ? ' on' : ''))) + '</div>';
}
function tracksHTML(p) {
  const { t, ui } = ctx;
  return '<div class="sttracks">' + p.tracks.map((tr, i) => '<div class="sttr' + (tr.mute ? ' muted' : '') + (tr.solo ? ' solo' : '') + '" data-tr="' + tr.id + '" style="--c:' + tr.color + '">' +
    '<button class="sttrmain" data-edit="' + tr.id + '"><i class="sttrdot"></i><span class="grow"><b>' + ui.esc(trName(tr, i)) + '</b><span class="bksub">' + ui.esc(tr.kind === 'audio' ? '♪ ' + fileName(tr.fileId) : instName(tr.inst) + ' · ' + (tr.kind === 'chords' ? ctx.tn('chordsN', tr.chords.length) + ' · ' + t('mode.' + tr.mode) : ctx.tn('notesN', tr.notes.length))) + '</span></span></button>' +
    '<button class="ic sm plain' + (tr.solo ? ' on' : '') + '" data-solo="' + tr.id + '" aria-pressed="' + tr.solo + '" aria-label="' + ui.esc(t('solo')) + '">S</button>' +
    '<button class="ic sm plain" data-mute="' + tr.id + '" aria-pressed="' + tr.mute + '" aria-label="' + ui.esc(t(tr.mute ? 'unmute' : 'mute')) + '">' + (tr.mute ? I.mute : I.vol) + '</button>' +
    '<input type="range" class="sttrvol" min="0" max="1.5" step="0.01" value="' + tr.vol + '" data-vol="' + tr.id + '" aria-label="' + ui.esc(t('vol')) + '"></div>').join('') +
    '<div class="stadd"><button class="lchip pick" data-x="addNotes">＋ ' + ui.esc(t('tr.notes')) + '</button><button class="lchip pick" data-x="addChords">＋ ' + ui.esc(t('tr.chords')) + '</button><button class="lchip pick" data-x="addAudio">＋ ' + ui.esc(t('tr.audio')) + '</button>' +
    '<button class="lchip pick" data-x="export">' + ui.esc(t('export')) + '</button></div></div>';
}
function trackHeadHTML(p, tr) {
  const { t, ui } = ctx, i = p.tracks.indexOf(tr);
  return '<div class="sthead" style="--c:' + tr.color + '">' + ui.icb('data-x="toProject"', I.back, t('toProject'), 'sm') + '<i class="sttrdot"></i><button class="grow sttitle" data-x="trackMenu"><b>' + ui.esc(trName(tr, i)) + '</b><span>' + ui.esc(instName(tr.inst)) + '</span></button>' +
    (tr.kind === 'notes' ? ui.seg('stgrid', [['1', '♩'], ['0.5', '♪'], ['0.25', '♬']], String(grid()), t('grid')) : '') + '</div>';
}
function view() {
  const p = proj();
  if (!p || V.view === 'list') return listHTML();
  const small = size === 'quarter' || size === 'strip';
  if (small) return '<div class="stwrap">' + transportHTML(p) + '</div>';
  const tr = V.view === 'track' && track();
  if (tr) return '<div class="stwrap">' + transportHTML(p) + trackHeadHTML(p, tr) + (tr.kind === 'chords' ? chordsHTML(ctx, p, tr) : '<div class="stroll" id="stroll"></div>') + '</div>';
  return '<div class="stwrap">' + transportHTML(p) + tracksHTML(p) + '</div>';
}

function render() {
  if (!host) return;
  if (roll) { roll.destroy(); roll = null; }
  const y = host.querySelector('.sttracks, .scbars'), sy = y ? y.scrollTop : 0;
  host.innerHTML = view();
  const y2 = host.querySelector('.sttracks, .scbars');
  if (y2 && sy) y2.scrollTop = sy;
  const rh = host.querySelector('#stroll');
  if (rh) {
    roll = createRoll(rh, () => ({ p: proj(), tr: track(), grid: grid() }), { change: () => save(), audition: (m) => seq.audition(track(), m) });
    rh.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  tickPos();
}
function tickPos() {
  cancelAnimationFrame(raf);
  if (!host || !seq) return;
  const p = proj(), el = host.querySelector('#stpos'), b = seq.pos();
  if (p && el) el.textContent = b < 0 ? '1.1' : (Math.floor(b / p.num) + 1) + '.' + (Math.floor(b % p.num) + 1);
  if (roll) { roll.pos(b); if (b >= 0) roll.follow(b); }
  if (seq.playing) raf = requestAnimationFrame(tickPos);
}

/* ---------- настройки проекта, меню дорожки ---------- */

function settingsSheet() {
  const { t, ui } = ctx, p = proj();
  const NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
  const row = (lab, right) => '<div class="cell"><span class="grow">' + ui.esc(lab) + '</span>' + right + '</div>';
  const step = (k, v, lab) => '<span class="stepper"><button type="button" data-st="' + k + '" data-d="-1" aria-label="' + ui.esc(lab + ' −') + '">−</button><b class="num stv">' + v + '</b><button type="button" data-st="' + k + '" data-d="1" aria-label="' + ui.esc(lab + ' +') + '">+</button></span>';
  const body = () => ui.snav(t('settings')) +
    '<div class="group"><label class="cell"><input class="inp left" data-name maxlength="40" placeholder="' + ui.esc(t('nameHint')) + '" value="' + ui.esc(p.name) + '" aria-label="' + ui.esc(t('pname')) + '"></label></div>' +
    '<div class="hdr">' + ui.esc(t('tempo')) + '</div><div class="group">' + row(t('bpm'), step('bpm', p.bpm, t('bpm'))) + row(t('meter'), ui.seg('stnum', [['3', '3/4'], ['4', '4/4'], ['6', '6/8']], String(p.num), t('meter'))) + row(t('barsLab'), step('bars', p.bars, t('barsLab'))) + '</div>' +
    '<div class="hdr">' + ui.esc(t('key')) + '</div><div class="hscroll" style="padding:0 4px">' + NAMES.map((n, pc) => '<button class="pill sm" data-key="' + pc + '" aria-pressed="' + (pc === p.key.pc) + '">' + n + '</button>').join('') + '</div>' +
    '<div class="group" style="margin-top:8px"><div class="cellcol">' + ui.seg('stmin', [['0', t('maj')], ['1', t('min')]], p.key.minor ? '1' : '0', t('key')) + '</div></div>' +
    '<div class="group" style="margin-top:16px"><button class="cell danger center" data-delproj>' + ui.esc(t('delete')) + '</button></div>';
  ui.sheet(body, (el, sh) => {
    el.addEventListener('input', (e) => { if (e.target.matches('[data-name]')) { p.name = e.target.value; save(); } });
    el.addEventListener('click', (e) => {
      let b;
      if ((b = e.target.closest('[data-st]'))) { const d = +b.dataset.d; if (b.dataset.st === 'bpm') p.bpm = Math.max(20, Math.min(300, p.bpm + d * (e.shiftKey ? 10 : 1))); else p.bars = Math.max(1, Math.min(BARS_MAX, p.bars + d)); normalizeProject(p); save(); sh.update(); }
      else if ((b = e.target.closest('[data-seg="stnum"] [data-v]'))) { p.num = +b.dataset.v; p.den = p.num === 6 ? 8 : 4; save(); sh.update(); }
      else if ((b = e.target.closest('[data-key]'))) { p.key.pc = +b.dataset.key; save(); sh.update(); }
      else if ((b = e.target.closest('[data-seg="stmin"] [data-v]'))) { p.key.minor = b.dataset.v === '1'; save(); sh.update(); }
      else if (e.target.closest('[data-delproj]')) ui.confirm(t('delTitle'), t('delText'), t('delete')).then((ok) => { if (!ok) return; seq.stop(); ctx.projects.remove(p.id); V.view = 'list'; V.pid = null; sh.close(); render(); });
    });
  }, { onClose: render });
}
function trackMenu(anchor, tr) {
  const { t, ui } = ctx, p = proj(), i = p.tracks.indexOf(tr);
  holdMenu(anchor, [
    { icon: I.pen, label: t('tr.rename'), run: () => ui.sheet(() => ui.snav(t('tr.rename')) + '<div class="group"><label class="cell"><input class="inp left" data-trn maxlength="30" value="' + ui.esc(tr.name) + '" placeholder="' + ui.esc(trName(tr, i)) + '" aria-label="' + ui.esc(t('tr.rename')) + '"></label></div>', (el) => { const inp = el.querySelector('[data-trn]'); setTimeout(() => inp.focus(), 80); inp.addEventListener('input', () => { tr.name = inp.value; save(); }); }, { onClose: render }) },
    ...(tr.kind === 'audio' ? [{ icon: I.vol, label: t('tr.pickFile'), run: () => filePicker(tr) }] : [{ icon: I.vol, label: t('tr.inst'), run: () => ui.sheet(() => ui.snav(t('tr.inst')) + '<div class="group">' + INSTRUMENTS.map((id) => '<button class="cell" data-inst="' + id + '"><span class="grow">' + ui.esc(instName(id)) + '</span>' + (tr.inst === id ? ui.icons.check : '') + '</button>').join('') + '</div>' +
      '<div class="hdr">' + ui.esc(t('tr.oct')) + '</div><div class="group"><div class="cellcol">' + ui.seg('stoct', [['-1', '−1'], ['0', '0'], ['1', '+1']], String(tr.oct || 0), t('tr.oct')) + '</div></div>' +
      '<div class="hdr">' + ui.esc(t('tr.color')) + '</div><div class="stcolors">' + COLORS.map((c) => '<button class="stcol' + (tr.color === c ? ' on' : '') + '" data-col="' + c + '" style="--c:' + c + '" aria-label="' + c + '"></button>').join('') + '</div>',
      (el, sh) => el.addEventListener('click', (e) => { let b; if ((b = e.target.closest('[data-inst]'))) { tr.inst = b.dataset.inst; seq.audition(tr, 60); } else if ((b = e.target.closest('[data-seg="stoct"] [data-v]'))) tr.oct = +b.dataset.v; else if ((b = e.target.closest('[data-col]'))) tr.color = b.dataset.col; else return; save(); sh.update(); }), { onClose: render }) }]),
    { icon: I.copy, label: t('tr.dup'), run: () => { const c = JSON.parse(JSON.stringify(tr)); c.id = newTrack().id; c.name = (tr.name || trName(tr, i)) + ' 2'; p.tracks.splice(i + 1, 0, c); save(); render(); } },
    { icon: I.del, label: t('tr.delete'), danger: true, run: () => { p.tracks.splice(i, 1); if (V.tid === tr.id) { V.view = 'project'; V.tid = null; } save(); render(); } },
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
// Экспорт: .mid (играется в пианино) или MusicXML (открывается в «Табах»)
function exportMenu(anchor) {
  const { t } = ctx;
  holdMenu(anchor, [{ icon: I.share, label: t('exportMidi'), run: exportMidi }, { icon: I.share, label: t('exportXml'), run: exportXml }], t('export'));
}
async function exportXml() {
  const { t } = ctx, p = proj();
  if (!p.tracks.some((tr) => tr.kind !== 'audio' && (tr.notes || tr.chords).length)) { ctx.ui.toast(t('err.empty')); return; }
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

function act(x, el) {
  const p = proj();
  switch (x) {
    case 'new': { const np = newProject({ songId: ctx.session && ctx.session.songId || null }); ctx.projects.save(np); V.pid = np.id; V.view = 'project'; render(); break; }
    case 'back': seq.stop(); V.view = 'list'; V.pid = null; render(); break;
    case 'toProject': V.view = 'project'; V.tid = null; render(); break;
    case 'play': if (!ctx.audio.unlock()) { ctx.ui.toast(ctx.t('err.sound')); return; } seq.toggle(); render(); break;
    case 'click': seq.click = !seq.click; render(); break;
    case 'loop': p.loop = !p.loop; save(); render(); break;
    case 'settings': settingsSheet(); break;
    case 'addNotes': case 'addChords': { const tr = newTrack(x === 'addChords' ? 'chords' : 'notes', p.tracks.length); p.tracks.push(tr); save(); V.tid = tr.id; V.view = 'track'; render(); break; }
    case 'export': exportMenu(el); break;
    case 'addAudio': { const tr = newTrack('audio', p.tracks.length); p.tracks.push(tr); save(); render(); filePicker(tr); break; }
    case 'trackMenu': trackMenu(el, track()); break;
  }
}
function onClick(e) {
  const p = proj(), g = (s) => e.target.closest(s);
  let b;
  if ((b = g('[data-x]'))) { act(b.dataset.x, b); return; }
  if ((b = g('[data-open]'))) { V.pid = b.dataset.open; V.view = 'project'; render(); return; }
  if (!p) return;
  if ((b = g('[data-edit]'))) { const tr = p.tracks.find((t) => t.id === b.dataset.edit); if (tr.kind === 'audio') { filePicker(tr); return; } V.tid = b.dataset.edit; V.view = 'track'; render(); return; }
  if ((b = g('[data-mute]'))) { const tr = p.tracks.find((t) => t.id === b.dataset.mute); tr.mute = !tr.mute; save(); render(); return; }
  if ((b = g('[data-solo]'))) { const tr = p.tracks.find((t) => t.id === b.dataset.solo); tr.solo = !tr.solo; save(); render(); return; }
  if ((b = g('[data-seg="stgrid"] [data-v]'))) { st().grid = +b.dataset.v; ctx.store.save(); render(); return; }
  const tr = track();
  if (tr && tr.kind === 'chords' && chordsAct(ctx, p, tr, e, () => { save(); render(); })) return;
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
    onHold(host, '.scch', (el2) => { const p = proj(), tr = track(); if (tr) chordHold(ctx, p, tr, el2, () => { save(); render(); }); });
    onHold(host, '.stproj', (b) => { const id = b.dataset.open; holdMenu(b, [{ icon: I.del, label: c.t('delete'), danger: true, run: () => c.ui.confirm(c.t('delTitle'), c.t('delText'), c.t('delete')).then((ok) => { if (ok) { c.projects.remove(id); render(); } }) }], (c.projects.get(id) || {}).name || c.t('untitled')); });
    sortable(host, '.sttr', 'data-tr', (ids) => { const p = proj(); p.tracks = ids.map((id) => p.tracks.find((t) => t.id === id)).filter(Boolean).concat(p.tracks.filter((t) => !ids.includes(t.id))); save(); render(); });
    render();
  },
  resize(sz) { size = sz; render(); },
  // Окно закрыто: проигрывание останавливается (черновик — не фон для занятия)
  unmount() {
    cancelAnimationFrame(raf);
    if (seq) seq.stop();
    if (roll) { roll.destroy(); roll = null; }
    offs.splice(0).forEach((f) => f());
    host = null;
  },
};
