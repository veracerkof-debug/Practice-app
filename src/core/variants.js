// Варианты (решение автора 24.10.2026, DECISIONS): у новой вещи с несколькими вариантами (звуки, ревербы, виды,
// алгоритмы) в dev-сборке — все варианты и переключатель (Профиль → «Варианты», только в dev), в pre — только
// выбранный автором (pre), без переключателя. Новый вариант без решения автора в pre не уходит: pre = как было.
// Точка выбора: { id, options: [значения], pre — значение для тестеров, apply(app, v) — применить на ходу }.
// Строки: variant.<id>, variant.<id>.<значение>, variant.<id>.hint.
import { CHANNEL } from './update.js';

export const DEV = CHANNEL === 'dev';
const KEY = 'melete.variants';

export const VARIANTS = [
  // ревербы Airwindows (wl/airwin.worklet.js) вместо своих пространств — эксперимент 24.10.2026
  { id: 'verb', options: ['melete', 'galactic', 'verbity'], pre: 'melete', apply: (app, v) => app.audio.mixer.setVerbAlgo(v) },
];

const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const byId = (id) => VARIANTS.find((x) => x.id === id);

// Значение: pre — всегда выбранное автором; dev — выбранное здесь (иначе как в pre)
export function variant(id) {
  const v = byId(id); if (!v) return null;
  if (!DEV) return v.pre;
  const s = read()[id];
  return v.options.includes(s) ? s : v.pre;
}
export function setVariant(app, id, val) {
  const v = byId(id); if (!DEV || !v || !v.options.includes(val)) return;
  const all = read(); all[id] = val;
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* память недоступна — до перезапуска */ }
  v.apply(app, val);
}
// При запуске: применить все (в pre — значения автора)
export function applyVariants(app) { VARIANTS.forEach((v) => { try { v.apply(app, variant(v.id)); } catch { /* звук ещё не готов — применится при создании */ } }); }
