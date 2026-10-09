// Пианино: 5–15 белых клавиш, октавы, Hold, два ряда, поворот, панель звука (встроенная или шторкой).
// Перенесено из legacy/practice.html (pianoHTML, pianoAfter, kbHTML, обработчики клавиш, pianoSheet).
import './piano.css';
import ru from './i18n/ru.json';
import uz from './i18n/uz.json';
import en from './i18n/en.json';
import el from './i18n/el.json';
import { pianoPatch, PRESETS } from '../../audio/synth.js';
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
const offs = [], ptr = new Map(), hold = { on: false, k: new Map() };

const P = () => ctx.store.all();
const rotated = () => size === 'full' && P().rot && P().rotMode !== 'screen';

/* ---------- разметка ---------- */

function view() {
  const { t, ui } = ctx, p = P(), m0 = 12 * (p.oct + 1), full = size === 'full', rot = rotated(), dual = full && p.dual;
  const hl = ctx.shared.get('highlight');
  const pk = (attrs, icon, lab, on) => '<button class="pk' + (on ? ' on' : '') + '" ' + attrs + ' aria-label="' + lab + '" title="' + lab + '"' +
    (on != null ? ' aria-pressed="' + !!on + '"' : '') + '>' + icon + '</button>';
  const bar = '<div class="pbar"><div class="pgrp">' + pk('data-step="poct" data-d="-1"', '‹', t('octDown')) + '<span class="num pval">' + mName(m0) + '–' +
    mName(lastWhite(m0, p.size)) + '</span>' + pk('data-step="poct" data-d="1"', '›', t('octUp')) + '</div><div class="pgrp">' +
    pk('data-step="pkeys" data-d="-1"', I.minus, t('keysLess')) + pk('data-step="pkeys" data-d="1"', I.plus, t('keysMore')) +
    pk('data-x="psound"', I.wave, t('sound'), !!(full && p.panel && !rot)) +
    (full ? pk('data-x="phold"', 'Hold', t('hold'), hold.on) + pk('data-x="pdual"', I.dual, t('dual'), !!p.dual) + pk('data-x="prot"', I.rot, t('rotate'), !!p.rot) +
      pk('data-x="pset"', ui.icons.gear, t('settings')) : '') + '</div></div>';
  const hlBtn = hl ? '<button class="pk txt on hlp" data-x="hloff" aria-label="' + t('hlOff') + '">' + ui.esc(hl.label) + ' ×</button>' : '';
  const kb = (m) => kbHTML(m, p.size, hl ? hl.pcs : null, hl ? hl.root : null);
  const syn = full && !rot && p.panel ? '<div class="psyn">' + synBody(ctx, true) + '</div>' : '';
  const inner = '<div class="pwrap' + (syn ? ' wsyn' : '') + '">' + syn + '<div class="lastnote num" id="lastnote" aria-live="polite"></div>' + hlBtn + bar +
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
  const used = (bar ? bar.offsetHeight + 8 : 0) + (hl ? hl.offsetHeight + 6 : 0) + 24, avail = (H - used) / kbs.length - (kbs.length > 1 ? 8 : 0);
  const ps = host.querySelector('.psyn');
  let kh = Math.round(Math.max(96, Math.min((W / n) * 5.2, avail, 340)));
  if (ps) kh = Math.round(Math.max(110, Math.min(kh, (H - used) * 0.42)));
  kbs.forEach((k) => (k.style.height = kh + 'px'));
  markHeld();
}

function markHeld() {
  host.querySelectorAll('.kb [data-m]').forEach((k) => k.classList.toggle('held', hold.k.has(+k.dataset.m)));
}

function render() {
  if (!host) return;
  unbindSyn();
  unbindSyn = () => {};
  host.innerHTML = view();
  const ps = host.querySelector('.psyn');
  if (ps) unbindSyn = synBind(ctx, ps, true, { rerender: () => { ps.innerHTML = synBody(ctx, true); }, onClose: () => { P().panel = false; ctx.store.save(); render(); } });
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
  return key;
}

function noteOff(p) {
  p.el.classList.remove('down');
  ctx.audio.synth.off(p.key);
}

function holdToggle() {
  hold.on = !hold.on;
  if (!hold.on) { hold.k.forEach((key) => ctx.audio.synth.off(key)); hold.k.clear(); }
}

function pianoSheet() {
  const { t, ui } = ctx, p = P();
  ui.sheet(() => ui.snav(t('set.title')) +
    '<div class="hdr" style="margin-top:4px">' + t('set.what') + '</div><div class="group"><div class="cellcol">' +
    ui.seg('rm', [['keys', t('set.keys')], ['screen', t('set.screen')]], p.rotMode === 'screen' ? 'screen' : 'keys', t('set.what')) + '</div></div>' +
    '<div class="hdr">' + t('set.dir') + '</div><div class="group"><div class="cellcol">' +
    ui.seg('rd', [['r', t('set.cw')], ['l', t('set.ccw')]], p.rotDir === 'l' ? 'l' : 'r', t('set.dir')) + '</div></div><p class="ftr">' + t('set.ftr') + '</p>',
  (el, sh) => el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-seg] [data-v]');
    if (!b) return;
    if (b.closest('[data-seg]').dataset.seg === 'rm') p.rotMode = b.dataset.v;
    else p.rotDir = b.dataset.v;
    ctx.store.save();
    sh.update();
    render();
  }));
}

function bind() {
  const on = (el, ev, fn, o) => { el.addEventListener(ev, fn, o); offs.push(() => el.removeEventListener(ev, fn, o)); };
  const syn = ctx.audio.synth;

  on(host, 'pointerdown', (e) => {
    const k = e.target.closest('.kb [data-m]');
    if (!k) return;
    e.preventDefault();
    if (!ctx.audio.unlock()) { ctx.ui.toast(ctx.t('noAudio')); return; }
    if (hold.on) { // Hold: нажатие включает ноту, повторное — выключает
      const m = +k.dataset.m;
      if (hold.k.has(m)) { syn.off(hold.k.get(m)); hold.k.delete(m); k.classList.remove('held'); }
      else { const key = 'ph' + m + '_' + Date.now(); syn.on(m, key, { hold: true, bus: 'piano' }); hold.k.set(m, key); k.classList.add('held'); showNote(m); }
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
  const up = (e) => { const p = ptr.get(e.pointerId); if (!p) return; noteOff(p); ptr.delete(e.pointerId); };
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
    if (a === 'psound') {
      if (size === 'full' && !rotated()) { p.panel = !p.panel; ctx.store.save(); render(); }
      else synthSheet(ctx);
    } else if (a === 'phold') { holdToggle(); render(); }
    else if (a === 'pdual') { p.dual = !p.dual; ctx.store.save(); render(); }
    else if (a === 'prot') { p.rot = !p.rot; if (!p.rotMode) p.rotMode = 'keys'; ctx.store.save(); render(); }
    else if (a === 'pset') pianoSheet();
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
  sizes: ['full', 'half', 'quarter', 'strip'],
  // «Поворот — весь экран»: сессия поворачивает весь экран, пока пианино в окне
  rotate: (c) => { const p = c.store.all(); return p.rot && p.rotMode === 'screen' ? (p.rotDir === 'l' ? 'l' : 'r') : null; },
  status(c) {
    const p = c.store.all(), s = pianoPatch(p);
    const sound = s.name || c.t('pre.' + (PRESETS[s.preset] ? s.preset : 'piano'));
    return c.t('status', { range: mName(12 * (p.oct + 1)), sound });
  },
  mount(el, c, sz = 'full') {
    host = el; ctx = c; size = sz;
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
    // Hold переживает закрытие окна: удержанные ноты звучат, пока занимаются другим инструментом
    // (выключить — кнопкой Hold, когда пианино снова открыто, или звуком пианино в микшере)
    host = null;
  },
};
