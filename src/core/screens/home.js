// «Сегодня»: цель недели, дни, кнопка практики, быстрый доступ к инструментам, недавние песни; ударный режим.
// Перенесено из legacy/practice.html (homeHTML, quickList, quickEdit, streakPill, streakSheet).
import { t, tn, getLang, hasMascot } from '../../i18n/index.js';
import { esc, sheet, snav, toast } from '../../ui/index.js';
import { goalRing, FLAME } from '../../ui/cards.js';
import { fmtDur } from '../format.js';
import { weekData, goalProgress, songStats, streakInfo } from '../stats.js';
import { GEMS, gemOf } from '../mastery.js';
import { gemSec } from '../profile.js';
import { gemCanvas, mountGems } from '../../ui/gem3d.js';
import { trackMode } from '../session.js';
import { genreOf, ensureLib } from '../library.js';
import { isOn } from '../settings.js';
import { weekday, dayKey } from '../time.js';
import { modules, moduleById } from '../../modules/index.js';
import { moduleName } from '../modules.js';
import { topbar, weekdays, relDay, PLAY, IC } from './common.js';
import { logoHTML } from '../../ui/logo.js';
import { stoneView, wear, stoneKm, stoneSeed, roundness } from '../../ui/stone.js';
import { nextEventsHTML } from './calendar.js';
import { refText } from '../bible.js';
import { nextOf } from '../reading.js';
import { quoteAt, dayIndex, setsOf } from '../quotes.js';
import { pleaLine } from '../remindtexts.js';
import { remindOf } from '../reminders.js';
import { moodOf } from '../mascot.js';
import { mascotSVG } from '../../ui/mascot.js';
import { holdMenu, sortable } from '../../ui/hold.js';
import { toolsTab, setToolsTab } from './tools.js';
import { showHelp } from '../help.js';

// Тренажёр слуха временно убран (вернётся на этапе 2) — вместо него пэды
export const QUICK_DEF = ['metro', 'tuner', 'piano', 'drone'];
const QUICK_MAX = 8;

const quickList = (st) => (st.quick || QUICK_DEF).filter((id) => isOn(st, id) && moduleById(id) && !moduleById(id).tab);

export function streakPill(app, extra = '') {
  const st = app.store.state.settings;
  if (!isOn(st, 'streak')) return '';
  const s = streakInfo(app.store.sessions(), st);
  if (!s.weeks && !extra) return '';
  return '<button class="spill' + (s.atRisk ? ' risk' : '') + '" data-act="streak"' + (extra ? ' style="margin-top:6px"' : '') + ' aria-label="' + esc(t('streak.aria', { n: tn('streak.weeks', s.weeks) })) + '">' +
    FLAME + '<b class="num">' + s.weeks + '</b><span>' + esc(tn('streak.weeksWord', s.weeks) + extra) + '</span></button>';
}

/* ---------- блоки главной: порядок, размер, что показывать (settings.home) ---------- */
// Долгое нажатие на блок — меню у блока (меньше, больше, выше, ниже, убрать); всё вместе — «Профиль → Главный экран»
export const HOME_BLOCKS = ['voice', 'week', 'league', 'reading', 'start', 'quick', 'events', 'songs'];
export const HOME_SIZES = ['s', 'm', 'l'];
export function homeLayout(st) {
  const h = st.home || {}, order = (h.order || []).filter((k) => HOME_BLOCKS.includes(k));
  // новые блоки — на своё место по умолчанию
  HOME_BLOCKS.forEach((k, i) => { if (!order.includes(k)) order.splice(Math.min(i, order.length), 0, k); });
  // по умолчанию маскот на главной молчит: он — в уведомлениях (решение автора); включить — «Главный экран»
  return { order, off: new Set((h.off || ['voice']).filter((k) => HOME_BLOCKS.includes(k))), size: h.size || {} };
}
export function setHomeLayout(st, L) {
  st.home = { order: L.order.slice(), off: [...L.off], size: Object.fromEntries(Object.entries(L.size).filter(([k, v]) => HOME_BLOCKS.includes(k) && v !== 'm')) };
}
const blocks = (st, parts) => {
  const L = homeLayout(st);
  return L.order.filter((k) => !L.off.has(k) && parts[k]).map((k) => '<section class="hblk hb-' + (HOME_SIZES.includes(L.size[k]) ? L.size[k] : 'm') + '" data-hb="' + k + '">' + parts[k] + '</section>').join('');
};

/* ---------- «Минимал» (эксперимент): та же главная, но только текст, линии и оттенки серого ---------- */

const ARROW = '<svg viewBox="0 0 12 12" class="mtri" aria-hidden="true"><path d="M3.5 2l5 4-5 4z"/></svg>';
const greet = (h) => t(h < 5 ? 'mono.night' : h < 12 ? 'mono.morning' : h < 18 ? 'mono.day' : h < 23 ? 'mono.evening' : 'mono.night');
// Церковный режим: чтение дня по плану — главы, сколько прочитано, «Читать» открывает Библию на первой непрочитанной
function readingCard(app, mono = false) {
  const st = app.store.state.settings;
  if (!st.church || !app.bible) return '';
  const r = app.bible.today();
  // план не выбран (или закончился) — приглашение выбрать готовый или свой
  if (!r) return '<button class="' + (mono ? 'mread' : 'hread') + '" data-pp="feat"><span class="hrt">' + t('read.title') + '</span><span class="hrr">' + t('read.noPlan') + '</span><span class="hrs">' + t('read.pick') + '</span></button>';
  const all = r.done === r.keys.length, next = nextOf(app.bible.st(), r);
  return '<button class="' + (mono ? 'mread' : 'hread') + '" data-act="bible" data-key="' + next + '"><span class="hrt">' + t('read.today') + ' · ' + t('read.day', { d: r.day, n: r.days }) + '</span>' +
    '<span class="hrr">' + esc(refText(r.keys)) + '</span><span class="hrs">' + (all ? t('read.done') : t('read.progress', { done: r.done, n: r.keys.length })) + '</span>' +
    '<span class="hrbar"><i style="width:' + Math.round((r.done / r.keys.length) * 100) + '%"></i></span></button>';
}
// Мелета (маскот) и слово дня из выбранных наборов (история музыканта, слова мастеров, стих, цитатник) — одно на день.
// Лицо — по состоянию занятий (src/core/mascot.js); касание — реакция (src/ui/mascot.js), слово не меняется
function moodNow(app) {
  const st = app.store.state.settings, po = app.pomodoro;
  return moodOf({ active: !!app.active, pomoBreak: !!(po && po.active() && po.phase !== 'work'), weekSec: weekData(app.store.sessions()).total,
    goalSec: st.toolsOnly ? 0 : st.goalMin * 60, days: st.days, sessions: app.store.sessions(), mode: remindOf(st).mode });
}
// Навязчивая Мелета: в день практики, пока не занимались, — строка-просьба, к вечеру сильнее
function pleaHTML(app, cls) {
  const st = app.store.state.settings, now = new Date(), h = now.getHours();
  if (remindOf(st).mode !== 'pushy' || app.active || !st.days[weekday(now.getTime())] || h < 8 || h >= 23) return '';
  if (app.store.sessions().some((x) => dayKey(x.start) === dayKey(now.getTime()))) return '';
  return '<b class="' + cls + '">' + esc(pleaLine(h, getLang())) + '</b>';
}
// На главной говорит только маскот — одной репликой: приветствие по времени суток и имени и слово дня.
// Без маскота — та же реплика, без лица
function quoteHTML(app, mono) {
  const st = app.store.state.settings, now = new Date(), name = st.profile && st.profile.name;
  const hello = greet(now.getHours()) + (name ? ', ' + name : '');
  const q = isOn(st, 'quote') ? quoteAt(dayIndex(), getLang(), setsOf(st), st.quoteBooks || []) : {};
  return '<div class="' + (mono ? 'mvo' : 'hvoice') + (hasMascot() ? '' : ' nomascot') + '" aria-live="polite">' + (hasMascot() ? '<button class="mascotb" data-mascot aria-label="' + esc(t('mascot.aria')) + '">' + mascotSVG(moodNow(app), { size: mono ? 52 : 56, ring: !mono }) + '</button>' : '') +
    '<p class="' + (mono ? 'mquote' : 'hquote') + '">' + pleaHTML(app, 'mplea') + esc(hello) + (q.text ? '. ' + esc(q.text) : '!') + (q.ref ? '<span class="qref">' + esc(q.ref) + '</span>' : '') + '</p></div>';
}
const mhead = (title, actions = '') => '<div class="mhd"><h2>' + title + '</h2><span class="mact">' + actions + '</span></div>';

function homeMonoHTML(app) {
  const st = app.store.state.settings, plain = !!st.toolsOnly, P = {};
  P.voice = '<div class="mvoice">' + quoteHTML(app, true) + '</div>';
  if (!plain) {
    const w = weekData(app.store.sessions()), goal = st.goalMin * 60, p = goalProgress(w.total, st), today = weekday(Date.now()), WD = weekdays();
    P.week = mhead(t('home.week'), '<button class="mbtn" data-pp="' + (st.configured ? 'stats' : 'week') + '" aria-label="' + esc(t('home.stats')) + '">' + ARROW + '</button>') +
      '<button class="mweek" data-pp="' + (st.configured ? 'stats' : 'week') + '"><span class="mbig num' + (trackMode(st) === 'strict' ? ' goldshine' : '') + '">' + fmtDur(w.total) + '</span>' +
      '<span class="mof num">/ ' + fmtDur(goal) + '</span></button><div class="mline"><i style="width:' + Math.min(100, p * 100) + '%"></i></div>' +
      '<div class="mdays">' + WD.map((d, i) => '<span class="' + (w.per[i] > 0 ? 'done' : st.days[i] ? 'plan' : 'rest') + (i === today ? ' today' : '') + '">' + d + '</span>').join('') + '</div>';
    if (isOn(st, 'mastery')) {
      // «Минимал»: лиг нет — только камень с дороги, который с часами занятий круглеет (src/ui/stone.js)
      const all = app.store.sessions(), sec = leagueHours(app) * 3600, wr = wear(sec / 3600);
      P.league = '<div class="mstone"><canvas data-stone="home" role="button" tabindex="0" aria-label="' + esc(t('stone.title') + ', ' + fmtDur(sec)) + '"></canvas>' +
        '<div class="mstxt"><span class="mslbl">' + t('stone.title') + '</span><span class="msval num">' + fmtDur(sec) + '</span><span class="mslbl">' + esc(t('stone.round', { p: Math.round(roundness(wr) * 100) })) + '</span>' +
        '<span class="mslbl num">' + esc(kmText(sec / 3600)) + '</span></div></div>' +
        (isOn(st, 'streak') && streakInfo(all, st).weeks ? '<div class="mtags"><button data-act="streak">' + esc(tn('streak.weeks', streakInfo(all, st).weeks)) + '</button></div>' : '');
    }
  }
  P.reading = readingCard(app, true);
  P.start = '<button class="mcta" data-act="free"><i class="bareic" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z"/></svg></i><span>' + t(plain ? (app.active ? 'home.wsResume' : 'home.ws') : app.active ? 'home.resume' : 'home.start') + '</span></button>';
  const q = quickList(st);
  P.quick = mhead(t('home.quick'), '<button class="mbtn" data-act="quickedit" aria-label="' + esc(t('home.edit')) + '">' + IC.plus + '</button>') +
    '<div class="mtools">' + q.map((id) => { const m = moduleById(id); return '<button data-open-tool="' + id + '"><span class="mcirc">' + m.icon + '</span><span class="mlbl">' + esc(moduleName(m)) + '</span></button>'; }).join('') + '</div>';
  P.events = nextEventsHTML(app);
  const songs = app.store.songs();
  const rec = songs.map((s) => ({ s, st: songStats(app.store.sessions(), s.id) })).sort((a, b) => (b.st.last || b.s.createdAt) - (a.st.last || a.s.createdAt)).slice(0, 6);
  P.songs = mhead(t('home.continue'), '<button class="mbtn" data-act="addSong" aria-label="' + esc(t('home.firstSong')) + '">' + IC.plus + '</button><button class="mbtn" data-tab="library" aria-label="' + esc(t('home.allSongs')) + '">' + ARROW + '</button>') +
    (rec.length ? '<div class="mlist">' + rec.map(({ s, st: ss }) => '<div class="mrow"><button data-song="' + s.id + '"><span class="mt">' + esc(s.title) + '</span>' +
    (!plain && ss.total ? '<span class="mm num">' + fmtDur(ss.total) + '</span>' : s.artist ? '<span class="mm">' + esc(s.artist) + '</span>' : '') + '</button>' +
    '<button class="mplay" data-play="' + s.id + '" aria-label="' + esc(t('home.playSong', { title: s.title })) + '">' + ARROW + '</button></div>').join('') + '</div>'
    : '<p class="mempty">' + t('mono.noSongs') + '</p>');
  return '<div class="mono-home">' + topbar(logoHTML()) + blocks(st, P) + '</div>';
}

export function homeHTML(app) {
  if (app.store.state.settings.uiStyle === 'mono') return homeMonoHTML(app);
  const st = app.store.state.settings, w = weekData(app.store.sessions()), goal = st.goalMin * 60, p = goalProgress(w.total, st);
  const today = weekday(Date.now()), plan = st.days, WD = weekdays(), P = {};
  // «Только инструменты»: без недели, цели и лиги — сразу рабочее место и инструменты
  const plain = !!st.toolsOnly;
  P.voice = quoteHTML(app, false);
  if (!plain) P.week = '<div class="hcard"><div class="hrow">' + goalRing(p, true, t('home.ringAria', { p: Math.round(p * 100) })) + '<div class="htxt"><div class="l2" style="font-size:14px">' + t('home.week') +
    '</div><div class="big num' + (trackMode(st) === 'strict' ? ' goldshine' : '') + '">' + fmtDur(w.total) + '</div><div class="l2" style="font-size:14px">' + t('home.of', { goal: fmtDur(goal) }) + (p > 1 ? t('home.over') : p >= 1 ? t('home.met') : '') + '</div>' +
    streakPill(app) + '</div></div>' +
    '<div class="days hdays">' + WD.map((d, i) => '<div class="day ' + (w.per[i] > 0 ? 'done' : plan[i] ? 'plan' : 'rest') + (i === today ? ' today' : '') + '" title="' +
      esc(w.per[i] ? fmtDur(w.per[i]) : plan[i] ? t('home.dayPlan') : t('home.dayRest')) + '"><span class="d"></span>' + d + '</div>').join('') + '</div>' +
    '<button class="hlink" data-pp="' + (st.configured ? 'stats' : 'week') + '">' +
    (st.configured ? (plan[today] ? t('home.todayPlan') : t('home.todayRest')) + ' · ' + t('home.stats') : t('home.setup')) + ' ›</button></div>';
  P.league = gemRow(app);
  P.reading = readingCard(app);
  P.start = '<button class="hcta" data-act="free"><i class="bareic" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z"/></svg></i><span>' + t(plain ? (app.active ? 'home.wsResume' : 'home.ws') : app.active ? 'home.resume' : 'home.start') + '</span></button>';
  const q = quickList(st);
  P.quick = '<div class="hhdr"><span>' + t('home.quick') + '</span><button class="link" data-act="quickedit">' + t('home.edit') + '</button></div>' +
    '<div class="qgrid">' + (q.length
    ? q.map((id) => { const m = moduleById(id); return '<button class="qbtn" data-open-tool="' + id + '" style="--c:' + m.color + ';--on:' + (m.on || '#fff') + '"><span class="qic">' + m.icon + '</span><span class="qn">' + esc(moduleName(m)) + '</span></button>'; }).join('')
    : '<button class="qbtn add" data-act="quickedit"><span class="qic">' + IC.plus + '</span><span class="qn">' + t('home.add') + '</span></button>') + '</div>';
  P.events = nextEventsHTML(app);
  const songs = app.store.songs(), L = ensureLib(app.store.state, t);
  const rec = songs.map((s) => ({ s, st: songStats(app.store.sessions(), s.id) })).sort((a, b) => (b.st.last || b.s.createdAt) - (a.st.last || a.s.createdAt)).slice(0, 4);
  P.songs = '<div class="hhdr"><span>' + t('home.continue') + '</span>' + (songs.length > 4 ? '<button class="link" data-tab="library">' + t('home.allSongs') + '</button>' : '') + '</div>' +
    (!rec.length ? '<div class="group"><button class="cell act" data-act="addSong">' + t('home.firstSong') + '</button></div>'
    : '<div class="slist">' + rec.map(({ s, st: ss }) => {
      const g = genreOf(L, s.genre);
      const sub = s.currentBpm && s.targetBpm ? s.currentBpm + ' → ' + s.targetBpm + ' bpm' : plain ? s.artist || '' : ss.last ? relDay(ss.last) + ', ' + fmtDur(ss.total) : t('home.notPlayed');
      return '<div class="stile3 hsong" style="--g:' + (g ? g.color : 'var(--l3)') + '"><button class="grow" data-song="' + s.id + '" style="text-align:left;min-width:0"><div class="ttl">' + esc(s.title) +
        '</div><div class="st">' + esc(sub) + '</div></button><button class="playmini2" aria-label="' + esc(t('home.playSong', { title: s.title })) + '" data-play="' + s.id + '">' + PLAY + '</button></div>';
    }).join('') + '</div>');
  return topbar(logoHTML()) + '<div class="hlist">' + blocks(st, P) + '</div>';
}

// Долгое нажатие на инструмент (главная — быстрый доступ, вкладка «Инструменты»): меню у кнопки —
// открыть, сдвинуть левее/правее, убрать с главной или добавить, вся панель, инструкция
const HI = {
  open: '<svg viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z"/></svg>',
  left: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  right: '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>',
  minus: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M8 12h8"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M8 12h8M12 8v8"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M4 7h10M4 12h16M4 17h7"/><circle cx="17" cy="7" r="2"/><circle cx="14" cy="17" r="2"/></svg>',
  help: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.5a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.5M12 16.8v.2"/></svg>',
};
export function toolHoldMenu(app, btn, rerender, open) {
  const st = app.store.state.settings, id = btn.dataset.openTool, m = moduleById(id);
  if (!m) return;
  const onHome = !!btn.closest('.qgrid, .mtools'), vis = quickList(st), i = vis.indexOf(id), inQuick = i >= 0;
  const save = (q) => { st.quick = q; app.store.settingsChanged(); rerender(); };
  // сдвиг среди видимых: меняемся местами с соседом в полном списке (выключенные инструменты остаются на своих местах)
  const shift = (d) => { const full = (st.quick || QUICK_DEF).slice(), a = full.indexOf(id), b = full.indexOf(vis[i + d]); [full[a], full[b]] = [full[b], full[a]]; save(full); };
  const items = [{ icon: HI.open, label: t('hold.open'), run: () => open(id) }];
  if (onHome && i > 0) items.push({ icon: HI.left, label: t('hold.left'), run: () => shift(-1) });
  if (onHome && i < vis.length - 1) items.push({ icon: HI.right, label: t('hold.right'), run: () => shift(1) });
  if (inQuick) items.push({ icon: HI.minus, label: t('hold.unquick'), danger: onHome, run: () => save((st.quick || QUICK_DEF).filter((x) => x !== id)) });
  else items.push({ icon: HI.plus, label: t('hold.quick'), run: () => { if (vis.length >= QUICK_MAX) { toast(t('quick.max', { max: QUICK_MAX })); return; } save((st.quick || QUICK_DEF).concat(id)); toast(t('hold.added')); } });
  if (onHome) items.push({ icon: HI.edit, label: t('hold.edit'), run: () => quickEdit(app, rerender) });
  // вкладка «Инструменты»: левее, правее, убрать из вкладки
  if (!onHome) {
    const T = toolsTab(st), j = T.shown.indexOf(id);
    const tmove = (d) => { const a = T.order.indexOf(id), b = T.order.indexOf(T.shown[j + d]); [T.order[a], T.order[b]] = [T.order[b], T.order[a]]; setToolsTab(st, T); app.store.settingsChanged(); rerender(); };
    if (j > 0) items.splice(1, 0, { icon: HI.left, label: t('hold.left'), run: () => tmove(-1) });
    if (j >= 0 && j < T.shown.length - 1) items.splice(j > 0 ? 2 : 1, 0, { icon: HI.right, label: t('hold.right'), run: () => tmove(1) });
    items.push({ icon: HI.minus, label: t('tools.hide'), danger: true, run: () => { T.off.add(id); setToolsTab(st, T); app.store.settingsChanged(); rerender(); toast(t('tools.hiddenToast')); } });
  }
  items.push({ icon: HI.help, label: t('hold.help'), run: () => showHelp(app, m) });
  holdMenu(btn, items, moduleName(m));
}

// Долгое нажатие на блок главной: меньше, больше, выше, ниже, убрать, настроить всё
const HB = {
  smaller: '<svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg>',
  bigger: '<svg viewBox="0 0 24 24"><path d="M5 12h14M12 5v14"/></svg>',
  up: '<svg viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>',
  hide: '<svg viewBox="0 0 24 24"><path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z"/><path d="M4 20 20 4"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M4 7h10M4 12h16M4 17h7"/><circle cx="17" cy="7" r="2"/><circle cx="14" cy="17" r="2"/></svg>',
};
export function homeBlockMenu(app, el, rerender, openPage) {
  const st = app.store.state.settings, id = el.dataset.hb, L = homeLayout(st);
  const vis = L.order.filter((k) => !L.off.has(k) && document.querySelector('[data-hb="' + k + '"]')), i = vis.indexOf(id), sz = HOME_SIZES.includes(L.size[id]) ? L.size[id] : 'm';
  const save = () => { setHomeLayout(st, L); app.store.settingsChanged(); rerender(); };
  const move = (d) => { const j = L.order.indexOf(vis[i + d]), k = L.order.indexOf(id); [L.order[j], L.order[k]] = [L.order[k], L.order[j]]; save(); };
  const items = [];
  if (sz !== 's') items.push({ icon: HB.smaller, label: t('hb.smaller'), run: () => { L.size[id] = sz === 'l' ? 'm' : 's'; save(); } });
  if (sz !== 'l') items.push({ icon: HB.bigger, label: t('hb.bigger'), run: () => { L.size[id] = sz === 's' ? 'm' : 'l'; save(); } });
  if (i > 0) items.push({ icon: HB.up, label: t('hb.up'), run: () => move(-1) });
  if (i >= 0 && i < vis.length - 1) items.push({ icon: HB.down, label: t('hb.down'), run: () => move(1) });
  items.push({ icon: HB.hide, label: t('hb.hide'), danger: true, run: () => { L.off.add(id); save(); toast(t('hb.hidden')); } });
  items.push({ icon: HB.edit, label: t('hb.all'), run: openPage });
  holdMenu(el, items, t('hb.' + id));
}

// Быстрый доступ: до 8 инструментов, порядок — перетаскиванием по удержанию или стрелкой
export function quickEdit(app, rerender) {
  const st = app.store.state.settings, sel = () => (st.quick || QUICK_DEF).slice();
  const row = (id, on, i) => {
    const m = moduleById(id);
    return '<div class="cell"' + (on ? ' data-q-row="' + id + '"' : '') + '><span class="ticon" style="background:' + m.color + ';--on:' + (m.on || '#fff') + '">' + m.icon + '</span><span class="grow">' + esc(moduleName(m)) + '</span>' +
      (on ? (i > 0 ? '<button class="ic sm plain" data-qu="' + id + '" aria-label="' + t('quick.up') + '">' + IC.up + '</button>' : '') +
        '<button class="ic sm plain" data-qr="' + id + '" aria-label="' + t('quick.remove') + '" style="color:var(--red)">' + IC.minus + '</button>'
        : '<button class="ic sm plain" data-qa="' + id + '" aria-label="' + t('quick.add') + '" style="color:#5F8568">' + IC.plus + '</button>') + '</div>';
  };
  const body = () => {
    const q = sel().filter((id) => isOn(st, id) && moduleById(id) && !moduleById(id).tab), rest = modules.filter((m) => !m.tab).map((m) => m.id).filter((id) => isOn(st, id) && !q.includes(id));
    return snav(t('home.quick')) + '<div class="hdr" style="margin-top:4px">' + t('quick.onHome', { n: q.length, max: QUICK_MAX }) + '</div><div class="group">' +
      (q.length ? q.map((id, i) => row(id, true, i)).join('') : '<div class="cell l2">' + t('quick.empty') + '</div>') + '</div>' +
      (rest.length ? '<div class="hdr">' + t('quick.canAdd') + '</div><div class="group">' + rest.map((id) => row(id, false)).join('') + '</div>' : '') +
      '<p class="ftr">' + t('quick.hint') + '</p>';
  };
  sheet(body, (el, sh) => {
    // удержать строку и вести вверх-вниз — новый порядок (выключенные инструменты — на своих местах в конце)
    sortable(el, '[data-q-row]', 'data-q-row', (ids) => { st.quick = ids.concat(sel().filter((x) => !ids.includes(x))); app.store.settingsChanged(); sh.update(); rerender(); });
    el.addEventListener('click', (e) => {
      const g = (s) => e.target.closest(s);
      let b, q = sel();
      if ((b = g('[data-qa]'))) { if (q.length >= QUICK_MAX) { toast(t('quick.max', { max: QUICK_MAX })); return; } q.push(b.dataset.qa); }
      else if ((b = g('[data-qr]'))) q = q.filter((x) => x !== b.dataset.qr);
      else if ((b = g('[data-qu]'))) { const i = q.indexOf(b.dataset.qu); if (i > 0) [q[i - 1], q[i]] = [q[i], q[i - 1]]; }
      else return;
      st.quick = q;
      app.store.settingsChanged();
      sh.update();
      rerender();
    });
  });
}

export function streakSheet(app) {
  const st = app.store.state.settings, s = streakInfo(app.store.sessions(), st), goal = st.goalMin * 60;
  sheet(() => snav(t('streak.title')) +
    '<div class="shero2">' + FLAME + '<div class="num sbig">' + s.weeks + '</div><div class="l2">' + t('streak.inRow', { w: tn('streak.weeksWord', s.weeks) }) + '</div></div>' +
    '<div class="tiles num" style="margin-top:14px"><div class="tile"><b>' + s.best + '</b><span>' + t('streak.best') + '</span></div><div class="tile"><b>' + s.days + '</b><span>' +
    t('streak.daysPlan', { d: tn('streak.daysWord', s.days) }) + '</span></div><div class="tile"><b>' + t(s.curMet ? 'streak.yes' : 'streak.notYet') + '</b><span>' + t('streak.thisWeek') + '</span></div></div>' +
    '<div class="card"><div class="ch"><span>' + t('streak.12w') + '</span><span>' + t('streak.goal', { goal: fmtDur(goal) }) + '</span></div><div class="swk">' +
    s.met.map((m, i) => '<i class="' + (m ? 'on' : '') + (i === 11 ? ' cur' : '') + '" title="' + fmtDur(s.wt[i]) + '"><b style="height:' + Math.min(100, goal ? (s.wt[i] / goal) * 100 : 0) + '%"></b></i>').join('') + '</div></div>' +
    '<p class="ftr">' + (s.atRisk ? t('streak.atRisk') + ' ' : '') + t('streak.hint') + '</p>');
}

/* ---------- значок мастерства ---------- */

const hoursText = (h) => fmtDur(h * 3600);

const fmtNum = (h) => new Intl.NumberFormat(getLang() === 'en' ? 'en' : 'ru').format(h);
const bar = (frac, c = '') => '<div class="gbar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.round(frac * 100) + '"' + (c ? ' style="--bc:' + c + '"' : '') + '><i style="width:' + frac * 100 + '%"></i></div>';

// Часы лиги и камня: только практика в приложении
const leagueHours = (app) => gemSec(app.store.sessions()) / 3600;

/* ---------- камень (режим «Минимал»: вместо лиг) ---------- */

// Путь камня: до километра — метры (десятками), до 10 км — с десятой, дальше — целые
export function kmText(hours) {
  const km = stoneKm(hours), nf = (n, d = 0) => new Intl.NumberFormat(getLang() === 'en' ? 'en' : 'ru', { maximumFractionDigits: d }).format(n);
  return km < 1 ? t('stone.m', { n: nf(Math.round(km * 100) * 10) }) : t('stone.km', { n: nf(km, km < 10 ? 1 : 0) });
}

// Оживить камни на экране после отрисовки (холсты с data-stone="home"); size — главная или профиль
export function mountStones(app, root) {
  const st = app.store.state.settings, h = leagueHours(app);
  mountGems(root, stoneSeed(st)); // камни лиг (обычный вид)
  root.querySelectorAll('canvas[data-stone="home"]').forEach((c) => {
    const v = stoneView(c, { seed: stoneSeed(st), hours: h, detail: 3, key: 'home', onTap: () => stoneSheet(app) });
    c.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); stoneSheet(app); } });
  });
}

// Камень во весь экран: крутить, рассматривать; «Каким был» — тот же камень без единого часа
export function stoneSheet(app) {
  const st = app.store.state.settings, hrs = leagueHours(app), sec = hrs * 3600, wr = wear(hrs);
  const pct = (x) => Math.round(x * 100) + '%';
  const api = sheet(() => snav(t('stone.title')) +
    '<div class="stonefull"><canvas data-stone="full" aria-label="' + esc(t('stone.title')) + '"></canvas></div>' +
    '<div class="seg stseg" role="group" aria-label="' + esc(t('stone.title')) + '"><button data-stv="now" aria-pressed="true">' + t('stone.now') + '</button><button data-stv="then" aria-pressed="false">' + t('stone.then') + '</button></div>' +
    '<div class="tiles num" style="margin-top:14px"><div class="tile"><b>' + fmtDur(sec) + '</b><span>' + t('stone.hours') + '</span></div><div class="tile"><b>' + pct(wr.edges) + '</b><span>' + t('stone.edges') +
    '</span></div><div class="tile"><b>' + pct(roundness(wr)) + '</b><span>' + t('stone.form') + '</span></div></div>' +
    '<div class="stkm"><b class="num">' + esc(kmText(hrs)) + '</b><span>' + t('stone.path') + '</span></div>' +
    '<p class="ftr">' + t('stone.text') + '</p>');
  const root = api.el;
  const cv = root.querySelector('canvas[data-stone="full"]');
  if (!cv) return;
  const v = stoneView(cv, { seed: stoneSeed(st), hours: hrs, detail: 4, key: 'home' });
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-stv]');
    if (!b) return;
    root.querySelectorAll('[data-stv]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    v.setHours(b.dataset.stv === 'then' ? 0 : hrs);
  });
}

// Лига под карточкой недели: самоцвет, часы в приложении, путь до следующей лиги
function gemRow(app) {
  const st = app.store.state.settings;
  if (!isOn(st, 'mastery')) return '';
  const hrs = leagueHours(app), total = hrs * 3600, g = gemOf(hrs), name = t('gem.' + g.gem.id);
  return '<button class="gemrow" data-act="gem" aria-label="' + esc(t('gem.aria', { name, total: fmtDur(total) })) + '">' + gemCanvas(g.gem.id, g.frac, 52) +
    '<span class="gtxt"><b>' + esc(name) + '</b><span class="l2 num">' + fmtDur(total) + (g.next ? ' · ' + esc(t('gem.toNext', { name: t('gem.' + g.next.id), left: hoursText(g.left) })) : '') + '</span>' +
    (g.next ? '<span class="rkbar"><i style="width:' + g.frac * 100 + '%"></i></span>' : '') + '</span></button>';
}

export function gemSheet(app) {
  if (app.store.state.settings.uiStyle === 'mono') { stoneSheet(app); return; }
  const hrs = leagueHours(app), total = hrs * 3600, g = gemOf(hrs);
  // камни — объёмные, крутятся сами и пальцем (src/ui/gem3d.js); в списке вращается только текущий
  const api = sheet(() => snav(t('gem.title')) +
    '<div class="gemhero">' + gemCanvas(g.gem.id, g.frac, 180, t('gem.' + g.gem.id)) + '<div class="gname">' + t('gem.' + g.gem.id) + '</div><div class="l2 num">' + t('gem.total', { total: fmtDur(total) }) + '</div>' +
    (g.next ? bar(g.frac) + '<div class="l2" style="font-size:13px">' +
      t('gem.toNext', { name: t('gem.' + g.next.id), left: hoursText(g.left) }) + '</div>' : '<div class="l2" style="font-size:13px">' + t('gem.top') + '</div>') + '</div>' +
    '<div class="group">' + GEMS.map((x, i) => '<div class="cell gemli' + (i > g.i ? ' locked' : '') + (i === g.i ? ' cur' : '') + '">' + gemCanvas(x.id, i < g.i ? 1 : i === g.i ? g.frac : 0, 48, '', i === g.i) +
      '<span class="grow">' + t('gem.' + x.id) + (x.id === 'obsidian' ? '<span class="st l2" style="display:block;font-size:12px">' + t('gem.pro') + '</span>' : '') + '</span><span class="val num">' + t('gem.from', { h: fmtNum(x.h) }) + '</span></div>').join('') + '</div>' +
    '<p class="ftr">' + t('gem.hint') + '</p>');
  if (api && api.el) mountGems(api.el, stoneSeed(app.store.state.settings));
}

// Новая лига — одно короткое сообщение (выключается в «Уведомлениях»). Номер последней показанной лиги —
// settings.leagueSeen; в первый раз запоминается молча
export function leagueCheck(app) {
  const st = app.store.state.settings;
  if (!st.profile || st.toolsOnly || st.uiStyle === 'mono') return; // в «Минимале» лиг нет — только камень
  const g = gemOf(gemSec(app.store.sessions()) / 3600);
  if (st.leagueSeen == null || g.i < st.leagueSeen) { st.leagueSeen = g.i; app.store.settingsChanged(); return; }
  if (g.i === st.leagueSeen) return;
  st.leagueSeen = g.i;
  app.store.settingsChanged();
  if (st.rankNote !== false && isOn(st, 'mastery')) toast(t('gem.new', { name: t('gem.' + g.gem.id) }));
}

// Справка о названии — только стих из Писания с адресом (решение автора)
const VERSE_GR = 'Ταῦτα <b>μελέτα</b>, ἐν τούτοις ἴσθι, ἵνα σου ἡ προκοπὴ φανερὰ ᾖ πᾶσιν.';
// В переводе слово, соответствующее μελέτα, отмечено **так** — выделяется жирным
const boldMarks = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
export function nameSheet() {
  sheet(() => snav(t('name.title')) +
    '<div class="namehero">' + logoHTML() + '<div class="tr">' + esc(t('name.tr')) + '</div></div>' +
    '<div class="group"><div class="cellcol"><p class="nameq" lang="grc">' + VERSE_GR + '</p>' +
    (t('name.verse') ? '<p style="margin:0 0 6px">' + boldMarks(t('name.verse')) + '</p>' : '') + '<div class="nameref">' + esc(t('name.ref')) + '</div></div></div>');
}
