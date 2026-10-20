// Пианино: 5–15 белых клавиш, октавы, педаль (Sustain → Hold → выкл), два ряда, поворот всего экрана,
// панель звука — всегда сверху над клавишами (в двух рядах и маленьких окнах — шторкой).
// Поворот: кнопка поворачивает весь экран инструмента вместе с надписями (телефон держат горизонтально);
// сторону подсказывает наклон телефона — повернули как удобно, и при выключенном автоповороте положение остаётся.
// Перенесено из legacy/practice.html (pianoHTML, pianoAfter, kbHTML, обработчики клавиш, pianoSheet).
import './piano.css';
import ru from './i18n/ru.json';
import uz from './i18n/uz.json';
import en from './i18n/en.json';
import el from './i18n/el.json';
import { pianoPatch, pianoLayer, PRESETS } from '../../audio/synth.js';
import { synBody, synBind, synthSheet } from './synth-panel.js';
import { kbHTML, lastWhite } from '../../ui/keyboard.js';
import { mName } from '../../music/notes.js';

const ICON = '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M8 5v14M13 5v14M10.5 5v8M15.5 5v8"/></svg>';
const I = {
  minus: '<svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  wave: '<svg viewBox="0 0 24 24"><path d="M3 12c2-5 4-5 6 0s4 5 6 0 4-5 6 0"/></svg>',
  dual: '<svg viewBox="0 0 24 24"><rect x="3.5" y="4" width="17" height="7" rx="1.5"/><rect x="3.5" y="13" width="17" height="7" rx="1.5"/></svg>',
  rot: '<svg viewBox="0 0 24 24"><rect x="7" y="3.5" width="10" height="17" rx="2"/><path d="M20.5 8.5a6 6 0 0 1-3 5.2M3.5 15.5a6 6 0 0 1 3-5.2"/></svg>',
};

let host = null, ctx = null, size = 'full', ro = null, unbindSyn = () => {}, unsubShared = () => {};
// педаль: 0 — выкл, 1 — Sustain (отпущенная нота звучит долгим хвостом, как с педалью пианино), 2 — Hold (нота держится)
const PEDAL = ['off', 'sus', 'hold'];
const offs = [], ptr = new Map(), hold = { mode: 0, k: new Map() };
// MIDI: ноты с клавиатуры и из записи (id → { key, m }) и сколько раз подсвечена клавиша
const mi = new Map(), lit = new Map();

const P = () => ctx.store.all();
const rotated = () => false; // поворачивается весь экран (rotate ниже), клавиатура внутри окна — нет
const panelOn = () => size === 'full' && !P().dual; // панель эффектов — всегда, кроме двух рядов

/* ---------- разметка ---------- */

function view() {
  const { t, ui } = ctx, p = P(), m0 = 12 * (p.oct + 1), full = size === 'full', rot = rotated(), dual = full && p.dual;
  const hl = ctx.shared.get('highlight');
  const pk = (attrs, icon, lab, on) => '<button class="pk' + (on ? ' on' : '') + '" ' + attrs + ' aria-label="' + lab + '" title="' + lab + '"' +
    (on != null ? ' aria-pressed="' + !!on + '"' : '') + '>' + icon + '</button>';
  const bar = '<div class="pbar"><div class="pgrp">' + pk('data-step="poct" data-d="-1"', '‹', t('octDown')) + '<span class="num pval">' + mName(m0) + '–' +
    mName(lastWhite(m0, p.size)) + '</span>' + pk('data-step="poct" data-d="1"', '›', t('octUp')) + '</div><div class="pgrp">' +
    pk('data-step="pkeys" data-d="-1"', I.minus, t('keysLess')) + pk('data-step="pkeys" data-d="1"', I.plus, t('keysMore')) +
    (panelOn() ? '' : pk('data-x="psound"', I.wave, t('sound'))) +
    (full ? '<button class="pk txt2' + (hold.mode ? ' on' : '') + '" data-x="phold" aria-pressed="' + !!hold.mode + '" aria-label="' + ui.esc(t('pedal.' + PEDAL[hold.mode])) + '" title="' + ui.esc(t('pedal.' + PEDAL[hold.mode])) + '">' + '<i class="bareic" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 20h12M9 20l2-12h2l2 12" style="fill:none;stroke:currentColor;stroke-width:2"/>' + (hold.mode === 2 ? '<circle cx="12" cy="5" r="2" style="fill:currentColor"/>' : '') + '</svg></i><span class="bt">' + (hold.mode === 1 ? 'Sus' : 'Hold') + '</span></button>' +
      pk('data-x="pdual"', I.dual, t('dual'), !!p.dual) + pk('data-x="prot"', I.rot, t('rotate'), !!p.rot) : '') + '</div></div>';
  const hlBtn = hl ? '<button class="pk txt on hlp" data-x="hloff" aria-label="' + t('hlOff') + '">' + ui.esc(hl.label) + ' ×</button>' : '';
  const kb = (m) => kbHTML(m, p.size, hl ? hl.pcs : null, hl ? hl.root : null);
  const syn = panelOn() ? '<div class="psyn">' + synBody(ctx, true) + '</div>' : '';
  const inner = '<div class="pwrap' + (syn ? ' wsyn' : '') + '">' + syn + (syn ? '' : '<div class="lastnote num" id="lastnote" aria-live="polite"></div>') + hlBtn + bar +
    '<div class="kbs">' + (dual ? kb(m0 + 12) : '') + kb(m0) + '</div></div>';
  return rot ? '<div class="protbox"><div class="prot' + (p.rotDir === 'l' ? ' l' : '') + '">' + inner + '</div></div>' : inner;
}

// Высота клавиш по размеру окна (прототип: pianoAfter)
function layout() {
  if (!host) return;
  const box = host.querySelector('.protbox') || host, cs = getComputedStyle(host);
  let W = box.clientWidth, H = box.clientHeight;
  if (box === host) { W -= parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight); H -= parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom); }
  if (!W || !H) return;
  const rot = host.querySelector('.prot');
  if (rot) { rot.style.width = H + 'px'; rot.style.height = W + 'px'; [W, H] = [H, W]; }
  const kbs = [...host.querySelectorAll('.pwrap .kb')];
  if (!kbs.length) return;
  const n = parseInt(kbs[0].style.getPropertyValue('--n'), 10) || 8, bar = host.querySelector('.pbar'), hl = host.querySelector('.hlp');
  // полный экран: клавиши — на всю высоту (две клавиатуры — пополам), без панели и полей
  if (host.closest('.tview.pure, .pfull')) { kbs.forEach((k) => (k.style.height = Math.floor(H / kbs.length) + 'px')); markHeld(); return; }
  const used = (bar ? bar.offsetHeight + 8 : 0) + (hl ? hl.offsetHeight + 6 : 0) + 24, avail = (H - used) / kbs.length - (kbs.length > 1 ? 8 : 0);
  const ps = host.querySelector('.psyn');
  let kh = Math.round(Math.max(96, Math.min((W / n) * 5.2, avail, 340)));
  // с панелью эффектов — клавиши ровно в нижней половине, панель занимает всё, что выше
  if (ps) kh = Math.round(Math.max(96, Math.min((W / n) * 6, (H - used) * 0.5)));
  kbs.forEach((k) => (k.style.height = kh + 'px'));
  markHeld();
}

function markHeld() {
  host.querySelectorAll('.kb [data-m]').forEach((k) => { k.classList.toggle('held', hold.k.has(+k.dataset.m)); if (lit.has(+k.dataset.m)) k.classList.add('down'); });
}

function render() {
  if (!host) return;
  unbindSyn();
  unbindSyn = () => {};
  host.innerHTML = view();
  const ps = host.querySelector('.psyn');
  if (ps) unbindSyn = synBind(ctx, ps, true, { rerender: () => { ps.innerHTML = synBody(ctx, true); } });
  requestAnimationFrame(layout);
}

/* ---------- клавиши ---------- */

function showNote(m) {
  const ln = host && host.querySelector('#lastnote');
  if (ln) ln.textContent = mName(m);
}

function noteOn(k, pid) {
  const m = +k.dataset.m, key = 'p' + pid + '_' + m + '_' + performance.now();
  k.classList.add('down');
  ctx.audio.synth.on(m, key, { bus: 'piano' });
  showNote(m);
  ctx.midi.ev({ k: 'on', id: key, m, v: 0.8 });
  return key;
}

function noteOff(p) {
  p.el.classList.remove('down');
  ctx.audio.synth.off(p.key);
  ctx.midi.ev({ k: 'off', id: p.key });
}

/* ---------- MIDI: клавиатура и воспроизведение записи ---------- */

function light(m, d) {
  const n = Math.max(0, (lit.get(m) || 0) + d);
  if (n) lit.set(m, n); else lit.delete(m);
  const k = host && host.querySelector('.kb [data-m="' + m + '"]');
  if (k) k.classList.toggle('down', n > 0);
}
function midiIn(e) {
  if (!ctx) return;
  const syn = ctx.audio.synth;
  if (e.k === 'on') {
    if (!ctx.audio.unlock()) return;
    const m = Math.max(0, Math.min(127, Math.round(e.m))), key = 'mi' + e.id;
    if (mi.has(e.id)) { syn.off(mi.get(e.id).key, true); light(mi.get(e.id).m, -1); }
    syn.on(m, key, { bus: 'piano', vel: e.v });
    mi.set(e.id, { key, m });
    light(m, 1);
    showNote(m);
  } else if (e.k === 'off') {
    const v = mi.get(e.id);
    if (!v) return;
    mi.delete(e.id);
    if (e.r) syn.release(v.key); else syn.off(v.key);
    light(v.m, -1);
  }
}
function midiStop() {
  if (!ctx) return;
  mi.forEach((v) => { ctx.audio.synth.off(v.key); light(v.m, -1); });
  mi.clear();
}

// Sustain → Hold → выкл. Из Hold — удержанные ноты отпускаются долгим хвостом
function holdToggle() {
  hold.mode = (hold.mode + 1) % PEDAL.length;
  if (hold.mode !== 2) { hold.k.forEach((key) => { ctx.audio.synth.release(key); ctx.midi.ev({ k: 'off', id: key, r: true }); }); hold.k.clear(); }
  ctx.midi.ev({ k: 'ped', v: hold.mode === 1 ? 1 : 0 });
  ctx.ui.toast(ctx.t('pedal.' + PEDAL[hold.mode]));
}

function bind() {
  const on = (el, ev, fn, o) => { el.addEventListener(ev, fn, o); offs.push(() => el.removeEventListener(ev, fn, o)); };
  const syn = ctx.audio.synth;

  on(host, 'pointerdown', (e) => {
    const k = e.target.closest('.kb [data-m]');
    if (!k) return;
    e.preventDefault();
    if (!ctx.audio.unlock()) { ctx.ui.toast(ctx.t('noAudio')); return; }
    if (hold.mode === 2) { // Hold: нажатие включает ноту, повторное — выключает
      const m = +k.dataset.m;
      if (hold.k.has(m)) { syn.off(hold.k.get(m)); ctx.midi.ev({ k: 'off', id: hold.k.get(m) }); hold.k.delete(m); k.classList.remove('held'); }
      else { const key = 'ph' + m + '_' + Date.now(); syn.on(m, key, { hold: true, bus: 'piano' }); hold.k.set(m, key); k.classList.add('held'); showNote(m); ctx.midi.ev({ k: 'on', id: key, m, v: 0.8 }); }
      return;
    }
    ptr.set(e.pointerId, { el: k, key: noteOn(k, e.pointerId) });
  });
  // Скольжение пальцем по клавишам
  on(window, 'pointermove', (e) => {
    const p = ptr.get(e.pointerId);
    if (!p) return;
    const el = document.elementFromPoint(e.clientX, e.clientY), k = el && el.closest ? el.closest('.kb [data-m]') : null;
    if (k && k !== p.el && host.contains(k)) { noteOff(p); ptr.set(e.pointerId, { el: k, key: noteOn(k, e.pointerId) }); }
  });
  // Sustain: отпущенная клавиша не глушится — звук уходит долгим хвостом
  const up = (e) => { const p = ptr.get(e.pointerId); if (!p) return; if (hold.mode === 1) { p.el.classList.remove('down'); syn.release(p.key); ctx.midi.ev({ k: 'off', id: p.key, r: true }); } else noteOff(p); ptr.delete(e.pointerId); };
  on(window, 'pointerup', up);
  on(window, 'pointercancel', up);

  on(host, 'click', (e) => {
    const st = e.target.closest('[data-step]');
    const p = P();
    if (st) {
      const d = +st.dataset.d;
      if (st.dataset.step === 'poct') p.oct = Math.max(0, Math.min(7, p.oct + d));
      else p.size = Math.max(5, Math.min(15, p.size + d));
      ctx.store.save();
      render();
      return;
    }
    const x = e.target.closest('[data-x]');
    if (!x) return;
    const a = x.dataset.x;
    if (a === 'psound') synthSheet(ctx);
    else if (a === 'phold') { holdToggle(); render(); }
    else if (a === 'pdual') { p.dual = !p.dual; ctx.store.save(); render(); }
    // Поворот — только по кнопке: выкл → вправо → влево → выкл (сам по наклону телефона больше не переворачивается)
    else if (a === 'prot') {
      if (!p.rot) { p.rot = true; p.rotDir = 'r'; } else if (p.rotDir !== 'l') p.rotDir = 'l'; else p.rot = false;
      ctx.store.save(); render(); dispatchEvent(new Event('melete:rot'));
      ctx.ui.toast(ctx.t(p.rot ? (p.rotDir === 'l' ? 'rotL' : 'rotR') : 'rotOff'));
    }
    else if (a === 'hloff') ctx.shared.set('highlight', null);
  });
}

export default {
  id: 'piano',
  order: 30,
  name: { ru: ru.name, uz: uz.name, en: en.name, el: el.name },
  i18n: { ru, uz, en, el },
  icon: ICON,
  color: '#646493',
  // MIDI: запись игры, воспроизведение в самом пианино, MIDI-клавиатура (src/core/midi.js)
  midiIn, midiStop,
  multitouch: true, // играют несколькими пальцами — защита от снимка экрана тремя пальцами
  sizes: ['full', 'half', 'quarter', 'strip'],
  // Поворот: весь экран инструмента (и сессии) поворачивается, пока пианино в окне; если экран уже
  // горизонтальный (автоповорот телефона), поворачивать нечего
  pure: true, // в отдельном окне — полный экран: только клавиатура
  onPure() { requestAnimationFrame(layout); },
  rotate: (c) => { const p = c.store.all(); return p.rot && innerHeight > innerWidth ? (p.rotDir === 'l' ? 'l' : 'r') : null; },
  status(c) {
    const p = c.store.all(), nm = (s) => s.name || c.t('pre.' + (PRESETS[s.preset] ? s.preset : 'piano')), L = pianoLayer(p);
    const sound = nm(pianoPatch(p)) + (L ? ' + ' + nm(L) : '');
    return c.t('status', { range: mName(12 * (p.oct + 1)), sound });
  },
  mount(el, c, sz = 'full') {
    host = el; ctx = c; size = sz;
    if (ctx.audio.synth.preload) ctx.audio.synth.preload(); // записи рояля — заранее, пока смотрят на клавиши
    render();
    bind();
    ro = new ResizeObserver(() => layout());
    ro.observe(host);
    unsubShared = ctx.shared.subscribe((k) => { if (k === 'highlight') render(); });
  },
  resize(sz) { size = sz; render(); },
  unmount() {
    ro && ro.disconnect();
    unsubShared();
    unbindSyn();
    offs.splice(0).forEach((f) => f());
    ptr.forEach((p) => ctx.audio.synth.off(p.key));
    ptr.clear();
    midiStop(); // ноты с MIDI-клавиатуры не остаются звучать
    // Hold переживает закрытие окна: удержанные ноты звучат, пока занимаются другим инструментом
    // (выключить — кнопкой Hold, когда пианино снова открыто, или звуком пианино в микшере)
    host = null;
  },
};
