// Профиль и настройки (полноэкранная панель): статистика, неделя и цель, оформление, данные, функции;
// поддержать разработчика, правовые тексты, соглашение при первом запуске.
// Перенесено из legacy/practice.html (panelRoot, renderPanel, PPAGES, weekHTML, lookHTML, dataHTML, featHTML, statsHTML,
// barsSVG, hbars, legalSheet, tosGate, donateSheet, doExport, импорт копии).
import { t, tn, getLang, LANGS, LANG_NAMES } from '../../i18n/index.js';
import { esc, seg, sheet, snav, toast, confirm } from '../../ui/index.js';
import { goalRing, FLAME } from '../../ui/cards.js';
import { fmtDur } from '../format.js';
import { dayKey, weekday, weekStart } from '../time.js';
import {
  weekData, goalProgress, goalPerDay, streakInfo, heatmap, weeklyTotals, monthSplit, totalTime, byTool, bySong, bySongField, byFreeTag, strictTime,
} from '../stats.js';
import { CORE_FEATURES, isOn, setFeature, changeGoal, toggleDay, ACCENTS, applyTheme, visibleTabs, hiddenTabs, editTabs } from '../settings.js';
import { scaleOf } from '../library.js';
import { modules, moduleById, skippedModules } from '../../modules/index.js';
import { moduleName } from '../modules.js';
import { AVATAR, CHEV, BACK, IC, TAB_IDS, TAB_ICONS, weekdays, mBadge } from './common.js';
import { TOS_VER, TOS_HTML, PRIV_HTML, OFL_TEXT } from '../legal.js';
import { freeTagName, trackMode } from '../session.js';
import { INSTRUMENTS, LEVELS, PRIOR_MAX, lifetimeSec, saveProfile, newProfile } from '../profile.js';
import { rankOf } from '../rank.js';
import { rankSVG, rankName, RANK_COLORS } from '../../ui/rank.js';
import { gemSVG } from '../../ui/gems.js';

const PAGES = {
  me: ['#FF9500', '<svg viewBox="0 0 24 24"><circle cx="12" cy="9" r="3.6"/><path d="M5 19.5c1.4-3.2 4-4.6 7-4.6s5.6 1.4 7 4.6"/></svg>'],
  feat: ['#34C759', '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="12" rx="6"/><circle cx="15" cy="12" r="3.5"/></svg>'],
  tabs: ['#8E8E93', '<svg viewBox="0 0 24 24"><rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M3.5 15.5h17M9.2 15.5v4M14.8 15.5v4"/></svg>'],
  stats: ['#007AFF', '<svg viewBox="0 0 24 24"><path d="M5 20v-6M10 20V9M15 20v-8M20 20V5"/></svg>'],
  week: ['#FF9500', '<svg viewBox="0 0 24 24"><rect x="4" y="5.5" width="16" height="14" rx="2.5"/><path d="M4 10h16M9 3.5v4M15 3.5v4"/></svg>'],
  notif: ['#FF3B30', '<svg viewBox="0 0 24 24"><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/></svg>'],
  look: ['#5856D6', '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 0 0 16z" fill="#fff"/></svg>'],
  data: ['#34C759', '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="6" rx="7" ry="2.6"/><path d="M5 6v12c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6V6M5 12c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6"/></svg>'],
};
// Страницы, которых нет в режиме «Только инструменты»
const PLAIN_HIDE = ['stats', 'week', 'notif'];
const HEART = '<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>';
const VERSION = '0.0.1';

/* ---------- статистика ---------- */

function barsSVG(vals, labels, goalLine, hl, aria) {
  const W = 320, H = 120, n = vals.length, bw = Math.min(30, (W - 8 * (n - 1)) / n), gap = (W - n * bw) / (n - 1);
  const top = Math.max(...vals, goalLine || 0, 1);
  let s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + (H + 18) + '" role="img" aria-label="' + esc(aria) + '">';
  for (let i = 0; i <= 2; i++) { const y = H - ((H - 6) * i) / 2; s += '<line x1="0" x2="' + W + '" y1="' + y + '" y2="' + y + '" stroke="var(--sep)"/>'; }
  if (goalLine) { const gy = H - (goalLine / top) * (H - 6); s += '<line x1="0" x2="' + W + '" y1="' + gy + '" y2="' + gy + '" stroke="var(--l2)" stroke-dasharray="3 4"/>'; }
  vals.forEach((v, i) => {
    const bh = v ? Math.max(4, (v / top) * (H - 6)) : 0, x = i * (bw + gap);
    s += '<rect x="' + x + '" y="' + (H - bh) + '" width="' + bw + '" height="' + bh + '" rx="' + Math.min(5, bw / 2) + '" fill="' + (hl === undefined || hl === i ? 'var(--tint)' : 'var(--l3)') + '"/><text x="' + (x + bw / 2) + '" y="' + (H + 15) + '" text-anchor="middle">' + esc(labels[i]) + '</text>';
  });
  return s + '</svg>';
}

const hbars = (arr) => {
  const mx = Math.max(...arr.map((x) => x.v), 1);
  return '<div style="margin-top:6px">' + arr.map((x) => '<div class="hrow"><span class="n">' + esc(x.n) + '</span><span class="hb"><i style="width:' + (x.v / mx) * 100 + '%"></i></span><span class="num l2" style="font-size:14px">' + fmtDur(x.v) + '</span></div>').join('') + '</div>';
};
const card = (title, right, body) => '<div class="card"><div class="ch"><span>' + title + '</span><span>' + right + '</span></div>' + body + '</div>';
const ddmm = (ts) => { const d = new Date(ts); return d.getDate() + '.' + String(d.getMonth() + 1).padStart(2, '0'); };

function statsHTML(app) {
  const all = app.store.sessions(), st = app.store.state.settings, now = Date.now();
  let h = '<div class="large">' + t('stats.title') + '</div>';
  if (!all.length) return h + '<div class="empty"><b>' + t('stats.emptyTitle') + '</b>' + t('stats.emptyText') + '<br><button class="btn fill" data-go="home">' + t('stats.toPractice') + '</button></div>';
  const w = weekData(all, now), m = monthSplit(all, now), goal = st.goalMin * 60, pw = goalProgress(w.total, st), sk = streakInfo(all, st, now);
  h += '<div class="tiles num"><div class="tile"><b>' + fmtDur(w.total) + '</b><span>' + t('stats.week') + '</span></div><div class="tile"><b>' + fmtDur(m.total) + '</b><span>' + t('stats.month') +
    '</span></div><div class="tile"><b>' + fmtDur(totalTime(all)) + '</b><span>' + t('stats.total') + '</span></div></div><div class="sgrid">';
  h += card(t('stats.thisWeek'), t('streak.goal', { goal: fmtDur(goal) }), '<div class="wkhead">' + goalRing(pw, true, t('home.ringAria', { p: Math.round(pw * 100) })) + '<div><div class="cv num" style="margin:0">' + fmtDur(w.total) +
    '</div><div class="l2" style="font-size:14px">' + (pw > 1 ? t('stats.over', { p: Math.round((pw - 1) * 100) }) : pw >= 1 ? t('stats.met') : t('stats.left', { d: fmtDur(goal - w.total) })) + '</div>' +
    (isOn(st, 'streak') ? '<button class="spill" data-act="streak" style="margin-top:6px">' + FLAME + '<b class="num">' + sk.weeks + '</b><span>' + esc(t('streak.inRowShort', { w: tn('streak.weeksWord', sk.weeks) })) + '</span></button>' : '') +
    '</div></div>' + barsSVG(w.per, weekdays(), goalPerDay(st), weekday(now), t('stats.byDayAria')));
  // Строгие часы — только при включённом экране; всегда золотые
  const sAll = strictTime(all), sWeek = strictTime(all, weekStart(now)), tot = totalTime(all);
  if (sAll || trackMode(st) === 'strict') {
    h += card('<span class="gold">' + t('track.strictCard') + '</span>', t('track.mode.' + trackMode(st)),
      '<div class="cv num gold">' + fmtDur(sAll) + '</div><div class="l2" style="font-size:14px">' + t('track.strictWeek', { d: fmtDur(sWeek), p: tot ? Math.round((sAll / tot) * 100) : 0 }) + '</div>' +
      '<div class="split"><i style="width:' + (tot ? (sAll / tot) * 100 : 0) + '%;background:var(--gold)"></i><i style="flex:1;background:var(--l3)"></i></div>' +
      '<div class="legend"><span><i style="background:var(--gold)"></i>' + t('track.strict', { d: fmtDur(sAll) }) + '</span><span><i style="background:var(--l3)"></i>' + t('track.normal', { d: fmtDur(tot - sAll) }) + '</span></div>');
  }
  const hm = heatmap(all, now), loc = getLang() === 'en' ? 'en-GB' : getLang() === 'uz' ? 'uz-Latn' : 'ru-RU';
  h += card(t('stats.12w'), tn('stats.activeDays', hm.active), '<div class="heat" role="img" aria-label="' + t('stats.heatAria') + '">' + hm.cells.map((c) =>
    '<i title="' + esc(new Date(c.t).toLocaleDateString(loc) + ': ' + (c.v ? fmtDur(c.v) : t('stats.none'))) + '" style="' + (c.future ? 'opacity:.35;' : '') +
    (c.v ? 'background:color-mix(in srgb,var(--tint) ' + Math.round(c.level * 100) + '%,var(--fill))' : '') + '"></i>').join('') + '</div>');
  const wk = weeklyTotals(all, now);
  h += card(t('stats.byWeek'), t('stats.avg', { d: fmtDur(wk.avg) }), barsSVG(wk.weeks.map((x) => x.v), wk.weeks.map((x) => ddmm(x.a)), goal, 7, t('stats.byWeekAria')));
  const pc = (v) => (m.total ? (v / m.total) * 100 : 0);
  h += card(t('stats.thisMonth'), fmtDur(m.total), '<div class="split"><i style="width:' + pc(m.free) + '%;background:var(--ink)"></i><i style="width:' + pc(m.songs) + '%;background:var(--tint)"></i><i style="flex:1;background:#5856D6"></i></div>' +
    '<div class="legend"><span><i style="background:var(--ink)"></i>' + t('stats.free', { d: fmtDur(m.free) }) + '</span><span><i style="background:var(--tint)"></i>' + t('stats.songs', { d: fmtDur(m.songs) }) +
    '</span><span><i style="background:#5856D6"></i>' + t('stats.tools', { d: fmtDur(m.tool) }) + '</span></div>');
  // Модуль могли выключить или убрать — тогда название из строк ядра (tool.<id>), иначе id
  const toolName = (id) => (moduleById(id) ? moduleName(moduleById(id)) : t('tool.' + id) !== 'tool.' + id ? t('tool.' + id) : id);
  const tools = byTool(all).map((x) => ({ n: toolName(x.n), v: x.v }));
  if (tools.length) h += card(t('stats.toolsTitle'), t('stats.total'), hbars(tools));
  const songs = app.store.songs(), byS = bySong(all, songs).map((x) => ({ n: songs.find((s) => s.id === x.n).title, v: x.v }));
  if (byS.length) h += card(t('stats.songsTitle'), t('stats.byTime'), hbars(byS));
  const g = bySongField(all, songs, 'genre').map((x) => ({ n: x.n || t('stats.noGenre'), v: x.v }));
  if (g.length) h += card(t('stats.genres'), '', hbars(g));
  const d = bySongField(all, songs, 'difficulty').map((x) => ({ n: x.n ? t('diff.' + x.n) : '—', v: x.v }));
  if (d.length) h += card(t('stats.difficulty'), '', hbars(d));
  const tags = byFreeTag(all).map((x) => ({ n: x.n ? freeTagName(x.n) : t('stats.noTag'), v: x.v }));
  if (tags.length) h += card(t('stats.freeTitle'), t('stats.byTag'), hbars(tags));
  return h + '</div>';
}

export { freeTagName };

/* ---------- страницы настроек ---------- */

const psw = (key, on, label) => '<label class="sw"><input type="checkbox" data-psw="' + key + '"' + (on ? ' checked' : '') + ' aria-label="' + esc(label) + '"><i></i></label>';

// Обо мне: имя, инструменты, уровень, опыт до приложения (то же, что при регистрации)
function meHTML(app) {
  const p = { ...newProfile(), ...(app.store.state.settings.profile || {}) };
  const chip = (attr, on, label) => '<button class="lchip pick mech' + (on ? ' on' : '') + '" ' + attr + ' aria-pressed="' + on + '" style="--c:var(--tint);--t:var(--on-tint)">' + esc(label) + '</button>';
  return '<div class="large">' + t('page.me') + '</div>' +
    '<div class="group"><label class="cell"><span class="grow">' + t('ob.name') + '</span><input class="inp" data-me="name" maxlength="40" placeholder="' + t('ob.namePh') + '" aria-label="' + t('ob.name') + '" value="' + esc(p.name) + '"></label></div>' +
    '<div class="hdr">' + t('ob.instTitle') + '</div><div class="group"><div class="cellcol"><div class="pickrow">' + INSTRUMENTS.map((k) => chip('data-meinst="' + k + '"', p.instruments.includes(k), t('inst.' + k))).join('') + '</div></div></div>' +
    '<div class="hdr">' + t('ob.levelTitle') + '</div><div class="group"><div class="cellcol">' + seg('melevel', LEVELS.map((k) => [k, t('level.' + k)]), p.level, t('ob.levelTitle')).replace('class="seg"', 'class="seg g2"') +
    '<div class="segcap">' + t('level.' + p.level + '.text') + '</div></div></div>' +
    '<div class="hdr">' + t('ob.expTitle') + '</div><div class="group"><label class="cell"><span class="grow">' + t('ob.hours') + '</span><input class="inp num" data-me="priorHours" type="number" inputmode="numeric" min="0" max="' + PRIOR_MAX + '" placeholder="0" aria-label="' + t('ob.hours') + '" value="' + (p.priorHours || '') + '"></label></div>' +
    '<p class="ftr">' + t('me.hint') + '</p>';
}

function weekHTML(app) {
  const st = app.store.state.settings, WD = weekdays();
  return '<div class="large">' + t('week.title') + '</div>' +
    '<div class="group"><div class="cell"><span class="grow">' + t('week.autoTrack') + '</span>' + psw('autoTrack', st.autoTrack !== false, t('week.autoTrack')) + '</div>' +
    '<div class="cell"><span class="grow">' + t('week.showClock') + '</span>' + psw('showClock', st.showClock !== false, t('week.showClock')) + '</div></div>' +
    '<p class="ftr">' + t('week.autoHint') + '</p>' +
    '<div class="hdr">' + t('track.title') + '</div><div class="group"><div class="cellcol">' + seg('track', [['normal', t('track.mode.normal')], ['strict', t('track.mode.strict')]], trackMode(st), t('track.title')) +
    '<div class="segcap">' + t('track.hint.' + trackMode(st)) + '</div></div></div><p class="ftr">' + t('track.hint') + '</p>' +
    '<div class="group"><div class="cell"><span class="grow">' + t('presence.title') + '</span>' + psw('micPresence', !!st.micPresence, t('presence.title')) + '</div></div>' +
    '<p class="ftr">' + t('presence.hint') + '</p>' +
    '<div class="hdr">' + t('week.days') + '</div><div class="group"><div class="cellcol"><div class="seg" role="group" aria-label="' + t('week.days') + '">' +
    WD.map((d, i) => '<button data-day="' + i + '" aria-pressed="' + !!st.days[i] + '">' + d + '</button>').join('') + '</div></div></div>' +
    '<p class="ftr">' + t('week.restHint') + '</p>' +
    '<div class="hdr">' + t('week.goal') + '</div><div class="group"><div class="cell"><span class="grow">' + t('week.perWeek') + '</span><span class="val num" style="color:var(--ink);margin-right:6px">' + fmtDur(st.goalMin * 60) +
    '</span><span class="stepper"><button data-goal="-30" aria-label="' + t('week.minus30') + '">−</button><button data-goal="30" aria-label="' + t('week.plus30') + '">+</button></span></div></div>';
}

// Уведомления: каждое выключается раз и навсегда
function notifHTML(app) {
  const st = app.store.state.settings;
  const row = (k, on) => '<div class="group"><div class="cell"><span class="grow">' + t('notif.' + k) + '</span>' + psw(k, on, t('notif.' + k)) + '</div></div><p class="ftr">' + t('notif.' + k + '.hint') + '</p>';
  return '<div class="large">' + t('page.notif') + '</div>' +
    row('askIdle', st.askIdle !== false) + row('noSoundNote', st.noSoundNote !== false) + row('rankNote', st.rankNote !== false);
}

function lookHTML(app) {
  const st = app.store.state.settings;
  return '<div class="large">' + t('look.title') + '</div>' +
    '<div class="hdr">' + t('look.lang') + '</div><div class="group"><div class="cellcol"><div class="seg uc" role="group" aria-label="' + t('look.lang') + '">' +
    LANGS.map((k) => '<button data-lang="' + k + '" lang="' + k + '" aria-pressed="' + (getLang() === k) + '">' + LANG_NAMES[k] + '</button>').join('') + '</div></div></div>' +
    '<div class="hdr">' + t('look.theme') + '</div><div class="group"><div class="cellcol">' + seg('theme', [['system', t('look.auto')], ['light', t('look.light')], ['dark', t('look.dark')]], st.theme, t('look.theme')) + '</div></div>' +
    // «Минимал» — экспериментальный вид интерфейса: чёрно-белый, без акцента и цветных тем
    '<div class="hdr">' + t('mono.title') + '</div><div class="group"><div class="cellcol">' + seg('uistyle', [['default', t('mono.default')], ['mono', t('mono.name')]], st.uiStyle === 'mono' ? 'mono' : 'default', t('mono.title')) +
    '<div class="segcap">' + t('mono.hint') + '</div></div></div>' +
    (st.uiStyle === 'mono' ? '' : '<div class="hdr">' + t('look.style') + '</div><div class="skins">' + [['paper', t('look.paper'), '#F4EFE6', '#2B2620'], ['oled', 'OLED', '#000', '#fff']].map(([k, n, bg, fg]) =>
      '<button class="skin' + (st.theme === k ? ' on' : '') + '" data-skin="' + k + '" aria-pressed="' + (st.theme === k) + '" style="background:' + bg + ';color:' + fg + '">' + n + '</button>').join('') + '</div>') +
    (st.uiStyle === 'mono' ? '' :
    '<div class="hdr">' + t('look.accent') + '</div><div class="group"><div class="cellcol"><div class="swgrid">' + ACCENTS.map(([k, c]) =>
      '<button class="swc' + ((st.accent || 'orange') === k ? ' on' : '') + '" data-acc="' + k + '" aria-pressed="' + ((st.accent || 'orange') === k) + '" style="background:' + c + '" aria-label="' + esc(t('look.accentAria', { c: t('accent.' + k) })) + '"></button>').join('') + '</div></div></div>') +
    '<div class="hdr">' + t('look.scale') + '</div><div class="group"><div class="cellcol">' + seg('scale', [['5', '1–5'], ['10', '1–10'], ['100', '%']], String(scaleOf(st)), t('look.scale')) + '</div><div class="cell center" style="gap:12px">' +
    [20, 60, 100].map((p) => mBadge(p, st)).join('') + '</div></div><p class="ftr">' + t('look.scaleHint') + '</p>';
}

function dataHTML() {
  return '<div class="large">' + t('data.title') + '</div><div class="group"><button class="cell act" data-act="export">' + t('data.export') + '</button><button class="cell act" data-act="import">' + t('data.import') + '</button></div>' +
    '<p class="ftr">' + t('data.hint') + '</p>' +
    '<div class="group" style="margin-top:28px"><button class="cell danger center" data-act="reset">' + t('data.reset') + '</button></div>';
}

// Модули (встроенные и личные из src/modules-local) и функции ядра: включить и выключить
function featHTML(app) {
  const st = app.store.state.settings, lang = getLang();
  const row = (id, icon, color, name, about, extra = '') => '<div class="cell"><span class="ticon" style="background:' + color + '">' + icon + '</span><span class="grow"><span>' + esc(name) + extra +
    '</span>' + (about ? '<span class="st l2" style="display:block;font-size:13px">' + esc(about) + '</span>' : '') + '</span>' +
    '<label class="sw"><input type="checkbox" data-feat="' + id + '"' + (isOn(st, id) ? ' checked' : '') + ' aria-label="' + esc(name) + '"><i></i></label></div>';
  const aboutOf = (m) => (m.i18n?.[lang]?.about ?? m.i18n?.ru?.about ?? (m.about && (m.about[lang] || m.about.ru)) ?? '');
  return '<div class="large">' + t('feat.title') + '</div><p class="sub" style="margin:0 4px 12px">' + t('feat.hint') + '</p>' +
    '<div class="group"><div class="cell"><span class="grow">' + t('feat.toolsOnly') + '</span>' + psw('toolsOnly', !!st.toolsOnly, t('feat.toolsOnly')) + '</div></div>' +
    '<p class="ftr">' + t('feat.toolsOnly.hint') + '</p>' +
    '<div class="hdr">' + t('feat.modules') + '</div><div class="group">' +
    modules.map((m) => row(m.id, m.icon, m.color || '#8E8E93', moduleName(m), aboutOf(m), m.local ? ' <span class="lchip sm off">' + t('feat.local') + '</span>' : '')).join('') + '</div>' +
    // в режиме «Только инструменты» функции ядра (ударный режим, значок) и так выключены — переключатели не нужны
    (st.toolsOnly ? '' : '<div class="hdr">' + t('feat.core') + '</div><div class="group">' + CORE_FEATURES.map((k) => row(k, k === 'mastery' ? gemSVG('sapphire', 1, 22) : FLAME, k === 'mastery' ? '#5856D6' : '#FF9500', t('feat.' + k), t('feat.about.' + k))).join('') + '</div>') +
    '<p class="ftr">' + t('feat.own') + '</p>' +
    (skippedModules.length ? '<p class="ftr" style="color:var(--red)">' + esc(t('feat.skipped', { list: skippedModules.map((x) => x.path.split('/').slice(-2, -1)[0] + ' (' + x.err + ')').join(', ') })) + '</p>' : '');
}

// Вкладки внизу: порядок и состав
function tabsHTML(app) {
  const st = app.store.state.settings, vis = visibleTabs(st, TAB_IDS), hid = hiddenTabs(st, TAB_IDS);
  const row = (k, on, i) => '<div class="cell"><span class="ticon" style="background:var(--tint)">' + TAB_ICONS[k] + '</span><span class="grow">' + t('nav.' + k) + '</span>' +
    (on ? (i > 0 ? '<button class="ic sm plain" data-tabmv="up" data-tab-id="' + k + '" aria-label="' + esc(t('tabs.up', { name: t('nav.' + k) })) + '">' + IC.up + '</button>' : '') +
      (vis.length > 1 ? '<button class="ic sm plain" data-tabmv="off" data-tab-id="' + k + '" aria-label="' + esc(t('tabs.off', { name: t('nav.' + k) })) + '" style="color:var(--red)">' + IC.minus + '</button>' : '')
      : '<button class="ic sm plain" data-tabmv="on" data-tab-id="' + k + '" aria-label="' + esc(t('tabs.on', { name: t('nav.' + k) })) + '" style="color:#34C759">' + IC.plus + '</button>') + '</div>';
  return '<div class="large">' + t('tabs.title') + '</div>' +
    '<div class="hdr">' + t('tabs.shown') + '</div><div class="group">' + vis.map((k, i) => row(k, true, i)).join('') + '</div>' +
    (hid.length ? '<div class="hdr">' + t('tabs.hidden') + '</div><div class="group">' + hid.map((k) => row(k, false)).join('') + '</div>' : '') +
    '<p class="ftr">' + t('tabs.hint') + '</p>';
}

function rootHTML(app) {
  const all = app.store.sessions(), n = app.store.songs().length, weeks = streakInfo(all, app.store.state.settings).weeks;
  const pr = app.store.state.settings.profile || {}, sub = (pr.instruments || []).map((k) => t('inst.' + k)).join(', ');
  // Вместо аватара — значок звания (весь опыт: до приложения и в приложении); нажатие — подробности.
  // «Только инструменты»: ни звания, ни итогов — обычный аватар, и в списке нет статистики, недели, уведомлений
  const plain = !!app.store.state.settings.toolsOnly;
  const r = rankOf(lifetimeSec(all, app.store.state.settings) / 3600), rn = rankName(r.id, r.level);
  return '<div class="phero">' + (plain ? '<div class="pav">' + AVATAR + '</div>' : '<button class="prank" data-act="rank" style="--rk:' + RANK_COLORS[r.id] + '" aria-label="' + esc(t('rank.aria', { name: rn })) + '">' + rankSVG(r.id, r.level, 88) + '</button>') +
    '<div class="large" style="margin:12px 0 0;text-align:center">' + esc(pr.name || t('panel.title')) + '</div>' +
    (plain ? '' : '<button class="prname" data-act="rank" style="--rk:' + RANK_COLORS[r.id] + '">' + esc(rn) + '</button>') +
    (sub ? '<div class="l2" style="text-align:center;font-size:15px">' + esc(sub) + (pr.level ? ' · ' + t('level.' + pr.level) : '') + '</div>' : '') + '</div>' +
    (plain ? '' : '<div class="tiles num"><div class="tile"><b>' + fmtDur(lifetimeSec(all, app.store.state.settings)) + '</b><span>' + t('panel.total') + '</span></div><div class="tile"><b>' + n + '</b><span>' + tn('panel.songsWord', n) + '</span></div>' +
    '<button class="tile stile" data-act="streak"><b>' + FLAME + weeks + '</b><span>' + esc(t('streak.inRowShort', { w: tn('streak.weeksWord', weeks) })) + '</span></button></div>') +
    '<div class="group" style="margin-top:20px">' + Object.entries(PAGES).filter(([k]) => !plain || !PLAIN_HIDE.includes(k)).map(([k, [c, ic]]) => '<button class="cell" data-pp="' + k + '"><span class="ticon" style="background:' + c + '">' + ic + '</span><span class="grow">' + t('page.' + k) + '<span class="psub">' + t('page.' + k + '.sub') + '</span></span>' + CHEV + '</button>').join('') + '</div>' +
    '<div class="group" style="margin-top:20px"><button class="cell" data-act="donate"><span class="ticon" style="background:#FF2D55">' + HEART + '</span><span class="grow">' + t('panel.donate') + '</span>' + CHEV + '</button></div>' +
    '<div class="group" style="margin-top:12px">' + ['tos', 'priv', 'lic'].map((k) => '<button class="cell" data-act="legal" data-v="' + k + '"><span class="grow">' + t('legal.' + k) + '</span>' + CHEV + '</button>').join('') + '</div>' +
    '<div class="about"><b>Practice</b> · ' + t('panel.version', { v: VERSION }) + '<br>' + t('panel.author') + '<br>' + t('panel.madeWith') + '</div>';
}

/* ---------- панель ---------- */

// Полноэкранная панель профиля; page — 'root' или ключ PAGES
export function createPanel(app, onChange) {
  let page = null, layer = null, input = null;
  const render = () => {
    if (!page) { if (layer) { layer.remove(); layer = null; } return; }
    if (!layer) {
      layer = document.createElement('div');
      layer.id = 'panelLayer';
      layer.className = 'panel';
      layer.setAttribute('role', 'dialog');
      layer.setAttribute('aria-modal', 'true');
      layer.setAttribute('aria-label', t('panel.aria'));
      document.body.appendChild(layer);
      bind();
    }
    const sub = page !== 'root', y = layer.scrollTop;
    const body = { root: rootHTML, me: meHTML, stats: statsHTML, week: weekHTML, look: lookHTML, notif: notifHTML, data: dataHTML, feat: featHTML, tabs: tabsHTML }[page](app);
    layer.innerHTML = '<div class="wrap" style="padding-bottom:40px"><div class="navrow">' + (sub ? '<button class="link" data-pp="root">' + BACK + t('panel.back') + '</button>' : '<span></span>') +
      '<button class="link b" data-act="pclose">' + t('ui.done') + '</button></div>' + body + '</div>';
    layer.scrollTop = y;
  };
  const changed = () => { app.store.settingsChanged(); render(); onChange(); };
  function bind() {
    layer.addEventListener('click', (e) => {
      const g = (s) => e.target.closest(s);
      let b;
      if ((b = g('[data-pp]'))) { page = b.dataset.pp; render(); layer.scrollTop = 0; return; }
      if (g('[data-act="pclose"]')) { panel.close(); return; }
      if ((b = g('[data-tabmv]'))) { if (editTabs(app.store, TAB_IDS, b.dataset.tabId, b.dataset.tabmv)) { render(); onChange(); } return; }
      if ((b = g('[data-day]'))) { toggleDay(app.store, +b.dataset.day); render(); onChange(); return; }
      if ((b = g('[data-goal]'))) { changeGoal(app.store, +b.dataset.goal); render(); onChange(); return; }
      if ((b = g('[data-seg="theme"] [data-v]'))) { app.store.state.settings.theme = b.dataset.v; applyTheme(app.store.state.settings); changed(); return; }
      if ((b = g('[data-seg="uistyle"] [data-v]'))) { app.store.state.settings.uiStyle = b.dataset.v === 'mono' ? 'mono' : 'default'; applyTheme(app.store.state.settings); changed(); return; }
      if ((b = g('[data-skin]'))) { const st = app.store.state.settings; st.theme = st.theme === b.dataset.skin ? 'system' : b.dataset.skin; applyTheme(st); changed(); return; }
      if ((b = g('[data-acc]'))) { app.store.state.settings.accent = b.dataset.acc; applyTheme(app.store.state.settings); changed(); return; }
      if ((b = g('[data-meinst]'))) {
        const p = { ...newProfile(), ...(app.store.state.settings.profile || {}) }, k = b.dataset.meinst;
        p.instruments = p.instruments.includes(k) ? p.instruments.filter((x) => x !== k) : [...p.instruments, k];
        saveProfile(app.store, p); render(); onChange(); return;
      }
      if ((b = g('[data-seg="melevel"] [data-v]'))) { saveProfile(app.store, { ...newProfile(), ...(app.store.state.settings.profile || {}), level: b.dataset.v }); render(); onChange(); return; }
      if ((b = g('[data-seg="track"] [data-v]'))) { app.store.state.settings.trackMode = b.dataset.v; changed(); return; }
      if ((b = g('[data-seg="scale"] [data-v]'))) { app.store.state.settings.scale = b.dataset.v; changed(); return; }
      if ((b = g('[data-lang]'))) { app.store.state.settings.lang = b.dataset.lang; app.store.settingsChanged(); setTimeout(() => location.reload(), 150); return; }
      if (g('[data-act="export"]')) { exportBackup(app); return; }
      if (g('[data-act="import"]')) { input.click(); return; }
      if (g('[data-act="reset"]')) {
        confirm(t('data.resetTitle'), t('data.resetText'), t('data.resetYes')).then((ok) => {
          if (!ok) return;
          app.store.reset();
          applyTheme(app.store.state.settings);
          render();
          onChange();
          toast(t('data.resetDone'));
        });
        return;
      }
      if ((b = g('[data-go]'))) { panel.close(); app.go(b.dataset.go); return; }
      app.shellAct(e); // общие действия: ударный режим, поддержать, правовые тексты
    });
    layer.addEventListener('change', (e) => {
      const d = e.target.dataset;
      if (d.feat) { setFeature(app.store, d.feat, e.target.checked); onChange(); return; }
      if (d.psw) { app.store.state.settings[d.psw] = e.target.checked; app.store.settingsChanged(); if (d.psw === 'toolsOnly') { render(); onChange(); } }
      if (d.me) { saveProfile(app.store, { ...newProfile(), ...(app.store.state.settings.profile || {}), [d.me]: e.target.value }); onChange(); }
    });
  }
  // Выбор файла копии живёт вне панели: панель перерисовывается целиком
  input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.hidden = true;
  input.addEventListener('change', () => importBackup(app, input, () => { applyTheme(app.store.state.settings); render(); onChange(); }));
  document.body.appendChild(input);
  const onKey = (e) => { if (e.key === 'Escape' && page && !document.querySelector('#sheetLayer .scrim, .ask')) panel.close(); };
  document.addEventListener('keydown', onKey);
  const panel = {
    open(p = 'root') { page = p; render(); if (layer) layer.scrollTop = 0; },
    close() { page = null; render(); },
    refresh() { if (page) render(); },
    get page() { return page; },
  };
  return panel;
}

/* ---------- резервная копия ---------- */

function exportBackup(app) {
  const name = 'practice-backup-' + dayKey(Date.now()) + '.json';
  const url = URL.createObjectURL(new Blob([app.store.exportBackup()], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(t('data.saved'));
}

function importBackup(app, input, done) {
  const f = input.files[0];
  input.value = '';
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const n = app.store.importBackup(JSON.parse(r.result));
      done();
      toast(tn('data.imported', n));
    } catch { toast(t('data.notBackup')); }
  };
  r.readAsText(f);
}

/* ---------- поддержать, правовые тексты, соглашение ---------- */

export function donateSheet() {
  sheet(() => snav(t('donate.title')) + '<div class="prohero"><div class="pav" style="color:#FF2D55">' + HEART.replace('<svg', '<svg style="width:40px;height:40px;fill:currentColor"') + '</div><p class="l2" style="text-align:center;margin:10px 16px 0">' + t('donate.text') + '</p></div>' +
    '<div class="dongrid">' + [['1 $', 'coffee'], ['3 $', 'strings'], ['5 $', 'pick']].map(([a, k]) => '<button class="donb" data-don="' + a + '"><b>' + a + '</b><span>' + t('donate.' + k) + '</span></button>').join('') +
    '</div><p class="ftr" style="text-align:center">' + t('donate.later') + '</p>',
  (el) => el.addEventListener('click', (e) => { if (e.target.closest('[data-don]')) toast(t('donate.thanks')); }));
}

const ruOnly = () => (getLang() === 'ru' ? '' : '<p class="ftr">' + t('legal.ruOnly') + '</p>');

export function legalSheet(kind) {
  let body;
  if (kind === 'priv') body = snav(t('legal.privShort')) + ruOnly() + '<div class="legal" lang="ru"><h2>Политика конфиденциальности</h2>' + PRIV_HTML + '</div>';
  else if (kind === 'tos') body = snav(t('legal.tosShort')) + ruOnly() + '<div class="legal" lang="ru"><h2>Пользовательское соглашение</h2>' + TOS_HTML + '</div>';
  else {
    const lic = (title, sub, text) => '<div class="lic"><h3>' + title + '</h3><p class="l2">' + sub + '</p>' + text + '</div>';
    body = snav(t('legal.lic')) + '<div class="legal"><p>' + t('lic.intro') + '</p>' +
      lic('alphaTab', t('lic.at.sub'), '<p>© CoderLine (Daniel Kuschny) ' + t('lic.andContrib') + '</p><p>' + t('lic.at.text') + '</p><p>' + t('lic.at.inner') + '</p>') +
      lic('Bravura', t('lic.brav.sub'), '<p>Copyright © 2013, Steinberg Media Technologies GmbH (http://www.steinberg.net/), with Reserved Font Name "Bravura".</p><p>This Font Software is licensed under the SIL Open Font License, Version 1.1.</p><pre>' + esc(OFL_TEXT) + '</pre>') +
      lic('SONiVOX EAS', t('lic.sv.sub'), '<p>' + t('lic.sv.text') + '</p>') +
      lic('Comfortaa', t('lic.cg.sub'), '<p>Copyright 2011 The Comfortaa Project Authors (github.com/alexeiva/comfortaa), with Reserved Font Name "Comfortaa".</p><p>' + t('lic.cg.text') + '</p>') +
      lic('Onest', t('lic.onest.sub'), '<p>Copyright 2023 The Onest Project Authors (github.com/simpals/onest).</p><p>' + t('lic.cg.text') + '</p>') +
      lic('pdf.js', t('lic.pdf.sub'), '<p>© Mozilla Foundation ' + t('lic.andContrib') + '</p><p>' + t('lic.pdf.text') + '</p>') +
      lic('Capacitor', t('lic.cap.sub'), '<p>© Ionic ' + t('lic.andContrib') + '</p><p>' + t('lic.cap.text') + '</p>') +
      '<div class="lic"><h3>' + t('lic.snd.title') + '</h3><p>' + t('lic.snd.text') + '</p></div></div>';
  }
  sheet(() => body);
}

// Соглашение при первом запуске (и при смене редакции)
// then() — после согласия (или сразу, если оно уже дано): дальше регистрация
export function tosGate(app, then = () => {}) {
  const st = app.store.state.settings;
  if (document.getElementById('tosGate')) return;
  if (st.tosOk === TOS_VER) { then(); return; }
  const l = document.createElement('div');
  l.id = 'tosGate';
  l.className = 'ask';
  l.style.zIndex = '39';
  l.innerHTML = '<div class="askbox tosbox" role="dialog" aria-modal="true" aria-label="' + esc(t('legal.tos')) + '"><h2>' + t('tos.title') + '</h2><p>' + t('tos.p1') + '</p><p>' + t('tos.p2') + '</p>' +
    '<button class="link" data-tos-read style="font-size:15px">' + t('tos.read') + '</button><button class="btn fill block" data-tos-ok style="margin-top:12px">' + t('tos.ok') + '</button></div>';
  document.body.appendChild(l);
  l.addEventListener('click', (e) => {
    if (e.target.closest('[data-tos-read]')) legalSheet('tos');
    else if (e.target.closest('[data-tos-ok]')) { st.tosOk = TOS_VER; app.store.settingsChanged(); l.remove(); then(); }
  });
}

