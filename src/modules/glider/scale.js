// Глайдер: положение пальца → высота (MIDI с дробной частью), привязка к нотам. Без DOM и звука.
import { scaleInfo } from '../../music/theory.js';

// free — без ладов, magnet — тянет к нотам, но между ними можно скользить, note — только ноты (с портаменто)
export const SNAPS = ['free', 'magnet', 'note'];
export const WIDTHS = [7, 12, 18, 24, 36, 48];
export const LO_MIN = 24, HI_MAX = 108; // C1 … C8

// Разрешённые классы нот: null — все 12 (хроматика), иначе — звуки лада от тоники
export function allowedPcs(cfg) {
  if (!cfg.scale || cfg.scale === 'chrom') return null;
  return scaleInfo(cfg.root || 0, cfg.scale).pcs;
}
const ok = (m, pcs) => !pcs || pcs.includes(((m % 12) + 12) % 12);

// Края поверхности — на полтона дальше крайних нот, чтобы у них было своё место, как у остальных
export const posToMidi = (x, lo, width) => lo - 0.5 + x * (width + 1);
export const midiToPos = (m, lo, width) => (m - lo + 0.5) / (width + 1);

// Ноты лада в диапазоне [lo, lo + width]
export function notesIn(lo, width, pcs) {
  const out = [];
  for (let m = lo; m <= lo + width; m++) if (ok(m, pcs)) out.push(m);
  return out;
}

// Ближайшие разрешённые ноты снизу и сверху: a ≤ m < b
export function neighbors(m, pcs) {
  let a = Math.floor(m), b = a + 1;
  for (let i = 0; i < 12 && !ok(a, pcs); i++) a--;
  for (let i = 0; i < 12 && !ok(b, pcs); i++) b++;
  return [a, b];
}

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
