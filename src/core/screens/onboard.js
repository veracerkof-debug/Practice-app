// Первый запуск (решение автора, 2026-10 — меньше текста): стартовый экран (Melete, стих, язык) и регистрация одним
// экраном — колесо часов: сколько уже сыграно. По часам — уровень, цель недели и набор инструментов; там же — загрузка
// своих данных. Всё остальное — по умолчанию (Мелетий, классические напоминания, церковный режим, демо-набор);
// имя Мелетий спрашивает уже на главной (askName). Соглашение — в настройках («О Melete»).
import '../../ui/onboard.css';
import { t, getLang, LANGS, LANG_NAMES, initI18n } from '../../i18n/index.js';
import { esc, toast } from '../../ui/index.js';
import { PRIOR_MAX, GOAL_BY_LEVEL, newProfile, saveProfile, applyLevelDefaults, toolsFor, levelByHours } from '../profile.js';
import { modules, moduleById } from '../../modules/index.js';
import { logoHTML } from '../../ui/logo.js';
import { setRemind, remindOf, remindAvailable, remindPermission } from '../reminders.js';
import { mascotSVG } from '../../ui/mascot.js';
import { hasMascot } from '../../i18n/index.js';
import { TOS_VER } from '../legal.js';

/* ---------- колесо часов ---------- */
// Положение на круге 0…1 → часы: сначала мелко (первые сотни часов важнее), к концу — крупно, до 20 000
const HMAX = 20000;
const snap = (h) => (h < 100 ? Math.round(h / 5) * 5 : h < 1000 ? Math.round(h / 25) * 25 : h < 5000 ? Math.round(h / 100) * 100 : Math.round(h / 500) * 500);
export const wheelHours = (f) => snap(Math.pow(Math.max(0, Math.min(1, f)), 2.6) * HMAX);
const wheelFrac = (h) => Math.pow(Math.max(0, Math.min(HMAX, h)) / HMAX, 1 / 2.6);
const ARC = 0.86; // колесо — не полный круг: внизу просвет
const fmtH = (h) => new Intl.NumberFormat(getLang() === 'en' ? 'en' : 'ru').format(h);
function wheelSVG(f) {
  const R = 118, C = 140, a0 = Math.PI / 2 + Math.PI * (1 - ARC), span = 2 * Math.PI * ARC;
  const pt = (x, r = R) => [C + r * Math.cos(a0 + span * x), C + r * Math.sin(a0 + span * x)];
  const arc = (x) => { const [sx, sy] = pt(0), [ex, ey] = pt(x); return 'M' + sx.toFixed(1) + ' ' + sy.toFixed(1) + 'A' + R + ' ' + R + ' 0 ' + (span * x > Math.PI ? 1 : 0) + ' 1 ' + ex.toFixed(1) + ' ' + ey.toFixed(1); };
  // деления: по часам 10, 100, 1000, 5000, 10 000 — подписи; мелкие — между
  const ticks = Array.from({ length: 49 }, (_, i) => { const x = i / 48, [x1, y1] = pt(x, R + 14), [x2, y2] = pt(x, R + (i % 6 ? 18 : 22)); return '<line x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) + '"/>'; }).join('');
  const [kx, ky] = pt(f);
  return '<svg class="whsvg" viewBox="0 0 280 280" aria-hidden="true"><g class="whticks">' + ticks + '</g>' +
    '<path class="whtrack" d="' + arc(1) + '"/>' + (f > 0.002 ? '<path class="whfill" d="' + arc(f) + '"/>' : '') +
    '<circle class="whknob" cx="' + kx.toFixed(1) + '" cy="' + ky.toFixed(1) + '" r="15"/></svg>';
}

export function onboarding(app, done = () => {}) {
  if (document.getElementById('onboard')) return;
  const st = app.store.state.settings;
  const p = { ...newProfile(), ...(st.profile || {}) };
  // по умолчанию: классические напоминания, Мелетий, церковный режим
  if (!st.remind) setRemind(st, { mode: 'classic' });
  if (!st.mascot) st.mascot = 'm';
  if (st.church == null) st.church = true;
  const allIds = modules.map((m) => m.id);
  let f = wheelFrac(+p.priorHours || 0);
  const layer = document.createElement('div');
  layer.id = 'onboard';
  layer.className = 'onb';
  layer.setAttribute('role', 'dialog');
  layer.setAttribute('aria-modal', 'true');
  layer.setAttribute('aria-label', t('ob.aria'));
  document.body.appendChild(layer);

  const hours = () => wheelHours(f);
  const toolsRow = (lvl) => toolsFor(lvl, p.instruments, allIds).map(moduleById).filter((m) => m && !m.tab && !m.inner)
    .map((m) => '<span class="whtool" style="--c:' + m.color + ';--on:' + (m.on || '#fff') + '" title="' + esc(m.name && (m.name[getLang()] || m.name.ru) || m.id) + '">' + m.icon + '</span>').join('');
  const live = () => {
    const h = hours(), lvl = levelByHours(h);
    layer.querySelector('.whwrap').innerHTML = wheelSVG(f) + '<div class="whmid"><b class="num">' + fmtH(h) + '</b><span>' + t('ob.hoursUnit') + '</span><em>' + t('level.' + lvl) + '</em></div>';
    layer.querySelector('.whtools').innerHTML = toolsRow(lvl);
    const s = layer.querySelector('[role="slider"]');
    s.setAttribute('aria-valuenow', h); s.setAttribute('aria-valuetext', fmtH(h) + ' ' + t('ob.hoursUnit') + ', ' + t('level.' + lvl));
  };
  layer.innerHTML = '<div class="obbody obwheel"><h1 class="obh">' + t('ob.wheelTitle') + '</h1>' +
    '<div class="whwrap" role="slider" tabindex="0" aria-label="' + esc(t('ob.wheelTitle')) + '" aria-valuemin="0" aria-valuemax="' + HMAX + '"></div>' +
    '<div class="whtools" aria-hidden="true"></div></div>' +
    '<div class="obfoot"><button type="button" class="btn fill block" data-obgo>' + t('ob.finish') + '</button>' +
    '<button type="button" class="link obimp" data-obimp>' + t('ob.import') + '</button></div>';
  live();

  // вращение пальцем: угол точки касания → положение на колесе
  const wrap = layer.querySelector('.whwrap');
  const fromPoint = (e) => {
    const r = wrap.getBoundingClientRect(), x = e.clientX - (r.left + r.width / 2), y = e.clientY - (r.top + r.height / 2);
    const a0 = Math.PI / 2 + Math.PI * (1 - ARC), span = 2 * Math.PI * ARC;
    let a = Math.atan2(y, x) - a0;
    while (a < 0) a += 2 * Math.PI;
    let nf = a / span;
    if (nf > 1) nf = nf - 1 > (2 * Math.PI / span - 1) / 2 ? 0 : 1; // просвет внизу — к ближайшему краю
    // без перескока через просвет с конца на начало и обратно
    if (Math.abs(nf - f) > 0.5) nf = f > 0.5 ? 1 : 0;
    const before = hours();
    f = nf;
    if (hours() !== before && navigator.vibrate && (hours() % 1000 === 0 || hours() < 100)) { try { navigator.vibrate(4); } catch { /* */ } }
    live();
  };
  let drag = false;
  wrap.addEventListener('pointerdown', (e) => { drag = true; wrap.setPointerCapture(e.pointerId); fromPoint(e); });
  wrap.addEventListener('pointermove', (e) => { if (drag) fromPoint(e); });
  wrap.addEventListener('pointerup', () => { drag = false; });
  wrap.addEventListener('pointercancel', () => { drag = false; });
  wrap.addEventListener('keydown', (e) => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 0.01 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -0.01 : 0;
    if (!d) return;
    e.preventDefault(); f = Math.max(0, Math.min(1, f + d)); live();
  });

  const finish = () => {
    const h = hours();
    p.priorHours = Math.min(PRIOR_MAX, h);
    p.level = levelByHours(h);
    saveProfile(app.store, p, { done: true });
    // по уровню — набор инструментов и цель недели
    const tools = toolsFor(p.level, p.instruments, allIds), off = st.off || (st.off = {});
    allIds.forEach((id) => { if (tools.includes(id)) delete off[id]; else off[id] = true; });
    st.goalMin = GOAL_BY_LEVEL[p.level];
    st.tosOk = TOS_VER; // соглашение — в настройках («О Melete»)
    app.store.settingsChanged();
    if (remindOf(st).mode !== 'quiet' && remindAvailable()) remindPermission().then((ok) => { if (!ok) toast(t('rem.denied')); });
    applyLevelDefaults(app.device, app.store.state.settings.profile);
    app.saveDevice();
    layer.remove();
    // демо-набор — сразу (песни, табы, ноты, записи, события); убрать — «Данные и копии»
    import('../demo.js').then((m) => m.addDemo(app, t)).then(() => app.render && app.render()).catch(() => {});
    done();
    setTimeout(() => askName(app), 700);
  };

  layer.addEventListener('click', (e) => {
    if (e.target.closest('[data-obgo]')) { finish(); return; }
    if (e.target.closest('[data-obimp]')) {
      // свои данные (файл от команды или собранный нейросетью): профиль из файла — сразу регистрация готова
      saveProfile(app.store, p);
      import('./share.js').then((m) => m.pickFile(app, () => {
        const q = app.store.state.settings.profile || {};
        if (q.priorHours != null) f = wheelFrac(+q.priorHours || 0);
        if (q.name) p.name = q.name;
        if (q.instruments) p.instruments = q.instruments.slice();
        live();
      }));
    }
  });
}

// После регистрации: маскот спрашивает, как обращаться (один раз; пропустить — тоже ответ)
export function askName(app) {
  const st = app.store.state.settings;
  if (!st.profile || st.profile.name || st.nameAsked || document.querySelector('.askname')) return;
  const d = document.createElement('div');
  d.className = 'askname';
  d.setAttribute('role', 'dialog');
  d.setAttribute('aria-label', t('ob.askName'));
  d.innerHTML = '<div class="anbox">' + (hasMascot() ? '<span class="anface">' + mascotSVG('glad', { size: 56 }) + '</span>' : '') +
    '<div class="anmain"><b>' + t('ob.askName') + '</b><input class="inp" maxlength="40" autocomplete="given-name" aria-label="' + esc(t('ob.askName')) + '">' +
    '<div class="anbtns"><button type="button" class="link" data-an="skip">' + t('ob.skip') + '</button><button type="button" class="btn fill" data-an="ok">' + t('ui.done') + '</button></div></div></div>';
  document.body.appendChild(d);
  const inp = d.querySelector('input');
  setTimeout(() => inp.focus(), 250);
  const close = (save) => {
    if (save && inp.value.trim()) saveProfile(app.store, { ...st.profile, name: inp.value.trim() });
    st.nameAsked = true;
    app.store.settingsChanged();
    d.classList.add('leaving');
    setTimeout(() => d.remove(), 220);
    if (save && inp.value.trim()) toast(t('ob.welcome', { name: inp.value.trim() }));
    app.render && app.render();
  };
  d.addEventListener('click', (e) => { const b = e.target.closest('[data-an]'); if (b) close(b.dataset.an === 'ok'); });
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') close(true); if (e.key === 'Escape') close(false); });
}

// Стартовый экран: Melete — компаньон в практике, стих, где встречается это слово, и выбор языка.
// Уже выбран язык (или есть профиль) — пропускается. Подробнее о приложении — «О Melete» в настройках
const VERSE_GR = 'Ταῦτα <b>μελέτα</b>, ἐν τούτοις ἴσθι';
const bold = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
export function startHTML() {
  const lang = getLang();
  return '<div class="wlbox wlstart"><div class="wllang" role="group" aria-label="' + esc(t('look.lang')) + '">' + LANGS.map((k) => '<button type="button" class="wllb' + (lang === k ? ' on' : '') + '" data-lg="' + k + '" lang="' + k + '" aria-pressed="' + (lang === k) + '">' + LANG_NAMES[k] + '</button>').join('') + '</div>' +
    '<div class="wlhero"><div class="wllogo">' + logoHTML() + '</div><h1 class="wlh">' + t('wel.tag') + '</h1></div>' +
    '<figure class="wlverse"><p class="wlgr" lang="grc">' + VERSE_GR + '</p><blockquote>' + bold(t('name.verse')) + '</blockquote><figcaption>' + esc(t('name.ref')) + '</figcaption></figure>' +
    '<button type="button" class="btn fill block" data-wlgo>' + t('wel.go') + '</button></div>';
}

// Подробно о Melete (настройки → «О Melete»): видение, бесплатность, ответственность, документы
export function welcomeHTML() {
  return '<div class="wlbox"><div class="wlhero">' + mascotSVG('glad', { size: 96 }) + '<div class="wllogo">' + logoHTML() + '</div><h1 class="wlh">' + t('wel.title') + '</h1></div>' +
    '<p class="wlp">' + t('wel.p1') + '</p><p class="wlp">' + t('wel.p2') + '</p><p class="wlp wlgood">' + t('wel.p3') + '</p>' +
    '<p class="wlp wllegal">' + t('wel.legal') + '</p>' +
    '<div class="wldocs">' + ['tos', 'priv', 'lic'].map((k) => '<button type="button" class="link" data-wldoc="' + k + '">' + t('legal.' + k) + '</button>').join('') + '</div></div>';
}

export function langGate(app, then = () => {}) {
  const st = app.store.state.settings;
  if (st.profile || st.lang) { then(); return; }
  initI18n(undefined); // язык системы — до выбора
  const l = document.createElement('div');
  l.className = 'onb langgate';
  l.setAttribute('role', 'dialog');
  l.setAttribute('aria-modal', 'true');
  const render = () => { l.innerHTML = startHTML(); l.setAttribute('aria-label', t('wel.tag')); };
  render();
  document.body.appendChild(l);
  l.addEventListener('click', (e) => {
    const b = e.target.closest('[data-lg]');
    if (b) { st.lang = b.dataset.lg; initI18n(st.lang); render(); return; }
    if (!e.target.closest('[data-wlgo]')) return;
    st.lang = st.lang || getLang();
    app.store.settingsChanged();
    initI18n(st.lang);
    l.remove();
    then();
  });
}
