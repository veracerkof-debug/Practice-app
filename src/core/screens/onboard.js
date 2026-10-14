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
import { weekdays } from './common.js';

const STEPS = ['name', 'inst', 'level', 'tools', 'exp', 'goal', 'melete'];

// Карточки для выбора (инструменты, уровень)
const card = (attr, on, title, sub = '') => '<button type="button" class="obcard' + (on ? ' on' : '') + '" ' + attr + ' aria-pressed="' + on + '"><b>' + esc(title) + '</b>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</button>';

// Лига на старте — всегда «Камень»: опыт до приложения в лигу и статистику не идёт (решение автора)
const leagueBox = () => gemSVG('stone', 0, 64, t('gem.stone')) + '<div><b>' + esc(t('gem.stone')) + '</b><small>' + t('ob.leagueNote') + '</small></div>';

export function onboarding(app, done = () => {}) {
  if (document.getElementById('onboard')) return;
  const st = app.store.state.settings;
  const p = { ...newProfile(), ...(st.profile || {}) };
  // новому человеку — классические напоминания (выбор — на последнем шаге)
  if (!st.remind) setRemind(st, { mode: 'classic' });
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
        '<div class="hdr">' + t('look.lang') + '</div><div class="group"><div class="cellcol"><div class="seg uc" role="group" aria-label="' + t('look.lang') + '">' +
        LANGS.map((k) => '<button type="button" data-oblang="' + k + '" lang="' + k + '" aria-pressed="' + (getLang() === k) + '">' + LANG_NAMES[k] + '</button>').join('') + '</div></div></div>' +
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
    // Набор инструментов: по уровню и инструментам подставлен, любой можно отметить или снять
    if (s === 'tools') {
      return '<h1 class="obh">' + t('ob.toolsTitle') + '</h1><p class="obp">' + t('ob.toolsText.' + (p.level === 'beginner' ? 'beginner' : 'other')) + '</p><div class="oblist">' +
        modules.filter((m) => !m.tab).map((m) => '<button type="button" class="obcard obtool' + (f.tools.includes(m.id) ? ' on' : '') + '" data-obtool="' + m.id + '" aria-pressed="' + f.tools.includes(m.id) + '">' +
          '<span class="obtic" style="background:' + (m.color || '#8E8E93') + ';color:' + (m.on || '#fff') + '">' + m.icon + '</span><span><b>' + esc(moduleName(m)) + '</b><small>' + esc(aboutOf(m)) + '</small></span></button>').join('') +
        '</div><p class="ftr">' + t('ob.toolsHint') + '</p>';
    }
    // Мелета: характер напоминаний и маскота, время занятий, обращение, наборы слов
    if (s === 'melete') return '<h1 class="obh">' + t('ob.meleteTitle') + '</h1><p class="obp">' + t('ob.meleteText') + '</p>' + meleteHTML(st, { sets: true });
    if (s === 'exp') {
      return '<h1 class="obh">' + t('ob.expTitle') + '</h1><p class="obp">' + t('ob.expText') + '' + '</p>' +
        '<div class="group"><label class="cell"><span class="grow">' + t('ob.hours') + '</span><input class="inp num obhours" id="obhours" type="number" inputmode="numeric" min="0" max="' + PRIOR_MAX + '" placeholder="0" aria-label="' + t('ob.hours') + '" value="' + (p.priorHours || '') + '"></label></div>' +
        '<div class="hdr">' + t('ob.calc') + '</div><div class="group"><label class="cell"><span class="grow">' + t('ob.years') + '</span><input class="inp num" id="obyears" type="number" inputmode="decimal" min="0" max="80" step="0.5" placeholder="0" value="' + (f.years || '') + '"></label>' +
        '<label class="cell"><span class="grow">' + t('ob.perWeek') + '</span><input class="inp num" id="obweek" type="number" inputmode="decimal" min="0" max="80" step="0.5" placeholder="0" value="' + (f.perWeek || '') + '"></label>' +
        '<button type="button" class="cell act center" data-obcalc>' + t('ob.calcUse', { h: estimateHours(f.years, f.perWeek) }) + '</button></div>' +
        '<div class="obgem">' + leagueBox() + '</div>';
    }
    const WD = weekdays();
    return '<h1 class="obh">' + t('ob.goalTitle') + '</h1><p class="obp">' + t('ob.goalText') + '</p>' +
      '<div class="hdr">' + t('week.goal') + '</div><div class="group"><div class="cell"><span class="grow">' + t('week.perWeek') + '</span><span class="val num" style="color:var(--ink);margin-right:6px">' + fmtDur(f.goalMin * 60) +
      '</span><span class="stepper"><button type="button" data-obgoal="-30" aria-label="' + t('week.minus30') + '">−</button><button type="button" data-obgoal="30" aria-label="' + t('week.plus30') + '">+</button></span></div></div>' +
      '<p class="ftr">' + t('ob.goalHint') + '</p>' +
      '<div class="hdr">' + t('week.days') + '</div><div class="group"><div class="cellcol"><div class="seg" role="group" aria-label="' + t('week.days') + '">' +
      WD.map((d, i) => '<button type="button" data-obday="' + i + '" aria-pressed="' + !!f.days[i] + '">' + d + '</button>').join('') + '</div></div></div>' +
      '<p class="ftr">' + t('week.restHint') + '</p>';
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

// Самый первый экран: язык приложения (до соглашения и регистрации). Названия языков — на самих языках,
// чтобы выбрать, не зная остальных. Уже выбранный язык (или есть профиль) — экран пропускается
export function langGate(app, then = () => {}) {
  const st = app.store.state.settings;
  if (st.lang || st.profile) { then(); return; }
  const l = document.createElement('div');
  l.className = 'onb langgate';
  l.setAttribute('role', 'dialog');
  l.setAttribute('aria-modal', 'true');
  const HELLO = { ru: 'Здравствуйте', uz: 'Assalomu alaykum', en: 'Welcome' };
  l.innerHTML = '<div class="lgbox"><div class="lglogo">' + logoHTML() + '</div><div class="lglist">' +
    LANGS.map((k) => '<button type="button" class="lgbtn" data-lg="' + k + '" lang="' + k + '"><b>' + LANG_NAMES[k] + '</b><span>' + HELLO[k] + '</span></button>').join('') + '</div></div>';
  document.body.appendChild(l);
  l.addEventListener('click', (e) => {
    const b = e.target.closest('[data-lg]');
    if (!b) return;
    st.lang = b.dataset.lg;
    app.store.settingsChanged();
    initI18n(st.lang);
    l.remove();
    then();
  });
}

