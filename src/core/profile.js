// Профиль музыканта: имя, инструменты, уровень, опыт до приложения. Хранится только на устройстве (settings.profile,
// попадает в резервную копию). Без DOM.
import { totalTime } from './stats.js';
import { profileSeal, profileOk } from './integrity.js';

// Порядок — как в списке при регистрации. Названия — ключи i18n inst.<id>
export const INSTRUMENTS = ['guitar', 'egtr', 'bass', 'uke', 'piano', 'vocal', 'drums', 'violin', 'viola', 'cello', 'dbass',
  'flute', 'sax', 'trumpet', 'clarinet', 'mando', 'banjo', 'other'];
export const LEVELS = ['beginner', 'amateur', 'advanced', 'pro'];
// Цель недели по уровню (минуты) — подсказка на шаге «Цель», её можно поменять
export const GOAL_BY_LEVEL = { beginner: 180, amateur: 300, advanced: 600, pro: 900 };
export const PRIOR_MAX = 100000;
// Уровень по часам, сыгранным до приложения (колесо часов при регистрации)
export const LEVEL_FROM = [[5000, 'pro'], [1000, 'advanced'], [150, 'amateur'], [0, 'beginner']];
export const levelByHours = (h) => (LEVEL_FROM.find(([min]) => (+h || 0) >= min) || [0, 'beginner'])[1];

// Инструменты (модули) при регистрации — по уровню и инструментам (решение автора). Новичку — самое нужное,
// остальное включается потом в «Настройки → Функции». all — id всех модулей; возвращает id включённых
const BY_LEVEL = {
  beginner: ['metro', 'tuner', 'notes', 'audio'],
  amateur: ['metro', 'tuner', 'notes', 'audio', 'piano', 'drone', 'theory', 'timer'],
};
export function toolsFor(level, instruments = [], all = []) {
  const on = new Set(BY_LEVEL[level] || all.filter((id) => id !== 'theremin')); // продвинутым — всё, кроме камеры
  if (instruments.includes('vocal')) { on.add('piano'); on.add('drone'); } // голосу нужна опора для интонации
  on.add('bible'); // церковный режим включён по умолчанию — Библия у всех (видна, только пока режим включён)
  if (instruments.length && instruments.every((x) => x === 'piano' || x === 'drums')) on.delete('tuner'); // настраивать нечего
  return all.filter((id) => on.has(id));
}

// Строй тюнера для инструмента (первый из выбранных, у которого есть строй)
const TUNING = { guitar: 'g_std', egtr: 'g_std', bass: 'b4', dbass: 'b4', uke: 'u_std', violin: 'violin', viola: 'viola', cello: 'cello', mando: 'mando', banjo: 'banjo' };
export function tuningFor(instruments = []) {
  const i = instruments.find((x) => TUNING[x]);
  return i ? TUNING[i] : null;
}

// Опыт до приложения — только если его печать сходится (правка в файле копии — не учитывается)
export const priorHours = (settings) => (profileOk(settings.profile) ? Math.max(0, Math.min(PRIOR_MAX, +((settings.profile || {}).priorHours) || 0)) : 0);


// Время для лиги, с: только практика в приложении (опыт до приложения в лигу не идёт),
// без пауз тишины, отмеченных подтверждением игры звуком (rec.quiet)
export const gemSec = (sessions) => totalTime(sessions) - sessions.reduce((s, r) => s + Math.min(r.dur || 0, r.quiet || 0), 0);

// Оценка опыта: годы занятий × часов в неделю × 52 недели
export const estimateHours = (years, perWeek) => Math.max(0, Math.round((+years || 0) * 52 * (+perWeek || 0)));

export function newProfile() {
  return { name: '', instruments: [], level: 'amateur', priorHours: 0 };
}

// Сохранить профиль; done — регистрация пройдена (её больше не показывать).
// Опыт до приложения меняется свободно: он воображаемый — ни в лигу, ни в статистику не идёт
export function saveProfile(store, p, { done = false } = {}) {
  const st = store.state.settings, old = st.profile;
  const want = Math.round(Math.max(0, Math.min(PRIOR_MAX, +p.priorHours || 0)));
  st.profile = {
    name: String(p.name || '').trim().slice(0, 40),
    instruments: INSTRUMENTS.filter((x) => (p.instruments || []).includes(x)),
    level: LEVELS.includes(p.level) ? p.level : 'amateur',
    priorHours: want,
    createdAt: (old && old.createdAt) || store.now(),
  };
  st.profile.sig = profileSeal(st.profile);
  if (done) st.configured = true;
  store.settingsChanged();
  return st.profile;
}

// Настройки инструментов под уровень (применяются при регистрации). Новичку: тюнер в режиме новичка со строем
// его инструмента, глайдер — только ноты в одной октаве. Остальным уровням ничего не навязываем
export function applyLevelDefaults(device, profile) {
  const tun = tuningFor(profile.instruments);
  if (tun) device.tuner.tuning = tun;
  if (profile.level !== 'beginner') return device;
  device.tuner.beginner = true;
  device.tuner.useTuning = !!tun;
  device.glider = { ...(device.glider || {}), snap: 'note', width: 12, lo: 60 };
  return device;
}
