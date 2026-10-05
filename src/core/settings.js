// Настройки ядра: цель недели, дни практики, тема, функции (вкл/выкл).

// Функции, которые можно выключить; данные при этом сохраняются
export const FEATURES = ['metro', 'tuner', 'piano', 'drone', 'theory', 'ear', 'timer', 'audio', 'notes', 'streak'];

export const isOn = (settings, id) => !((settings.off || {})[id]);

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
export function applyTheme(settings, de = document.documentElement) {
  const t = settings.theme;
  if (t === 'system' || !THEMES.includes(t)) de.removeAttribute('data-theme');
  else de.setAttribute('data-theme', t);
  const a = settings.accent && settings.accent !== 'orange' ? ACCENTS.find((x) => x[0] === settings.accent) : null;
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
