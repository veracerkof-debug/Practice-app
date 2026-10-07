// «Сегодня»: цель недели, дни, кнопка практики, быстрый доступ к инструментам, недавние песни; ударный режим.
// Перенесено из legacy/practice.html (homeHTML, quickList, quickEdit, streakPill, streakSheet).
import { t, tn, getLang } from '../../i18n/index.js';
import { esc, sheet, snav, toast } from '../../ui/index.js';
import { goalRing, FLAME } from '../../ui/cards.js';
import { fmtDur } from '../format.js';
import { weekData, goalProgress, songStats, streakInfo } from '../stats.js';
import { GEMS, gemOf } from '../mastery.js';
import { gemSec, lifetimeSec, priorHours } from '../profile.js';
import { RANK_STEPS, rankOf } from '../rank.js';
import { rankSVG, rankName, RANK_COLORS } from '../../ui/rank.js';
import { gemSVG } from '../../ui/gems.js';
import { trackMode } from '../session.js';
import { genreOf, ensureLib } from '../library.js';
import { isOn } from '../settings.js';
import { weekday } from '../time.js';
import { modules, moduleById } from '../../modules/index.js';
import { moduleName } from '../modules.js';
import { topbar, weekdays, relDay, PLAY, IC } from './common.js';
import { logoHTML } from '../../ui/logo.js';
import { nextEventsHTML } from './calendar.js';

// Тренажёр слуха временно убран (вернётся на этапе 2) — вместо него пэды
export const QUICK_DEF = ['metro', 'tuner', 'piano', 'drone'];
const QUICK_MAX = 8;

const quickList = (st) => (st.quick || QUICK_DEF).filter((id) => isOn(st, id) && moduleById(id));

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
const mhead = (title, actions = '') => '<div class="mhd"><h2>' + title + '</h2><span class="mact">' + actions + '</span></div>';

function homeMonoHTML(app) {
  const st = app.store.state.settings, plain = !!st.toolsOnly, now = new Date();
  const lang = getLang() === 'uz' ? 'uz-Latn' : getLang();
  const date = new Intl.DateTimeFormat(lang, { weekday: 'long', day: 'numeric', month: 'short' }).format(now);
  let h = '<div class="mono-home">' + topbar(logoHTML()) + '<h1 class="mhello">' + esc(greet(now.getHours())) + '</h1><div class="mdate">' + esc(date) + '</div>';
  if (!plain) {
    const w = weekData(app.store.sessions()), goal = st.goalMin * 60, p = goalProgress(w.total, st), today = weekday(Date.now()), WD = weekdays();
    h += mhead(t('home.week'), '<button class="mbtn" data-pp="' + (st.configured ? 'stats' : 'week') + '" aria-label="' + esc(t('home.stats')) + '">' + ARROW + '</button>') +
      '<button class="mweek" data-pp="' + (st.configured ? 'stats' : 'week') + '"><span class="mbig num' + (trackMode(st) === 'strict' ? ' goldshine' : '') + '">' + fmtDur(w.total) + '</span>' +
      '<span class="mof num">/ ' + fmtDur(goal) + '</span></button><div class="mline"><i style="width:' + Math.min(100, p * 100) + '%"></i></div>' +
      '<div class="mdays">' + WD.map((d, i) => '<span class="' + (w.per[i] > 0 ? 'done' : st.days[i] ? 'plan' : 'rest') + (i === today ? ' today' : '') + '">' + d + '</span>').join('') + '</div>';
    if (isOn(st, 'mastery')) {
      const all = app.store.sessions(), r = rankOf(lifetimeSec(all, st) / 3600), g = gemOf(gemSec(all) / 3600);
      h += '<div class="mtags"><button data-act="rank">' + esc(rankName(r.id, r.level)) + '</button><button data-act="gem">' + esc(t('gem.' + g.gem.id)) + ' · ' + fmtDur(gemSec(all)) + '</button>' +
        (isOn(st, 'streak') && streakInfo(all, st).weeks ? '<button data-act="streak">' + esc(tn('streak.weeks', streakInfo(all, st).weeks)) + '</button>' : '') + '</div>';
    }
  }
  h += '<button class="mcta" data-act="free"><span>' + t(plain ? (app.active ? 'home.wsResume' : 'home.ws') : app.active ? 'home.resume' : 'home.start') + '</span><i>' + PLAY + '</i></button>';
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
  let h = topbar(logoHTML()) + '<div class="large">' + t('home.title') + '</div><div class="hcols"><div>';
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
  h += '<button class="hcta" data-act="free"' + (plain ? ' style="margin-top:4px"' : '') + '>' + PLAY + '<span>' + t(plain ? (app.active ? 'home.wsResume' : 'home.ws') : app.active ? 'home.resume' : 'home.start') + '</span></button>';
  const q = quickList(st);
  h += '<div class="hhdr"><span>' + t('home.quick') + '</span><button class="link" data-act="quickedit">' + t('home.edit') + '</button></div>';
  h += '<div class="qgrid">' + (q.length
    ? q.map((id) => { const m = moduleById(id); return '<button class="qbtn" data-open-tool="' + id + '" style="--c:' + m.color + '"><span class="qic">' + m.icon + '</span><span class="qn">' + esc(moduleName(m)) + '</span></button>'; }).join('')
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
    return '<div class="cell"><span class="ticon" style="background:' + m.color + '">' + m.icon + '</span><span class="grow">' + esc(moduleName(m)) + '</span>' +
      (on ? (i > 0 ? '<button class="ic sm plain" data-qu="' + id + '" aria-label="' + t('quick.up') + '">' + IC.up + '</button>' : '') +
        '<button class="ic sm plain" data-qr="' + id + '" aria-label="' + t('quick.remove') + '" style="color:var(--red)">' + IC.minus + '</button>'
        : '<button class="ic sm plain" data-qa="' + id + '" aria-label="' + t('quick.add') + '" style="color:#34C759">' + IC.plus + '</button>') + '</div>';
  };
  const body = () => {
    const q = sel().filter((id) => isOn(st, id) && moduleById(id)), rest = modules.map((m) => m.id).filter((id) => isOn(st, id) && !q.includes(id));
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

// Строка под карточкой недели: камень (практика в приложении) и звание (весь опыт) — две половины,
// без лишних подписей: подробности — в шторках
function gemRow(app) {
  const st = app.store.state.settings;
  if (!isOn(st, 'mastery')) return '';
  const all = app.store.sessions(), total = gemSec(all), g = gemOf(total / 3600), name = t('gem.' + g.gem.id);
  const r = rankOf(lifetimeSec(all, st) / 3600), rn = rankName(r.id, r.level);
  return '<div class="hprog"><button class="gemrow" data-act="gem" aria-label="' + esc(t('gem.aria', { name, total: fmtDur(total) })) + '">' + gemSVG(g.gem.id, g.frac, 44) +
    '<span class="gtxt"><b class="num">' + fmtDur(total) + '</b><span class="l2">' + esc(name) + '</span></span></button>' +
    '<button class="gemrow rkrow" data-act="rank" style="--rk:' + RANK_COLORS[r.id] + '" aria-label="' + esc(t('rank.aria', { name: rn })) + '">' + rankSVG(r.id, r.level, 44) +
    '<span class="gtxt"><b>' + esc(rn) + '</b>' + (r.next ? '<span class="rkbar"><i style="width:' + r.frac * 100 + '%"></i></span>' : '<span class="l2">' + t('rank.topShort') + '</span>') + '</span></button></div>';
}

export function gemSheet(app) {
  const total = gemSec(app.store.sessions()), g = gemOf(total / 3600);
  sheet(() => snav(t('gem.title')) +
    '<div class="gemhero">' + gemSVG(g.gem.id, g.frac, 150, t('gem.' + g.gem.id)) + '<div class="gname">' + t('gem.' + g.gem.id) + '</div><div class="l2 num">' + t('gem.total', { total: fmtDur(total) }) + '</div>' +
    (g.next ? bar(g.frac) + '<div class="l2" style="font-size:13px">' +
      t('gem.toNext', { name: t('gem.' + g.next.id), left: hoursText(g.left) }) + '</div>' : '<div class="l2" style="font-size:13px">' + t('gem.top') + '</div>') + '</div>' +
    '<div class="group">' + GEMS.map((x, i) => '<div class="cell gemli' + (i > g.i ? ' locked' : '') + (i === g.i ? ' cur' : '') + '">' + gemSVG(x.id, i < g.i ? 1 : i === g.i ? g.frac : 0, 40) +
      '<span class="grow">' + t('gem.' + x.id) + (x.id === 'rough' ? '<span class="st l2" style="display:block;font-size:12px">' + t('gem.pro') + '</span>' : '') + '</span><span class="val num">' + t('gem.from', { h: fmtNum(x.h) }) + '</span></div>').join('') + '</div>' +
    '<p class="ftr">' + t('gem.hint') + '</p>');
}

// Звание: весь опыт — часы до приложения и практика в приложении
export function rankSheet(app) {
  const st = app.store.state.settings, total = lifetimeSec(app.store.sessions(), st), r = rankOf(total / 3600), prior = priorHours(st), c = RANK_COLORS[r.id];
  sheet(() => snav(t('rank.title')) +
    '<div class="gemhero" style="--rk:' + c + '">' + rankSVG(r.id, r.level, 120, rankName(r.id, r.level)) + '<div class="gname" style="color:var(--rk)">' + esc(rankName(r.id, r.level)) + '</div>' +
    '<div class="l2 num">' + t('rank.total', { total: fmtDur(total) }) + '</div>' +
    (prior ? '<div class="l2 num" style="font-size:13px">' + t('rank.prior', { h: hoursText(prior) }) + '</div>' : '') +
    (r.next ? bar(r.frac, c) + '<div class="l2" style="font-size:13px">' + t('gem.toNext', { name: rankName(r.next.id, r.next.level), left: hoursText(r.left) }) + '</div>'
      : '<div class="l2" style="font-size:13px">' + t('rank.top') + '</div>') + '</div>' +
    '<div class="group">' + RANK_STEPS.map(([id, lv, h], i) => '<div class="cell gemli rkli' + (i > r.i ? ' locked' : '') + (i === r.i ? ' cur' : '') + '">' + rankSVG(id, lv, 40) +
      '<span class="grow">' + esc(rankName(id, lv)) + '</span><span class="val num">' + t('gem.from', { h: fmtNum(h) }) + '</span></div>').join('') + '</div>' +
    '<p class="ftr">' + t('rank.hint') + '</p>');
}

// Новое звание — одно короткое сообщение (его можно выключить в «Уведомлениях»). Номер последнего
// показанного звания хранится в settings.rankSeen; в первый раз запоминается молча
export function rankCheck(app) {
  const st = app.store.state.settings;
  if (!st.profile || st.toolsOnly) return;
  const r = rankOf(lifetimeSec(app.store.sessions(), st) / 3600);
  if (st.rankSeen == null || r.i < st.rankSeen) { st.rankSeen = r.i; app.store.settingsChanged(); return; }
  if (r.i === st.rankSeen) return;
  st.rankSeen = r.i;
  app.store.settingsChanged();
  if (st.rankNote !== false && isOn(st, 'mastery')) toast(t('rank.new', { name: rankName(r.id, r.level) }));
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
