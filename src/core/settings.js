// Настройки ядра: цель недели, дни практики, тема, функции (вкл/выкл).

// Функции ядра, которые можно выключить (модули выключаются так же — по id); данные при этом сохраняются
export const CORE_FEATURES = ['streak', 'mastery'];

// Режим «Только инструменты»: без учёта времени, статистики, званий, значков и уведомлений — только инструменты,
// песни и календарь. Уже записанные данные не удаляются и вернутся, если режим выключить
export const toolsOnly = (settings) => !!settings.toolsOnly;

// В режиме «Только инструменты» функции ядра (ударный режим, значок мастерства) выключены
export const isOn = (settings, id) => !((settings.off || {})[id]) && !(settings.toolsOnly && CORE_FEATURES.includes(id));

export function setFeature(store, id, on) {
  const st = store.state.settings, off = st.off || (st.off = {});
  if (on) delete off[id];
  else off[id] = true;
  store.settingsChanged();
}

export const GOAL_MIN = 30, GOAL_MAX = 3000;

export function changeGoal(store, deltaMin) {
  const st = store.state.settings;
  st.goalMin = Math.max(GOAL_MIN, Math.min(GOAL_MAX, st.goalMin + deltaMin));
  st.configured = true;
  store.settingsChanged();
}

export function toggleDay(store, i) {
  const st = store.state.settings;
  st.days[i] = st.days[i] ? 0 : 1;
  st.configured = true;
  store.settingsChanged();
}

export const THEMES = ['system', 'light', 'dark', 'paper', 'oled'];

export const ACCENTS = [['orange', '#FF9500'], ['red', '#FF3B30'], ['pink', '#FF2D55'], ['purple', '#AF52DE'],
  ['indigo', '#5856D6'], ['blue', '#007AFF'], ['teal', '#00C7BE'], ['green', '#34C759'], ['graphite', '#8E8E93']];

// Тема и акцент на <html>. Приложение бесплатное: все темы и акценты доступны всем
// Стиль интерфейса «Минимал» (эксперимент): только чёрный, белый и оттенки серого; темы — светлая и тёмная,
// акцента нет («Бумага» показывается светлой, OLED — тёмной)
export const UI_STYLES = ['default', 'mono'];
export const isMono = (settings) => settings.uiStyle === 'mono';

export function applyTheme(settings, de = document.documentElement) {
  const t = settings.theme;
  if (t === 'system' || !THEMES.includes(t)) de.removeAttribute('data-theme');
  else de.setAttribute('data-theme', t);
  if (isMono(settings)) de.setAttribute('data-style', 'mono');
  else de.removeAttribute('data-style');
  const a = !isMono(settings) && settings.accent && settings.accent !== 'orange' ? ACCENTS.find((x) => x[0] === settings.accent) : null;
  if (a) {
    de.style.setProperty('--tint', a[1]);
    de.style.setProperty('--tint-text', 'color-mix(in srgb,' + a[1] + ' 78%,var(--ink))');
    de.style.setProperty('--on-tint', '#fff');
  } else ['--tint', '--tint-text', '--on-tint'].forEach((k) => de.style.removeProperty(k));
}

export function setTheme(store, theme) {
  store.state.settings.theme = theme;
  store.settingsChanged();
}

/* ---------- вкладки ---------- */

export const DEFAULT_TABS = ['home', 'library', 'calendar', 'tools'];

// Видимые вкладки по порядку. settings.tabs — порядок видимых, settings.tabsOff — убранные.
// Вкладка, которой нет ни там, ни там (новая в обновлении), появляется в конце. Хотя бы одна остаётся всегда.
export function visibleTabs(settings, known) {
  const off = settings.tabsOff || [];
  const list = (settings.tabs || DEFAULT_TABS).filter((k, i, a) => known.includes(k) && !off.includes(k) && a.indexOf(k) === i);
  known.forEach((k) => { if (!list.includes(k) && !off.includes(k) && !(settings.tabs || DEFAULT_TABS).includes(k)) list.push(k); });
  return list.length ? list : [known[0]];
}

export const hiddenTabs = (settings, known) => known.filter((k) => !visibleTabs(settings, known).includes(k));

// Действия на экране «Вкладки»: 'up' — выше, 'off' — убрать, 'on' — вернуть в конец
export function editTabs(store, known, id, action) {
  const st = store.state.settings, vis = visibleTabs(st, known), off = new Set(st.tabsOff || []);
  const i = vis.indexOf(id);
  if (action === 'up' && i > 0) [vis[i - 1], vis[i]] = [vis[i], vis[i - 1]];
  else if (action === 'off' && i >= 0 && vis.length > 1) { vis.splice(i, 1); off.add(id); }
  else if (action === 'on' && i < 0) { vis.push(id); off.delete(id); }
  else return false;
  st.tabs = vis;
  st.tabsOff = [...off];
  store.settingsChanged();
  return true;
}
