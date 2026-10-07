// Аккорды правой рукой (режим «Аккорды» терменвокса). Без DOM и звука — проверяется тестами.
// Система — нэшвиллские пальцы и числа жестового языка (решение автора):
//   1–5 вытянутых пальцев — ступени I–V (считается число пальцев, с большим или без; «1» — указательный: один отставленный
//   большой палец считается кулаком, иначе при сжатии руки для тишины проскакивал бы аккорд I);
//   большой палец касается мизинца — VI, безымянного — VII (числа 6 и 7 американского жестового языка, ASL);
//   ладонь к камере — мажор, тыльной стороной — минор; кулак — тишина;
//   «окей» (большой касается указательного, остальные вытянуты) — переключение «соло ↔ аккорды».
// Точки руки — 21 ориентир MediaPipe: 0 — запястье; большой 1–4, указательный 5–8, средний 9–12, безымянный 13–16, мизинец 17–20.
import { SH, FL } from '../../music/notes.js';

const TIPS = [4, 8, 12, 16, 20], PIPS = [3, 6, 10, 14, 18];
const d2 = (a, b, ar = 1) => Math.hypot((a.x - b.x) * ar, a.y - b.y);
const d3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));

// Пальцы: ext — вытянут ли каждый (большой, указательный, средний, безымянный, мизинец); touch — расстояние
// от кончика большого до кончиков других (в размерах ладони). По объёмным точкам, если есть (палец к камере тоже читается)
export function fingers(h) {
  const w = h.w && h.w.length === 21 ? h.w : null, P = w || h.lm, ar = w ? 1 : h.ar || 4 / 3;
  const dist = (a, b) => (w ? d3(P[a], P[b]) : d2(P[a], P[b], ar));
  const size = dist(0, 9) || 1e-6;
  const ext = [0, 1, 2, 3, 4].map((i) => {
    if (i === 0) return dist(4, 9) / size > 0.75 && dist(4, 0) > dist(3, 0); // большой отведён от ладони
    return dist(TIPS[i], 0) > dist(PIPS[i], 0) * 1.12; // кончик дальше среднего сустава — палец выпрямлен
  });
  return { ext, touch: { index: dist(4, 8) / size, middle: dist(4, 12) / size, ring: dist(4, 16) / size, pinky: dist(4, 20) / size }, size };
}

// Ладонь к камере? По тому, с какой стороны от середины ладони большой палец (зеркальный кадр, как в зеркале).
// right — это правая рука музыканта. Поворот руки в плоскости кадра на ответ не влияет
export function palmFacing(lm, right = true) {
  const ax = lm[5].x - lm[0].x, ay = lm[5].y - lm[0].y, bx = lm[17].x - lm[0].x, by = lm[17].y - lm[0].y;
  return (ax * by - ay * bx > 0) === right;
}

export const TOUCH = 0.38; // кончики сведены, если ближе этого (в размерах ладони)

// Знак руки: { kind: 'fist' | 'num' | 'ok' | 'none', n (ступень 1–7), palm (ладонь к камере) }
export function readSign(h, right = true) {
  const f = fingers(h), [th, ix, md, rg, pk] = f.ext, palm = palmFacing(h.lm, right);
  const t = f.touch;
  // «окей»: большой к указательному, остальные три вытянуты
  if (t.index < TOUCH && md && rg && pk) return { kind: 'ok', palm };
  // жестовые 6 и 7: большой к мизинцу (указательный, средний, безымянный вытянуты) или к безымянному
  if (t.pinky < TOUCH && ix && md && rg) return { kind: 'num', n: 6, palm };
  if (t.ring < TOUCH && ix && md && pk) return { kind: 'num', n: 7, palm };
  const n = f.ext.filter(Boolean).length;
  if (n === 0 || (n === 1 && th && !ix)) return { kind: 'fist', palm }; // кулак (большой сбоку — тоже кулак)
  return { kind: 'num', n, palm };
}

/* ---------- ступень → аккорд ---------- */

const STEPS = { maj: [0, 2, 4, 5, 7, 9, 11], min: [0, 2, 3, 5, 7, 8, 10] };
// Лад трезвучий по тональности: мажор I ii iii IV V vi vii°, минор i ii° III iv v VI VII
const DIATONIC = { maj: ['M', 'm', 'm', 'M', 'M', 'm', 'd'], min: ['m', 'd', 'M', 'm', 'm', 'M', 'M'] };
const SHAPES = { M: [0, 4, 7], m: [0, 3, 7], d: [0, 3, 6] };
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

// n — ступень 1–7; palm — ладонь к камере; key — { root 0–11, mode 'maj' | 'min' }; how — 'hand' (ладонь — мажор,
// тыльная — минор) или 'key' (по тональности; тыльной стороной — противоположный лад)
export function chordOf(n, palm, key = { root: 0, mode: 'maj' }, how = 'hand') {
  const mode = key.mode === 'min' ? 'min' : 'maj', i = Math.max(1, Math.min(7, n)) - 1;
  const root = (((key.root || 0) + STEPS[mode][i]) % 12 + 12) % 12;
  let q;
  if (how === 'key') { const dq = DIATONIC[mode][i]; q = palm ? dq : dq === 'M' ? 'm' : 'M'; }
  else q = palm ? 'M' : 'm';
  return { root, q, n: i + 1 };
}

// Название: C, Am, B° — бемоли в бемольных тональностях; ступень римской цифрой (минор — строчными)
export function chordName(c, key = { root: 0, mode: 'maj' }) {
  const flat = [5, 10, 3, 8, 1, 6].includes(((key.mode === 'min' ? key.root + 3 : key.root) % 12 + 12) % 12);
  const nm = (flat ? FL : SH)[c.root] + (c.q === 'm' ? 'm' : c.q === 'd' ? '°' : '');
  const r = ROMAN[c.n - 1];
  return { name: nm, roman: c.q === 'M' ? r : r.toLowerCase() + (c.q === 'd' ? '°' : '') };
}

// Расположение: бас (основной тон снизу) и три голоса трезвучия в том обращении, середина которого ближе всего
// к center (MIDI) — высота руки плавно переводит аккорд из обращения в обращение
export function voicing(c, center = 60) {
  const sh = SHAPES[c.q] || SHAPES.M;
  let best = null;
  for (let base = Math.floor(center) - 24; base <= Math.floor(center) + 12; base++) {
    if (((base - c.root) % 12 + 12) % 12 !== 0) continue;
    for (let inv = 0; inv < 3; inv++) {
      const notes = sh.map((x, k) => base + x + (k < inv ? 12 : 0)).sort((a, b) => a - b);
      const mid = (notes[0] + notes[2]) / 2, dv = Math.abs(mid - center);
      if (!best || dv < best.dv) best = { notes, dv };
    }
  }
  const top = best.notes, bass = top[0] - ((top[0] - c.root) % 12 + 12) % 12 - 12; // основной тон ниже всех
  return [bass, ...top];
}

// Голоса к следующему аккорду — к ближайшим нотам (по порядку снизу вверх), чтобы переход был плавным
export const sameChord = (a, b) => !!a && !!b && a.root === b.root && a.q === b.q;
