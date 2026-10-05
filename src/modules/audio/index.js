// Медиатека: минусы, партии, уроки и записи — только на устройстве. Плеер с волной или винилом,
// замедление без изменения высоты, повтор A–B, тренер темпа (+5 % с каждым повтором), привязка к песням.
// Перенесено из legacy/practice.html (AU, auLoad, audioHTML, wformHTML, medLibHTML, trackSheet, mlMenu, vinylHTML, VIN).
import './audio.css';
import ru from './i18n/ru.json';
import uz from './i18n/uz.json';
import en from './i18n/en.json';
import { fileSongs, inSong, linkSong } from '../../core/files.js';
import { fmtDur } from '../../core/format.js';

const ICON = '<svg viewBox="0 0 24 24"><path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2"/></svg>';
const I = {
  play: '<svg viewBox="0 0 24 24"><path d="M7 4.8v14.4c0 .8.9 1.3 1.6.9l11.3-7.2c.6-.4.6-1.4 0-1.8L8.6 3.9C7.9 3.5 7 4 7 4.8z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><rect x="6" y="5" width="4.2" height="14" rx="1.4"/><rect x="13.8" y="5" width="4.2" height="14" rx="1.4"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  minus: '<svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg>',
  list: '<svg viewBox="0 0 24 24"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1.2" fill="currentColor"/><circle cx="4.5" cy="12" r="1.2" fill="currentColor"/><circle cx="4.5" cy="18" r="1.2" fill="currentColor"/></svg>',
  back5: '<svg viewBox="0 0 24 24"><path d="M12 4.5a7.5 7.5 0 1 1-7.5 7.5M12 4.5 9 2M12 4.5 9 7"/><text x="12.5" y="15.5" text-anchor="middle" style="font:700 7.5px var(--font);fill:currentColor;stroke:none">5</text></svg>',
  fwd5: '<svg viewBox="0 0 24 24"><path d="M12 4.5a7.5 7.5 0 1 0 7.5 7.5M12 4.5 15 2M12 4.5 15 7"/><text x="11.5" y="15.5" text-anchor="middle" style="font:700 7.5px var(--font);fill:currentColor;stroke:none">5</text></svg>',
  more: '<svg viewBox="0 0 24 24" class="f"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
  disc: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="2.5"/></svg>',
  search: '<svg viewBox="0 0 16 16"><circle cx="7" cy="7" r="5"/><path d="m11 11 3.5 3.5"/></svg>',
};
const MB = 1048576;

/* ---------- плеер (один на приложение, играет и при закрытом окне) ---------- */

const AU = { el: null, cur: null, url: null, rate: 1, a: null, b: null, loop: false, step: false, raf: 0 };
const ML = { q: '', sort: 'date', f: 'all', view: 'lib' };
let host = null, ctx = null, size = 'full', input = null, uiTimer = 0, offs = [], app = null;

const fmtT = (s) => { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const st = () => ctx.store.all();
const tracks = () => ctx.files.list('audio');
const curSong = () => (ctx.session && ctx.session.songId) || null;
const audKey = () => (curSong() ? 'song:' + curSong() : 'free');
const style = () => (st().style === 'vinyl' ? 'vinyl' : 'wave');
const rateTxt = () => ctx.num(AU.rate, AU.rate * 100 % 10 ? 2 : AU.rate % 1 ? 1 : 0) + '×';
const sizeMb = (r) => ctx.t('mb', { n: ctx.num((r.size || 0) / MB, 1) });

function ensureEl(c) {
  if (AU.el) return;
  AU.el = new Audio();
  ['preservesPitch', 'webkitPreservesPitch', 'mozPreservesPitch'].forEach((k) => { try { AU.el[k] = true; } catch { /* ignore */ } });
  AU.el.addEventListener('loadedmetadata', () => { AU.el.playbackRate = AU.rate; render(); });
  AU.el.addEventListener('error', () => { if (AU.cur && ctx) ctx.ui.toast(ctx.t('cantPlay')); });
  AU.el.addEventListener('play', () => { loopStart(); if (document.querySelector('.mlist') && !document.activeElement?.hasAttribute?.('data-mlq')) render(); });
  AU.el.addEventListener('pause', () => { if (document.querySelector('.mlist') && !document.activeElement?.hasAttribute?.('data-mlq')) render(); });
  AU.el.addEventListener('ended', () => { if (host && host.querySelector('#vdisc') && !AU.loop) { try { AU.el.currentTime = 0; } catch { /* ignore */ } } });
  const vol = () => { AU.el.volume = c.audio.mixer.elementVolume('media'); };
  vol();
  c.audio.mixer.subscribe(vol);
  c.audio.mixer.probe('media', () => !!(AU.cur && !AU.el.paused));
}

// Повтор A–B и тренер темпа, пока идёт воспроизведение
function loopStart() {
  if (AU.raf) return;
  const tick = () => {
    if (AU.el.paused) { AU.raf = 0; return; }
    if (AU.loop && AU.b != null && AU.el.currentTime >= AU.b) {
      AU.el.currentTime = AU.a || 0;
      if (AU.step && AU.rate < 1) {
        setRate(Math.min(1, AU.rate + 0.05));
        const rv = host && host.querySelector('#ratev');
        if (rv) rv.textContent = rateTxt();
        if (ctx) ctx.ui.toast(ctx.t('rateToast', { rate: rateTxt() }));
      }
    }
    AU.raf = requestAnimationFrame(tick);
  };
  AU.raf = requestAnimationFrame(tick);
}

function load(t) {
  st().last = st().last || {};
  st().last[audKey()] = t.id;
  ctx.store.save();
  if (AU.url) URL.revokeObjectURL(AU.url);
  AU.cur = t;
  AU.url = URL.createObjectURL(t.blob);
  AU.el.src = AU.url;
  AU.el.defaultPlaybackRate = AU.rate;
  AU.el.playbackRate = AU.rate;
  AU.a = AU.b = null;
  AU.loop = false;
}

function setRate(r) {
  AU.rate = Math.max(0.5, Math.min(1.5, Math.round(r * 100) / 100));
  AU.el.defaultPlaybackRate = AU.rate;
  AU.el.playbackRate = AU.rate;
}

const playEl = () => AU.el.play().catch(() => ctx.ui.toast(ctx.t('cantPlay')));

// Выбранный в этом месте файл (свободная практика или песня) ждёт готовым
function autoAudio() {
  const sid = curSong();
  if (AU.cur && (!sid || inSong(AU.cur, sid))) return;
  const lid = (st().last || {})[audKey()], list = tracks();
  let t = list.find((x) => x.id === lid && (!sid || inSong(x, sid)));
  if (!t && sid) t = list.find((x) => inSong(x, sid));
  if (t && t !== AU.cur) { try { if (!AU.el.paused) AU.el.pause(); } catch { /* ignore */ } load(t); }
}

/* ---------- волна ---------- */

async function computePeaks(t) {
  if (t.peaks || t._busy) return;
  t._busy = true;
  try {
    const C = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext, oc = new C(1, 8000, 8000);
    const buf = await oc.decodeAudioData(await t.blob.arrayBuffer());
    t.dur = buf.duration;
    const N = 480, ch = [];
    for (let c = 0; c < buf.numberOfChannels; c++) ch.push(buf.getChannelData(c));
    const len = ch[0].length, step = Math.max(1, Math.floor(len / N)), pk = [];
    let mx = 0;
    for (let i = 0; i < N; i++) {
      let m = 0;
      const s = i * step, e = Math.min(len, s + step);
      for (let j = s; j < e; j += 4) for (const d of ch) { const v = Math.abs(d[j]); if (v > m) m = v; }
      pk.push(m);
      if (m > mx) mx = m;
    }
    t.peaks = pk.map((v) => Math.round((v / (mx || 1)) * 100) / 100);
    t._busy = false;
    ctx.files.save(t);
  } catch { t.peaks = []; t._busy = false; }
  render();
}

let queueBusy = false;
async function queuePeaks() {
  if (queueBusy) return;
  queueBusy = true;
  try { for (const t of tracks().slice()) if (!t.peaks && !t._busy) await computePeaks(t); } catch { /* ignore */ }
  queueBusy = false;
}

function wformHTML(cls) {
  const t = AU.cur, d = AU.el.duration || 0, { t: tr } = ctx;
  if (!t.peaks) { computePeaks(t); return '<div class="wform ' + cls + ' wait" id="wform"><span class="l2">' + tr('waveWait') + '</span><i class="wfhead" id="wfhead"></i></div>'; }
  const pk = t.peaks.length ? t.peaks : Array(120).fill(0.15), N = pk.length;
  let p = '';
  pk.forEach((v, i) => { const hh = Math.max(1.5, v * 46); p += 'M' + (i + 0.5) + ' ' + (50 - hh) + 'V' + (50 + hh); });
  const ax = d && AU.a != null ? (AU.a / d) * N : null, bx = d && AU.b != null ? (AU.b / d) * N : null;
  return '<div class="wform ' + cls + '" id="wform" role="slider" tabindex="0" aria-label="' + tr('waveAria') + '" aria-valuemin="0" aria-valuemax="' + Math.round(d) +
    '" aria-valuenow="' + Math.round(AU.el.currentTime) + '"><svg viewBox="0 0 ' + N + ' 100" preserveAspectRatio="none" aria-hidden="true"><defs><clipPath id="wfc"><rect id="wfclip" x="0" y="0" width="' +
    (d ? (AU.el.currentTime / d) * N : 0) + '" height="100"/></clipPath></defs>' +
    (ax != null ? '<rect class="wfloop" x="' + ax + '" y="0" width="' + ((bx != null ? bx : ax + 0.6) - ax) + '" height="100"/>' : '') +
    '<path class="wfbase" d="' + p + '"/><path class="wfplayed" d="' + p + '" clip-path="url(#wfc)"/></svg>' +
    (ax != null ? '<i class="wfh a" data-h="a" style="left:' + (ax / N) * 100 + '%"><b>A</b></i>' : '') +
    (bx != null ? '<i class="wfh b" data-h="b" style="left:' + (bx / N) * 100 + '%"><b>B</b></i>' : '') +
    '<i class="wfhead" id="wfhead" style="left:' + (d ? (AU.el.currentTime / d) * 100 : 0) + '%"></i></div>';
}

/* ---------- разметка ---------- */

const icb = (...a) => ctx.ui.icb(...a);
const esc = (s) => ctx.ui.esc(s);
const hueOf = (s) => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h % 360; };

function artHTML(t, cls) {
  const pk = t.peaks && t.peaks.length ? t.peaks : null;
  let p = '';
  if (pk) {
    const N = 28, s = pk.length / N;
    for (let i = 0; i < N; i++) { const v = pk[Math.floor(i * s)] || 0, hh = Math.max(1, v * 12); p += 'M' + (4 + i * 1.15).toFixed(2) + ' ' + (20 - hh).toFixed(1) + 'V' + (20 + hh).toFixed(1); }
  }
  return '<span class="mlart ' + (cls || '') + '" style="--h:' + hueOf(t.name) + '">' + (pk ? '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="' + p + '"/></svg>' : ICON) +
    (AU.cur && AU.cur.id === t.id && !AU.el.paused ? '<i class="eq"><b></b><b></b><b></b></i>' : '') + '</span>';
}

function songTitles(t, except) {
  const all = ctx.songs();
  return fileSongs(t).map((id) => all.find((s) => s.id === id)).filter(Boolean).filter((s) => s.id !== except).map((s) => esc(s.title));
}

function libHTML() {
  const { t, tn } = ctx;
  let list = tracks().slice();
  queuePeaks();
  if (ML.q) { const q = ML.q.toLowerCase(); list = list.filter((x) => x.name.toLowerCase().includes(q)); }
  if (ML.f === 'songs') list = list.filter((x) => fileSongs(x).length);
  else if (ML.f === 'free') list = list.filter((x) => !fileSongs(x).length);
  const so = { date: (a, b) => (b.created || 0) - (a.created || 0), name: (a, b) => a.name.localeCompare(b.name, ctx.lang()), size: (a, b) => (b.size || 0) - (a.size || 0), dur: (a, b) => (b.dur || 0) - (a.dur || 0) };
  list.sort(so[ML.sort] || so.date);
  const all = tracks(), tot = all.reduce((s, x) => s + (x.size || 0), 0), totd = all.reduce((s, x) => s + (x.dur || 0), 0);
  let h = '<div class="medlib"><div class="mlhead"><label class="mlsearch">' + I.search + '<input type="search" data-mlq placeholder="' + t('search') + '" aria-label="' + t('search') +
    '" value="' + esc(ML.q) + '"></label>' + icb('data-x="aadd"', I.plus, t('addFile'), 'sm') + '</div>' +
    '<div class="mlbar"><div class="mlfil" role="group">' + [['all', t('f.all')], ['songs', t('f.songs')], ['free', t('f.free')]].map(([k, n]) => '<button class="' + (ML.f === k ? 'on' : '') +
      '" data-x="mlf" data-v="' + k + '" aria-pressed="' + (ML.f === k) + '">' + n + '</button>').join('') + '</div><select class="sortsel" data-mls aria-label="' + t('sort') + '">' +
    [['date', t('s.date')], ['name', t('s.name')], ['dur', t('s.dur')], ['size', t('s.size')]].map(([v, l]) => '<option value="' + v + '"' + (ML.sort === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></div>';
  if (!all.length) h += '<div class="aempty"><div class="aeico">' + ICON + '</div><div class="aet">' + t('emptyLib') + '</div><div class="ael">' + t('emptyLibText') + '</div><div class="group aeg"><button class="cell act" data-x="aadd">' + t('upload') + '</button></div></div>';
  else if (!list.length) h += '<div class="aempty"><div class="ael">' + t('notFound') + '</div></div>';
  else {
    h += '<div class="mlist">' + list.map((x) => {
      const sn = songTitles(x), cur = AU.cur && AU.cur.id === x.id;
      return '<div class="mlrow' + (cur ? ' cur' : '') + '"><button class="mlmain" data-x="mlplay" data-id="' + x.id + '" aria-label="' + t(cur && !AU.el.paused ? 'pauseX' : 'playX', { name: x.name }) +
        '">' + artHTML(x) + '<span class="mltxt"><b>' + esc(x.name) + '</b><small>' + [x.dur ? fmtT(x.dur) : '', sizeMb(x), sn.join(', ')].filter(Boolean).join(' · ') +
        '</small></span></button><button class="ic sm plain mlmore" data-x="mlmenu" data-id="' + x.id + '" aria-label="' + t('fileActions', { name: x.name }) + '">' + I.more + '</button></div>';
    }).join('') + '</div>';
  }
  if (all.length) h += '<p class="ftr" style="text-align:center">' + tn('files', all.length) + (totd ? ' · ' + fmtDur(totd) : '') + ' · ' + t('onDevice', { mb: ctx.num(tot / MB, 1) }) + '</p>';
  h += '</div>';
  if (AU.cur) {
    h += '<div class="mlmini"><button class="mlmmain" data-x="mlopen" aria-label="' + t('openPlayer') + '">' + artHTML(AU.cur, 'sm') + '<span class="mltxt"><b>' + esc(AU.cur.name) +
      '</b><small><span id="acur" class="num">' + fmtT(AU.el.currentTime) + '</span>' + (AU.rate !== 1 ? ' · ' + rateTxt() : '') + '</small></span></button><button class="bigplay mlpl" data-x="aplay" id="aplay" aria-label="' +
      t('playPause') + '">' + (AU.el.paused ? I.play : I.pause) + '</button><i class="mlprog"><b id="mlprog" style="width:' + (AU.el.duration ? (AU.el.currentTime / AU.el.duration) * 100 : 0) + '%"></b></i></div>';
  }
  return '<div class="mlwrap">' + h + '</div>';
}

function controls() {
  const { t } = ctx, ab = AU.b != null ? 'on' : AU.a != null ? 'a' : '';
  return {
    play: '<button class="bigplay" data-x="aplay" id="aplay" aria-label="' + t('playPause') + '">' + (AU.el.paused ? I.play : I.pause) + '</button>',
    rate: icb('data-step="arate" data-d="-1"', I.minus, t('slower'), 'sm') + '<button class="ratev num" id="ratev" data-x="arate1" aria-label="' + t('rate1') + '">' + rateTxt() + '</button>' +
      icb('data-step="arate" data-d="1"', I.plus, t('faster'), 'sm'),
    back: icb('data-x="aback"', I.back5, t('back5')),
    fwd: icb('data-x="afwd"', I.fwd5, t('fwd5')),
    abb: '<button class="ic txt' + (ab === 'on' ? ' act' : '') + '" data-x="aab" aria-pressed="' + (ab === 'on') + '" aria-label="' + t('ab') + '">' + (ab === 'a' ? 'B?' : 'A–B') + '</button>',
    stepb: '<button class="ic txt sm' + (AU.step ? ' act' : '') + '" data-x="astep" aria-pressed="' + AU.step + '" aria-label="' + t('stepUp') + '">+5%↻</button>',
    list: icb('data-x="alist"', I.list, t('files.btn')),
    time: '<span id="acur" class="num">' + fmtT(AU.el.currentTime) + '</span>',
    sty: (cls) => icb('data-x="astyle"', I.disc, t('styleBtn'), cls),
    back2: !curSong() && ML.view === 'player' ? '<button class="mlback" data-x="mllib">' + t('backLib') + '</button>' : '',
  };
}

function vinylHTML() {
  const { t } = ctx, tr = AU.cur, d = AU.el.duration || 0, fr = d ? AU.el.currentTime / d : 0, R = 46, C = 2 * Math.PI * R, c = controls();
  setTimeout(vinStart, 0);
  const disc = '<div class="vdisc" id="vdisc" style="--h:' + hueOf(tr.name) + '" role="group" aria-label="' + t('discAria') + '"><svg viewBox="0 0 100 100" class="vring" aria-hidden="true"><circle cx="50" cy="50" r="' + R +
    '" class="vtrk"/><path id="vab" class="vab" d=""/><g id="vabm"></g><circle cx="50" cy="50" r="' + R + '" class="vprog" id="vprog" stroke-dasharray="' + (C * fr).toFixed(1) + ' ' + C.toFixed(1) +
    '" transform="rotate(-90 50 50)"/></svg><span class="vrec"><i class="vgr"></i><span class="vlab"><b>' + esc(tr.name.slice(0, 18)) + '</b></span><i class="vhole"></i></span><span class="varm" style="transition:none;transform:rotate(' +
    (!AU.el.paused || AU.el.currentTime > 0.05 ? 5 + 27 * fr : -6).toFixed(2) + 'deg)" aria-label="' + t('armAria') + '"></span><button class="vstate" data-x="aplay" aria-label="' + t('playPause') + '">' +
    (!AU.el.paused ? I.pause : I.play) + '</button></div>';
  const time = '<div class="vtime num"><span id="acur">' + fmtT(AU.el.currentTime) + '</span> / ' + fmtT(d) + '</div>';
  if (size === 'strip') return '<div class="srow2 vstrip">' + disc + '<div class="sgrow" style="min-width:0;text-align:left"><div class="aname">' + esc(tr.name) + '</div>' + time + '</div><div class="vrow tight">' + c.rate + '</div></div>';
  if (size === 'quarter') return '<div class="vq vqv">' + disc + time + '<div class="vrow tight">' + c.rate + '</div></div>';
  return '<div class="vwrap ' + size + '">' + c.back2 + '<div class="vtop"><div class="aname sgrow" style="text-align:left">' + esc(tr.name) + '</div>' + c.sty('sm') + '</div><div class="vbody">' + disc +
    '<div class="vside">' + time + wformHTML('s') + '<div class="vrow tight vrate">' + c.rate + '</div><div class="ctrl5 vctl">' + c.list + c.back + c.fwd + c.abb + '</div></div></div></div>';
}

function playerHTML() {
  const { t } = ctx, sid = curSong();
  autoAudio();
  if (!sid && (size === 'full' || size === 'half') && !(ML.view === 'player' && AU.cur)) return libHTML();
  const all = tracks();
  if (!AU.cur) {
    const add = icb('data-x="aadd"', I.plus, t('addAudio')), list = icb('data-x="alist"', I.list, t('files.btn'));
    if (size === 'quarter' || size === 'strip') {
      return '<div class="' + (size === 'strip' ? 'srow2' : 'vq') + '"><span class="aeico sm">' + ICON + '</span><span class="bpmlbl sgrow">' + t(sid ? 'noSongAudio' : 'name') + '</span>' +
        (all.length && sid ? icb('data-x="apick"', I.list, t('pickFromLib')) : all.length ? list : '') + add + '</div>';
    }
    return '<div class="aempty"><div class="aeico">' + ICON + '</div><div class="aet">' + t(sid ? 'songEmpty' : 'emptyLib') + '</div><div class="ael">' + t('emptyText') + '</div><div class="group aeg">' +
      '<button class="cell act" data-x="aadd">' + t('upload') + '</button>' + (all.length && sid ? '<button class="cell act" data-x="apick">' + t('pickFromLib') + '</button>' : '') + '</div></div>';
  }
  const c = controls(), d = AU.el.duration || 0, name = '<div class="aname">' + esc(AU.cur.name) + '</div>';
  if (size === 'quarter') return '<div class="vq">' + name + wformHTML('q') + '<div class="l2" style="font-size:12px">' + c.time + '</div>' + c.play + '<div class="vrow tight">' + c.rate + '</div></div>';
  if (size === 'strip') {
    return '<div class="vs"><div class="srow2" style="flex:none">' + name + '<span class="sgrow"></span><span class="l2" style="font-size:12px">' + c.time + '</span></div>' + wformHTML('s') +
      '<div class="srow2" style="flex:none">' + c.back + c.play + c.fwd + '<span class="sgrow"></span><div class="vrow tight">' + c.rate + '</div></div></div>';
  }
  if (style() === 'vinyl') return vinylHTML();
  const sf = sid ? all.filter((x) => inSong(x, sid)) : [];
  const chips = (cls) => '<div class="chips nowrap afiles' + cls + '">' + sf.map((x) => '<button class="chip' + (x.id === AU.cur.id ? ' on' : '') + '" data-x="aload2" data-id="' + x.id + '">' + esc(x.name) + '</button>').join('') + '</div>';
  if (size === 'half') {
    return '<div class="ah2">' + c.back2 + '<div class="arow3">' + (sf.length > 1 ? chips(' sgrow') : '<div class="aname sgrow" style="text-align:left">' + esc(AU.cur.name) + '</div>') +
      '<div class="vrow tight">' + c.rate + c.sty('sm') + '</div></div><div class="wfbox">' + wformHTML('h2') + '<span class="wft num">' + c.time + '</span></div><div class="ctrl5">' +
      c.list + c.back + c.play + c.fwd + c.abb + '</div></div>';
  }
  return '<div class="mcard av" style="position:relative">' + c.sty('corner') + c.back2 + (sf.length > 1 ? chips('') : name) + wformHTML('f') +
    '<div class="num l2 atimes">' + c.time + '<span>' + (AU.a != null ? 'A ' + fmtT(AU.a) + (AU.b != null ? ' – B ' + fmtT(AU.b) : '') : t('dragHint')) + '</span><span id="adur">' + fmtT(d) + '</span></div>' +
    '<div class="vrow tight arow2">' + c.rate + c.stepb + '</div><div class="ctrl5">' + c.list + c.back + c.play + c.fwd + c.abb + '</div></div>';
}

function render() {
  if (!host || !ctx) return;
  host.innerHTML = playerHTML();
}

/* ---------- обновление по ходу воспроизведения ---------- */

function uiTick() {
  if (!host || !AU.cur) return;
  const q = (s) => host.querySelector(s), d = AU.el.duration;
  const mp = q('#mlprog');
  if (mp && d) mp.style.width = (AU.el.currentTime / d) * 100 + '%';
  const wh = q('#wfhead');
  if (wh && d) {
    const fr = AU.el.currentTime / d;
    wh.style.left = fr * 100 + '%';
    const cl = q('#wfclip');
    if (cl) cl.setAttribute('width', fr * ((AU.cur.peaks || []).length || 120));
    const wf = q('#wform');
    if (wf) wf.setAttribute('aria-valuenow', Math.round(AU.el.currentTime));
  }
  const c1 = q('#acur');
  if (c1) c1.textContent = fmtT(AU.el.currentTime);
  const c2 = q('#adur');
  if (c2) c2.textContent = fmtT(d);
  const ap = q('#aplay');
  if (ap) { const w = AU.el.paused ? 'p' : 's'; if (ap.dataset.st !== w) { ap.dataset.st = w; ap.innerHTML = AU.el.paused ? I.play : I.pause; } }
}

/* ---------- винил ---------- */

const VIN = { ang: 0, t: 0, drag: null, arm: null, raf: 0 };
const arcD = (cx, cy, r, a0, a1) => {
  const p = (a) => [cx + r * Math.cos((a * Math.PI) / 180), cy + r * Math.sin((a * Math.PI) / 180)], [x0, y0] = p(a0), [x1, y1] = p(a1);
  return 'M' + x0.toFixed(2) + ' ' + y0.toFixed(2) + 'A' + r + ' ' + r + ' 0 ' + (a1 - a0 > 180 ? 1 : 0) + ' 1 ' + x1.toFixed(2) + ' ' + y1.toFixed(2);
};

function vinLoop() {
  const d = host && host.querySelector('#vdisc');
  if (!d) { VIN.raf = 0; return; }
  const now = performance.now(), dt = VIN.t ? (now - VIN.t) / 1000 : 0;
  VIN.t = now;
  const rec = d.querySelector('.vrec'), arm = d.querySelector('.varm'), dur = AU.el.duration || 0, fr = dur ? AU.el.currentTime / dur : 0, ct = AU.el.currentTime;
  // перемотка назад (повтор A–B) — пластинка быстро крутится обратно
  if (!VIN.drag && VIN.lt != null && ct < VIN.lt - 0.25) {
    VIN.rw = (VIN.rw || 0) - Math.min(420, ((VIN.lt - ct) / 1.8) * 360);
    d.classList.remove('rew'); void d.offsetWidth; d.classList.add('rew');
  }
  VIN.lt = ct;
  if (VIN.rw) { const s = VIN.rw * Math.min(1, dt * 3.2); VIN.ang = (VIN.ang + s + 3600) % 360; VIN.rw -= s; if (Math.abs(VIN.rw) < 1) VIN.rw = 0; }
  // 33⅓ оборота: один оборот за 1,8 с, с учётом скорости
  const target = !VIN.drag && AU.cur && !AU.el.paused ? 360 / (1.8 / AU.rate) : 0;
  VIN.w = (VIN.w || 0) + (target - (VIN.w || 0)) * Math.min(1, dt * (target ? 2.2 : 3.2));
  if (!VIN.drag) VIN.ang = (VIN.ang + dt * VIN.w) % 360;
  d.classList.toggle('playing', !AU.el.paused);
  const key = (AU.a == null ? '-' : AU.a.toFixed(2)) + '|' + (AU.b == null ? '-' : AU.b.toFixed(2)) + '|' + dur.toFixed(1);
  if (d.dataset.abk !== key && dur) {
    d.dataset.abk = key;
    const ab = d.querySelector('#vab'), mk = d.querySelector('#vabm'), ang = (f) => -90 + f * 359.9, hasB = AU.a != null && AU.b != null, prevB = VIN.hadB;
    VIN.hadB = hasB;
    if (ab) {
      if (hasB) {
        ab.setAttribute('pathLength', '100');
        ab.setAttribute('d', arcD(50, 50, 46, ang(AU.a / dur), ang(Math.max(AU.a, AU.b) / dur)));
        ab.classList.remove('out');
        if (!prevB) { ab.classList.remove('in'); void ab.getBoundingClientRect(); ab.classList.add('in'); }
      } else if (prevB && ab.getAttribute('d')) {
        ab.classList.add('out');
        setTimeout(() => { if (!VIN.hadB) ab.setAttribute('d', ''); }, 420);
      } else ab.setAttribute('d', '');
    }
    const newA = AU.a != null && VIN.hadA !== true;
    VIN.hadA = AU.a != null;
    if (mk) {
      mk.innerHTML = [['A', AU.a], ['B', AU.b]].filter((x) => x[1] != null).map(([l, v]) => {
        const a = (ang(v / dur) * Math.PI) / 180, x = 50 + 46 * Math.cos(a), y = 50 + 46 * Math.sin(a);
        return '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="4.2" class="vabd' + ((l === 'A' && newA) || (l === 'B' && hasB && !prevB) ? ' pop' : '') + '" style="transform-origin:' +
          x.toFixed(1) + 'px ' + y.toFixed(1) + 'px"/><text x="' + x.toFixed(1) + '" y="' + (y + 2).toFixed(1) + '" text-anchor="middle" class="vabt">' + l + '</text>';
      }).join('');
    }
    d.classList.toggle('loop', AU.b != null);
  }
  const pg = d.querySelector('#vprog');
  if (pg && dur) { const C = 2 * Math.PI * 46; pg.setAttribute('stroke-dasharray', (C * fr).toFixed(1) + ' ' + C.toFixed(1)); }
  if (rec) rec.style.transform = 'rotate(' + VIN.ang.toFixed(2) + 'deg)';
  if (arm && arm.style.transition === 'none') { if (arm.dataset.f) arm.style.transition = ''; else arm.dataset.f = 1; }
  if (arm && !VIN.arm) { const on = !AU.el.paused || AU.el.currentTime > 0.05; arm.style.transform = 'rotate(' + (on ? 5 + 27 * fr : -6) + 'deg)'; }
  const sb = d.querySelector('.vstate');
  if (sb) { const p = !AU.el.paused; if (sb.dataset.p !== String(p)) { sb.dataset.p = String(p); sb.innerHTML = p ? I.pause : I.play; } }
  VIN.raf = requestAnimationFrame(vinLoop);
}
function vinStart() { if (!VIN.raf) { VIN.t = 0; VIN.raf = requestAnimationFrame(vinLoop); } }

/* ---------- шторки ---------- */

function trackRow(x, sid, mode) {
  const { t } = ctx, sn = songTitles(x, sid);
  return '<div class="cell"><button class="grow" data-tl="' + x.id + '" style="text-align:left;min-width:0"><div class="ttl' + (AU.cur && AU.cur.id === x.id ? ' tintc' : '') + '">' + esc(x.name) +
    '</div><div class="st">' + sizeMb(x) + (sn.length ? ' · ' + sn.join(', ') : '') + '</div></button>' +
    (mode === 'song' ? '<button class="link" data-tu="' + x.id + '" style="font-size:14px;color:var(--l2)">' + t('unlink') + '</button>'
      : mode === 'pick' ? icb('data-tp="' + x.id + '"', I.plus, t('addToSong'), 'sm')
        : '<button class="ic sm" data-td="' + x.id + '" aria-label="' + esc(t('deleteX', { name: x.name })) + '" style="color:var(--red)">' + I.minus + '</button>') + '</div>';
}

async function removeTrack(x) {
  const { t, ui } = ctx;
  if (!(await ui.confirm(t('delTitle', { name: x.name }), t('delText'), t('delete')))) return;
  if (AU.cur && AU.cur.id === x.id) { AU.el.pause(); AU.cur = null; }
  await ctx.files.remove(x.id);
  render();
}

function trackSheet() {
  const { t, tn, ui } = ctx, sid = curSong();
  const body = () => {
    const all = tracks(), mine = sid ? all.filter((x) => inSong(x, sid)) : [], tot = all.reduce((s, x) => s + (x.size || 0), 0);
    return ui.snav(t(sid ? 'songAudio' : 'name')) + (sid
      ? '<div class="group">' + mine.map((x) => trackRow(x, sid, 'song')).join('') + '<button class="cell act" data-tpick>' + t('pickFromLib') + '</button><button class="cell act" data-tadd>' +
        t('uploadNew') + '</button></div><p class="ftr">' + t('newGoesBoth') + '</p>'
      : '<div class="group">' + all.map((x) => trackRow(x, null, 'lib')).join('') + '<button class="cell act" data-tadd>' + t('upload') + '</button></div>') +
      '<p class="ftr">' + (ctx.files.noDb ? t('noDb') : t('libInfo', { files: tn('files', all.length), mb: ctx.num(tot / MB, 1) })) + '</p>';
  };
  ui.sheet(body, (el, sh) => el.addEventListener('click', (e) => {
    const g = (s) => e.target.closest(s);
    let b;
    if (g('[data-tadd]')) { sh.close(); addFile(); return; }
    if (g('[data-tpick]')) { sh.close(); pickSheet(sid); return; }
    if ((b = g('[data-tl]'))) { const x = ctx.files.get(b.dataset.tl); if (x) load(x); sh.close(); render(); return; }
    if ((b = g('[data-tu]'))) { const x = ctx.files.get(b.dataset.tu); linkSong(x, sid, false); ctx.files.save(x); sh.update(); render(); return; }
    if ((b = g('[data-td]'))) { const x = ctx.files.get(b.dataset.td); sh.close(); removeTrack(x); }
  }));
}

function pickSheet(sid) {
  const { t, ui } = ctx;
  const body = () => {
    const rest = tracks().filter((x) => !inSong(x, sid));
    return ui.snav(t('fromLib'), { left: '<button class="link l" data-back>' + t('back') + '</button>', right: '<span></span>' }) + '<div class="group">' +
      (rest.length ? rest.map((x) => trackRow(x, sid, 'pick')).join('') : '<div class="cell l2">' + t('allInSong') + '</div>') + '</div>';
  };
  ui.sheet(body, (el, sh) => el.addEventListener('click', (e) => {
    if (e.target.closest('[data-back]')) { sh.close(); trackSheet(); return; }
    const p = e.target.closest('[data-tp]');
    if (!p) return;
    const x = ctx.files.get(p.dataset.tp);
    linkSong(x, sid, true);
    ctx.files.save(x);
    ui.toast(t('addedToSong'));
    sh.update();
    render();
  }));
}

function menuSheet(id) {
  const { t, ui } = ctx, x = ctx.files.get(id);
  if (!x) return;
  const body = () => {
    const songs = ctx.songs();
    return ui.snav(x.name) + '<div class="mlmh">' + artHTML(x, 'big') + '<div><b>' + esc(x.name) + '</b><div class="l2" style="font-size:13px">' + [x.dur ? fmtT(x.dur) : '', sizeMb(x)].filter(Boolean).join(' · ') +
      '</div></div></div><div class="group"><button class="cell act" data-m="play">' + t('play') + '</button><button class="cell act" data-m="ren">' + t('rename') + '</button></div>' +
      '<div class="hdr">' + t('addToSongs') + '</div><div class="group">' + (songs.length ? songs.map((s) => '<button class="cell" data-m="song" data-sg="' + s.id + '" aria-pressed="' + inSong(x, s.id) +
        '"><span class="grow">' + esc(s.title) + '</span>' + (inSong(x, s.id) ? ui.icons.check : '') + '</button>').join('') : '<div class="cell l2">' + t('noSongs') + '</div>') + '</div>' +
      '<div class="group" style="margin-top:16px"><button class="cell danger center" data-m="del">' + t('delFromLib') + '</button></div>';
  };
  ui.sheet(body, (el, sh) => el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-m]');
    if (!b) return;
    const m = b.dataset.m;
    if (m === 'play') { load(x); playEl(); sh.close(); render(); }
    else if (m === 'song') { linkSong(x, b.dataset.sg, !inSong(x, b.dataset.sg)); ctx.files.save(x); sh.update(); render(); }
    else if (m === 'ren') renameSheet(x, () => sh.update());
    else if (m === 'del') { sh.close(); removeTrack(x); }
  }));
}

function renameSheet(x, after) {
  const { t, ui } = ctx;
  ui.sheet(() => ui.snav(t('nameTitle'), { left: '<button class="link l" data-close>' + t('cancel') + '</button>', right: '<button class="link b r" id="rnok">' + t('save') + '</button>' }) +
    '<div class="group"><label class="cell"><input class="inp left" id="rnv" maxlength="80" aria-label="' + t('nameTitle') + '" value="' + esc(x.name) + '"></label></div>',
  (el, sh) => {
    const i = el.querySelector('#rnv');
    setTimeout(() => { i.focus(); i.select(); }, 80);
    const ok = () => { const v = i.value.trim(); if (!v) return; x.name = v; ctx.files.save(x); sh.close(); render(); if (after) after(); };
    el.querySelector('#rnok').addEventListener('click', ok);
    i.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
  });
}

function styleSheet() {
  const { t, ui } = ctx;
  ui.sheet(() => ui.snav(t('player')) + '<div class="hdr">' + t('view') + '</div><div class="stycards" role="group" aria-label="' + t('view') + '">' + ['wave', 'vinyl'].map((k) => '<button class="stycard' +
    (style() === k ? ' on' : '') + '" data-sty="' + k + '" aria-pressed="' + (style() === k) + '"><span class="sprev ' + k + '"><i></i><i></i><i></i><i></i></span><b>' + t('style.' + k) + '</b></button>').join('') +
    '</div><p class="ftr">' + t('vinylHint') + '</p>',
  (el, sh) => el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-sty]');
    if (!b) return;
    st().style = b.dataset.sty;
    ctx.store.save();
    sh.update();
    render();
  }));
}

async function addFile() {
  if (await ctx.confirmUpload()) input.click();
}

async function onFile(e) {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const rec = { id, name: f.name.replace(/\.[^.]+$/, ''), size: f.size, type: f.type, songs: curSong() ? [curSong()] : [], created: Date.now(), blob: f };
  if (!(await ctx.files.add(rec))) ctx.ui.toast(ctx.t('notSaved'));
  load(rec);
  render();
}

/* ---------- жесты ---------- */

function act(a, el) {
  const { t, ui } = ctx;
  switch (a) {
    case 'aplay': if (AU.el.paused) playEl(); else AU.el.pause(); break;
    case 'aback': AU.el.currentTime = Math.max(0, AU.el.currentTime - 5); break;
    case 'afwd': AU.el.currentTime = Math.min(AU.el.duration || 0, AU.el.currentTime + 5); break;
    case 'aab': // A — B — сброс
      if (AU.b != null) { AU.a = AU.b = null; AU.loop = false; }
      else if (AU.a == null) AU.a = AU.el.currentTime;
      else if (AU.el.currentTime > AU.a) { AU.b = AU.el.currentTime; AU.loop = true; }
      else AU.a = AU.el.currentTime;
      if (host.querySelector('#vdisc')) {
        const ab = AU.b != null ? 'on' : AU.a != null ? 'a' : '';
        el.classList.toggle('act', ab === 'on');
        el.textContent = ab === 'a' ? 'B?' : 'A–B';
      } else render();
      break;
    case 'astep': AU.step = !AU.step; if (AU.step && AU.b == null) ui.toast(t('stepHint')); render(); break;
    case 'arate1': setRate(1); render(); break;
    case 'alist': trackSheet(); break;
    case 'aadd': addFile(); break;
    case 'apick': pickSheet(curSong()); break;
    case 'aload2': { const x = ctx.files.get(el.dataset.id); if (x) { load(x); render(); } break; }
    case 'astyle': styleSheet(); break;
    case 'mlplay': {
      const x = ctx.files.get(el.dataset.id);
      if (!x) break;
      if (AU.cur && AU.cur.id === x.id) AU.el.paused ? playEl() : AU.el.pause();
      else { load(x); playEl(); }
      render();
      break;
    }
    case 'mlopen': ML.view = 'player'; render(); break;
    case 'mllib': ML.view = 'lib'; render(); break;
    case 'mlmenu': menuSheet(el.dataset.id); break;
    case 'mlf': ML.f = el.dataset.v; render(); break;
  }
}

function bind() {
  const on = (el, ev, fn, o) => { el.addEventListener(ev, fn, o); offs.push(() => el.removeEventListener(ev, fn, o)); };
  on(host, 'click', (e) => {
    const s = e.target.closest('[data-step="arate"]');
    if (s) { setRate(AU.rate + +s.dataset.d * 0.05); const rv = host.querySelector('#ratev'); if (rv) rv.textContent = rateTxt(); return; }
    const x = e.target.closest('[data-x]');
    if (x) act(x.dataset.x, x);
  });
  on(host, 'input', (e) => {
    if (!e.target.hasAttribute('data-mlq')) return;
    ML.q = e.target.value;
    const pos = e.target.selectionStart;
    render();
    const s = host.querySelector('[data-mlq]');
    if (s) { s.focus(); try { s.setSelectionRange(pos, pos); } catch { /* ignore */ } }
  });
  on(host, 'change', (e) => { if (e.target.hasAttribute('data-mls')) { ML.sort = e.target.value; render(); } });
  // Волна: нажать — перемотать, тянуть A или B — сдвинуть фрагмент
  let wf = null;
  on(host, 'pointerdown', (e) => {
    const w = e.target.closest('#wform');
    if (!w || !AU.cur) return;
    const r = w.getBoundingClientRect(), d = AU.el.duration || 0;
    if (!d) return;
    e.preventDefault();
    const x = e.clientX - r.left, near = (k) => AU[k] != null && Math.abs((AU[k] / d) * r.width - x) < 18, h = near('b') ? 'b' : near('a') ? 'a' : null;
    wf = { pid: e.pointerId, r, d, h };
    if (!h) AU.el.currentTime = Math.max(0, Math.min(d, (x / r.width) * d));
  }, true);
  on(window, 'pointermove', (e) => {
    if (!wf || e.pointerId !== wf.pid) return;
    const tt = Math.max(0, Math.min(wf.d, ((e.clientX - wf.r.left) / wf.r.width) * wf.d));
    if (wf.h === 'a') AU.a = Math.min(tt, AU.b != null ? AU.b - 0.2 : tt);
    else if (wf.h === 'b') AU.b = Math.max(tt, (AU.a || 0) + 0.2);
    else AU.el.currentTime = tt;
    if (wf.h) { const w = host.querySelector('#wform'); if (w) w.outerHTML = wformHTML(w.className.replace('wform', '').replace('wait', '').trim()); }
  }, { passive: true });
  const wfUp = (e) => { if (wf && e.pointerId === wf.pid) wf = null; };
  on(window, 'pointerup', wfUp, true);
  on(window, 'pointercancel', wfUp, true);
  // Волна с клавиатуры: стрелки — ±5 с
  on(host, 'keydown', (e) => {
    if (e.target.id !== 'wform') return;
    if (e.key === 'ArrowRight') { AU.el.currentTime = Math.min(AU.el.duration || 0, AU.el.currentTime + 5); e.preventDefault(); }
    if (e.key === 'ArrowLeft') { AU.el.currentTime = Math.max(0, AU.el.currentTime - 5); e.preventDefault(); }
  });
  // Винил: нажать — играть/пауза, крутить — перемотка; тонарм — выбрать место
  on(host, 'pointerdown', (e) => {
    const d = e.target.closest('#vdisc');
    if (!d || e.target.closest('.vstate')) return;
    e.preventDefault();
    const r = d.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (e.target.closest('.varm')) { VIN.arm = { id: e.pointerId, r }; return; }
    VIN.drag = { id: e.pointerId, cx, cy, rad: r.width / 2, x0: e.clientX, y0: e.clientY, a: Math.atan2(e.clientY - cy, e.clientX - cx), was: !AU.el.paused, px: 0, seek: 0, started: false };
  }, true);
  on(window, 'pointermove', (e) => {
    if (VIN.drag && e.pointerId === VIN.drag.id) {
      const g = VIN.drag;
      g.px = Math.max(g.px, Math.hypot(e.clientX - g.x0, e.clientY - g.y0));
      const a = Math.atan2(e.clientY - g.cy, e.clientX - g.cx), dist = Math.hypot(e.clientX - g.cx, e.clientY - g.cy);
      let da = a - g.a;
      if (da > Math.PI) da -= 2 * Math.PI;
      if (da < -Math.PI) da += 2 * Math.PI;
      g.a = a;
      if (g.px < 8 || dist < g.rad * 0.18) return;
      if (!g.started) { g.started = true; VIN.w = 0; if (g.was) AU.el.pause(); }
      const deg = (da * 180) / Math.PI;
      VIN.ang = (VIN.ang + deg + 360) % 360;
      g.seek += (deg / 360) * 1.8;
      const now = performance.now();
      if (AU.cur && AU.el.duration && (!g.ts || now - g.ts > 40)) { g.ts = now; AU.el.currentTime = Math.max(0, Math.min(AU.el.duration - 0.05, AU.el.currentTime + g.seek)); g.seek = 0; }
    } else if (VIN.arm && e.pointerId === VIN.arm.id && AU.el.duration) {
      const r = VIN.arm.r, px = r.left + r.width * 0.94, py = r.top + r.height * 0.051, ang = (Math.atan2(e.clientX - px, e.clientY - py) * -180) / Math.PI, fr = Math.max(0, Math.min(1, (ang - 5) / 27));
      AU.el.currentTime = fr * AU.el.duration;
      const arm = host.querySelector('#vdisc .varm');
      if (arm) arm.style.transform = 'rotate(' + (5 + 27 * fr) + 'deg)';
    }
  }, { passive: true });
  const vinUp = (e) => {
    if (VIN.drag && e.pointerId === VIN.drag.id) {
      const g = VIN.drag;
      VIN.drag = null;
      if (!g.started) g.was ? AU.el.pause() : playEl();
      else {
        if (g.seek && AU.el.duration) AU.el.currentTime = Math.max(0, Math.min(AU.el.duration - 0.05, AU.el.currentTime + g.seek));
        if (g.was) playEl();
      }
    }
    if (VIN.arm && e.pointerId === VIN.arm.id) VIN.arm = null;
  };
  on(window, 'pointerup', vinUp, true);
  on(window, 'pointercancel', vinUp, true);
}

export default {
  id: 'audio',
  name: { ru: ru.name, uz: uz.name, en: en.name },
  i18n: { ru, uz, en },
  icon: ICON,
  color: '#FF2D55',
  sizes: ['full', 'half', 'quarter', 'strip'],
  status(c) {
    const list = c.files.list('audio'), td = list.reduce((s, x) => s + (x.dur || 0), 0);
    return list.length ? c.tn('files', list.length) + (td ? ' · ' + fmtDur(td) : '') : c.t('empty');
  },
  mount(el, c, sz = 'full') {
    host = el; ctx = c; size = sz;
    ensureEl(c);
    input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*';
    input.hidden = true;
    input.addEventListener('change', onFile);
    document.body.appendChild(input);
    render();
    bind();
    offs.push(c.files.subscribe(() => { if (!document.activeElement?.hasAttribute?.('data-mlq')) render(); }));
    c.files.ready.then(render);
    uiTimer = setInterval(uiTick, 200);
  },
  resize(sz) { size = sz; render(); },
  // Окно закрыто: вне сессии музыка останавливается (как в прототипе)
  unmount() {
    clearInterval(uiTimer);
    offs.splice(0).forEach((f) => (typeof f === 'function' ? f() : null));
    if (input) { input.remove(); input = null; }
    if (AU.el && !ctx.session) AU.el.pause();
    cancelAnimationFrame(VIN.raf);
    VIN.raf = 0;
    host = null;
  },
};
