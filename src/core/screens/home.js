// «Сегодня»: цель недели, дни, кнопка практики, быстрый доступ к инструментам, недавние песни; ударный режим.
// Перенесено из legacy/practice.html (homeHTML, quickList, quickEdit, streakPill, streakSheet).
import { sandboxHours } from '../sandbox.js';
import { t, tn, getLang } from '../../i18n/index.js';
import { esc, sheet, snav, toast } from '../../ui/index.js';
import { goalRing, FLAME } from '../../ui/cards.js';
import { fmtDur } from '../format.js';
import { weekData, goalProgress, songStats, streakInfo } from '../stats.js';
import { GEMS, gemOf } from '../mastery.js';
import { gemSec } from '../profile.js';
import { gemSVG } from '../../ui/gems.js';
import { trackMode } from '../session.js';
import { genreOf, ensureLib } from '../library.js';
import { isOn } from '../settings.js';
import { weekday, dayKey } from '../time.js';
import { modules, moduleById } from '../../modules/index.js';
import { moduleName } from '../modules.js';
import { topbar, weekdays, relDay, PLAY, IC } from './common.js';
import { logoHTML } from '../../ui/logo.js';
import { nextEventsHTML } from './calendar.js';
import { extWho } from '../ext.js';
import { refText } from '../bible.js';
import { nextOf } from '../reading.js';
import { quoteAt, dayIndex, setsOf } from '../quotes.js';
import { pleaLine } from '../remindtexts.js';
import { remindOf } from '../reminders.js';
import { moodOf } from '../mascot.js';
import { mascotSVG } from '../../ui/mascot.js';

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

/* ---------- «Минимал» (эксперимент): та же главная, но только текст, линии и оттенки серого ---------- */

const ARROW = '<svg viewBox="0 0 12 12" class="mtri" aria-hidden="true"><path d="M3.5 2l5 4-5 4z"/></svg>';
const greet = (h) => t(h < 5 ? 'mono.night' : h < 12 ? 'mono.morning' : h < 18 ? 'mono.day' : h < 23 ? 'mono.evening' : 'mono.night');
// Создателю — по роли: «Добрый вечер, создатель» и тихая строчка, своя на каждый день (без пафоса)
const ROLE_LINES = 5;
const roleLine = (d) => t('mono.role.' + (1 + (Math.floor(d.getTime() / 864e5) % ROLE_LINES)));
// Личные бета-тестеры (Михаил — 'm', Парисо — 'r'): имя в разных формах и строчка о значении имени — своя на каждый день
const PERSON = { m: 'mono.mi', r: 'mono.pa' }, PERSON_LINES = 6;
function personHello(who, d) {
  const day = Math.floor(d.getTime() / 864e5), names = t(PERSON[who] + '.names').split('|');
  return { hello: greet(d.getHours()) + ', ' + names[(day + (d.getHours() >= 12 ? 1 : 0)) % names.length], line: t(PERSON[who] + '.' + (1 + (day % PERSON_LINES))) };
}
// Личное обращение после кода (создатель, Михаил, Парисо) — в обоих видах; null — обращения нет
function personal(st, now) {
  const who = extWho(st);
  if (PERSON[who]) return personHello(who, now);
  if (who === 'p') return { hello: t('mono.creator', { g: greet(now.getHours()) }), line: roleLine(now) };
  return null;
}
const elx = (s) => esc(s).replace(/(Μελέτη|Μιχαήλ)/g, '<span lang="el">$1</span>');
function helloHTML(st, now) {
  const p = personal(st, now);
  return p ? '<h1 class="mhello">' + elx(p.hello) + '</h1><p class="mrole">' + elx(p.line) + '</p>' : '<h1 class="mhello">' + esc(greet(now.getHours())) + '</h1>';
}
// Обычный вид: приветствие строкой над неделей — только при личном обращении
function helloClassic(st) {
  const p = personal(st, new Date());
  return p ? '<div class="hgreet" aria-live="polite"><b>' + elx(p.hello) + '</b><span>' + elx(p.line) + '</span></div>' : '';
}
// Церковный режим: чтение дня по плану — главы, сколько прочитано, «Читать» открывает Библию на первой непрочитанной
function readingCard(app, mono = false) {
  const st = app.store.state.settings;
  if (!st.church || !app.bible) return '';
  const r = app.bible.today();
  if (!r) return '';
  const all = r.done === r.keys.length, next = nextOf(app.bible.st(), r);
  return '<button class="' + (mono ? 'mread' : 'hread') + '" data-act="bible" data-key="' + next + '"><span class="hrt">' + t('read.today') + ' · ' + t('read.day', { d: r.day, n: r.days }) + '</span>' +
    '<span class="hrr">' + esc(refText(r.keys)) + '</span><span class="hrs">' + (all ? t('read.done') : t('read.progress', { done: r.done, n: r.keys.length })) + '</span></button>';
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
function quoteHTML(app, mono) {
  const st = app.store.state.settings;
  if (!isOn(st, 'quote')) return '';
  const q = quoteAt(dayIndex(), getLang(), setsOf(st), st.quoteBooks || []);
  return '<div class="' + (mono ? 'mvo' : 'hvoice') + '"><button class="mascotb" data-mascot aria-label="' + esc(t('mascot.aria')) + '">' + mascotSVG(moodNow(app), { size: mono ? 52 : 56, ring: !mono }) + '</button>' +
    (q.text ? '<p class="' + (mono ? 'mquote' : 'hquote') + '">' + pleaHTML(app, 'mplea') + esc(q.text) + (q.ref ? '<span class="qref">' + esc(q.ref) + '</span>' : '') + '</p>' : '') + '</div>';
}
const mhead = (title, actions = '') => '<div class="mhd"><h2>' + title + '</h2><span class="mact">' + actions + '</span></div>';

function homeMonoHTML(app) {
  const st = app.store.state.settings, plain = !!st.toolsOnly, now = new Date();
  // (имя приложения в строчке — с lang="el": прописными по-гречески, без ударения)
  // Приветствие — место, где приложение потом будет говорить: спрашивать, предлагать, напоминать (без даты: это не календарь)
  let h = '<div class="mono-home">' + topbar(logoHTML()) + '<div class="mvoice" aria-live="polite">' + helloHTML(st, now) + quoteHTML(app, true) + '</div>';
  if (!plain) {
    const w = weekData(app.store.sessions()), goal = st.goalMin * 60, p = goalProgress(w.total, st), today = weekday(Date.now()), WD = weekdays();
    h += mhead(t('home.week'), '<button class="mbtn" data-pp="' + (st.configured ? 'stats' : 'week') + '" aria-label="' + esc(t('home.stats')) + '">' + ARROW + '</button>') +
      '<button class="mweek" data-pp="' + (st.configured ? 'stats' : 'week') + '"><span class="mbig num' + (trackMode(st) === 'strict' ? ' goldshine' : '') + '">' + fmtDur(w.total) + '</span>' +
      '<span class="mof num">/ ' + fmtDur(goal) + '</span></button><div class="mline"><i style="width:' + Math.min(100, p * 100) + '%"></i></div>' +
      '<div class="mdays">' + WD.map((d, i) => '<span class="' + (w.per[i] > 0 ? 'done' : st.days[i] ? 'plan' : 'rest') + (i === today ? ' today' : '') + '">' + d + '</span>').join('') + '</div>';
    if (isOn(st, 'mastery')) {
      // лига: самоцвет по часам практики в приложении (src/core/mastery.js), без званий
      const all = app.store.sessions(), hrs = leagueHours(app), g = gemOf(hrs), name = t('gem.' + g.gem.id);
      h += '<button class="mstone mleague" data-act="gem" aria-label="' + esc(t('gem.aria', { name, total: fmtDur(hrs * 3600) })) + '">' + gemSVG(g.gem.id, g.frac, 96) +
        '<span class="mstxt"><span class="mslbl">' + esc(name) + '</span><span class="msval num">' + fmtDur(hrs * 3600) + '</span>' +
        (g.next ? '<span class="mslbl num">' + esc(t('gem.toNext', { name: t('gem.' + g.next.id), left: hoursText(g.left) })) + '</span>' : '') + '</span></button>';
      if (isOn(st, 'streak') && streakInfo(all, st).weeks) h += '<div class="mtags"><button data-act="streak">' + esc(tn('streak.weeks', streakInfo(all, st).weeks)) + '</button></div>';
    }
  }
  h += readingCard(app, true);
  h += '<button class="mcta" data-act="free"><i class="bareic" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z"/></svg></i><span>' + t(plain ? (app.active ? 'home.wsResume' : 'home.ws') : app.active ? 'home.resume' : 'home.start') + '</span></button>';
  const q = quickList(st);
  h += mhead(t('home.quick'), '<button class="mbtn" data-act="quickedit" aria-label="' + esc(t('home.edit')) + '">' + IC.plus + '</button>') +
    '<div class="mtools">' + q.map((id) => { const m = moduleById(id); return '<button data-open-tool="' + id + '"><span class="mcirc">' + m.icon + '</span><span class="mlbl">' + esc(moduleName(m)) + '</span></button>'; }).join('') + '</div>';
  h += nextEventsHTML(app);
  const songs = app.store.songs();
  const rec = songs.map((s) => ({ s, st: songStats(app.store.sessions(), s.id) })).sort((a, b) => (b.st.last || b.s.createdAt) - (a.st.last || a.s.createdAt)).slice(0, 6);
  h += mhead(t('home.continue'), '<button class="mbtn" data-act="addSong" aria-label="' + esc(t('home.firstSong')) + '">' + IC.plus + '</button><button class="mbtn" data-tab="library" aria-label="' + esc(t('home.allSongs')) + '">' + ARROW + '</button>');
  h += rec.length ? '<div class="mlist">' + rec.map(({ s, st: ss }) => '<div class="mrow"><button data-song="' + s.id + '"><span class="mt">' + esc(s.title) + '</span>' +
    (!plain && ss.total ? '<span class="mm num">' + fmtDur(ss.total) + '</span>' : s.artist ? '<span class="mm">' + esc(s.artist) + '</span>' : '') + '</button>' +
    '<button class="mplay" data-play="' + s.id + '" aria-label="' + esc(t('home.playSong', { title: s.title })) + '">' + ARROW + '</button></div>').join('') + '</div>'
    : '<p class="mempty">' + t('mono.noSongs') + '</p>';
  return h + '</div>';
}

export function homeHTML(app) {
  if (app.store.state.settings.uiStyle === 'mono') return homeMonoHTML(app);
  const st = app.store.state.settings, w = weekData(app.store.sessions()), goal = st.goalMin * 60, p = goalProgress(w.total, st);
  const today = weekday(Date.now()), plan = st.days, WD = weekdays();
  // заголовка «Сегодня» нет: место — неделе и делу (личное обращение после кода — строкой сверху)
  let h = topbar(logoHTML()) + helloClassic(st) + quoteHTML(app, false) + '<div class="hcols"><div>';
  // «Только инструменты»: без недели, цели, камня и звания — сразу рабочее место и инструменты
  const plain = !!st.toolsOnly;
  if (!plain) h += '<div class="hcard"><div class="hrow">' + goalRing(p, true, t('home.ringAria', { p: Math.round(p * 100) })) + '<div class="htxt"><div class="l2" style="font-size:14px">' + t('home.week') +
    '</div><div class="big num' + (trackMode(st) === 'strict' ? ' goldshine' : '') + '">' + fmtDur(w.total) + '</div><div class="l2" style="font-size:14px">' + t('home.of', { goal: fmtDur(goal) }) + (p > 1 ? t('home.over') : p >= 1 ? t('home.met') : '') + '</div>' +
    streakPill(app) + '</div></div>' +
    '<div class="days hdays">' + WD.map((d, i) => '<div class="day ' + (w.per[i] > 0 ? 'done' : plan[i] ? 'plan' : 'rest') + (i === today ? ' today' : '') + '" title="' +
      esc(w.per[i] ? fmtDur(w.per[i]) : plan[i] ? t('home.dayPlan') : t('home.dayRest')) + '"><span class="d"></span>' + d + '</div>').join('') + '</div>' +
    '<button class="hlink" data-pp="' + (st.configured ? 'stats' : 'week') + '">' +
    (st.configured ? (plan[today] ? t('home.todayPlan') : t('home.todayRest')) + ' · ' + t('home.stats') : t('home.setup')) + ' ›</button></div>';
  h += gemRow(app);
  h += readingCard(app);
  h += '<button class="hcta" data-act="free"' + (plain ? ' style="margin-top:4px"' : '') + '><i class="bareic" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z"/></svg></i><span>' + t(plain ? (app.active ? 'home.wsResume' : 'home.ws') : app.active ? 'home.resume' : 'home.start') + '</span></button>';
  const q = quickList(st);
  h += '<div class="hhdr"><span>' + t('home.quick') + '</span><button class="link" data-act="quickedit">' + t('home.edit') + '</button></div>';
  h += '<div class="qgrid">' + (q.length
    ? q.map((id) => { const m = moduleById(id); return '<button class="qbtn" data-open-tool="' + id + '" style="--c:' + m.color + ';--on:' + (m.on || '#fff') + '"><span class="qic">' + m.icon + '</span><span class="qn">' + esc(moduleName(m)) + '</span></button>'; }).join('')
    : '<button class="qbtn add" data-act="quickedit"><span class="qic">' + IC.plus + '</span><span class="qn">' + t('home.add') + '</span></button>') + '</div>';
  h += '</div><div>';
  h += nextEventsHTML(app);
  const songs = app.store.songs(), L = ensureLib(app.store.state, t);
  const rec = songs.map((s) => ({ s, st: songStats(app.store.sessions(), s.id) })).sort((a, b) => (b.st.last || b.s.createdAt) - (a.st.last || a.s.createdAt)).slice(0, 4);
  h += '<div class="hhdr"><span>' + t('home.continue') + '</span>' + (songs.length > 4 ? '<button class="link" data-tab="library">' + t('home.allSongs') + '</button>' : '') + '</div>';
  if (!rec.length) h += '<div class="group"><button class="cell act" data-act="addSong">' + t('home.firstSong') + '</button></div>';
  else h += '<div class="slist">' + rec.map(({ s, st: ss }) => {
    const g = genreOf(L, s.genre);
    const sub = s.currentBpm && s.targetBpm ? s.currentBpm + ' → ' + s.targetBpm + ' bpm' : plain ? s.artist || '' : ss.last ? relDay(ss.last) + ', ' + fmtDur(ss.total) : t('home.notPlayed');
    return '<div class="stile3 hsong" style="--g:' + (g ? g.color : 'var(--l3)') + '"><button class="grow" data-song="' + s.id + '" style="text-align:left;min-width:0"><div class="ttl">' + esc(s.title) +
      '</div><div class="st">' + esc(sub) + '</div></button><button class="playmini2" aria-label="' + esc(t('home.playSong', { title: s.title })) + '" data-play="' + s.id + '">' + PLAY + '</button></div>';
  }).join('') + '</div>';
  return h + '</div></div>';
}

// Быстрый доступ: до 8 инструментов, порядок стрелкой
export function quickEdit(app, rerender) {
  const st = app.store.state.settings, sel = () => (st.quick || QUICK_DEF).slice();
  const row = (id, on, i) => {
    const m = moduleById(id);
    return '<div class="cell"><span class="ticon" style="background:' + m.color + ';--on:' + (m.on || '#fff') + '">' + m.icon + '</span><span class="grow">' + esc(moduleName(m)) + '</span>' +
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
  sheet(body, (el, sh) => el.addEventListener('click', (e) => {
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
  }));
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

// Часы лиги: практика в приложении; во время проверки создателем — заданные правкой числа (sandbox.js)
const leagueHours = (app) => sandboxHours(app.store.state.settings) ?? gemSec(app.store.sessions()) / 3600;

// Лига под карточкой недели: самоцвет, часы в приложении, путь до следующей лиги
function gemRow(app) {
  const st = app.store.state.settings;
  if (!isOn(st, 'mastery')) return '';
  const hrs = leagueHours(app), total = hrs * 3600, g = gemOf(hrs), name = t('gem.' + g.gem.id);
  return '<button class="gemrow" data-act="gem" aria-label="' + esc(t('gem.aria', { name, total: fmtDur(total) })) + '">' + gemSVG(g.gem.id, g.frac, 48) +
    '<span class="gtxt"><b>' + esc(name) + '</b><span class="l2 num">' + fmtDur(total) + (g.next ? ' · ' + esc(t('gem.toNext', { name: t('gem.' + g.next.id), left: hoursText(g.left) })) : '') + '</span>' +
    (g.next ? '<span class="rkbar"><i style="width:' + g.frac * 100 + '%"></i></span>' : '') + '</span></button>';
}

export function gemSheet(app) {
  const hrs = leagueHours(app), total = hrs * 3600, g = gemOf(hrs);
  sheet(() => snav(t('gem.title')) +
    '<div class="gemhero">' + gemSVG(g.gem.id, g.frac, 150, t('gem.' + g.gem.id)) + '<div class="gname">' + t('gem.' + g.gem.id) + '</div><div class="l2 num">' + t('gem.total', { total: fmtDur(total) }) + '</div>' +
    (g.next ? bar(g.frac) + '<div class="l2" style="font-size:13px">' +
      t('gem.toNext', { name: t('gem.' + g.next.id), left: hoursText(g.left) }) + '</div>' : '<div class="l2" style="font-size:13px">' + t('gem.top') + '</div>') + '</div>' +
    '<div class="group">' + GEMS.map((x, i) => '<div class="cell gemli' + (i > g.i ? ' locked' : '') + (i === g.i ? ' cur' : '') + '">' + gemSVG(x.id, i < g.i ? 1 : i === g.i ? g.frac : 0, 40) +
      '<span class="grow">' + t('gem.' + x.id) + (x.id === 'obsidian' ? '<span class="st l2" style="display:block;font-size:12px">' + t('gem.pro') + '</span>' : '') + '</span><span class="val num">' + t('gem.from', { h: fmtNum(x.h) }) + '</span></div>').join('') + '</div>' +
    '<p class="ftr">' + t('gem.hint') + '</p>');
}

// Новая лига — одно короткое сообщение (выключается в «Уведомлениях»). Номер последней показанной лиги —
// settings.leagueSeen; в первый раз запоминается молча
export function leagueCheck(app) {
  const st = app.store.state.settings;
  if (!st.profile || st.toolsOnly) return;
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
