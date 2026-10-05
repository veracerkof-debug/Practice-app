// «Сегодня»: цель недели, дни, кнопка практики, быстрый доступ к инструментам, недавние песни; ударный режим.
// Перенесено из legacy/practice.html (homeHTML, quickList, quickEdit, streakPill, streakSheet).
import { t, tn, getLang } from '../../i18n/index.js';
import { esc, sheet, snav, toast } from '../../ui/index.js';
import { goalRing, FLAME } from '../../ui/cards.js';
import { fmtDur } from '../format.js';
import { weekData, goalProgress, songStats, streakInfo, strictTime, totalTime } from '../stats.js';
import { GEMS, gemOf } from '../mastery.js';
import { lifetimeSec, priorHours } from '../profile.js';
import { gemSVG } from '../../ui/gems.js';
import { weekStart } from '../time.js';
import { genreOf, ensureLib } from '../library.js';
import { isOn } from '../settings.js';
import { weekday } from '../time.js';
import { modules, moduleById } from '../../modules/index.js';
import { moduleName } from '../modules.js';
import { topbar, weekdays, relDay, PLAY, IC } from './common.js';
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

export function homeHTML(app) {
  const st = app.store.state.settings, w = weekData(app.store.sessions()), goal = st.goalMin * 60, p = goalProgress(w.total, st);
  const today = weekday(Date.now()), plan = st.days, WD = weekdays(), strictW = strictTime(app.store.sessions(), weekStart(Date.now()));
  let h = topbar() + '<div class="large">' + t('home.title') + '</div><div class="hcols"><div>';
  h += '<div class="hcard"><div class="hrow">' + goalRing(p, true, t('home.ringAria', { p: Math.round(p * 100) })) + '<div class="htxt"><div class="l2" style="font-size:14px">' + t('home.week') +
    '</div><div class="big num">' + fmtDur(w.total) + '</div><div class="l2" style="font-size:14px">' + t('home.of', { goal: fmtDur(goal) }) + (p > 1 ? t('home.over') : p >= 1 ? t('home.met') : '') + '</div>' +
    (strictW ? '<div class="gold num" style="font-size:13px;font-weight:600" title="' + esc(t('track.strictTitle')) + '">' + esc(t('track.strictOf', { d: fmtDur(strictW) })) + '</div>' : '') +
    streakPill(app) + '</div></div>' +
    '<div class="days hdays">' + WD.map((d, i) => '<div class="day ' + (w.per[i] > 0 ? 'done' : plan[i] ? 'plan' : 'rest') + (i === today ? ' today' : '') + '" title="' +
      esc(w.per[i] ? fmtDur(w.per[i]) : plan[i] ? t('home.dayPlan') : t('home.dayRest')) + '"><span class="d"></span>' + d + '</div>').join('') + '</div>' +
    '<button class="hlink" data-pp="' + (st.configured ? 'stats' : 'week') + '">' +
    (st.configured ? (plan[today] ? t('home.todayPlan') : t('home.todayRest')) + ' · ' + t('home.stats') : t('home.setup')) + ' ›</button></div>';
  h += gemRow(app);
  h += '<button class="hcta" data-act="free">' + PLAY + '<span>' + t(app.active ? 'home.resume' : 'home.start') + '</span></button>';
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
    const sub = s.currentBpm && s.targetBpm ? s.currentBpm + ' → ' + s.targetBpm + ' bpm' : ss.last ? relDay(ss.last) + ', ' + fmtDur(ss.total) : t('home.notPlayed');
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

// Строка под карточкой недели: значок и общие часы
function gemRow(app) {
  const st = app.store.state.settings;
  if (!isOn(st, 'mastery')) return '';
  const total = lifetimeSec(app.store.sessions(), st), g = gemOf(total / 3600), name = t('gem.' + g.gem.id);
  return '<button class="gemrow" data-act="gem" aria-label="' + esc(t('gem.aria', { name, total: fmtDur(total) })) + '">' + gemSVG(g.gem.id, g.frac, 50) +
    '<span class="gtxt"><b class="num">' + fmtDur(total) + '</b><span class="l2">' + esc(name) + (g.next ? ' · ' + esc(t('gem.toNext', { name: t('gem.' + g.next.id), left: hoursText(g.left) })) : '') + '</span></span>' +
    '<svg class="chev" viewBox="0 0 8 13"><path d="M1.5 1.5 6.5 6.5 1.5 11.5"/></svg></button>';
}

export function gemSheet(app) {
  const st = app.store.state.settings, total = lifetimeSec(app.store.sessions(), st), g = gemOf(total / 3600), prior = priorHours(st);
  sheet(() => snav(t('gem.title')) +
    '<div class="gemhero">' + gemSVG(g.gem.id, g.frac, 150, t('gem.' + g.gem.id)) + '<div class="gname">' + t('gem.' + g.gem.id) + '</div><div class="l2 num">' + t('gem.total', { total: fmtDur(total) }) + '</div>' +
    (prior ? '<div class="l2 num" style="font-size:13px">' + t('gem.prior', { h: hoursText(prior) }) + '</div>' : '') +
    (g.next ? '<div class="gbar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.round(g.frac * 100) + '"><i style="width:' + g.frac * 100 + '%"></i></div><div class="l2" style="font-size:13px">' +
      t('gem.toNext', { name: t('gem.' + g.next.id), left: hoursText(g.left) }) + '</div>' : '<div class="l2" style="font-size:13px">' + t('gem.top') + '</div>') + '</div>' +
    '<div class="group">' + GEMS.map((x, i) => '<div class="cell gemli' + (i > g.i ? ' locked' : '') + (i === g.i ? ' cur' : '') + '">' + gemSVG(x.id, i < g.i ? 1 : i === g.i ? g.frac : 0, 40) +
      '<span class="grow">' + t('gem.' + x.id) + (x.id === 'rough' ? '<span class="st l2" style="display:block;font-size:12px">' + t('gem.pro') + '</span>' : '') + '</span><span class="val num">' + t('gem.from', { h: new Intl.NumberFormat(getLang() === 'en' ? 'en' : 'ru').format(x.h) }) + '</span></div>').join('') + '</div>' +
    '<p class="ftr">' + t('gem.hint') + '</p>');
}
