// «Снять ноты» — запись из медиатеки → ноты (src/audio/transcribe.js: Basic Pitch в TensorFlow.js, на устройстве).
// Экран: список записей (и дорожек из «Дорожек» — вокал или бас отдельно снимаются точнее) во всё окно, касание
// запускает; во время счёта — ход во всё окно и «Прервать»; по концу — файл .mid в медиатеке рядом с записью
// (kind: 'midi', trans: { src }), его можно послушать и открыть в студии. Чувствительность и изгибы высоты — внизу списка.
import ru from './i18n/ru.json';
import uz from './i18n/uz.json';
import en from './i18n/en.json';
import el from './i18n/el.json';
import './transcribe.css';
import { transcribe } from '../../audio/transcribe.js';
import { readMidiSong } from '../../music/daw.js';
import { projectFromSong, isEmptyProject } from '../../music/project.js';
import { takeDur } from '../../music/midi.js';
import { after, cancel } from '../../audio/clock.js';

const ICON = '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 10h16M4 14h16M4 18h16"/><ellipse cx="9" cy="14.2" rx="2.3" ry="1.6" style="fill:currentColor"/><path d="M11.3 14V5.5l4 1.5"/></svg>';
const I = {
  stop: '<svg viewBox="0 0 24 24"><rect x="6.5" y="6.5" width="11" height="11" rx="2" style="fill:currentColor"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z" style="fill:currentColor"/></svg>',
  studio: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="4" height="4" rx="1"/><rect x="10" y="4" width="4" height="4" rx="1"/><rect x="17" y="4" width="4" height="4" rx="1"/><rect x="3" y="11" width="4" height="4" rx="1"/><rect x="17" y="11" width="4" height="4" rx="1"/><rect x="3" y="18" width="18" height="2.5" rx="1"/></svg>',
};

let host = null, ctx = null, onClick = null;
let R = null, last = null; // R — идущий счёт { src, job, stage, frac, t0 }; last — { src, rec } для экрана «готово»

const st = () => ctx.store.all();
const fmtT = (sec) => { const m = Math.floor(sec / 60), s = Math.round(sec % 60); return m ? m + ' ' + ctx.t('min') + (s ? ' ' + s + ' ' + ctx.t('sec') : '') : s + ' ' + ctx.t('sec'); };
const sources = () => ctx.files.list('audio').sort((a, b) => (b.created || 0) - (a.created || 0));
const resultOf = (id) => ctx.files.list('midi').find((r) => r.trans && r.trans.src === id);

function listHTML() {
  const { t, ui } = ctx, L = sources(), s = st();
  const row = (r) => { const done = resultOf(r.id); return '<button class="cell" data-src="' + r.id + '"><span class="grow">' + ui.esc(r.name) + '<span class="bksub">' + ui.esc((r.dur ? fmtT(r.dur) : '') + (done ? ' · ' + t('notesN', { n: done.notes || 0 }) : '')) + '</span></span>' + ui.icons.chev + '</button>'; };
  return '<div class="tnwrap"><div class="tnlist">' +
    (L.length ? '<div class="hdr">' + ui.esc(t('pick')) + '</div><div class="group">' + L.map(row).join('') + '</div>' : '<p class="ftr">' + ui.esc(t('empty')) + '</p>') +
    '<div class="hdr">' + ui.esc(t('opt.title')) + '</div><div class="group">' +
    '<div class="cellcol"><span>' + ui.esc(t('opt.sens')) + '</span>' + ui.seg('tnsens', [['normal', t('opt.sensNormal')], ['high', t('opt.sensHigh')]], s.sens || 'normal', t('opt.sens')) + '</div>' +
    '<button class="cell act" data-x="bends" aria-pressed="' + !!s.bends + '"><span class="grow">' + ui.esc(t('opt.bends')) + '<span class="bksub">' + ui.esc(t('opt.bendsHint')) + '</span></span><span class="val">' + (s.bends ? '✓' : '') + '</span></button></div>' +
    '<p class="ftr">' + ui.esc(t('hint')) + '</p></div></div>';
}
function runHTML() {
  const { t, ui } = ctx, pct = Math.round((R.frac || 0) * 100);
  return '<div class="tnwrap"><div class="tnrun"><div class="tnname">' + ui.esc(R.src.name) + '</div><div class="tnbig num">' + (R.stage === 'run' ? pct + ' %' : '…') + '</div>' +
    '<div class="tnbar"><b style="width:' + pct + '%"></b></div><div class="tnstage">' + ui.esc(t('stage.' + R.stage)) + '</div>' +
    '<button class="cell act center" data-x="cancel">' + I.stop + ' ' + ui.esc(t('cancel')) + '</button></div></div>';
}
function doneHTML() {
  const { t, ui } = ctx, r = last.rec;
  return '<div class="tnwrap"><div class="tnlist"><div class="hdr">' + ui.esc(last.src.name) + '</div>' +
    '<div class="tnsum"><b class="num">' + (r.notes || 0) + '</b><span>' + ui.esc(t('notesFound')) + '</span><span class="l2">' + ui.esc(fmtT(r.dur || 0)) + '</span></div>' +
    '<div class="group" style="margin-top:14px"><button class="cell act center" data-x="play">' + I.play + ' ' + ui.esc(t('listen')) + '</button>' +
    '<button class="cell act center b" data-x="studio">' + I.studio + ' ' + ui.esc(t('toStudio')) + '</button><button class="cell center" data-x="back">' + ui.esc(t('pick')) + '</button></div>' +
    '<p class="ftr">' + ui.esc(t('doneHint')) + '</p></div></div>';
}
function render() { if (!host) return; host.innerHTML = R ? runHTML() : last ? doneHTML() : listHTML(); }

async function start(r) {
  const { t } = ctx;
  if (R) { ctx.ui.toast(t('busy')); return; }
  const s = st();
  R = { src: r, stage: 'load', frac: 0, t0: Date.now() };
  R.job = transcribe(r.blob, { sens: s.sens || 'normal', bends: !!s.bends, name: r.name.replace(/\.[a-z0-9]+$/i, ''), onStage: (stage, f) => { if (!R) return; R.stage = stage; R.frac = f; render(); } });
  render();
  let res;
  try { res = await R.job.promise; } catch (e) {
    const cancelled = e && e.message === 'cancel';
    R = null; render();
    if (cancelled) { ctx.ui.toast(t('cancelled')); return; }
    ctx.logErr(e); ctx.ui.toast(t(/model|fetch|webgl|tensor/i.test(String(e && e.message)) ? 'err.load' : 'err.fail'));
    return;
  }
  // в медиатеку: один .mid рядом с записью; прежний результат по этой записи заменяется
  const base = r.name.replace(/\.[a-z0-9]+$/i, ''), at = Date.now(), old = resultOf(r.id);
  const rec = { id: old ? old.id : 'tn' + at.toString(36), name: base + ' — ' + t('fileSuffix') + '.mid', size: res.mid.length, type: 'audio/midi', kind: 'midi', tool: 'piano', songs: r.songs || [],
    created: at, blob: new Blob([res.mid], { type: 'audio/midi' }), take: { v: 1, ev: res.ev }, dur: takeDur(res.ev), notes: res.notes, trans: { src: r.id } };
  try { await ctx.files.add(rec); } catch (e) { ctx.logErr(e); R = null; render(); ctx.ui.toast(t('err.fail')); return; }
  R = null; last = { src: r, rec };
  render();
  ctx.ui.toast(res.notes ? t('saved', { n: res.notes }) : t('none'));
}
// Послушать: ноты звуком пианино по своим часам (инструмент открывать не нужно); повторное касание — стоп
let L = null;
function listen(rec) {
  if (L) { L.forEach(cancel); L = null; ctx.ui.toast(ctx.t('cancelled')); return; }
  const ev = (rec.take && rec.take.ev) || [], on = new Map();
  ev.forEach((e) => { if (e.k === 'on') on.set(e.id, e); });
  L = [];
  ev.forEach((e) => { if (e.k !== 'off') return; const s = on.get(e.id); if (!s) return; L.push(after(s.t * 1000, () => ctx.audio.playNote(Math.round(s.m), { dur: Math.max(0.08, e.t - s.t), preset: 'piano' }))); });
  const end = ev.length ? ev[ev.length - 1].t : 0;
  L.push(after(end * 1000 + 300, () => { L = null; }));
}
async function toStudio() {
  const { t } = ctx;
  try {
    const song = readMidiSong(new Uint8Array(await last.rec.blob.arrayBuffer()));
    song.name = last.src.name.replace(/\.[a-z0-9]+$/i, '');
    const p = projectFromSong(song);
    if (isEmptyProject(p)) { ctx.ui.toast(t('none')); return; }
    ctx.projects.save(p);
    ctx.ui.toast(t('studioMade'));
  } catch (e) { ctx.logErr(e); ctx.ui.toast(t('err.fail')); }
}

export default {
  id: 'transcribe',
  order: 49,
  name: { ru: ru.name, uz: uz.name, en: en.name, el: el.name },
  i18n: { ru, uz, en, el },
  icon: ICON,
  color: '#5E7A99',
  sizes: ['full', 'half'],
  status(c) { const n = c.files.list('midi').filter((r) => r.trans).length; return n ? c.tn('doneN', n) : c.t('st.idle'); },
  mount(el, c) {
    host = el; ctx = c;
    render();
    onClick = (e) => {
      let b;
      if ((b = e.target.closest('[data-src]'))) { const r = c.files.get(b.dataset.src); if (r && r.blob) { const d = resultOf(r.id); if (d && !e.altKey) { last = { src: r, rec: d }; render(); } else start(r); } return; }
      if ((b = e.target.closest('[data-seg="tnsens"] [data-v]'))) { st().sens = b.dataset.v; c.store.save(); render(); return; }
      if ((b = e.target.closest('[data-x]'))) {
        const x = b.dataset.x;
        if (x === 'cancel' && R) R.job.cancel();
        else if (x === 'bends') { st().bends = !st().bends; c.store.save(); render(); }
        else if (x === 'play' && last) listen(last.rec);
        else if (x === 'studio' && last) toStudio();
        else if (x === 'back') { last = null; render(); }
      }
    };
    host.addEventListener('click', onClick);
  },
  resize() { render(); },
  unmount() { if (host && onClick) host.removeEventListener('click', onClick); host = null; }, // счёт продолжается
};
