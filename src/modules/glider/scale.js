// Глайдер: положение пальца → высота (MIDI с дробной частью), привязка к нотам. Без DOM и звука.
import { scaleInfo } from '../../music/theory.js';
import { folkCents } from '../../music/folk.js';

// free — без ладов, magnet — тянет к нотам, но между ними можно скользить, note — только ноты (с портаменто)
export const SNAPS = ['free', 'magnet', 'note'];
export const WIDTHS = [7, 12, 18, 24, 36, 48];
export const LO_MIN = 24, HI_MAX = 108; // C1 … C8

// Разрешённые высоты внутри октавы (0 ≤ p < 12, у микроладов — дробные: 3,5 — ми на четверть тона ниже):
// null — все 12 (хроматика), иначе — звуки лада от тоники (обычного — theory.js, народного и своего — folk.js)
export function allowedPcs(cfg) {
  if (!cfg.scale || cfg.scale === 'chrom') return null;
  const c = folkCents(cfg.scale, cfg);
  if (c) return c.map((x) => (((cfg.root || 0) + x / 100) % 12 + 12) % 12);
  return scaleInfo(cfg.root || 0, cfg.scale).pcs;
}
const EPS = 1e-6;
const dist = (m, p) => { const d = (((m - p) % 12) + 12) % 12; return Math.min(d, 12 - d); };
const ok = (m, pcs) => !pcs || pcs.some((p) => dist(m, p) < EPS);

// Края поверхности — на полтона дальше крайних нот, чтобы у них было своё место, как у остальных
export const posToMidi = (x, lo, width) => lo - 0.5 + x * (width + 1);
export const midiToPos = (m, lo, width) => (m - lo + 0.5) / (width + 1);

// Все высоты лада между a и b (включительно), по возрастанию
function pitches(a, b, pcs) {
  const out = [];
  for (let o = Math.floor(a / 12) - 1; o <= Math.ceil(b / 12) + 1; o++) pcs.forEach((p) => { const v = o * 12 + p; if (v >= a - EPS && v <= b + EPS) out.push(v); });
  return out.sort((x, y) => x - y);
}

// Ноты лада в диапазоне [lo, lo + width]
export function notesIn(lo, width, pcs) {
  if (!pcs) { const out = []; for (let m = lo; m <= lo + width; m++) out.push(m); return out; }
  return pitches(lo, lo + width, pcs);
}

// Ближайшие разрешённые ноты снизу и сверху: a ≤ m < b
export function neighbors(m, pcs) {
  if (!pcs) { const a = Math.floor(m); return [a, a + 1]; }
  const all = pitches(m - 13, m + 13, pcs);
  let a = -Infinity, b = Infinity;
  all.forEach((v) => { if (v <= m + EPS && v > a) a = v; if (v > m + EPS && v < b) b = v; });
  return [a, b];
}
export const inScale = ok;

// Высота с учётом привязки. Магнит: между соседними нотами путь «залипает» у нот и быстро проходит середину —
// кривая непрерывна, поэтому скольжение остаётся плавным
export function snapPitch(m, mode, pcs) {
  if (mode === 'free') return m;
  const [a, b] = neighbors(m, pcs);
  if (mode === 'note') return m - a < b - m ? a : b;
  const u = (m - a) / (b - a), k = u < 0.5 ? 4 * u * u * u : 1 - 4 * (1 - u) * (1 - u) * (1 - u);
  return a + k * (b - a);
}

// Отклонение от ближайшей ноты в центах (−50…+50) и сама нота
export function nearest(m) {
  const n = Math.round(m);
  return { n, cents: Math.round((m - n) * 100) };
}

export const clampLo = (lo, width) => Math.max(LO_MIN, Math.min(HI_MAX - width, Math.round(lo)));
