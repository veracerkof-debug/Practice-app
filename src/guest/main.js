// Гостевая страница раздачи (docs/guest-web.md): любой телефон в той же сети открывает адрес компьютера с Melete и
// видит раздаваемые песни — текст с аккордами, сет-лист, записи (по одной песне). Только чтение. Связь — /g/v1/…
// (сервер — src-tauri/src/guest.rs, решает src/core/guest.js). Страница без ядра и звукового движка: по http в
// локальной сети браузер не даёт AudioWorklet и офлайн-режим, а тут они и не нужны — <audio> и текст.
// Под свой инструмент: сдвиг тональности, строй (B♭, E♭, F — аккорды в своём строе), капо; «За лидером» — ведущий
// открыл песню, у гостя она открывается сама. Если ведение передали гостю — его песня открывается у всех.
import '../styles/tokens.css';
import './guest.css';
import { lyricsHTML } from '../music/lyrics.js';
import { chordsAbove } from '../core/stage.js';
import { shiftKey, keyLabel } from '../music/transpose.js';
import { t, LANG } from './i18n.js';

document.documentElement.lang = LANG;
const root = document.getElementById('g');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const INST = { C: 0, Bb: 2, Eb: 9, F: 7 }; // аккорды для инструмента в строе X: на столько полутонов выше звучащих
const prefs = (() => { try { return { name: '', inst: 'C', capo: 0, size: 18, follow: true, ...JSON.parse(localStorage.getItem('melete.guest.me') || '{}') }; } catch { return { name: '', inst: 'C', capo: 0, size: 18, follow: true }; } })();
const savePrefs = () => { try { localStorage.setItem('melete.guest.me', JSON.stringify(prefs)); } catch { /* */ } };
const G = { host: '', mode: 'open', gid: sessionStorage.getItem('melete.guest.gid') || '', state: 'join', lead: false, songs: [], set: null, q: '', song: null, my: 0, live: null, ver: 0, lost: false, view: 'list' };
const token = new URLSearchParams(location.search).get('t') || '';

async function api(path, { method = 'GET', body = null } = {}) {
  const sep = path.includes('?') ? '&' : '?';
  const r = await fetch('/g/v1/' + path + (G.gid ? sep + 'g=' + encodeURIComponent(G.gid) : ''), { method, body: body ? JSON.stringify(body) : undefined, headers: body ? { 'Content-Type': 'application/json' } : {} });
  if (r.status === 401) { G.state = 'join'; G.gid = ''; sessionStorage.removeItem('melete.guest.gid'); render(); throw new Error('401'); }
  if (!r.ok) throw Object.assign(new Error('http ' + r.status), { status: r.status });
  return r.json();
}

/* ---------- вход ---------- */
async function hello() {
  try {
    const h = await api('hello');
    G.host = h.name; G.mode = h.mode; G.lost = false;
    if (G.gid) { const me = await api('me'); if (me.state === 'ok') { G.state = 'ok'; G.lead = !!me.lead; return enter(); } if (me.state === 'wait') { G.state = 'wait'; return waitLoop(); } G.gid = ''; }
    G.state = G.mode === 'closed' && !token ? 'needqr' : 'join';
    render();
  } catch { G.lost = true; render(); setTimeout(hello, 4000); }
}
async function join() {
  const inp = root.querySelector('[data-k="name"]');
  prefs.name = (inp && inp.value.trim()) || prefs.name; savePrefs();
  try {
    const r = await api('join', { method: 'POST', body: { name: prefs.name, t: token } });
    G.gid = r.gid; sessionStorage.setItem('melete.guest.gid', r.gid);
    if (r.state === 'ok') { G.state = 'ok'; enter(); } else { G.state = 'wait'; render(); waitLoop(); }
  } catch (e) { G.state = e.status === 403 ? 'needqr' : 'join'; render(); }
}
async function waitLoop() {
  render();
  try { const me = await api('me'); if (me.state === 'ok') { G.state = 'ok'; return enter(); } if (me.state === 'no') { G.state = 'denied'; G.gid = ''; sessionStorage.removeItem('melete.guest.gid'); return render(); } } catch { /* повтор */ }
  setTimeout(waitLoop, 2000);
}
async function enter() {
  await loadSongs();
  liveLoop(); heartbeat();
}
async function loadSongs() {
  try { const [a, b] = await Promise.all([api('songs'), api('set')]); G.songs = a.songs || []; G.set = b; } catch { /* */ }
  render();
}
// раз в 30 с — «я здесь» (иначе компьютер уберёт из списка) и кто ведёт
async function heartbeat() {
  try { const me = await api('me'); G.lost = false; if (me.state !== 'ok') { G.state = me.state === 'wait' ? 'wait' : 'join'; render(); return; } if (G.lead !== !!me.lead) { G.lead = !!me.lead; render(); } } catch { G.lost = true; render(); }
  setTimeout(heartbeat, 30000);
}
// «Что на экранах»: долгий опрос — ответ, как только ведущий переключил песню
async function liveLoop() {
  if (G.state !== 'ok') return;
  try {
    const r = await api('live?since=' + G.ver);
    G.lost = false;
    if (r.ver !== G.ver) {
      G.ver = r.ver; G.live = r.live;
      if (G.live && G.live.song && prefs.follow && !G.lead && (!G.song || G.song.id !== G.live.song || G.song.leadTr !== G.live.tr)) await openSong(G.live.song, G.live.tr, true);
      else render();
    }
    setTimeout(liveLoop, 50);
  } catch { G.lost = true; render(); setTimeout(liveLoop, 3000); }
}

/* ---------- песня ---------- */
async function openSong(id, leadTr = 0, fromLive = false) {
  try {
    const s = await api('song?id=' + encodeURIComponent(id));
    stopAudio();
    G.song = { ...s, leadTr: +leadTr || 0 }; G.my = 0; G.view = 'song';
    render(); window.scrollTo(0, 0);
    if (G.lead && !fromLive) api('lead', { method: 'POST', body: { song: id, tr: G.song.leadTr } }).catch(() => {});
    wake();
  } catch { /* песни нет */ }
}
const shiftOf = () => (G.song ? G.song.leadTr + G.my + INST[prefs.inst] - prefs.capo : 0);
// Запись — одна: открыли другую песню или ушли из песни — прежняя выгружается
function stopAudio() { const a = root.querySelector('audio'); if (a) { a.pause(); a.removeAttribute('src'); a.load(); } }
let lock = null;
async function wake() { try { if (!lock && navigator.wakeLock) lock = await navigator.wakeLock.request('screen'); } catch { /* на http не бывает — экран гасит система */ } }

/* ---------- отрисовка ---------- */
function top() {
  const live = G.live && G.live.leader ? t('leader', { name: G.live.leader }) : '';
  return '<header class="gtop">' + (G.view === 'song' ? '<button class="gic" data-a="back" aria-label="' + esc(t('back')) + '">‹</button>' : '<span class="gbrand">Μελέτη</span>') +
    '<span class="ghost">' + esc(t('from', { name: G.host })) + (live ? ' · ' + esc(live) : '') + '</span>' +
    (G.lead ? '<span class="gchip on">' + esc(t('lead')) + '</span>' : '<button class="gchip' + (prefs.follow ? ' on' : '') + '" data-a="follow" aria-pressed="' + prefs.follow + '">' + esc(t('follow')) + '</button>') + '</header>' +
    (G.lost ? '<div class="glost">' + esc(t('lost')) + '</div>' : '');
}
function listHTML() {
  const q = G.q.trim().toLowerCase(), match = (s) => !q || (s.title + ' ' + s.artist).toLowerCase().includes(q);
  const row = (s, i) => '<button class="grow" data-song="' + esc(s.id) + '">' + (i != null ? '<span class="gnum">' + (i + 1) + '</span>' : '') + '<span class="gt"><b>' + esc(s.title) + '</b>' + (s.artist ? '<i>' + esc(s.artist) + '</i>' : '') + '</span>' +
    '<span class="gmeta">' + esc([s.key, s.bpm ? t('bpm', { n: s.bpm }) : '', s.audio ? '♪' : ''].filter(Boolean).join(' · ')) + '</span></button>';
  const setIds = G.set ? G.set.items.map((x) => x.id) : [];
  const setSongs = setIds.map((id) => G.songs.find((s) => s.id === id)).filter(Boolean);
  return top() + '<main class="gmain">' + (G.set ? '<h2>' + esc(G.set.title || t('set')) + '</h2><div class="glist">' + setSongs.map((s, i) => row(s, i)).join('') + '</div>' :
    '<input class="gsearch" data-k="q" type="search" placeholder="' + esc(t('search')) + '" value="' + esc(G.q) + '" aria-label="' + esc(t('search')) + '"><div class="glist">' +
    (G.songs.filter(match).map((s) => row(s)).join('') || '<p class="gempty">' + esc(t('empty')) + '</p>') + '</div>') + '</main>';
}
function songHTML() {
  const s = G.song, n = shiftOf(), k = s.k ? shiftKey(s.k, n) : null;
  const step = (a, v) => '<span class="gstep"><button data-a="' + a + '-" aria-label="−">−</button><b>' + esc(v) + '</b><button data-a="' + a + '+" aria-label="+">+</button></span>';
  const tr = G.song.leadTr + G.my;
  return top() + '<main class="gmain gsong" style="--fs:' + prefs.size + 'px"><h1>' + esc(s.title) + '</h1>' + (s.artist ? '<p class="gart">' + esc(s.artist) + '</p>' : '') +
    '<div class="gctl"><label>' + esc(t('tr')) + ' ' + step('tr', (k ? keyLabel(k) : '') + (tr ? ' (' + (tr > 0 ? '+' : '') + tr + ')' : '')) + '</label>' +
    '<label>' + esc(t('inst')) + ' <select data-k="inst">' + Object.keys(INST).map((x) => '<option value="' + x + '"' + (prefs.inst === x ? ' selected' : '') + '>' + esc(t('inst.' + x)) + '</option>').join('') + '</select></label>' +
    '<label>' + esc(t('capo')) + ' ' + step('capo', prefs.capo) + '</label><label>' + esc(t('size')) + ' ' + step('size', prefs.size) + '</label></div>' +
    (s.files && s.files.length ? '<div class="gaudio">' + (s.files.length > 1 ? '<select data-k="file">' + s.files.map((f) => '<option value="' + esc(f.id) + '">' + esc(f.name) + '</option>').join('') + '</select>' : '') +
      '<audio controls preload="none" data-file="' + esc(s.files[0].id) + '"></audio></div>' : '') +
    (s.notes ? '<pre class="gtext">' + lyricsHTML(chordsAbove(s.notes), n, s.k) + '</pre>' : '<p class="gempty">' + esc(t('noText')) + '</p>') + '</main>';
}
function render() {
  let h;
  if (G.state === 'needqr') h = '<div class="gcenter"><span class="gbrand big">Μελέτη</span><p>' + esc(t('needQr')) + '</p></div>';
  else if (G.state === 'denied') h = '<div class="gcenter"><span class="gbrand big">Μελέτη</span><p>' + esc(t('denied')) + '</p></div>';
  else if (G.state === 'wait') h = '<div class="gcenter"><span class="gbrand big">Μελέτη</span><p>' + esc(t('wait')) + '</p></div>';
  else if (G.state === 'join') h = '<div class="gcenter"><span class="gbrand big">Μελέτη</span>' + (G.host ? '<p>' + esc(t('from', { name: G.host })) + '</p>' : '') + (G.lost ? '<p class="glost">' + esc(t('lost')) + '</p>' : '') +
    '<input class="gsearch" data-k="name" placeholder="' + esc(t('namePh')) + '" value="' + esc(prefs.name) + '" aria-label="' + esc(t('name')) + '" maxlength="40"><button class="gbtn" data-a="join">' + esc(t('join')) + '</button></div>';
  else h = G.view === 'song' && G.song ? songHTML() : listHTML();
  // аудио не пересоздаётся, если песня та же (перерисовка от потока не рвёт звук)
  const a = root.querySelector('audio'), keepAudio = a && G.view === 'song' && G.song && a.dataset.file && G.song.files.some((f) => f.id === a.dataset.file);
  if (keepAudio) a.remove();
  root.innerHTML = h;
  if (keepAudio) { const slot = root.querySelector('audio'); if (slot) slot.replaceWith(a); }
}

root.addEventListener('click', (e) => {
  const b = e.target.closest('[data-a],[data-song]');
  if (!b) return;
  if (b.dataset.song) return openSong(b.dataset.song, G.live && G.live.song === b.dataset.song ? G.live.tr : 0);
  const a = b.dataset.a;
  if (a === 'join') return join();
  if (a === 'back') { stopAudio(); G.view = 'list'; G.song = null; render(); return; }
  if (a === 'follow') { prefs.follow = !prefs.follow; savePrefs(); if (prefs.follow && G.live && G.live.song) openSong(G.live.song, G.live.tr, true); else render(); return; }
  const m = /^(tr|capo|size)([+-])$/.exec(a);
  if (m) {
    const d = m[2] === '+' ? 1 : -1;
    if (m[1] === 'tr') G.my = Math.max(-11, Math.min(11, G.my + d));
    if (m[1] === 'capo') prefs.capo = Math.max(0, Math.min(7, prefs.capo + d));
    if (m[1] === 'size') prefs.size = Math.max(12, Math.min(40, prefs.size + d * 2));
    savePrefs(); render();
  }
});
// запись грузится, когда человек нажал «▶» (preload=none): src ставится при первом play
root.addEventListener('play', (e) => { const a = e.target; if (a.tagName === 'AUDIO' && !a.getAttribute('src')) { a.src = '/g/v1/audio?id=' + encodeURIComponent(a.dataset.file) + '&g=' + encodeURIComponent(G.gid); a.play().catch(() => {}); } }, true);
root.addEventListener('input', (e) => { if (e.target.dataset.k === 'q') { G.q = e.target.value; const pos = e.target.selectionStart; render(); const i = root.querySelector('[data-k="q"]'); if (i) { i.focus(); i.setSelectionRange(pos, pos); } } });
root.addEventListener('change', (e) => {
  const k = e.target.dataset.k;
  if (k === 'inst') { prefs.inst = e.target.value; savePrefs(); render(); }
  if (k === 'file') { const a = root.querySelector('audio'); if (a) { a.pause(); a.removeAttribute('src'); a.dataset.file = e.target.value; a.load(); } }
});
root.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.dataset.k === 'name') join(); });
// вернулся на вкладку — сразу проверить связь
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && G.state === 'ok') { lock = null; if (G.view === 'song') wake(); } });

render();
hello();
