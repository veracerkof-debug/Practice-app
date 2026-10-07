// Помодоро: кольцо или перекидные часы, работа и перерывы, точки циклов, настройки.
// Второй режим — секундомер «сколько я играю» в том же виде; его время можно записать в статистику.
// Таймер и секундомер — в ядре (ctx.pomodoro, ctx.stopwatch), модуль только показывает их.
// Перенесено из legacy/practice.html (pomoHTML, flipHTML, flapCard, flipTick, pomoSheet, styleCards).
import './timer.css';
import ru from './i18n/ru.json';
import uz from './i18n/uz.json';
import en from './i18n/en.json';
import el from './i18n/el.json';
import { POMO_LIMITS } from '../../core/pomodoro.js';

const ICON = '<svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="7.5"/><path d="M12 9.5V13l2.5 1.5M10 3h4"/></svg>';
const I = {
  play: '<svg viewBox="0 0 24 24"><path d="M7 4.8v14.4c0 .8.9 1.3 1.6.9l11.3-7.2c.6-.4.6-1.4 0-1.8L8.6 3.9C7.9 3.5 7 4 7 4.8z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><rect x="6" y="5" width="4.2" height="14" rx="1.4"/><rect x="13.8" y="5" width="4.2" height="14" rx="1.4"/></svg>',
  reset: '<svg viewBox="0 0 24 24"><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4v3.5H8"/></svg>',
  skip: '<svg viewBox="0 0 24 24"><path d="M6 5.5l9 6.5-9 6.5zM18.5 5.5v13"/></svg>',
  save: '<svg viewBox="0 0 24 24"><path d="M5 20v-6M10 20V10M15 20v-8"/><path d="M19.5 3.5v7M16 7h7"/></svg>', // в статистику
};
const R = 98, C = 2 * Math.PI * R;

let host = null, ctx = null, size = 'full', timer = 0, unsub = () => {}, onClick = null;

const PO = () => ctx.pomodoro;
const SW = () => ctx.stopwatch;
const cfg = () => ctx.store.all();
const watch = () => cfg().mode === 'watch';
const pad2 = (n) => String(n).padStart(2, '0');
// 1500 → '25:00', 3725 → '1:02:05'
export function fmtClock(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? h + ':' + pad2(m) + ':' + pad2(s) : pad2(m) + ':' + pad2(s);
}

/* ---------- разметка ---------- */

// Что показывать: помодоро — оставшееся время этапа; секундомер — прошедшее (кольцо обходит круг за минуту)
function view() {
  const { t } = ctx;
  if (watch()) {
    const sw = SW(), el = sw.elapsed();
    return { running: sw.running, shown: el, frac: (el % 60) / 60, brk: false, label: t(sw.running || !el ? 'w.label' : 'w.paused'),
      // до часа — минуты:секунды, дальше — часы:минуты
      flip: el < 3600 ? fmtClock(el).padStart(5, '0') : String(Math.floor(el / 3600)).padStart(2, '0') + ':' + pad2(Math.floor((el % 3600) / 60)) };
  }
  const po = PO(), rem = po.rem(), tot = po.total();
  return { running: po.running, shown: rem, frac: 1 - rem / tot, brk: po.phase !== 'work', label: t('ph.' + po.phase), flip: fmtClock(rem).padStart(5, '0') };
}

function buttons() {
  const { t, ui } = ctx, v = view();
  return {
    play: '<button class="bigplay" data-x="ptoggle" aria-label="' + t(v.running ? 'pause' : 'start') + '">' + (v.running ? I.pause : I.play) + '</button>',
    rs: ui.icb('data-x="preset"', I.reset, t(watch() ? 'w.reset' : 'reset')),
    // в режиме «Только инструменты» записывать некуда — кнопки нет
    sk: watch() ? (SW().saves === false ? '<span style="width:44px" aria-hidden="true"></span>' : ui.icb('data-x="wsave"', I.save, t('w.save'))) : ui.icb('data-x="pskip"', I.skip, t('skip')),
  };
}

// Переключатель режима — в большом окне
const modeSeg = () => '<div class="tmode">' + ctx.ui.seg('tmode', [['pomo', ctx.t('mode.pomo')], ['watch', ctx.t('mode.watch')]], watch() ? 'watch' : 'pomo', ctx.t('mode.aria')) + '</div>';

function dots() {
  if (watch()) return '<div class="pdots wnote l2">' + ctx.t('w.hint') + '</div>';
  const po = PO(), n = cfg().every, done = po.done % n;
  return '<div class="pdots" role="img" aria-label="' + ctx.t('progress', { done, n }) + '">' + Array.from({ length: n }, (_, i) => '<i class="' + (i < done ? 'on' : '') + '"></i>').join('') + '</div>';
}

// Перекидная цифра
const flapCard = (ch, i) => '<span class="fd" data-fi="' + i + '" data-v="' + ch + '"><span class="fh t"><b>' + ch + '</b></span><span class="fh b"><b>' + ch + '</b></span></span>';

function flipHTML() {
  const { t, ui } = ctx, v = view(), s = v.flip, brk = v.brk, { play, rs, sk } = buttons();
  const clock = '<div class="fclock' + (brk ? ' brk' : '') + '" id="pflip" role="timer" aria-label="' + fmtClock(v.shown) + '">' + flapCard(s[0], 0) + flapCard(s[1], 1) +
    '<span class="fcolon" aria-hidden="true"><i></i><i></i></span>' + flapCard(s[3], 3) + flapCard(s[4], 4) + '</div>';
  const prog = '<div class="fprog" aria-hidden="true"><b id="pfprog" style="width:' + v.frac * 100 + '%"></b></div>';
  const phase = '<div class="fphase' + (brk ? ' brk' : '') + '" id="pphase">' + v.label + '</div>';
  if (size === 'strip') return '<div class="srow2 fstrip">' + phase + clock + '<span class="sgrow"></span>' + play + sk + '</div>';
  if (size === 'quarter') return '<div class="vq fq">' + phase + clock + prog + '<div class="vrow tight">' + play + sk + '</div></div>';
  return '<div class="fwrap ' + size + '">' + ui.icb('data-x="psettings"', ui.icons.gear, t('settings'), 'corner') + modeSeg() + phase + clock + prog + dots() + '<div class="ctrl3">' + rs + play + sk + '</div></div>';
}

function ringHTML() {
  const { t, ui } = ctx, v = view(), { play, rs, sk } = buttons();
  const ring = '<div class="pring"><svg viewBox="0 0 220 220" aria-hidden="true"><circle cx="110" cy="110" r="' + R + '" fill="none" stroke="var(--fill)" stroke-width="12"/>' +
    '<circle id="parc" cx="110" cy="110" r="' + R + '" fill="none" stroke="' + (v.brk ? '#34C759' : 'var(--tint)') + '" stroke-width="12" stroke-linecap="round" stroke-dasharray="' +
    C * v.frac + ' ' + C + '" transform="rotate(-90 110 110)"/></svg><div id="ptime" class="num ptime" role="timer">' + fmtClock(v.shown) + '</div></div>';
  const phase = '<div class="bpmlbl ph" id="pphase">' + v.label + '</div>';
  if (size === 'quarter') return '<div class="vq">' + phase + ring + '<div class="vrow">' + rs + play + sk + '</div></div>';
  if (size === 'strip') return '<div class="srow2"><div class="sgrow" style="text-align:left">' + phase + '<div id="ptime" class="num pstrip" role="timer">' + fmtClock(rem) + '</div></div>' + rs + play + sk + '</div>';
  if (size === 'half') return '<div class="ph2">' + ring + '<div class="ph2side">' + modeSeg() + phase + dots() + '<div class="vrow">' + rs + play + sk + '</div>' + ui.icb('data-x="psettings"', ui.icons.gear, t('settings'), 'sm') + '</div></div>';
  return '<div class="mcard" style="text-align:center;position:relative">' + ui.icb('data-x="psettings"', ui.icons.gear, t('settings'), 'corner') + modeSeg() + phase + ring + dots() + '<div class="ctrl3">' + rs + play + sk + '</div></div>';
}

function render() {
  if (host) host.innerHTML = cfg().style === 'flip' && !ctx.mono ? flipHTML() : ringHTML(); // «Минимал» — кольцо
}

/* ---------- ход времени ---------- */

function tick() {
  if (!host) return;
  const v = view();
  const pt = host.querySelector('#ptime');
  if (pt) pt.textContent = fmtClock(v.shown);
  const arc = host.querySelector('#parc');
  if (arc) arc.setAttribute('stroke-dasharray', C * v.frac + ' ' + C);
  const f = host.querySelector('#pflip');
  if (!f) return;
  const s = v.flip, reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  f.setAttribute('aria-label', fmtClock(v.shown));
  f.querySelectorAll('.fd').forEach((el) => {
    const nv = s[+el.dataset.fi], ov = el.dataset.v;
    if (nv === ov) return;
    el.dataset.v = nv;
    const top = el.querySelector('.fh.t b'), bot = el.querySelector('.fh.b b');
    if (reduced) { top.textContent = nv; bot.textContent = nv; return; }
    // верхняя половина падает со старой цифрой, нижняя открывает новую
    el.querySelectorAll('.flap').forEach((x) => x.remove());
    top.textContent = nv;
    bot.textContent = ov;
    const ft = document.createElement('span'), fb = document.createElement('span');
    ft.className = 'fh t flap ft'; ft.innerHTML = '<b>' + ov + '</b>';
    fb.className = 'fh b flap fb'; fb.innerHTML = '<b>' + nv + '</b>';
    el.append(ft, fb);
    setTimeout(() => { if (el.dataset.v === nv) bot.textContent = nv; ft.remove(); fb.remove(); }, 560);
  });
  const pr = host.querySelector('#pfprog');
  if (pr) pr.style.width = v.frac * 100 + '%';
}

/* ---------- настройки ---------- */

function settingsSheet() {
  const { t, tn, ui } = ctx, c = cfg();
  const body = () => ui.snav(t('set.title')) +
    (ctx.mono ? '<div class="hdr">' + t('set.view') + '</div><p class="ftr" style="margin-top:0">' + t('monoFixed', { v: t('style.ring') }) + '</p>' :
    '<div class="hdr">' + t('set.view') + '</div><div class="stycards" role="group" aria-label="' + t('set.view') + '">' + ['ring', 'flip'].map((k) => '<button class="stycard' +
      ((c.style || 'ring') === k ? ' on' : '') + '" data-sty="' + k + '" aria-pressed="' + ((c.style || 'ring') === k) + '"><span class="sprev ' + k + '"><i></i><i></i><i></i><i></i></span><b>' +
      t('style.' + k) + '</b></button>').join('') + '</div><div style="height:10px"></div>') +
    '<div class="group">' + ['work', 'short', 'long', 'every'].map((k) => '<div class="cell"><span class="grow">' + t('set.' + k) +
      '</span><span class="val num" style="color:var(--ink);margin-right:6px">' + (k === 'every' ? tn('u.cycles', c[k]) : t('u.min', { n: c[k] })) + '</span>' +
      ui.stepper(k, t('set.' + k)) + '</div>').join('') + '</div>' +
    '<div class="group" style="margin-top:12px"><div class="cell"><span class="grow">' + t('auto') + '</span>' + ui.sw('pauto', c.auto, t('auto')) + '</div>' +
    '<div class="cell"><span class="grow">' + t('pauseSession') + '</span>' + ui.sw('ppause', c.pauseSession, t('pauseSession')) + '</div></div>';
  ui.sheet(body, (el, sh) => {
    const changed = () => { ctx.store.save(); PO().settingsChanged(); sh.update(); };
    el.addEventListener('click', (e) => {
      const st = e.target.closest('[data-sty]');
      if (st) { c.style = st.dataset.sty; ctx.store.save(); sh.update(); render(); return; }
      const b = e.target.closest('[data-step]');
      if (!b) return;
      const [lo, hi, step] = POMO_LIMITS[b.dataset.step];
      c[b.dataset.step] = Math.max(lo, Math.min(hi, c[b.dataset.step] + +b.dataset.d * step));
      changed();
    });
    el.addEventListener('change', (e) => {
      const k = e.target.dataset.sw;
      if (k === 'pauto') c.auto = e.target.checked;
      if (k === 'ppause') {
        if (!e.target.checked) PO().release(); // снять паузу сессии, если сейчас перерыв
        c.pauseSession = e.target.checked;
      }
      changed();
    });
  });
}

/* ---------- секундомер: сбросить, записать в статистику ---------- */

function resetWatch() {
  const { t, ui } = ctx;
  if (SW().elapsed() < 60) { SW().reset(); return; }
  ui.confirm(t('w.resetTitle'), t('w.resetText'), t('w.reset')).then((ok) => { if (ok) SW().reset(); });
}

function saveSheet() {
  const { t, ui } = ctx, sw = SW(), dur = sw.credit(), short = dur < 60;
  let tag = '';
  ui.sheet(() => ui.snav(t('w.saveTitle'), { left: '<button class="link l" data-close>' + t('w.cancel') + '</button>', right: short ? '<span></span>' : '<button class="link b r" data-k="save">' + t('w.saveBtn') + '</button>' }) +
    '<div style="text-align:center;margin:4px 0 18px"><div class="num" style="font-size:44px;font-weight:300;letter-spacing:-.03em">' + fmtClock(dur) + '</div><div class="l2" style="font-size:15px">' + t('w.freePractice') + '</div></div>' +
    (short ? '<p class="ftr" style="text-align:center">' + t(sw.elapsed() >= 60 ? 'w.counted' : 'w.short') + '</p>'
      : (dur < sw.elapsed() - 30 ? '<p class="ftr">' + t('w.partly') + '</p>' : '') +
        '<div class="hdr">' + t('w.what') + '</div><div class="group"><div class="cellcol"><div class="hscroll" style="padding:0;flex-wrap:wrap">' +
        SW().tags().map((x) => '<button type="button" class="pill" aria-pressed="false" data-t="' + x.value + '">' + ui.esc(x.label) + '</button>').join('') + '</div></div></div>' +
        '<div class="hdr">' + t('w.note') + '</div><div class="group"><textarea class="ta" id="wnt" style="min-height:70px;font-family:var(--font);font-size:16px" aria-label="' + t('w.noteLabel') + '"></textarea></div>'),
  (el, sh) => el.addEventListener('click', (e) => {
    const tg = e.target.closest('[data-t]');
    if (tg) { tag = tag === tg.dataset.t ? '' : tg.dataset.t; el.querySelectorAll('[data-t]').forEach((c) => c.setAttribute('aria-pressed', c.dataset.t === tag)); return; }
    if (!e.target.closest('[data-k="save"]')) return;
    const rec = SW().commit({ tag, note: el.querySelector('#wnt').value });
    sh.close();
    if (rec) ui.toast(t('w.saved', { time: fmtClock(rec.dur) }));
  }));
}

function bind() {
  onClick = (e) => {
    const x = e.target.closest('[data-x]');
    if (!x) return;
    const a = x.dataset.x, po = PO();
    if (a === 'ptoggle') { ctx.audio.unlock(); if (watch()) SW().toggle(); else po.toggle(); }  // звук сигнала разрешаем заранее
    else if (a === 'preset') { if (watch()) resetWatch(); else po.reset(); }
    else if (a === 'pskip') po.next(true);
    else if (a === 'wsave') saveSheet();
    else if (a === 'psettings') settingsSheet();
  };
  host.addEventListener('click', onClick);
  // Переключатель «Помодоро / Секундомер»
  host.addEventListener('click', (e) => {
    const b = e.target.closest('[data-seg="tmode"] [data-v]');
    if (!b) return;
    cfg().mode = b.dataset.v;
    ctx.store.save();
    render();
  });
}

export default {
  id: 'timer',
  order: 70,
  name: { ru: ru.name, uz: uz.name, en: en.name, el: el.name },
  i18n: { ru, uz, en, el },
  icon: ICON,
  color: '#FF3B30',
  sizes: ['full', 'half', 'quarter', 'strip'],
  session: false, // в сессии помодоро — значок в заголовке и шторка
  status(c) {
    const sw = c.stopwatch;
    if (c.store.all().mode === 'watch') return sw.active() ? c.t(sw.running ? 'w.statusRun' : 'w.statusPaused', { time: fmtClock(sw.elapsed()) }) : c.t('mode.watch');
    const po = c.pomodoro;
    return po.running ? c.t('statusRun', { phase: c.t('ph.' + po.phase), time: fmtClock(po.rem()) }) : c.t('statusIdle', { n: c.store.all().work });
  },
  mount(el, c, sz = 'full') {
    host = el; ctx = c; size = sz;
    render();
    bind();
    const u1 = PO().subscribe(render), u2 = SW().subscribe(render);
    unsub = () => { u1(); u2(); };
    timer = setInterval(tick, 200);
  },
  resize(sz) { size = sz; render(); },
  // Таймер продолжает идти в ядре; здесь останавливаем только отрисовку
  unmount() {
    clearInterval(timer);
    unsub();
    if (host && onClick) host.removeEventListener('click', onClick);
    host = null;
  },
};
