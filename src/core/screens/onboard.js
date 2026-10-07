// Регистрация при первом запуске: язык и имя, инструменты, уровень, опыт до приложения, цель недели и дни практики.
// Аккаунта нет: всё хранится на устройстве (settings.profile) и меняется потом в профиле.
import '../../ui/onboard.css';
import { t, getLang, LANGS, LANG_NAMES } from '../../i18n/index.js';
import { esc, toast } from '../../ui/index.js';
import { fmtDur } from '../format.js';
import { GOAL_MIN, GOAL_MAX } from '../settings.js';
import { INSTRUMENTS, LEVELS, GOAL_BY_LEVEL, PRIOR_MAX, newProfile, saveProfile, applyLevelDefaults, estimateHours } from '../profile.js';
import { rankOf } from '../rank.js';
import { rankSVG, rankName, RANK_COLORS } from '../../ui/rank.js';
import { weekdays } from './common.js';

const STEPS = ['name', 'inst', 'level', 'exp', 'goal'];

// Карточки для выбора (инструменты, уровень)
const card = (attr, on, title, sub = '') => '<button type="button" class="obcard' + (on ? ' on' : '') + '" ' + attr + ' aria-pressed="' + on + '"><b>' + esc(title) + '</b>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</button>';

// Стартовое звание по опыту до приложения
function rankBox(hours) {
  const r = rankOf(hours), n = rankName(r.id, r.level);
  return rankSVG(r.id, r.level, 64, n) + '<div style="--rk:' + RANK_COLORS[r.id] + '"><b style="color:var(--rk)">' + esc(n) + '</b><small>' + t('ob.rankNote') + '</small></div>';
}

export function onboarding(app, done = () => {}) {
  if (document.getElementById('onboard')) return;
  const st = app.store.state.settings;
  const p = { ...newProfile(), ...(st.profile || {}) };
  const f = { step: 0, years: 0, perWeek: 0, goalMin: st.goalMin, days: st.days.slice(), goalTouched: false };
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
        '<p class="ftr">' + t('ob.private') + '</p>';
    }
    if (s === 'inst') {
      return '<h1 class="obh">' + t('ob.instTitle') + '</h1><p class="obp">' + t('ob.instText') + '</p><div class="obgrid">' +
        INSTRUMENTS.map((k) => card('data-obinst="' + k + '"', p.instruments.includes(k), t('inst.' + k))).join('') + '</div>';
    }
    if (s === 'level') {
      return '<h1 class="obh">' + t('ob.levelTitle') + '</h1><p class="obp">' + t('ob.levelText') + '</p><div class="oblist">' +
        LEVELS.map((k) => card('data-oblevel="' + k + '"', p.level === k, t('level.' + k), t('level.' + k + '.text'))).join('') + '</div>';
    }
    if (s === 'exp') {
      return '<h1 class="obh">' + t('ob.expTitle') + '</h1><p class="obp">' + t('ob.expText') + (p.level === 'beginner' ? '' : ' ' + t('ob.expRequired')) + '</p>' +
        '<div class="group"><label class="cell"><span class="grow">' + t('ob.hours') + '</span><input class="inp num obhours" id="obhours" type="number" inputmode="numeric" min="0" max="' + PRIOR_MAX + '" placeholder="0" aria-label="' + t('ob.hours') + '" value="' + (p.priorHours || '') + '"></label></div>' +
        '<div class="hdr">' + t('ob.calc') + '</div><div class="group"><label class="cell"><span class="grow">' + t('ob.years') + '</span><input class="inp num" id="obyears" type="number" inputmode="decimal" min="0" max="80" step="0.5" placeholder="0" value="' + (f.years || '') + '"></label>' +
        '<label class="cell"><span class="grow">' + t('ob.perWeek') + '</span><input class="inp num" id="obweek" type="number" inputmode="decimal" min="0" max="80" step="0.5" placeholder="0" value="' + (f.perWeek || '') + '"></label>' +
        '<button type="button" class="cell act center" data-obcalc>' + t('ob.calcUse', { h: estimateHours(f.years, f.perWeek) }) + '</button></div>' +
        '<div class="obgem">' + rankBox(p.priorHours) + '</div>';
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
    st.goalMin = f.goalMin;
    st.days = f.days;
    app.store.settingsChanged();
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
      if (STEPS[f.step] === 'exp' && p.level !== 'beginner' && !p.priorHours) { toast(t('ob.needHours')); layer.querySelector('#obhours')?.focus(); return; }
      // цель по уровню подставляется, пока её не меняли вручную
      if (STEPS[f.step] === 'level' && !f.goalTouched) f.goalMin = GOAL_BY_LEVEL[p.level];
      if (f.step === STEPS.length - 1) { finish(); return; }
      f.step++;
      render();
    } else if (g('[data-obback]')) { f.step = Math.max(0, f.step - 1); render(); }
    else if ((b = g('[data-obinst]'))) {
      const k = b.dataset.obinst;
      p.instruments = p.instruments.includes(k) ? p.instruments.filter((x) => x !== k) : [...p.instruments, k];
      b.classList.toggle('on');
      b.setAttribute('aria-pressed', p.instruments.includes(k));
    } else if ((b = g('[data-oblevel]'))) { p.level = b.dataset.oblevel; render(); }
    else if (g('[data-obcalc]')) { p.priorHours = Math.min(PRIOR_MAX, estimateHours(f.years, f.perWeek)); render(); }
    else if ((b = g('[data-obgoal]'))) { f.goalMin = Math.max(GOAL_MIN, Math.min(GOAL_MAX, f.goalMin + +b.dataset.obgoal)); f.goalTouched = true; render(); }
    else if ((b = g('[data-obday]'))) { const i = +b.dataset.obday; f.days[i] = f.days[i] ? 0 : 1; render(); }
    else if ((b = g('[data-oblang]'))) {
      if (b.dataset.oblang === getLang()) return;
      saveProfile(app.store, p);
      st.lang = b.dataset.oblang;
      app.store.settingsChanged();
      setTimeout(() => location.reload(), 150);
    }
  });
  // Опыт и подсчёт: значок и подпись кнопки обновляются по мере ввода
  layer.addEventListener('input', (e) => {
    if (!['obhours', 'obyears', 'obweek'].includes(e.target.id)) return;
    read();
    const btn = layer.querySelector('[data-obcalc]');
    if (btn) btn.textContent = t('ob.calcUse', { h: estimateHours(f.years, f.perWeek) });
    if (e.target.id === 'obhours') {
      const box = layer.querySelector('.obgem');
      if (box) box.innerHTML = rankBox(p.priorHours);
    }
  });
  layer.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); layer.querySelector('[data-obnext]').click(); } });
  render();
}
