// Вкладка «Календарь»: месяц (с днём под сеткой), неделя по часам, список ближайших. События — репетиции, уроки,
// концерты, записи, дедлайны и цели по песням; типы и цвета свободные. Экспорт в .ics для других календарей.
import '../../ui/calendar.css';
import { epigraphHTML } from './verses.js';
import { refText } from '../bible.js';
import { nextOf } from '../reading.js';
import { t, tn, bareNow, withText } from '../../i18n/index.js';
import { esc, sheet, snav, toast, confirm, seg, sw, icb, icons } from '../../ui/index.js';
import { fmtDur } from '../format.js';
import { DAY, dayStart, dayKey, weekStart, monthStart, weekday, pad2, uid } from '../time.js';
import { PALETTE, autoText } from '../library.js';
import {
  ensureCal, liveEvents, kindOf, colorOf, occurrences, onDay, layoutDay, upcoming, newEvent, saveEvent, deleteEvent,
  skipOccurrence, toggleDone, isDone, toICS, REPEATS,
} from '../calendar.js';
import { topbar, IC, weekdays, TAB_ICONS } from './common.js';

const HOUR = 3600000, ROW = 48; // высота часа в недельной сетке, px
const I = {
  left: '<svg viewBox="0 0 24 24"><path d="M14.5 6l-6 6 6 6"/></svg>',
  right: '<svg viewBox="0 0 24 24"><path d="M9.5 6l6 6-6 6"/></svg>',
  share: '<svg viewBox="0 0 24 24"><path d="M12 15V4M8 7.5 12 3.5l4 4M6 11H5v9h14v-9h-1"/></svg>',
  pin: '<svg viewBox="0 0 24 24"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/></svg>',
  rep: '<svg viewBox="0 0 24 24"><path d="M5 12a7 7 0 0 1 12-4.9L19 9M19 4.5V9h-4.5M19 12a7 7 0 0 1-12 4.9L5 15M5 19.5V15h4.5"/></svg>',
  note: '<svg viewBox="0 0 24 24"><path d="M11 20V7.5l9-2.5V17.5"/><circle cx="8" cy="20" r="2.6"/><circle cx="17.5" cy="17.5" r="2.6"/></svg>',
  clock: IC.clock,
};

/* ---------- даты по-человечески ---------- */

// «Минимал» без текста: вид календаря — значками (месяц — сетка, неделя — столбцы, список — строки)
const CVIEW_IC = [['month', '<svg class="segic" viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M4 15h16M9.3 10v10M14.7 10v10"/></svg>'],
  ['week', '<svg class="segic" viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 5v15M12 5v15M16 5v15"/></svg>'],
  ['list', '<svg class="segic" viewBox="0 0 24 24"><path d="M5 7h14M5 12h14M5 17h14"/></svg>']];
// «Минимал» без текста: месяцы — числами (10 2026, 14.10), дни недели — без названий
const NUMS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
const months = () => (bareNow() ? NUMS : withText(() => t('cal.months')).split(' '));
const monthsGen = () => (bareNow() ? NUMS : withText(() => t('cal.monthsGen')).split(' '));
const wdFull = () => (bareNow() ? Array(7).fill('') : withText(() => t('cal.wdFull')).split(' '));
export const hm = (ts) => { const d = new Date(ts); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); };
const dayFmt = (ts, wd = true) => { const d = new Date(ts); return t(wd ? 'cal.dayFmt' : 'cal.dateFmt', { wd: wdFull()[weekday(ts)], d: d.getDate(), m: monthsGen()[d.getMonth()], y: d.getFullYear() }); };
const monthTitle = (ts) => { const d = new Date(ts); return t('cal.monthFmt', { m: months()[d.getMonth()], y: d.getFullYear() }); };
const addMonths = (ts, n) => { const d = new Date(monthStart(ts)); d.setMonth(d.getMonth() + n); return d.getTime(); };
const addDays = (ts, n) => { const d = new Date(ts); d.setDate(d.getDate() + n); return d.getTime(); };

// «сегодня», «завтра» или день недели и число
export function relDate(ts, now = Date.now()) {
  const n = Math.round((dayStart(ts) - dayStart(now)) / DAY);
  return n === 0 ? t('cal.today') : n === 1 ? t('cal.tomorrow') : dayFmt(ts);
}

// Заголовок дня: «Сегодня, 7 октября», «Завтра, 8 октября» или «Пятница, 9 октября»
function dayLabel(day, now = Date.now()) {
  const n = Math.round((dayStart(day) - dayStart(now)) / DAY);
  if (bareNow()) { const d = new Date(day); return d.getDate() + '.' + NUMS[d.getMonth()]; } // без текста — 14.10
  // сегодня отмечен в сетке — слово «Сегодня» не нужно; «Завтра» — остаётся
  return n === 1 ? t('cal.tomorrowCap') + ', ' + dayFmt(day, false) : dayFmt(day);
}

export function timeTxt(o) {
  if (o.ev.allDay) {
    const last = dayStart(o.ev.end || o.start) > dayStart(o.ev.start);
    return last ? t('cal.allDay') + ' · ' + t('cal.until', { d: dayFmt(o.end, false) }) : t('cal.allDay');
  }
  return hm(o.start) + '–' + hm(o.end);
}

const cal = (app) => ensureCal(app.store.state, t);
const events = (app) => liveEvents(app.store.state);
const titleOf = (c, ev) => ev.title || (kindOf(c, ev.kind) || {}).name || t('cal.untitled');

/* ---------- строка события (месяц, список, песня, главная) ---------- */

export function evRow(app, o, { date = false } = {}) {
  const c = cal(app), ev = o.ev, k = kindOf(c, ev.kind), col = colorOf(c, ev), task = k && k.task, done = task && isDone(ev, o.start);
  const songs = (ev.songs || []).map((id) => app.store.songById(id)).filter(Boolean).map((s) => s.title);
  const sub = [(date ? relDate(o.start) + ', ' : '') + timeTxt(o), k ? k.name : '', ev.place, songs.join(', ')].filter(Boolean).join(' · ');
  return '<div class="cevt' + (done ? ' done' : '') + '" style="--c:' + col + '">' +
    (task ? '<button class="cchk" data-cdone="' + ev.id + '" data-os="' + o.start + '" aria-pressed="' + done + '" aria-label="' + esc(t(done ? 'cal.undone' : 'cal.markDone', { title: titleOf(c, ev) })) + '">' + (done ? icons.check : '') + '</button>' : '<span class="cbar"></span>') +
    '<button class="cebody" data-cev="' + ev.id + '" data-os="' + o.start + '"><b>' + esc(titleOf(c, ev)) + ((ev.repeat || 'none') !== 'none' ? ' <i class="crep" aria-hidden="true">' + I.rep + '</i>' : '') + '</b><small>' + esc(sub) + '</small></button></div>';
}

/* ---------- экран ---------- */

export function calendarHTML(app, cv) {
  cv.view ??= app.device.calView || 'month';
  cv.sel ??= dayStart(Date.now());
  const head = '<div class="calhd"><button class="calmt" data-cnav="0" aria-label="' + esc(t('cal.todayBtn')) + '">' + esc(cv.view === 'list' ? t('cal.upcoming') : cv.view === 'week' ? weekTitle(cv.sel) : monthTitle(cv.sel)) + '</button>' +
    (cv.view === 'list' ? '' : icb('data-cnav="-1"', I.left, t(cv.view === 'week' ? 'cal.prevWeek' : 'cal.prevMonth'), 'sm') + icb('data-cnav="1"', I.right, t(cv.view === 'week' ? 'cal.nextWeek' : 'cal.nextMonth'), 'sm')) +
    '</div>';
  // в месяце «+» — круглой кнопкой у выбранного дня; сверху — только в неделе и списке
  const right = '<span class="ctop">' + icb('data-cics', I.share, t('cal.export'), 'plain') + (cv.view === 'month' ? '' : icb('data-cnew', IC.plus, t('cal.new'), 'plain')) + '</span>';
  // стих эпиграфом — Пс 89:12 (src/core/verses.js)
  let h = topbar(right) + '<div class="large">' + t('cal.title') + '</div>' + epigraphHTML() + '<div class="calw">' + head +
    seg('cview', bareNow() ? CVIEW_IC : [['month', t('cal.v.month')], ['week', t('cal.v.week')], ['list', t('cal.v.list')]], cv.view, withText(() => t('cal.view')));
  h += cv.view === 'week' ? weekHTML(app, cv) : cv.view === 'list' ? listHTML(app, cv) : monthHTML(app, cv);
  return h + '</div>';
}

const weekTitle = (ts) => {
  const a = weekStart(ts), b = addDays(a, 6), da = new Date(a), db = new Date(b);
  return da.getMonth() === db.getMonth() ? t('cal.monthFmt', { m: months()[da.getMonth()], y: da.getFullYear() })
    : months()[da.getMonth()].slice(0, 3) + ' – ' + months()[db.getMonth()].slice(0, 3) + ' ' + db.getFullYear();
};

// Минуты практики по дням (ключ дня → секунды)
function practiceByDay(app, from, to) {
  const m = {};
  app.store.sessions().forEach((s) => { if (s.start >= from && s.start < to) { const k = dayKey(s.start); m[k] = (m[k] || 0) + (s.dur || 0); } });
  return m;
}

function monthHTML(app, cv) {
  const c = cal(app), ms = monthStart(cv.sel), first = weekStart(ms), next = addMonths(ms, 1), today = dayStart(Date.now());
  const rows = Math.ceil((dayStart(next - 1) - first + DAY) / DAY / 7), end = addDays(first, rows * 7);
  const occ = occurrences(events(app), first, end), byDay = {}, prac = practiceByDay(app, first, end);
  occ.forEach((o) => {
    // многодневные — в каждом своём дне
    const last = o.ev.allDay ? dayStart(o.end) : dayStart(Math.max(o.start, o.end - 1));
    for (let d = Math.max(dayStart(o.start), first); d <= last && d < end; d = addDays(d, 1)) (byDay[dayKey(d)] ||= []).push(o);
  });
  const dayGoal = Math.max(600, (app.store.state.settings.goalMin * 60) / Math.max(1, app.store.state.settings.days.filter(Boolean).length));
  let h = '<div class="calgrid" role="grid" aria-label="' + esc(monthTitle(ms)) + '"><div class="cwd" role="row">' + weekdays().map((d) => '<span role="columnheader">' + d + '</span>').join('') + '</div>';
  for (let r = 0; r < rows; r++) {
    h += '<div class="crow" role="row">';
    for (let i = 0; i < 7; i++) {
      const d = addDays(first, r * 7 + i), k = dayKey(d), list = byDay[k] || [], p = prac[k] || 0, out = d < ms || d >= next;
      const lab = dayFmt(d) + (list.length ? ', ' + tn('cal.nEvents', list.length) : '') + (p ? ', ' + t('cal.practiced', { d: fmtDur(p) }) : '');
      h += '<button role="gridcell" class="cday' + (out ? ' out' : '') + (d === today ? ' today' : '') + (d === cv.sel ? ' sel' : '') + '" data-cday="' + d + '" aria-label="' + esc(lab) + '"' + (d === cv.sel ? ' aria-selected="true"' : '') + '>' +
        '<span class="cdn">' + new Date(d).getDate() + '</span>' +
        '<span class="cdots">' + list.slice(0, 3).map((o) => '<i style="background:' + colorOf(c, o.ev) + '"></i>').join('') + (list.length > 3 ? '<b>+</b>' : '') + '</span>' +
        '<span class="cchips">' + list.slice(0, 3).map((o) => '<i style="--c:' + colorOf(c, o.ev) + '">' + (o.ev.allDay ? '' : '<b>' + hm(o.start) + '</b> ') + esc(titleOf(c, o.ev)) + '</i>').join('') +
        (list.length > 3 ? '<i class="more">' + t('cal.more', { n: list.length - 3 }) + '</i>' : '') + '</span>' +
        (p ? '<i class="cprac" style="--p:' + Math.min(1, p / dayGoal).toFixed(2) + '"></i>' : '') + '</button>';
    }
    h += '</div>';
  }
  h += '</div>';
  return h + dayHTML(app, cv.sel, prac[dayKey(cv.sel)] || practiceByDay(app, cv.sel, cv.sel + DAY)[dayKey(cv.sel)] || 0);
}

// Церковный режим: чтение этого дня по плану — строкой под событиями; касание открывает Библию
function readingRow(app, day) {
  if (!app.store.state.settings.church || !app.bible) return '';
  const r = app.bible.today(day);
  if (!r) return '';
  return '<button class="cpracrow creadrow" data-act="bible" data-key="' + nextOf(app.bible.st(), r) + '"><span class="cbar"></span><span>' +
    esc(t('read.cal', { ref: refText(r.keys) })) + (r.done ? ' · ' + (r.done === r.keys.length ? '✓' : r.done + '/' + r.keys.length) : '') + '</span></button>';
}

// Выбранный день под сеткой месяца
function dayHTML(app, day, prac) {
  const list = onDay(events(app), day);
  return '<div class="cday-h"><b>' + esc(dayLabel(day)) + '</b>' +
    '<button class="cadd" data-cnew="' + day + '" aria-label="' + esc(t('cal.new')) + '">' + IC.plus + '</button></div><div class="clist">' +
    (list.length ? list.map((o) => evRow(app, o)).join('') : '<div class="cempty l2">' + t('cal.noEvents') + '</div>') +
    readingRow(app, day) +
    (prac ? '<button class="cpracrow" data-pp="stats"><span class="cbar"></span><span>' + t('cal.practiced', { d: fmtDur(prac) }) + '</span></button>' : '') + '</div>';
}

function weekHTML(app, cv) {
  const c = cal(app), ws = weekStart(cv.sel), today = dayStart(Date.now()), now = Date.now(), days = [...Array(7)].map((_, i) => addDays(ws, i));
  const occ = days.map((d) => onDay(events(app), d));
  let h = '<div class="cweek"><div class="cwhead"><span></span>' + days.map((d, i) => '<button class="cwd2' + (d === today ? ' today' : '') + (d === cv.sel ? ' sel' : '') + '" data-cday="' + d + '" aria-label="' + esc(dayFmt(d)) + '"><span>' + weekdays()[i] + '</span><b>' + new Date(d).getDate() + '</b></button>').join('') + '</div>';
  const allDay = occ.map((l) => l.filter((o) => o.ev.allDay));
  if (allDay.some((l) => l.length)) {
    h += '<div class="cwall"><span class="l2">' + t('cal.allDayShort') + '</span>' + allDay.map((l) => '<div>' + l.map((o) => '<button class="cwchip" style="--c:' + colorOf(c, o.ev) + '" data-cev="' + o.ev.id + '" data-os="' + o.start + '">' + esc(titleOf(c, o.ev)) + '</button>').join('') + '</div>').join('') + '</div>';
  }
  h += '<div class="cwscroll" id="cwscroll"><div class="cwgrid" style="height:' + 24 * ROW + 'px"><div class="cwhours">' + [...Array(24)].map((_, i) => '<span style="top:' + i * ROW + 'px">' + (i ? pad2(i) + ':00' : '') + '</span>').join('') + '</div>';
  days.forEach((d, i) => {
    h += '<div class="cwcol' + (d === today ? ' today' : '') + '" data-wcol="' + d + '" aria-label="' + esc(dayFmt(d)) + '">';
    layoutDay(occ[i]).forEach(({ o, col, cols }) => {
      const s = Math.max(o.start, d), e = Math.min(Math.max(o.end, o.start + 20 * 60000), d + DAY);
      const top = ((s - d) / HOUR) * ROW, ht = Math.max(20, ((e - s) / HOUR) * ROW - 2), k = kindOf(c, o.ev.kind), done = k && k.task && isDone(o.ev, o.start);
      h += '<button class="cwev' + (done ? ' done' : '') + (cols > 1 ? ' nar' : '') + '" data-cev="' + o.ev.id + '" data-os="' + o.start + '" style="--c:' + colorOf(c, o.ev) + ';top:' + top + 'px;height:' + ht + 'px;left:' + (col / cols) * 100 + '%;width:' + 100 / cols + '%" aria-label="' +
        esc(titleOf(c, o.ev) + ', ' + timeTxt(o)) + '"><b>' + esc(titleOf(c, o.ev)) + '</b>' + (ht > 34 ? '<small>' + hm(o.start) + '</small>' : '') + '</button>';
    });
    if (d === today) h += '<i class="cwnow" style="top:' + ((now - d) / HOUR) * ROW + 'px"></i>';
    h += '</div>';
  });
  return h + '</div></div></div><p class="ftr">' + t('cal.weekHint') + '</p>';
}

function listHTML(app, cv) {
  const now = Date.now(), all = occurrences(events(app), dayStart(now), dayStart(now) + 366 * DAY).filter((o) => (o.ev.allDay ? dayStart(o.start) + DAY : o.end) > now);
  // по 30: еженедельные репетиции за год — это сотня строк
  const list = all.slice(0, cv.listN || 30);
  if (!list.length) {
    return '<div class="aempty cal0"><div class="cal0i">' + TAB_ICON + '</div><div class="aet">' + t('cal.emptyTitle') + '</div><div class="ael">' + t('cal.emptyText') + '</div>' +
      '<div class="group aeg"><button class="cell act" data-cnew="' + dayStart(now) + '">' + t('cal.new') + '</button></div></div>';
  }
  const groups = [];
  list.forEach((o) => { const k = dayKey(o.start), g = groups.at(-1); if (g && g.k === k) g.l.push(o); else groups.push({ k, d: dayStart(o.start), l: [o] }); });
  return groups.map((g) => '<div class="hdr cgh">' + esc(dayLabel(g.d)) + '</div><div class="clist">' + g.l.map((o) => evRow(app, o)).join('') + '</div>').join('') +
    (all.length > list.length ? '<div class="group cmore"><button class="cell act center" data-cmore>' + t('cal.showMore') + '</button></div>' : '');
}


/* ---------- нажатия ---------- */

// Действия календаря (и строк событий на других экранах). true — нажатие обработано
export function calAct(app, b, cv, rerender) {
  const d = b.dataset;
  if (d.cev) { eventSheet(app, d.cev, +d.os, rerender); return true; }
  if (d.cdone) { const ev = events(app).find((e) => e.id === d.cdone); if (ev) { toggleDone(app.store, ev, +d.os); rerender(); } return true; }
  if (d.cnew !== undefined) { eventForm(app, null, { day: d.cnew ? +d.cnew : cv ? cv.sel : dayStart(Date.now()), songId: d.csong || null }, rerender); return true; }
  if (!cv) return false;
  if (d.cday) { cv.sel = +d.cday; rerender(); return true; }
  if (d.cnav !== undefined) {
    const n = +d.cnav;
    cv.sel = !n ? dayStart(Date.now()) : cv.view === 'week' ? addDays(cv.sel, 7 * n) : (() => { const m = addMonths(cv.sel, n), dim = new Date(addMonths(m, 1) - 1).getDate(); return addDays(m, Math.min(new Date(cv.sel).getDate(), dim) - 1); })();
    rerender();
    return true;
  }
  if (d.cics !== undefined) { exportICS(app); return true; }
  if (d.cmore !== undefined) { cv.listN = (cv.listN || 30) + 30; rerender(); return true; }
  const v = b.closest('[data-seg="cview"]') && d.v;
  if (v) { cv.view = v; app.device.calView = v; app.saveDevice(); rerender(); return true; }
  return false;
}

// После перерисовки: недельная сетка — к утру или к текущему часу; пустое место в сетке — новое событие; свайп по месяцу
export function bindCalendar(app, main, cv, rerender) {
  const sc = main.querySelector('#cwscroll');
  if (sc) {
    // своя неделя — к текущему часу (не раньше 7:00), другая — к 7:00; дальше — где пользователь оставил
    const thisWeek = weekStart(Date.now()) === weekStart(cv.sel), h = new Date().getHours();
    sc.scrollTop = cv.wsTop ?? (thisWeek ? Math.min(Math.max(7, h - 1), 16) : 7) * ROW;
    sc.onscroll = () => { cv.wsTop = sc.scrollTop; };
  }
  main.onclick = (e) => {
    const col = !e.target.closest('button') && e.target.closest('[data-wcol]');
    if (!col) return;
    const r = col.getBoundingClientRect(), h = Math.max(0, Math.min(23, Math.floor((e.clientY - r.top) / ROW)));
    eventForm(app, null, { day: +col.dataset.wcol, hour: h }, rerender);
  };
  const g = main.querySelector('.calgrid');
  if (g) {
    let x0 = null;
    g.onpointerdown = (e) => { x0 = e.clientX; };
    g.onpointerup = (e) => {
      if (x0 == null) return;
      const dx = e.clientX - x0;
      x0 = null;
      if (Math.abs(dx) > 60) { cv.sel = addMonths(cv.sel, dx < 0 ? 1 : -1); rerender(); }
    };
  }
}

/* ---------- событие: просмотр ---------- */

function repeatTxt(ev) {
  const r = ev.repeat || 'none';
  if (r === 'none') return '';
  let s = t('cal.rep.' + r);
  if (r === 'weekly' && ev.days && ev.days.length) s += ': ' + ev.days.slice().sort().map((i) => weekdays()[i]).join(', ');
  if (ev.until != null) s += ', ' + t('cal.repUntil', { d: dayFmt(ev.until, false) });
  return s;
}

export function eventSheet(app, id, os, rerender) {
  const c = cal(app);
  let askDel = false;
  const ev = () => events(app).find((e) => e.id === id);
  const body = () => {
    const e = ev();
    if (!e) return snav('');
    const k = kindOf(c, e.kind), o = { ev: e, start: os, end: os + (e.end - e.start) }, songs = (e.songs || []).map((sid) => app.store.songById(sid)).filter(Boolean);
    const task = k && k.task, done = task && isDone(e, os), rep = repeatTxt(e);
    let h = snav(t('cal.event'), { left: '<button class="link l" data-ce="edit">' + t('cal.edit') + '</button>' }) +
      '<div class="cdet" style="--c:' + colorOf(c, e) + '"><span class="cdbar"></span><div><div class="cdt">' + esc(titleOf(c, e)) + '</div>' +
      (k ? '<span class="lchip sm" style="--c:' + k.color + ';--t:' + autoText(k.color) + '">' + esc(k.name) + '</span>' : '') +
      '<div class="cdl">' + I.clock + '<span>' + esc(dayFmt(os)) + '<br>' + esc(timeTxt(o)) + '</span></div>' +
      (rep ? '<div class="cdl">' + I.rep + '<span>' + esc(rep) + '</span></div>' : '') +
      (e.place ? '<div class="cdl">' + I.pin + '<span>' + esc(e.place) + '</span></div>' : '') + '</div></div>';
    if (songs.length) h += '<div class="hdr">' + t('cal.songs') + '</div><div class="group">' + songs.map((s) => '<button class="cell cdsong" data-cgs="' + s.id + '">' + I.note + '<span class="grow">' + esc(s.title) + '</span>' + icons.chev + '</button>').join('') + '</div>';
    if (e.note) h += '<div class="hdr">' + t('cal.note') + '</div><div class="group"><div class="notes">' + esc(e.note) + '</div></div>';
    // сет-лист — команде одним файлом (песни, табы, ноты и само событие)
    if (songs.length) h += '<div class="group" style="margin-top:16px"><button class="cell act center" data-ce="share">' + t('share.setSend') + '</button></div>';
    if (task) h += '<div class="group" style="margin-top:16px"><button class="cell act center" data-ce="done">' + t(done ? 'cal.undoneBtn' : 'cal.doneBtn') + '</button></div>';
    h += askDel
      ? '<div class="hdr">' + t('cal.delRepeat') + '</div><div class="group"><button class="cell danger center" data-ce="del1">' + t('cal.delOne') + '</button><button class="cell danger center" data-ce="delAll">' + t('cal.delAll') + '</button><button class="cell center" data-ce="noDel">' + t('ui.cancel') + '</button></div>'
      : '<div class="group" style="margin-top:16px"><button class="cell danger center" data-ce="del">' + t('cal.delete') + '</button></div>';
    return h;
  };
  sheet(body, (el, sh) => el.addEventListener('click', async (e) => {
    const s = e.target.closest('[data-cgs]');
    if (s) { sh.close(); app.go('library', s.dataset.cgs); return; }
    const b = e.target.closest('[data-ce]');
    if (!b) return;
    const x = ev(), a = b.dataset.ce;
    if (!x) return;
    if (a === 'edit') { sh.close(); eventForm(app, x, {}, rerender); }
    else if (a === 'share') { const { shareSheet } = await import('./share.js'); shareSheet(app, { ev: { ...x, start: os, end: os + (x.end - x.start), repeat: 'none' } }); }
    else if (a === 'done') { toggleDone(app.store, x, os); sh.update(); rerender(); }
    else if (a === 'del') {
      if ((x.repeat || 'none') !== 'none') { askDel = true; sh.update(); return; }
      if (!(await confirm(t('cal.delTitle', { title: titleOf(c, x) }), t('cal.delText'), t('cal.delete')))) return;
      deleteEvent(app.store, x.id); sh.close(); rerender();
    } else if (a === 'noDel') { askDel = false; sh.update(); }
    else if (a === 'del1') { skipOccurrence(app.store, x, os); sh.close(); rerender(); }
    else if (a === 'delAll') { deleteEvent(app.store, x.id); sh.close(); rerender(); }
  }));
}

/* ---------- событие: форма ---------- */

const dVal = (ts) => dayKey(ts);
const fromDT = (ds, ts = '00:00') => {
  const m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(ds || ''), n = /^(\d\d):(\d\d)/.exec(ts || '');
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], n ? +n[1] : 0, n ? +n[2] : 0).getTime();
};

// ev — существующее событие или null (новое на opts.day, в opts.hour, с песней opts.songId)
export function eventForm(app, ex, opts = {}, after = () => {}) {
  const c = cal(app);
  const f = ex ? JSON.parse(JSON.stringify(ex)) : newEvent(opts.day ?? Date.now(), Date.now(), opts.songId ? { songs: [opts.songId], kind: 'goal' } : {});
  if (!ex && opts.hour != null) { f.start = dayStart(f.start) + opts.hour * HOUR; f.end = f.start + HOUR; }
  f.songs ||= [];
  const kchip = (k) => '<button type="button" class="lchip pick ck' + (f.kind === k.id ? ' on' : '') + '" data-ck="' + k.id + '" aria-pressed="' + (f.kind === k.id) + '" style="--c:' + k.color + ';--t:' + autoText(k.color) + '">' + esc(k.name) + '</button>';
  const body = () => {
    const songs = app.store.songs(), k = kindOf(c, f.kind), r = f.repeat || 'none';
    const dt = (n, ts) => '<input type="date" class="cin" name="' + n + 'd" value="' + dVal(ts) + '" aria-label="' + t('cal.' + n + 'Date') + '">' + (f.allDay ? '' : '<input type="time" class="cin" name="' + n + 't" value="' + hm(ts) + '" aria-label="' + t('cal.' + n + 'Time') + '">');
    return '<form id="evf">' + snav(t(ex ? 'cal.event' : 'cal.new'), { left: '<button type="button" class="link l" data-close>' + t('ui.cancel') + '</button>', right: '<button class="link b r">' + t('ui.done') + '</button>' }) +
      '<div class="group"><label class="cell"><input class="inp left" name="title" maxlength="80" placeholder="' + esc(k ? k.name : t('cal.titlePh')) + '" aria-label="' + t('cal.titlePh') + '" value="' + esc(f.title) + '"></label></div>' +
      '<div class="hdr">' + t('cal.kind') + '</div><div class="group"><div class="cellcol"><div class="pickrow">' + c.kinds.map(kchip).join('') +
      '<button type="button" class="lchip off add ck" data-ckinds aria-label="' + t('cal.kinds') + '">' + IC.pen + '</button></div></div></div>' +
      '<div class="group"><div class="cell">' + '<span class="grow">' + t('cal.allDay') + '</span>' + sw('callday', f.allDay, t('cal.allDay')) + '</div>' +
      '<div class="cell cdtrow"><span class="grow">' + t('cal.start') + '</span>' + dt('start', f.start) + '</div>' +
      '<div class="cell cdtrow"><span class="grow">' + t('cal.end') + '</span>' + dt('end', f.end || f.start) + '</div></div>' +
      '<div class="hdr">' + t('cal.repeat') + '</div><div class="group"><div class="cellcol">' + seg('crep', REPEATS.map((x) => [x, t('cal.repShort.' + x)]), r, t('cal.repeat')) +
      (r === 'weekly' ? '<div class="cwdpick" role="group" aria-label="' + t('cal.repDays') + '">' + weekdays().map((w, i) => {
        const on = (f.days || [weekday(f.start)]).includes(i);
        return '<button type="button" class="lchip pick ck' + (on ? ' on' : '') + '" data-cwd="' + i + '" aria-pressed="' + on + '" style="--c:var(--tint);--t:var(--on-tint)">' + w + '</button>';
      }).join('') + '</div>' : '') + '</div>' +
      (r !== 'none' ? '<div class="cell cdtrow"><span class="grow">' + t('cal.repEnd') + '</span><input type="date" class="cin" name="until" value="' + (f.until != null ? dVal(f.until) : '') + '" aria-label="' + t('cal.repEnd') + '">' +
        (f.until != null ? '<button type="button" class="link" data-cuntil>' + t('cal.never') + '</button>' : '<span class="l2 cnever">' + t('cal.never') + '</span>') + '</div>' : '') + '</div>' +
      (songs.length ? '<div class="hdr">' + t('cal.songs') + '</div><div class="group"><div class="cellcol"><div class="pickrow">' + songs.map((s) => {
        const on = f.songs.includes(s.id);
        return '<button type="button" class="lchip pick ck' + (on ? ' on' : '') + '" data-csg="' + s.id + '" aria-pressed="' + on + '" style="--c:var(--tint);--t:var(--on-tint)">' + esc(s.title) + '</button>';
      }).join('') + '</div></div></div>' : '') +
      '<div class="group" style="margin-top:16px"><label class="cell"><input class="inp left" name="place" maxlength="80" placeholder="' + t('cal.place') + '" aria-label="' + t('cal.place') + '" value="' + esc(f.place || '') + '"></label></div>' +
      '<div class="hdr">' + t('cal.note') + '</div><div class="group"><textarea class="ta" name="note" aria-label="' + t('cal.note') + '">' + esc(f.note || '') + '</textarea></div>' +
      '<div class="hdr">' + t('cal.color') + '</div><div class="group"><div class="cellcol"><div class="swgrid"><button type="button" class="swc cauto' + (!f.color ? ' on' : '') + '" data-ccol="" style="background:' + (k ? k.color : '#8E8E93') +
      '" aria-pressed="' + !f.color + '" aria-label="' + t('cal.colorKind') + '"><b>A</b></button>' + PALETTE.slice(0, 12).map((x) => '<button type="button" class="swc' + (f.color === x ? ' on' : '') + '" data-ccol="' + x + '" style="background:' + x + '" aria-pressed="' + (f.color === x) + '" aria-label="' + esc(t('libm.colorAria', { c: x })) + '"></button>').join('') +
      '</div></div></div>' + (ex ? '<div class="group" style="margin-top:20px"><button type="button" class="cell danger center" data-cdel>' + t('cal.delete') + '</button></div>' : '') + '</form>';
  };
  sheet(body, (el, sh) => {
    const form = () => el.querySelector('#evf');
    // Текст — в черновик перед перерисовкой (переключатели перерисовывают шторку)
    const sync = () => { const E = form().elements; f.title = E.title.value; f.place = E.place.value; f.note = E.note.value; };
    const re = () => { sync(); sh.update(); };
    el.addEventListener('click', async (e) => {
      const g = (s) => e.target.closest(s);
      let b;
      if ((b = g('[data-ck]'))) { f.kind = b.dataset.ck; re(); }
      else if (g('[data-ckinds]')) { sync(); kindsSheet(app, () => sh.update()); }
      else if ((b = g('[data-seg="crep"] [data-v]'))) { f.repeat = b.dataset.v; if (f.repeat === 'weekly' && !(f.days && f.days.length)) f.days = [weekday(f.start)]; re(); }
      else if ((b = g('[data-cwd]'))) {
        const i = +b.dataset.cwd, s = new Set(f.days || [weekday(f.start)]);
        s.has(i) ? s.size > 1 && s.delete(i) : s.add(i);
        f.days = [...s].sort();
        re();
      } else if ((b = g('[data-csg]'))) { const id = b.dataset.csg; f.songs = f.songs.includes(id) ? f.songs.filter((x) => x !== id) : [...f.songs, id]; re(); }
      else if ((b = g('[data-ccol]'))) { f.color = b.dataset.ccol || null; re(); }
      else if (g('[data-cuntil]')) { f.until = null; re(); }
      else if (g('[data-cdel]')) {
        if (!(await confirm(t('cal.delTitle', { title: titleOf(c, f) }), t('cal.delText'), t('cal.delete')))) return;
        deleteEvent(app.store, f.id); sh.close(); after();
      }
    });
    el.addEventListener('change', (e) => {
      const n = e.target.name, E = form().elements;
      if (e.target.dataset.sw === 'callday') {
        f.allDay = e.target.checked;
        if (f.allDay) { f.start = dayStart(f.start); f.end = dayStart(f.end || f.start); }
        else { f.start = dayStart(f.start) + 18 * HOUR; f.end = Math.max(dayStart(f.end) + 19 * HOUR, f.start + HOUR); }
        re();
        return;
      }
      if (n === 'startd' || n === 'startt') {
        // начало сдвигает и конец — длительность сохраняется
        const s = fromDT(E.startd.value, f.allDay ? '00:00' : E.startt.value);
        if (s == null) return;
        f.end = (f.end || f.start) + (s - f.start);
        f.start = s;
        re();
      } else if (n === 'endd' || n === 'endt') {
        const x = fromDT(E.endd.value, f.allDay ? '00:00' : E.endt.value);
        if (x == null) return;
        f.end = x < f.start ? (f.allDay ? f.start : f.start + HOUR) : x;
        if (x < f.start) toast(t('cal.endBefore'));
        re();
      } else if (n === 'until') { f.until = fromDT(E.until.value); re(); }
    });
    // На шторке, а не на форме: форма перерисовывается вместе с шторкой
    el.addEventListener('submit', (e) => {
      e.preventDefault();
      sync();
      f.title = f.title.trim();
      f.place = (f.place || '').trim();
      f.note = (f.note || '').trim();
      if (f.repeat !== 'weekly') f.days = null;
      if (f.repeat === 'none') f.until = null;
      saveEvent(app.store, f);
      sh.close();
      toast(t(ex ? 'cal.saved' : 'cal.added', { d: relDate(f.start) }));
      after(f);
    });
    if (!ex) setTimeout(() => { const i = form().elements.title; if (i && matchMedia('(pointer:fine)').matches) i.focus(); }, 80);
  });
}

/* ---------- типы событий ---------- */

function kindsSheet(app, back) {
  const c = cal(app);
  const body = () => snav(t('cal.kinds'), { left: '<button class="ic sm plain" data-kb aria-label="' + esc(t('ui.back')) + '">' + icons.back + '</button>', right: '<span></span>' }) + '<div class="group">' +
    c.kinds.map((k) => '<button class="cell" data-ked="' + k.id + '"><span class="lchip" style="--c:' + k.color + ';--t:' + autoText(k.color) + '">' + esc(k.name) + '</span><span class="grow"></span>' +
      (k.task ? '<span class="l2" style="font-size:13px">' + t('cal.taskShort') + '</span>' : '') + icons.chev + '</button>').join('') +
    '<button class="cell act" data-ked="">' + t('cal.kindAdd') + '</button></div><p class="ftr">' + t('cal.kindsHint') + '</p>';
  sheet(body, (el, sh) => el.addEventListener('click', (e) => {
    if (e.target.closest('[data-kb]')) { sh.close(); return; }
    const b = e.target.closest('[data-ked]');
    if (b) kindEditor(app, b.dataset.ked || null, () => sh.update());
  }), { onClose: back });
}

function kindEditor(app, id, back) {
  const c = cal(app), ex = id ? kindOf(c, id) : null, k = ex ? { ...ex } : { id: 'k' + uid(), name: '', color: PALETTE[(c.kinds.length * 5) % 12] };
  const used = id ? (app.store.state.events || []).filter((e) => !e.deleted && e.kind === id).length : 0;
  const body = () => snav(t(ex ? 'cal.kind' : 'cal.kindAdd'), { left: '<button class="ic sm plain" data-kk="back" aria-label="' + esc(t('ui.back')) + '">' + icons.back + '</button>', right: '<button class="link b r" data-kk="save">' + t('libm.save') + '</button>' }) +
    '<div class="group"><label class="cell"><input class="inp left" id="kname" maxlength="32" placeholder="' + t('libm.name') + '" aria-label="' + t('libm.name') + '" value="' + esc(k.name) + '"></label></div>' +
    '<div class="hdr">' + t('libm.color') + '</div><div class="group"><div class="cellcol"><div class="swgrid">' + PALETTE.slice(0, 12).map((x) => '<button type="button" class="swc' + (k.color === x ? ' on' : '') + '" data-kc="' + x + '" style="background:' + x + '" aria-pressed="' + (k.color === x) + '" aria-label="' + esc(t('libm.colorAria', { c: x })) + '"></button>').join('') +
    '<label class="swc custom" aria-label="' + t('libm.customColor') + '"><input type="color" data-kc-in value="' + k.color + '"></label></div></div></div>' +
    '<div class="group"><div class="cell"><span class="grow">' + t('cal.task') + '</span>' + sw('ktask', !!k.task, t('cal.task')) + '</div></div><p class="ftr">' + t('cal.taskHint') + '</p>' +
    (ex && c.kinds.length > 1 ? '<div class="group" style="margin-top:20px"><button class="cell danger center" data-kk="del">' + t('cal.kindDel') + '</button></div>' + (used ? '<p class="ftr">' + tn('cal.kindUsed', used) + '</p>' : '') : '');
  sheet(body, (el, sh) => {
    const nm = () => el.querySelector('#kname').value;
    el.addEventListener('click', (e) => {
      const col = e.target.closest('[data-kc]'), b = e.target.closest('[data-kk]');
      if (col) { k.name = nm(); k.color = col.dataset.kc; sh.update(); return; }
      if (!b) return;
      if (b.dataset.kk === 'back') { sh.close(); back(); return; }
      if (b.dataset.kk === 'del') { c.kinds = c.kinds.filter((x) => x.id !== k.id); app.store.settingsChanged(); sh.close(); back(); return; }
      k.name = nm().trim();
      if (!k.name) { toast(t('libm.needName')); return; }
      if (!k.task) delete k.task;
      const i = c.kinds.findIndex((x) => x.id === k.id);
      if (i >= 0) c.kinds[i] = k; else c.kinds.push(k);
      app.store.settingsChanged();
      sh.close();
      back();
    });
    el.addEventListener('change', (e) => {
      if (e.target.dataset.sw === 'ktask') k.task = e.target.checked;
      if (e.target.hasAttribute('data-kc-in')) { k.name = nm(); k.color = e.target.value; sh.update(); }
    });
  });
}

/* ---------- экспорт ---------- */

function exportICS(app) {
  const list = events(app);
  if (!list.length) { toast(t('cal.exportEmpty')); return; }
  const ics = toICS(list, { cal: cal(app), songs: app.store.songs(), name: t('cal.icsName') });
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'practice-calendar-' + dayKey(Date.now()) + '.ics';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(t('cal.exported', { n: tn('cal.nEvents', list.length) }));
}

/* ---------- на других экранах ---------- */

// Главная: ближайшие события на неделю (до двух)
export function nextEventsHTML(app) {
  const list = upcoming(events(app), Date.now(), 7).filter((o, i, a) => a.findIndex((x) => x.ev.id === o.ev.id) === i).slice(0, 2);
  if (!list.length) return '';
  return '<div class="hhdr"><span>' + t('cal.soon') + '</span><button class="link" data-tab="calendar">' + t('cal.title') + '</button></div><div class="clist hnext">' + list.map((o) => evRow(app, o, { date: true })).join('') + '</div>';
}

// Песня: её события (ближайшие полгода) и «+ событие» с этой песней
export function songEventsHTML(app, songId) {
  const now = Date.now(), list = occurrences(events(app), dayStart(now), dayStart(now) + 180 * DAY).filter((o) => (o.ev.songs || []).includes(songId) && (o.ev.allDay ? dayStart(o.start) + DAY : o.end) > now)
    .filter((o, i, a) => a.findIndex((x) => x.ev.id === o.ev.id) === i).slice(0, 5); // повторяющееся — один раз, ближайшее
  return '<div class="hhdr" style="margin-top:22px"><span>' + t('cal.songCal') + '</span><button class="link" data-cnew="" data-csong="' + songId + '">' + t('cal.add') + '</button></div>' +
    (list.length ? '<div class="clist">' + list.map((o) => evRow(app, o, { date: true })).join('') + '</div>' : '<p class="ftr" style="margin-top:0">' + t('cal.songNone') + '</p>');
}
