// Регистрация при первом запуске: язык и имя, инструменты, уровень, набор инструментов приложения, опыт до приложения,
// цель недели и дни практики.
// Аккаунта нет: всё хранится на устройстве (settings.profile) и меняется потом в профиле.
import '../../ui/onboard.css';
import { t, getLang, LANGS, LANG_NAMES, initI18n } from '../../i18n/index.js';
import { esc, toast } from '../../ui/index.js';
import { fmtDur } from '../format.js';
import { GOAL_MIN, GOAL_MAX } from '../settings.js';
import { INSTRUMENTS, LEVELS, GOAL_BY_LEVEL, PRIOR_MAX, newProfile, saveProfile, applyLevelDefaults, estimateHours, toolsFor } from '../profile.js';
import { modules } from '../../modules/index.js';
import { moduleName } from '../modules.js';
import { logoHTML } from '../../ui/logo.js';
import { meleteHTML, bindMelete } from './melete.js';
import { remindOf, setRemind, remindAvailable, remindPermission } from '../reminders.js';
import { gemSVG } from '../../ui/gems.js';
import { mascotSVG } from '../../ui/mascot.js';
import { TOS_VER } from '../legal.js';
import { legalSheet } from './panel.js';
import { weekdays } from './common.js';

// Регистрация — коротко (решение автора): маскот и характер, имя, инструменты, уровень. Остальное — по умолчанию
// (цель и набор инструментов — по уровню, церковный режим, демо-набор) и меняется потом в настройках
const STEPS = ['melete', 'name', 'inst', 'level'];

// Карточки для выбора (инструменты, уровень)
const card = (attr, on, title, sub = '') => '<button type="button" class="obcard' + (on ? ' on' : '') + '" ' + attr + ' aria-pressed="' + on + '"><b>' + esc(title) + '</b>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</button>';

// Лига на старте — всегда «Камень»: опыт до приложения в лигу и статистику не идёт (решение автора)
const leagueBox = () => gemSVG('stone', 0, 64, t('gem.stone')) + '<div><b>' + esc(t('gem.stone')) + '</b><small>' + t('ob.leagueNote') + '</small></div>';

export function onboarding(app, done = () => {}) {
  if (document.getElementById('onboard')) return;
  const st = app.store.state.settings;
  const p = { ...newProfile(), ...(st.profile || {}) };
  // новому человеку — классические напоминания, Мелетий, церковный режим (наборы слов — классика, рок и джаз, Библия, христианские авторы)
  if (!st.remind) setRemind(st, { mode: 'classic' });
  if (!st.mascot) st.mascot = 'm';
  if (st.church == null) st.church = true;
  const f = { step: 0, years: 0, perWeek: 0, goalMin: st.goalMin, days: st.days.slice(), goalTouched: false, tools: null, toolsTouched: false };
  const allIds = modules.map((m) => m.id);
  const aboutOf = (m) => { const l = getLang(); return m.i18n?.[l]?.about ?? m.i18n?.ru?.about ?? ''; };
  const layer = document.createElement('div');
  layer.id = 'onboard';
  layer.className = 'onb';
  layer.setAttribute('role', 'dialog');
  layer.setAttribute('aria-modal', 'true');
  layer.setAttribute('aria-label', t('ob.aria'));
  document.body.appendChild(layer);

  const stepHTML = () => {
    const s = STEPS[f.step];
    if (s === 'name') {
      return '<h1 class="obh">' + t('ob.hello') + '</h1><p class="obp">' + t('ob.intro') + '</p>' +
        '<div class="hdr">' + t('ob.name') + '</div><div class="group"><label class="cell"><input class="inp left" id="obname" maxlength="40" autocomplete="given-name" placeholder="' + t('ob.namePh') + '" aria-label="' + t('ob.name') + '" value="' + esc(p.name) + '"></label></div>' +
        '<p class="ftr">' + t('ob.private') + '</p>' +
        // уже есть свои данные (файл от команды или собранный нейросетью) — сразу загрузить
        '<div class="hdr">' + t('ob.import') + '</div><div class="group"><button type="button" class="cell act" data-obimp="file">' + t('ai.load') + '</button>' +
        '<button type="button" class="cell act" data-obimp="ai">' + t('ai.title') + '</button></div><p class="ftr">' + t('ob.importHint') + '</p>';
    }
    if (s === 'inst') {
      return '<h1 class="obh">' + t('ob.instTitle') + '</h1><p class="obp">' + t('ob.instText') + '</p><div class="obgrid">' +
        INSTRUMENTS.map((k) => card('data-obinst="' + k + '"', p.instruments.includes(k), t('inst.' + k))).join('') + '</div>';
    }
    if (s === 'level') {
      return '<h1 class="obh">' + t('ob.levelTitle') + '</h1><p class="obp">' + t('ob.levelText') + '</p><div class="oblist">' +
        LEVELS.map((k) => card('data-oblevel="' + k + '"', p.level === k, t('level.' + k), t('level.' + k + '.text'))).join('') + '</div>';
    }
    // Мелета: характер напоминаний и маскота, время занятий, обращение, наборы слов
    if (s === 'melete') return '<h1 class="obh">' + t('ob.mascotTitle') + '</h1><p class="obp">' + t('ob.mascotText') + '</p>' + meleteHTML(st);
    return '';
  };

  const render = () => {
    const last = f.step === STEPS.length - 1;
    layer.innerHTML = '<div class="obtop">' + (f.step ? '<button type="button" class="link" data-obback>' + t('ui.back') + '</button>' : '<span></span>') +
      '<div class="obdots" role="progressbar" aria-valuemin="1" aria-valuemax="' + STEPS.length + '" aria-valuenow="' + (f.step + 1) + '" aria-label="' + t('ob.step', { n: f.step + 1, of: STEPS.length }) + '">' +
      STEPS.map((_, i) => '<i class="' + (i <= f.step ? 'on' : '') + '"></i>').join('') + '</div><span></span></div>' +
      '<div class="obbody">' + stepHTML() + '</div>' +
      '<div class="obfoot"><button type="button" class="btn fill block" data-obnext>' + t(last ? 'ob.finish' : 'ob.next') + '</button></div>';
    layer.querySelector('.obbody').scrollTop = 0;
  };

  // Поля ввода — в черновик (перед перерисовкой и переходом)
  const read = () => {
    const q = (id) => layer.querySelector('#' + id);
    if (q('obname')) p.name = q('obname').value;
    if (q('obhours')) p.priorHours = Math.max(0, Math.min(PRIOR_MAX, Math.round(+q('obhours').value || 0)));
    if (q('obyears')) f.years = Math.max(0, +q('obyears').value || 0);
    if (q('obweek')) f.perWeek = Math.max(0, +q('obweek').value || 0);
  };

  const finish = () => {
    // по уровню — набор инструментов и цель недели; дни — как есть (будни)
    f.tools = toolsFor(p.level, p.instruments, allIds);
    f.goalMin = GOAL_BY_LEVEL[p.level];
    saveProfile(app.store, p, { done: true });
    // не отмеченные инструменты выключаются (как в «Настройки → Функции»); функции ядра в st.off не трогаются
    const off = st.off || (st.off = {});
    allIds.forEach((id) => { if (f.tools.includes(id)) delete off[id]; else off[id] = true; });
    st.goalMin = f.goalMin;
    st.days = f.days;
    app.store.settingsChanged();
    if (remindOf(st).mode !== 'quiet' && remindAvailable()) remindPermission().then((ok) => { if (!ok) toast(t('rem.denied')); });
    applyLevelDefaults(app.device, app.store.state.settings.profile);
    app.saveDevice();
    layer.remove();
    toast(t('ob.welcome', { name: p.name.trim() || t('ob.musician') }));
    // демо-набор — сразу (песни, табы, ноты, записи, события); убрать — «Данные и копии»
    import('../demo.js').then((m) => m.addDemo(app, t)).then(() => app.render && app.render()).catch(() => {});
    done();
  };

  layer.addEventListener('click', (e) => {
    const g = (s) => e.target.closest(s);
    let b;
    read();
    if (g('[data-obnext]')) {
      if (STEPS[f.step] === 'inst' && !p.instruments.length) { toast(t('ob.pickInst')); return; }
      // у всех, кроме новичка, опыт обязателен: иначе уровень и звание не с чего посчитать
      // цель по уровню подставляется, пока её не меняли вручную
      if (STEPS[f.step] === 'level' && !f.goalTouched) f.goalMin = GOAL_BY_LEVEL[p.level];
      // набор инструментов по уровню — пока его не меняли вручную
      if (STEPS[f.step] === 'level' && !f.toolsTouched) f.tools = toolsFor(p.level, p.instruments, allIds);
      if (STEPS[f.step] === 'tools' && !f.tools.length) { toast(t('ob.pickTool')); return; }
      if (f.step === STEPS.length - 1) { finish(); return; }
      // перед шагом «Мелета»: имя (для обращения), дни и цель — уже в настройках, чтобы образец был настоящим
      if (STEPS[f.step + 1] === 'melete') { saveProfile(app.store, p); st.goalMin = f.goalMin; st.days = f.days.slice(); }
      f.step++;
      render();
    } else if (g('[data-obback]')) { f.step = Math.max(0, f.step - 1); render(); }
    else if ((b = g('[data-obinst]'))) {
      const k = b.dataset.obinst;
      p.instruments = p.instruments.includes(k) ? p.instruments.filter((x) => x !== k) : [...p.instruments, k];
      b.classList.toggle('on');
      b.setAttribute('aria-pressed', p.instruments.includes(k));
    } else if ((b = g('[data-oblevel]'))) { p.level = b.dataset.oblevel; render(); }
    else if ((b = g('[data-obtool]'))) {
      const id = b.dataset.obtool;
      f.tools = f.tools.includes(id) ? f.tools.filter((x) => x !== id) : allIds.filter((x) => x === id || f.tools.includes(x));
      f.toolsTouched = true;
      b.classList.toggle('on');
      b.setAttribute('aria-pressed', f.tools.includes(id));
    }
    else if ((b = g('[data-obimp]'))) {
      // после приёма: профиль, дни и цель из файла — в шаги регистрации (их можно проверить и поменять)
      const after = (r) => {
        const S = app.store.state.settings, q = S.profile || {};
        if (r.profile) {
          if (q.name) p.name = q.name;
          if (q.instruments && q.instruments.length) p.instruments = q.instruments.slice();
          if (q.level) p.level = q.level;
          f.days = S.days.slice(); f.goalMin = S.goalMin; f.goalTouched = true;
        }
        render();
      };
      saveProfile(app.store, p);
      import('./share.js').then((m) => (b.dataset.obimp === 'ai' ? m.aiDocSheet(app, after) : m.pickFile(app, after)));
    }
    else if (g('[data-obcalc]')) { p.priorHours = Math.min(PRIOR_MAX, estimateHours(f.years, f.perWeek)); render(); }
    else if ((b = g('[data-obgoal]'))) { f.goalMin = Math.max(GOAL_MIN, Math.min(GOAL_MAX, f.goalMin + +b.dataset.obgoal)); f.goalTouched = true; render(); }
    else if ((b = g('[data-obday]'))) { const i = +b.dataset.obday; f.days[i] = f.days[i] ? 0 : 1; render(); }
    else if ((b = g('[data-oblang]'))) {
      if (b.dataset.oblang === getLang()) return;
      // язык — сразу, без перезапуска: регистрация перерисовывается на новом языке
      st.lang = b.dataset.oblang;
      app.store.settingsChanged();
      initI18n(st.lang);
      render();
    }
  });
  // Опыт и подсчёт: значок и подпись кнопки обновляются по мере ввода
  layer.addEventListener('input', (e) => {
    if (!['obhours', 'obyears', 'obweek'].includes(e.target.id)) return;
    read();
    const btn = layer.querySelector('[data-obcalc]');
    if (btn) btn.textContent = t('ob.calcUse', { h: estimateHours(f.years, f.perWeek) });
  });
  // характер Мелеты: перерисовка без прокрутки наверх
  bindMelete(layer, st, { save: () => app.store.settingsChanged(), ask: false, rerender: () => { const b = layer.querySelector('.obbody'), y = b ? b.scrollTop : 0; render(); const nb = layer.querySelector('.obbody'); if (nb) nb.scrollTop = y; } });
  layer.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); layer.querySelector('[data-obnext]').click(); } });
  render();
}

// Самый первый экран — знакомство (решение автора): маскот, видение и философия Melete, выбор языка,
// согласие с пользовательским соглашением и политикой, ссылка на лицензии. Язык меняется сразу, на месте.
// Уже выбран язык и принято соглашение (или есть профиль) — экран пропускается; позже тот же текст — «О Melete»
export function welcomeHTML({ gate = false } = {}) {
  const lang = getLang();
  return '<div class="wlbox">' + (gate ? '<div class="wllang" role="group" aria-label="' + esc(t('look.lang')) + '">' + LANGS.map((k) => '<button type="button" class="wllb' + (lang === k ? ' on' : '') + '" data-lg="' + k + '" lang="' + k + '" aria-pressed="' + (lang === k) + '">' + LANG_NAMES[k] + '</button>').join('') + '</div>' : '') +
    '<div class="wlhero">' + mascotSVG('glad', { size: 96 }) + '<div class="wllogo">' + logoHTML() + '</div><h1 class="wlh">' + t('wel.title') + '</h1></div>' +
    '<p class="wlp">' + t('wel.p1') + '</p><p class="wlp">' + t('wel.p2') + '</p><p class="wlp wlgood">' + t('wel.p3') + '</p>' +
    '<p class="wlp wllegal">' + t('wel.legal') + '</p>' +
    '<div class="wldocs">' + ['tos', 'priv', 'lic'].map((k) => '<button type="button" class="link" data-wldoc="' + k + '">' + t('legal.' + k) + '</button>').join('') + '</div>' +
    (gate ? '<p class="wlaccept">' + t('wel.accept') + '</p><button type="button" class="btn fill block" data-wlgo>' + t('wel.go') + '</button>' : '') + '</div>';
}

export function langGate(app, then = () => {}) {
  const st = app.store.state.settings;
  if (st.profile || (st.lang && st.tosOk === TOS_VER)) { then(); return; }
  if (!st.lang) initI18n(st.lang || undefined); // язык системы — до выбора
  const l = document.createElement('div');
  l.className = 'onb langgate';
  l.setAttribute('role', 'dialog');
  l.setAttribute('aria-modal', 'true');
  const render = () => { l.innerHTML = welcomeHTML({ gate: true }); l.setAttribute('aria-label', t('wel.title')); };
  render();
  document.body.appendChild(l);
  l.addEventListener('click', (e) => {
    const b = e.target.closest('[data-lg]'), d = e.target.closest('[data-wldoc]');
    if (b) { st.lang = b.dataset.lg; app.store.settingsChanged(); initI18n(st.lang); const y = l.scrollTop; render(); l.scrollTop = y; return; }
    if (d) { legalSheet(d.dataset.wldoc); return; }
    if (!e.target.closest('[data-wlgo]')) return;
    st.lang = st.lang || getLang();
    st.tosOk = TOS_VER; // согласие принято на этом экране — отдельное окно соглашения не нужно
    app.store.settingsChanged();
    initI18n(st.lang);
    l.remove();
    then();
  });
}

