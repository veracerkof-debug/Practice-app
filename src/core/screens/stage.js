// Сет-лист и сцена (логика — src/core/stage.js).
// setlistSheet — настройка сет-листа: порядок песен (↑ ↓) и у каждой песни свои настройки: темп и клик, отсчёт такта
// перед минусовкой, пэд в тональности, минусовка, сдвиг тональности, текст.
// openStage — сцена: весь экран, крупный текст с аккордами, внизу три большие кнопки: ← песня, ▶ / ■, песня →.
// ▶ включает всё, что задано у песни: клик, пэд, минусовку (после отсчёта); переход к следующей — клик и минусовка
// останавливаются, пэд плавно меняет тональность и звучит дальше (связка между песнями). Устойчивость: каждый звук
// включается отдельно и ошибка одного не останавливает остальные; место на сцене запоминается — после сбоя или
// перезапуска приложение предлагает вернуться; экран не гаснет; выход — с подтверждением.
import '../../ui/stage.css';
import { t } from '../../i18n/index.js';
import { esc, sheet, snav, sw, toast, confirm, icons } from '../../ui/index.js';
import { lyricsHTML } from '../../music/lyrics.js';
import { keyLabel, shiftKey } from '../../music/transpose.js';
import { itemOf, setItem, moveSong, setSongs, tracksOf, barSec, resumeOk, chordsAbove, TR_MAX, capoClamp } from '../stage.js';
import { saveEvent, liveEvents } from '../calendar.js';
import { metroForSession } from '../session.js';
import { logErr } from '../log.js';
import { swipe, pinch } from '../../ui/gestures.js';
import { onHold, holdMenu } from '../../ui/hold.js';
const fmtDur = (sec) => Math.floor(sec / 60) + ':' + String(Math.round(sec % 60)).padStart(2, '0');

const RESUME = 'melete.stage';
const I = {
  moon: '<svg viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none"/></svg>',
  stop: '<svg viewBox="0 0 24 24"><rect x="6.5" y="6.5" width="11" height="11" rx="1.5" fill="currentColor" stroke="none"/></svg>',
  prev: '<svg viewBox="0 0 24 24"><path d="M15.5 5.5 8.5 12l7 6.5"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path d="M8.5 5.5 15.5 12l-7 6.5"/></svg>',
  up: '<svg viewBox="0 0 24 24"><path d="M6 14.5l6-6 6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24"><path d="M6 9.5l6 6 6-6"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
};
const evOf = (app, id) => liveEvents(app.store.state).find((e) => e.id === id) || null;
const audioFiles = (app) => (app.files ? app.files.list('audio').filter((r) => !r.stem) : []); // без дорожек разделения
const safe = (what, fn) => { try { return fn(); } catch (e) { logErr('stage', e); toast(t('stage.err', { what: t('stage.' + what) })); return null; } };

/* ---------- настройка сет-листа ---------- */

function itemSub(app, it) {
  const tr = it.track ? (audioFiles(app).find((r) => r.id === it.track) || {}).name : '';
  return [it.bpm ? it.bpm + ' bpm' + (it.click ? '' : ' · ' + t('stage.noClick')) : '', it.key ? keyLabel(it.key) : '', it.pad ? t('stage.pad') : '', tr ? '♪ ' + tr : ''].filter(Boolean).join(' · ');
}

export function setlistSheet(app, evId, onChange = () => {}) {
  const body = () => {
    const ev = evOf(app, evId);
    if (!ev) return snav(t('stage.setlist'));
    const songs = setSongs(ev, app.store.songById), files = audioFiles(app);
    return snav(t('stage.setlist')) + '<p class="ftr" style="margin-top:0">' + esc(t('stage.setHint')) + '</p>' +
      (songs.length ? '<div class="group">' + songs.map((s, i) => '<div class="cell sgrow"><span class="num sgn">' + (i + 1) + '</span><button class="grow sgitem" data-sgi="' + s.id + '"><b>' + esc(s.title) + '</b><span class="bksub">' +
        esc(itemSub(app, itemOf(ev, s, files)) || t('stage.nothing')) + '</span></button>' +
        '<button class="ic sm plain" data-sgmv="' + i + '" data-d="-1"' + (i ? '' : ' disabled') + ' aria-label="' + esc(t('stage.up')) + '">' + I.up + '</button>' +
        '<button class="ic sm plain" data-sgmv="' + i + '" data-d="1"' + (i < songs.length - 1 ? '' : ' disabled') + ' aria-label="' + esc(t('stage.down')) + '">' + I.down + '</button></div>').join('') + '</div>' +
        '<div class="group" style="margin-top:16px"><button class="cell act center b" data-sgopen>' + esc(t('stage.go')) + '</button></div>'
        : '<p class="ftr">' + esc(t('stage.empty')) + '</p>');
  };
  sheet(body, (el, sh) => el.addEventListener('click', (e) => {
    const ev = evOf(app, evId);
    if (!ev) return;
    let b;
    if ((b = e.target.closest('[data-sgmv]'))) { moveSong(ev, +b.dataset.sgmv, +b.dataset.d); saveEvent(app.store, ev); sh.update(); onChange(); }
    else if ((b = e.target.closest('[data-sgi]'))) itemSheet(app, evId, b.dataset.sgi, () => { sh.update(); onChange(); });
    else if (e.target.closest('[data-sgopen]')) { sh.close(); openStage(app, evId, 0); }
  }));
}

// Настройки одной песни в сет-листе
function itemSheet(app, evId, songId, back) {
  const body = () => {
    const ev = evOf(app, evId), s = app.store.songById(songId);
    if (!ev || !s) return snav('');
    const it = itemOf(ev, s, audioFiles(app)), tracks = tracksOf(audioFiles(app), s.id);
    const step = (k, v, lab) => '<span class="stepper"><button type="button" data-sgst="' + k + '" data-d="-1" aria-label="' + esc(lab + ' −') + '">−</button><b class="num sgv">' + v + '</b>' +
      '<button type="button" data-sgst="' + k + '" data-d="1" aria-label="' + esc(lab + ' +') + '">+</button></span>';
    const row = (lab, right, sub = '') => '<div class="cell"><span class="grow">' + esc(lab) + (sub ? '<span class="bksub">' + esc(sub) + '</span>' : '') + '</span>' + right + '</div>';
    return snav(s.title) +
      '<div class="hdr">' + esc(t('stage.tempo')) + '</div><div class="group">' +
      row(t('stage.bpm'), step('bpm', it.bpm || '—', t('stage.bpm'))) +
      row(t('stage.click'), sw('sg:click', it.click, t('stage.click'))) +
      row(t('stage.count'), sw('sg:count', it.count, t('stage.count')), t('stage.countSub')) + '</div>' +
      '<div class="hdr">' + esc(t('stage.keyHdr')) + '</div><div class="group">' +
      row(t('stage.tr'), step('tr', (it.tr > 0 ? '+' : '') + it.tr, t('stage.tr')), it.key ? keyLabel(it.key) : t('stage.noKey')) +
      row(t('stage.capo'), step('capo', it.capo || '0', t('stage.capo')), it.capo && it.key ? t('stage.capoSub', { k: keyLabel(shiftKey(it.key, -it.capo)) }) : t('stage.capoHint')) +
      (it.key ? row(t('stage.pad'), sw('sg:pad', it.pad, t('stage.pad')), t('stage.padSub', { key: keyLabel(it.key) })) : '') + '</div>' +
      '<div class="hdr">' + esc(t('stage.track')) + '</div><div class="group">' +
      (tracks.length ? [['', t('stage.noTrack')], ...tracks.map((r) => [r.id, r.name])].map(([id, name]) => '<button class="cell" data-sgtr="' + esc(id) + '"><span class="grow">' + esc(name) + '</span>' +
        (it.track === id ? icons.check : '') + '</button>').join('') : '<div class="cell l2">' + esc(t('stage.noTracks')) + '</div>') + '</div>' +
      '<div class="hdr">' + esc(t('stage.screen')) + '</div><div class="group">' + row(t('stage.text'), sw('sg:text', it.text, t('stage.text')), s.notes ? '' : t('stage.noText')) +
      row(t('stage.scroll'), sw('sg:scroll', it.scroll, t('stage.scroll')), it.track ? t('stage.scrollTrack') : t('stage.scrollDur')) +
      (it.track ? '' : row(t('stage.dur'), step('dur', fmtDur(it.dur), t('stage.dur')), t('stage.durSub'))) + '</div>';
  };
  const save = (patch) => { const ev = evOf(app, evId); if (!ev) return; setItem(ev, songId, patch); saveEvent(app.store, ev); };
  sheet(body, (el, sh) => {
    el.addEventListener('change', (e) => {
      const k = e.target.dataset.sw;
      if (k && k.startsWith('sg:')) { save({ [k.slice(3)]: e.target.checked }); sh.update(); }
    });
    el.addEventListener('click', (e) => {
      const ev = evOf(app, evId), s = app.store.songById(songId);
      if (!ev || !s) return;
      let b;
      const it = itemOf(ev, s, audioFiles(app));
      if ((b = e.target.closest('[data-sgst]'))) {
        const d = +b.dataset.d;
        if (b.dataset.sgst === 'bpm') save({ bpm: (it.bpm || 90) + d * (e.shiftKey ? 10 : 1) });
        else if (b.dataset.sgst === 'capo') save({ capo: capoClamp(it.capo + d) });
        else if (b.dataset.sgst === 'dur') save({ dur: Math.max(0, it.dur + d * (e.shiftKey ? 60 : 15)) });
        else save({ tr: Math.max(-TR_MAX, Math.min(TR_MAX, it.tr + d)) });
        sh.update();
      } else if ((b = e.target.closest('[data-sgtr]'))) { save({ track: b.dataset.sgtr }); sh.update(); }
    });
  }, { onClose: back });
}

/* ---------- сцена ---------- */

let cur = null; // открытая сцена

export function openStage(app, evId, i = 0) {
  if (cur) cur.close(true);
  const ev0 = evOf(app, evId);
  if (!ev0 || !setSongs(ev0, app.store.songById).length) { toast(t('stage.empty')); return; }
  const audio = app.audio, drone0 = { pc: app.device.drone.pc, chord: app.device.drone.chord }, metro0 = audio.metro.cfg;
  const S = { i, playing: false, padOn: false, el: null, timers: [], track: null, url: '', offBeat: null, fs: +(sessionStorage.getItem('melete.stage.fs') || 0) || 26,
    night: sessionStorage.getItem('melete.stage.night') === '1', scrollRaf: 0, scrollPaused: false, userScrollAt: 0, startedAt: 0, lastTop: -1 };
  const pedalMode = () => (app.store.state.settings.stagePedal === 'song' ? 'song' : 'page'); // педаль листает страницу или песню
  const list = () => { const ev = evOf(app, evId); return ev ? setSongs(ev, app.store.songById) : []; };
  const item = () => { const ev = evOf(app, evId), s = list()[S.i]; return ev && s ? { s, it: itemOf(ev, s, audioFiles(app)) } : null; };
  const remember = () => { try { localStorage.setItem(RESUME, JSON.stringify({ ev: evId, i: S.i, at: Date.now() })); } catch { /* приватный режим */ } };

  const clearTimers = () => { S.timers.forEach(clearTimeout); S.timers = []; };
  const stopTrack = () => { if (S.track) { try { S.track.pause(); } catch { /* */ } S.track = null; } if (S.url) { URL.revokeObjectURL(S.url); S.url = ''; } };
  const stopClick = () => safe('click', () => { if (audio.metro.running) audio.metro.stop(); });
  const stopPad = (fade) => safe('pad', () => { audio.drone.stop(fade); S.padOn = false; });
  // пэд в тональности песни: если уже звучит — плавный переход
  const startPad = (it) => safe('pad', () => {
    if (!it.key) return;
    const d = app.device.drone;
    d.pc = it.key.pc; d.chord = 'fifth';
    if (S.padOn) audio.drone.swap(); else audio.drone.start();
    S.padOn = true;
  });
  const startClick = (it, s) => safe('click', () => {
    if (!it.bpm) return;
    audio.metro.cfg = { ...metroForSession(s, app.store.state.settings.metro), bpm: it.bpm, trainer: { on: false }, gap: { on: false } };
    if (!audio.metro.running) audio.metro.start();
  });
  const startTrack = (it) => safe('track', () => {
    const r = app.files && app.files.get(it.track);
    if (!r || !r.blob) return;
    S.url = URL.createObjectURL(r.blob);
    const el = new Audio(S.url);
    const v = audio.mixer && audio.mixer.elementVolume ? audio.mixer.elementVolume('media') : 1;
    el.volume = Number.isFinite(v) ? v : 1;
    el.onended = () => { if (S.track === el) { S.playing = false; stopClick(); render(); } };
    el.onerror = () => { logErr('stage', 'track ' + (r.name || '')); toast(t('stage.err', { what: t('stage.track') })); };
    S.track = el;
    const p = el.play();
    if (p && p.catch) p.catch((e) => logErr('stage', e));
  });

  // Автопрокрутка текста: позиция = доля прошедшего времени (минусовка — её currentTime, иначе — часы от старта и длительность);
  // касание текста — пауза; своя прокрутка пальцем — автопрокрутка догоняет через 3 с
  const scrollTick = () => {
    S.scrollRaf = 0;
    if (!S.playing) return;
    const x = item(), tx = S.el && S.el.querySelector('.sgtext'), bar = S.el && S.el.querySelector('.sgprog i');
    if (!x || !tx) return;
    const { it } = x, dur = S.track && S.track.duration > 0 ? S.track.duration : it.dur, pos = S.track ? S.track.currentTime : (performance.now() - S.startedAt) / 1000;
    if (it.scroll && dur > 0) {
      const fr = Math.max(0, Math.min(1, pos / dur)), max = tx.scrollHeight - tx.clientHeight;
      if (bar) bar.style.height = Math.round(fr * 100) + '%';
      if (!S.scrollPaused && max > 0 && performance.now() - S.userScrollAt > 3000) { const top = Math.round(fr * max); if (Math.abs(tx.scrollTop - top) > 1) { S.lastTop = top; tx.scrollTop = top; } }
    }
    S.scrollRaf = requestAnimationFrame(scrollTick);
  };
  const scrollStart = () => { S.startedAt = performance.now(); S.scrollPaused = false; if (!S.scrollRaf) S.scrollRaf = requestAnimationFrame(scrollTick); };
  const onUserScroll = (e) => { const tx = e.target; if (!tx.classList || !tx.classList.contains('sgtext')) return; if (Math.abs(tx.scrollTop - S.lastTop) > 1) S.userScrollAt = performance.now(); };

  const stop = ({ keepPad = false } = {}) => {
    clearTimers();
    if (S.scrollRaf) { cancelAnimationFrame(S.scrollRaf); S.scrollRaf = 0; }
    stopTrack();
    stopClick();
    if (!keepPad) stopPad();
    S.playing = false;
  };
  const play = () => {
    const x = item();
    if (!x || !audio.unlock()) { toast(t('stage.noAudio')); return; }
    const { s, it } = x;
    S.playing = true;
    if (it.pad) startPad(it); else if (S.padOn) stopPad();
    const wait = it.track && it.count && it.bpm ? barSec(it.bpm, (s.metro && s.metro.num) || 4) : 0;
    if (it.click || wait) startClick(it, s);
    if (it.track) {
      if (wait) S.timers.push(setTimeout(() => { if (!S.playing) return; startTrack(it); if (!it.click) stopClick(); }, wait * 1000));
      else startTrack(it);
    }
    scrollStart();
    render();
  };
  // Педаль или клавиатура: страница вниз/вверх (в конце страницы — следующая песня) или сразу песня; пробел — старт/стоп
  const page = (d) => {
    const tx = S.el && S.el.querySelector('.sgtext');
    if (!tx || pedalMode() === 'song') { go(d); return; }
    const max = tx.scrollHeight - tx.clientHeight;
    if (d > 0 && tx.scrollTop >= max - 2) { go(1); return; }
    if (d < 0 && tx.scrollTop <= 2) { go(-1); return; }
    S.userScrollAt = performance.now();
    tx.scrollBy({ top: d * tx.clientHeight * 0.85, behavior: 'smooth' });
  };
  const onKey = (e) => {
    if (!S.el || e.target.matches('input, textarea, select')) return;
    const k = e.key;
    if (k === 'PageDown' || k === 'ArrowRight' || k === 'ArrowDown') { e.preventDefault(); page(1); }
    else if (k === 'PageUp' || k === 'ArrowLeft' || k === 'ArrowUp') { e.preventDefault(); page(-1); }
    else if (k === ' ' || k === 'Enter') { e.preventDefault(); if (S.playing) { stop(); render(); } else play(); }
  };
  // Удержание названия — меню сцены: ночь, педаль, автопрокрутка этой песни
  const stageMenu = (anchor) => {
    const x = item(); if (!x) return;
    const ev = evOf(app, evId);
    holdMenu(anchor, [
      { icon: I.moon, label: t(S.night ? 'stage.nightOff' : 'stage.night'), run: () => { S.night = !S.night; try { sessionStorage.setItem('melete.stage.night', S.night ? '1' : '0'); } catch { /* */ } render(); } },
      { icon: I.next, label: t('stage.pedal') + ': ' + t(pedalMode() === 'song' ? 'stage.pedalSong' : 'stage.pedalPage'), run: () => { app.store.state.settings.stagePedal = pedalMode() === 'song' ? 'page' : 'song'; app.store.save(); toast(t('stage.pedal') + ': ' + t(pedalMode() === 'song' ? 'stage.pedalSong' : 'stage.pedalPage')); } },
      { icon: I.play, label: t(x.it.scroll ? 'stage.scrollOff' : 'stage.scrollOn'), run: () => { if (ev) { setItem(ev, x.s.id, { scroll: !x.it.scroll }); saveEvent(app.store, ev); } render(); } },
    ], x.s.title);
  };
  const go = (d) => {
    const n = list().length, j = Math.max(0, Math.min(n - 1, S.i + d));
    if (j === S.i) return;
    const wasPad = S.padOn;
    stop({ keepPad: wasPad });
    S.i = j;
    remember();
    const x = item();
    if (wasPad) { if (x && x.it.pad) startPad(x.it); else stopPad(); } // пэд — связка между песнями
    render();
    const tx = S.el && S.el.querySelector('.sgtext');
    if (tx) tx.scrollTop = 0;
  };
  // живые переключатели на сцене: клик, пэд, минусовка — без остановки остального
  const toggle = (k) => {
    const x = item();
    if (!x) return;
    const { s, it } = x;
    if (k === 'click') { if (audio.metro.running) stopClick(); else startClick({ ...it, bpm: it.bpm || 90 }, s); }
    else if (k === 'pad') { if (S.padOn) stopPad(); else startPad(it); }
    else if (k === 'track') { if (S.track) stopTrack(); else if (it.track) startTrack(it); }
    render();
  };

  const render = () => {
    if (!S.el) return;
    const L = list(), x = item();
    if (!x) { close(true); return; }
    const { s, it } = x, next = L[S.i + 1];
    const chip = (k, on, label, avail = true) => avail ? '<button class="sgchip' + (on ? ' on' : '') + '" data-sgt="' + k + '" aria-pressed="' + on + '">' + esc(label) + '</button>' : '';
    const trName = it.track ? (audioFiles(app).find((r) => r.id === it.track) || {}).name || '' : '';
    S.el.classList.toggle('night', !!S.night);
    S.el.innerHTML = '<div class="sgtop"><button class="sgic" data-sg="exit" aria-label="' + esc(t('stage.exit')) + '">' + I.x + '</button>' +
      '<div class="sghead"><b>' + esc(s.title) + '</b><span>' + esc([S.i + 1 + ' / ' + L.length, it.key ? keyLabel(it.key) : '', it.capo ? t('stage.capoN', { n: it.capo }) : '', it.bpm ? it.bpm + ' bpm' : ''].filter(Boolean).join(' · ')) + '</span></div>' +
      '<i class="sgbeat" aria-hidden="true"></i>' +
      '<button class="sgic txt" data-sgfs="-2" aria-label="' + esc(t('stage.smaller')) + '">A−</button><button class="sgic txt" data-sgfs="2" aria-label="' + esc(t('stage.bigger')) + '">A+</button></div>' +
      '<div class="sgtext" style="font-size:' + S.fs + 'px">' + (it.text && s.notes ? (it.scroll ? '<i class="sgprog" aria-hidden="true"><i></i></i>' : '') + '<div class="lyr">' + lyricsHTML(chordsAbove(s.notes), it.tr - it.capo, it.srcKey) + '</div>' :
        '<div class="sgbig">' + esc(s.title) + (s.artist ? '<small>' + esc(s.artist) + '</small>' : '') + '</div>') + '</div>' +
      '<div class="sgchips">' + chip('click', audio.metro.running, t('stage.click') + (it.bpm ? ' ' + it.bpm : '')) + chip('pad', S.padOn, t('stage.pad') + (it.key ? ' ' + keyLabel(it.key) : ''), !!it.key) +
        chip('track', !!S.track, '♪ ' + (trName || t('stage.track')), !!it.track) + (next ? '<span class="sgnext">' + esc(t('stage.next', { title: next.title })) + '</span>' : '') + '</div>' +
      '<div class="sgbar"><button class="sgbtn" data-sg="prev"' + (S.i ? '' : ' disabled') + ' aria-label="' + esc(t('stage.prev')) + '">' + I.prev + '</button>' +
      '<button class="sgbtn main' + (S.playing ? ' on' : '') + '" data-sg="play" aria-label="' + esc(t(S.playing ? 'stage.stop' : 'stage.play')) + '">' + (S.playing ? I.stop : I.play) + '</button>' +
      '<button class="sgbtn" data-sg="next"' + (S.i < L.length - 1 ? '' : ' disabled') + ' aria-label="' + esc(t('stage.nextBtn')) + '">' + I.next + '</button></div>';
    fit();
  };

  const onClick = (e) => {
    let b;
    if ((b = e.target.closest('[data-sg]'))) {
      const a = b.dataset.sg;
      if (a === 'play') { if (S.playing) { stop({ keepPad: false }); render(); } else play(); }
      else if (a === 'prev') go(-1);
      else if (a === 'next') go(1);
      else if (a === 'exit') confirm(t('stage.exitTitle'), t('stage.exitText'), t('stage.exitYes')).then((ok) => ok && close());
    } else if ((b = e.target.closest('[data-sgt]'))) toggle(b.dataset.sgt);
    else if (e.target.closest('.sgtext') && S.playing && item() && item().it.scroll && !String(document.getSelection && document.getSelection()).length) {
      S.scrollPaused = !S.scrollPaused; S.userScrollAt = 0;
      toast(t(S.scrollPaused ? 'stage.scrollPaused' : 'stage.scrollResumed'));
    }
    else if ((b = e.target.closest('[data-sgfs]'))) {
      S.fs = Math.max(14, Math.min(64, S.fs + +b.dataset.sgfs));
      try { sessionStorage.setItem('melete.stage.fs', S.fs); } catch { /* */ }
      fit();
    }
  };
  // строки не переносятся (аккорд — над своим слогом): шрифт уменьшается, пока самая длинная строка не поместится;
  // A− / A+ задают наибольший размер
  const fit = () => {
    const tx = S.el && S.el.querySelector('.sgtext'), ly = tx && tx.querySelector('.lyr');
    if (!tx) return;
    if (!ly) { tx.style.fontSize = S.fs + 'px'; return; }
    const cols = Math.max(1, ...ly.textContent.split('\n').map((l) => l.length)), w = tx.clientWidth - 36;
    tx.style.fontSize = Math.max(12, Math.min(S.fs, Math.floor(w / (cols * 0.61)))) + 'px';
  };
  const onResize = () => fit();
  // вспышка доли (видно без звука в наушниках)
  const beat = ({ level, ms }) => S.timers.push(setTimeout(() => {
    const d = S.el && S.el.querySelector('.sgbeat');
    if (!d) return;
    d.classList.remove('on', 'acc'); void d.offsetWidth; d.classList.add('on'); if (level >= 3) d.classList.add('acc');
  }, Math.max(0, ms)));

  const close = (silent = false) => {
    stop();
    if (S.offBeat) S.offBeat();
    // всё, что сцена меняла, — как было
    audio.metro.cfg = metro0;
    Object.assign(app.device.drone, drone0);
    removeEventListener('resize', onResize);
    removeEventListener('keydown', onKey);
    S.el && S.el.removeEventListener('scroll', onUserScroll, true);
    if (S.scrollRaf) cancelAnimationFrame(S.scrollRaf);
    offG.forEach((f) => f());
    if (S.el) { S.el.removeEventListener('click', onClick); S.el.remove(); S.el = null; }
    try { localStorage.removeItem(RESUME); } catch { /* */ }
    document.documentElement.classList.remove('onstage');
    cur = null;
    if (!silent) toast(t('stage.closed'));
  };

  S.el = document.createElement('div');
  S.el.className = 'stage';
  S.el.setAttribute('role', 'dialog');
  S.el.setAttribute('aria-label', t('stage.title'));
  S.el.addEventListener('click', onClick);
  document.body.appendChild(S.el);
  document.documentElement.classList.add('onstage');
  S.offBeat = audio.metro.onBeat(beat);
  addEventListener('resize', onResize);
  addEventListener('keydown', onKey);
  S.el.addEventListener('scroll', onUserScroll, true);
  onHold(S.el, '.sghead', (el) => stageMenu(el));
  // жесты: смахнуть влево — следующая песня, вправо — прошлая (длинное уверенное движение — случайно не сработает);
  // щипок по тексту — размер шрифта (как A− и A+)
  const offG = [swipe(S.el, { min: 110, left: () => go(1), right: () => go(-1), ok: (e) => !e.target.closest('.sgbar, .sgchips, .sgtop') }),
    pinch(S.el, { min: 14, max: 64, ok: (e) => !!e.target.closest('.sgtext'), get: () => S.fs,
      set: (v, live) => { S.fs = v; fit(); if (!live) try { sessionStorage.setItem('melete.stage.fs', v); } catch { /* */ } } })];
  S.i = Math.max(0, Math.min(list().length - 1, i));
  remember();
  render();
  cur = { close, render };
  return cur;
}

// После сбоя или перезапуска: была открыта сцена — предложить вернуться на ту же песню
export function resumeStage(app) {
  let r = null;
  try { r = JSON.parse(localStorage.getItem(RESUME) || 'null'); } catch { r = null; }
  if (!resumeOk(r) || !evOf(app, r.ev)) { try { localStorage.removeItem(RESUME); } catch { /* */ } return; }
  openStage(app, r.ev, r.i);
}
