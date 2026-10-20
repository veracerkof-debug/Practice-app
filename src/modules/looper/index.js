// Лупер: петля из слоёв с микрофона. Одна большая кнопка — всё по кругу: запись → петля → наложение → петля;
// удержание кнопки — отменить последний слой. По метроному — отсчёт такта и длина петли в целых тактах.
// Четыре петли (слота), у каждой свои слои; громкость и тишина слоя; сохранение сведения в медиатеку.
// Педаль Bluetooth (клавиши: пробел, PageDown — кнопка; PageUp — стоп; стрелки — отмена). Движок — src/audio/looper.js.
import './looper.css';
import ru from './i18n/ru.json';
import uz from './i18n/uz.json';
import en from './i18n/en.json';
import el from './i18n/el.json';
import { createLooper, SLOTS, MAX_SEC } from '../../audio/looper.js';
import { encodeWav } from '../../audio/voicefx.js';
import { onHold, holdMenu } from '../../ui/hold.js';

const ICON = '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 1 2.6 5.9"/><path d="M4 18.5V14h4.5"/><circle cx="12" cy="12" r="2" style="fill:currentColor"/></svg>';
const I = {
  rec: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="6" style="fill:currentColor"/></svg>',
  stop: '<svg viewBox="0 0 24 24"><rect x="6.5" y="6.5" width="11" height="11" rx="2" style="fill:currentColor"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  undo: '<svg viewBox="0 0 24 24"><path d="M8 7H4v4"/><path d="M4.5 11A8 8 0 1 1 7 18"/></svg>',
  save: '<svg viewBox="0 0 24 24"><path d="M12 4v11M8 11l4 4 4-4M5 19h14"/></svg>',
  metro: '<svg viewBox="0 0 24 24"><path d="M9 4h6l3 16H6zM12 17V8M12 8l5-3"/></svg>',
  ear: '<svg viewBox="0 0 24 24"><path d="M6 10a6 6 0 0 1 12 0c0 3-2 4-2 7a3 3 0 0 1-6 0"/><path d="M9.5 10a2.5 2.5 0 0 1 5 0"/></svg>',
  mute: '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9l5 6M21 9l-5 6"/></svg>',
  vol: '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
};
const R = 46, C = 2 * Math.PI * R;

let host = null, ctx = null, size = 'full', lp = null, raf = 0, offs = [], arm = null, offBeat = null;
const st = () => ctx.store.all();
const metro = () => ctx.audio.metro;
const barSec = () => { const m = metro().cfg; return (60 / m.bpm) * Math.max(1, m.num); };
const withMetro = () => !!st().metro;

/* ---------- разметка ---------- */

const fmt = (s) => { s = Math.max(0, s); const m = Math.floor(s / 60), x = Math.floor(s % 60); return m + ':' + String(x).padStart(2, '0'); };

function view() {
  const { t, ui } = ctx, S = lp ? lp.state : { state: 'idle', layers: [], slots: [0, 0, 0, 0], slot: 0, len: 0, pos: 0 }, s = S.state;
  const small = size === 'quarter' || size === 'strip', lab = arm ? 'cancel' : s === 'idle' && S.len ? 'resume' : s; // пауза: петля есть — «Играть»
  const main = '<button class="lpbtn ' + s + (arm ? ' arm' : '') + '" data-x="main" aria-label="' + ui.esc(t('do.' + lab)) + '">' +
    '<svg viewBox="0 0 100 100" aria-hidden="true"><circle class="lptrack" cx="50" cy="50" r="' + R + '"/><circle class="lpring" cx="50" cy="50" r="' + R + '" stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + (C * (1 - (S.pos || 0))).toFixed(1) + '"/></svg>' +
    '<span class="lpic">' + (arm ? '<b class="lpcount">' + (arm.n + 1) + '</b>' : lab === 'resume' ? ui.icons.play : s === 'idle' ? I.rec : s === 'rec' ? I.stop : s === 'play' ? I.plus : I.stop) + '</span>' +
    '<span class="lplab">' + ui.esc(t('do.' + lab)) + '</span></button>';
  const time = '<div class="lptime num">' + (s === 'rec' ? fmt(S.recSec) + ' / ' + fmt(MAX_SEC) : S.len ? fmt(S.len) + (withMetro() ? ' · ' + ctx.tn('bars', Math.round(S.len / barSec())) : '') : '') + '</div>';
  if (size === 'strip') return '<div class="lpstrip">' + main + time + (S.layers.length ? '<span class="lpn num">' + ctx.tn('layers', S.layers.length) + '</span>' : '') + '</div>';
  const layers = S.layers.length ? '<div class="lplayers">' + S.layers.map((L, i) => '<div class="lplayer' + (L.mute ? ' muted' : '') + '" data-li="' + i + '"><button class="lpm" data-x="mute" data-i="' + i + '" aria-label="' + ui.esc(t(L.mute ? 'unmute' : 'mute')) + '" aria-pressed="' + L.mute + '">' + (L.mute ? I.mute : I.vol) + '</button>' +
    '<span class="lpnum num">' + (i + 1) + '</span><input type="range" class="lpvol" min="0" max="1.5" step="0.01" value="' + L.gain + '" data-vol="' + i + '" aria-label="' + ui.esc(t('layerVol', { n: i + 1 })) + '"></div>').join('') + '</div>'
    : '<div class="lphint l2">' + ui.esc(t(small ? 'hintShort' : s === 'idle' ? 'hint' : 'hintMore')) + '</div>';
  const slots = '<div class="lpslots" role="group" aria-label="' + ui.esc(t('loops')) + '">' + Array.from({ length: SLOTS }, (_, i) => '<button class="lpslot' + (i === S.slot ? ' on' : '') + (S.slots[i] ? ' has' : '') + '" data-x="slot" data-i="' + i + '" aria-pressed="' + (i === S.slot) + '" aria-label="' + ui.esc(t('loopN', { n: i + 1 })) + '">' + (i + 1) + '</button>').join('') + '</div>';
  const bar = '<div class="lpbar">' +
    ui.icb('data-x="metro"', I.metro, t('metro'), 'sm' + (withMetro() ? ' on' : '')) +
    ui.icb('data-x="mon"', I.ear, t('mon'), 'sm' + (S.mon ? ' on' : '')) +
    ui.icb('data-x="undo"', I.undo, t('undo'), 'sm') +
    ui.icb('data-x="stop"', I.stop, t('stop'), 'sm') +
    ui.icb('data-x="save"', I.save, t('save'), 'sm') + '</div>';
  return '<div class="lpwrap ' + size + '"><div class="lpmain">' + main + time + '</div>' + layers + slots + bar + '</div>';
}

function render() {
  if (!host) return;
  const act = document.activeElement, keep = act && host.contains(act) && act.dataset.vol;
  host.innerHTML = view();
  if (keep) { const r = host.querySelector('[data-vol="' + keep + '"]'); if (r) r.focus(); }
  tick();
}
// кольцо хода петли — без перерисовки
function tick() {
  cancelAnimationFrame(raf);
  if (!host || !lp) return;
  const S = lp.state, ring = host.querySelector('.lpring'), tm = host.querySelector('.lptime');
  if (ring) ring.setAttribute('stroke-dashoffset', (C * (1 - S.pos)).toFixed(1));
  if (tm && S.state === 'rec') tm.textContent = fmt(S.recSec) + ' / ' + fmt(MAX_SEC);
  if (S.state !== 'idle') raf = requestAnimationFrame(tick);
}

/* ---------- действия ---------- */

const fail = (e) => {
  const r = e && e.reason;
  ctx.ui.toast(ctx.t(r === 'denied' ? 'err.denied' : r === 'unavailable' ? 'err.mic' : r === 'layers' ? 'err.layers' : e && e.message === 'nosound' ? 'err.sound' : 'err.fail'));
  if (!r) ctx.logErr(e);
};

// Главная кнопка. По метроному и без петли: отсчёт одного такта, запись — с начала следующего
async function main() {
  if (!ctx.audio.unlock()) { fail(new Error('nosound')); return; }
  const S = lp.state;
  if (arm) { disarm(); render(); return; }
  if (S.state === 'idle' && withMetro() && !S.len) {
    try { await lp.openMic(); } catch (e) { fail(e); return; }
    const m = metro();
    arm = { n: m.running ? 0 : 1 }; // метроном уже идёт — с ближайшего такта, иначе один такт отсчёта
    if (!m.running) m.start();
    offBeat = m.onBeat(({ b, ms }) => {
      if (!arm || b !== 0) return;
      if (arm.n > 0) { arm.n--; render(); return; }
      const at = ctx.audio.now() + ms / 1000;
      disarm();
      lp.startRec(at).then(render).catch(fail);
    });
    render();
    return;
  }
  if (S.state === 'idle' && S.len) { lp.play(); render(); return; }
  try { await lp.tap(withMetro() ? barSec() : 0); } catch (e) { fail(e); }
  render();
}
function disarm() { arm = null; if (offBeat) { offBeat(); offBeat = null; } }
function stopAll() { disarm(); lp.stop(); if (withMetro() && metro().running) metro().stop(); render(); }

async function save() {
  const m = lp && lp.mix();
  if (!m) { ctx.ui.toast(ctx.t('err.empty')); return; }
  const wav = encodeWav([m.data], m.sr), at = Date.now(), song = ctx.session && ctx.session.songId;
  let d;
  try { d = new Date(at).toLocaleString(ctx.lang() === 'uz' ? 'uz-Latn' : ctx.lang(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { d = new Date(at).toISOString().slice(0, 16); }
  try {
    await ctx.files.add({ id: 'lp' + at.toString(36), name: ctx.t('fileName', { when: d }), size: wav.length, type: 'audio/wav', kind: 'audio', songs: song ? [song] : [], created: at,
      blob: new Blob([wav], { type: 'audio/wav' }), dur: m.data.length / m.sr });
    ctx.ui.toast(ctx.t('saved'));
  } catch (e) { fail(e); }
}

function act(x, el) {
  const i = el && el.dataset.i != null ? +el.dataset.i : -1;
  switch (x) {
    case 'main': main(); break;
    case 'stop': stopAll(); break;
    case 'undo': if (arm) { disarm(); render(); } else { ctx.ui.toast(ctx.t(lp.undo() ? 'undone' : 'nothing')); render(); } break;
    case 'save': save(); break;
    case 'metro': st().metro = !withMetro(); ctx.store.save(); render(); break;
    case 'mon': lp.setMonitor(!lp.state.mon); if (lp.state.mon) ctx.ui.toast(ctx.t('monOn')); render(); break;
    case 'mute': lp.toggleMute(i); render(); break;
    case 'slot': if (arm) disarm(); lp.select(i); render(); break;
  }
}

// Педаль Bluetooth (как для перелистывания): пробел, Enter, PageDown — кнопка; PageUp — стоп; стрелки — отмена
function onKey(e) {
  if (!host || e.target.matches('input, textarea, select')) return;
  const k = e.key;
  if (k === ' ' || k === 'Enter' || k === 'PageDown') { e.preventDefault(); main(); }
  else if (k === 'PageUp') { e.preventDefault(); stopAll(); }
  else if (k === 'ArrowUp' || k === 'ArrowDown') { e.preventDefault(); act('undo'); }
}

export default {
  id: 'looper',
  order: 46,
  name: { ru: ru.name, uz: uz.name, en: en.name, el: el.name },
  i18n: { ru, uz, en, el },
  icon: ICON,
  color: '#B5533C',
  sizes: ['full', 'half', 'quarter', 'strip'],
  record: false, // лупер сам пишет микрофон; сведение — кнопкой «В медиатеку»
  status(c) { return c.t(c.store.get('metro') ? 'st.metro' : 'st.free'); },
  mount(el, c, sz = 'full') {
    host = el; ctx = c; size = sz;
    if (!lp) lp = createLooper({ mixer: c.audio.mixer, onChange: () => tick(), log: c.log });
    lp.setShift(st().shift || 0);
    const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); offs.push(() => t.removeEventListener(ev, fn, o)); };
    on(host, 'click', (e) => { const b = e.target.closest('[data-x]'); if (b) act(b.dataset.x, b); });
    on(host, 'input', (e) => { if (e.target.dataset.vol != null) lp.setGain(+e.target.dataset.vol, +e.target.value); });
    on(window, 'keydown', onKey);
    // удержание кнопки — отмена последнего слоя; удержание слоя — убрать его
    onHold(host, '[data-x="main"]', () => act('undo'));
    onHold(host, '.lplayer', (row) => holdMenu(row, [{ icon: I.x, label: c.t('removeLayer'), danger: true, run: () => { lp.removeLayer(+row.dataset.li); render(); } }], c.t('layerN', { n: +row.dataset.li + 1 })));
    render();
  },
  resize(sz) { size = sz; render(); },
  // Окно закрыто: петля звучит дальше (как Hold у пианино), пока не остановят — удобно играть под неё в другом инструменте
  unmount() {
    cancelAnimationFrame(raf);
    disarm();
    offs.splice(0).forEach((f) => f());
    if (lp && lp.state.state === 'rec') lp.stop();
    if (lp && lp.state.state === 'dub') lp.stopDub();
    if (lp && !lp.hasAny && lp.state.state === 'idle') { lp.close(); }
    host = null;
  },
};
