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
// Виды аккордов: трезвучия, септаккорды, задержания. d — уменьшённое, hd — полууменьшённый (m7♭5), d7 — уменьшённый септ
const SHAPES = { M: [0, 4, 7], m: [0, 3, 7], d: [0, 3, 6], 7: [0, 4, 7, 10], M7: [0, 4, 7, 11], m7: [0, 3, 7, 10],
  hd: [0, 3, 6, 10], d7: [0, 3, 6, 9], sus4: [0, 5, 7], sus2: [0, 2, 7] };
const MINORISH = ['m', 'm7', 'd', 'hd', 'd7'];
const SUFFIX = { M: '', m: 'm', d: '°', 7: '7', M7: 'maj7', m7: 'm7', hd: 'ø', d7: '°7', sus4: 'sus4', sus2: 'sus2' };

// Наклон руки высоты меняет вид аккорда (если включено): lean — наклон в плоскости кадра, как стрелка
// (+ наружу, от себя в сторону), tilt — вперёд (+, пальцы к камере) и назад. Ладонь/тыльная сторона по-прежнему
// задаёт мажорную или минорную семью:
//   наружу — септаккорд (C7 / Cm7 / Cø), внутрь — большой септ у мажора (Cmaj7), уменьшённый у минора (C° / C°7);
//   вперёд — sus4, назад — sus2. Прямо — трезвучие.
export const LEAN_ON = 24, TILT_ON = 38; // вперёд-назад — с запасом: рука с вытянутыми пальцами и так слегка наклонена
export function shapeOf(q, lean = 0, tilt = 0) {
  if (tilt > TILT_ON) return 'sus4';
  if (tilt < -TILT_ON) return 'sus2';
  if (lean > LEAN_ON) return q === 'M' ? '7' : q === 'd' ? 'hd' : 'm7';
  if (lean < -LEAN_ON) return q === 'M' ? 'M7' : q === 'd' ? 'd7' : 'd';
  return q;
}
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
  // знак тональности, показанный рукой (профи), решает сам: C♯ — диезы, D♭ — бемоли
  const flat = key.acc ? key.acc < 0 : [5, 10, 3, 8, 1, 6].includes(((key.mode === 'min' ? key.root + 3 : key.root) % 12 + 12) % 12);
  const nm = (flat ? FL : SH)[c.root] + (SUFFIX[c.q] ?? '');
  const r = ROMAN[c.n - 1], sx = c.q === 'M' || c.q === 'm' ? '' : SUFFIX[c.q];
  return { name: nm, roman: (MINORISH.includes(c.q) ? r.toLowerCase() : r) + (c.q === 'm' ? '' : c.q === 'd' ? '°' : sx) };
}

// Расположение: бас (основной тон снизу) и голоса аккорда (три или четыре) в том обращении, середина которого
// ближе всего к center (MIDI) — высота руки плавно переводит аккорд из обращения в обращение
export function voicing(c, center = 60) {
  const sh = SHAPES[c.q] || SHAPES.M;
  let best = null;
  for (let base = Math.floor(center) - 24; base <= Math.floor(center) + 12; base++) {
    if (((base - c.root) % 12 + 12) % 12 !== 0) continue;
    for (let inv = 0; inv < sh.length; inv++) {
      const notes = sh.map((x, k) => base + x + (k < inv ? 12 : 0)).sort((a, b) => a - b);
      const mid = (notes[0] + notes.at(-1)) / 2, dv = Math.abs(mid - center);
      if (!best || dv < best.dv) best = { notes, dv };
    }
  }
  const top = best.notes, bass = top[0] - ((top[0] - c.root) % 12 + 12) % 12 - 12; // основной тон ниже всех
  return [bass, ...top];
}

// Голоса к следующему аккорду — к ближайшим нотам (по порядку снизу вверх), чтобы переход был плавным
export const sameChord = (a, b) => !!a && !!b && a.root === b.root && a.q === b.q;

/* ---------- гармония соло ---------- */

// Пальцы правой руки в соло — какие голоса звучат с мелодией. Ладонь, кулак или один палец — одна мелодия.
// Жесты 2, 3, 4, 6 (большой к мизинцу), 7 (большой к безымянному); что они делают — зависит от стиля.
// Голос: число — точный сдвиг в полутонах, 'dK' — K ступеней тональности вверх (минус — вниз)
export const HARM_STYLES = {
  // классика: терции и сексты по тональности, трезвучие, хорал
  classic: { 2: ['d2'], 3: ['d2', 'd4'], 4: ['d-2', 'd-5'], 6: ['d5'], 7: ['d-5'] },
  // джаз: блок-аккорды под мелодией (Ширинг), кварты (Тайнер), «верхняя структура» на тон выше, шелл, drop 2
  jazz: { 2: ['d-2', 'd-4', 'd-6'], 3: ['d-3', 'd-6'], 4: [2, 6, 9], 6: ['d-2', 'd-6'], 7: ['d-4', 'd-6', 'd-9'] },
  // рок: терции двух гитар, «пауэр», сексты сверху, кварта снизу, квинта снизу с терцией сверху
  rock: { 2: ['d2'], 3: [7, 12], 4: ['d5'], 6: [-5], 7: [-7, 'd2'] },
  // кино: параллельные мажорные и минорные трезвучия, кварта с секстой, sus2, мерцающая большая септима
  film: { 2: [4, 7], 3: [3, 7], 4: [5, 9], 6: [2, 7], 7: [4, 11] },
};
export const HARM_IDS = Object.keys(HARM_STYLES);

export function harmOf(sign, style = 'classic') {
  if (!sign || sign.kind !== 'num') return null;
  const set = HARM_STYLES[style] || HARM_STYLES.classic;
  return set[sign.n] ? style + ':' + sign.n : null;
}

// Сдвиги голосов (полутоны) от ноты m для вида гармонии 'стиль:жест'; ступени — по тональности key
export function harmOffsets(kind, m, key = { root: 0, mode: 'maj' }) {
  if (!kind) return [];
  const [style, n] = kind.split(':'), spec = (HARM_STYLES[style] || {})[n] || [];
  const st = STEPS[key.mode === 'min' ? 'min' : 'maj'], r = key.root || 0, pc = ((Math.round(m) - r) % 12 + 12) % 12;
  // ступень — ближайшая снизу нота тональности (нота вне тональности гармонизуется как ближайшая ступень)
  let j = 0;
  st.forEach((x, i) => { if (x <= pc) j = i; });
  const step = (k) => { const q = j + k; return st[((q % 7) + 7) % 7] + 12 * Math.floor(q / 7) - st[j]; };
  return spec.map((x) => (typeof x === 'number' ? x : step(+x.slice(1))));
}

/* ---------- профи: тональность левой рукой ---------- */

// Профи-режим аккордов (решение автора): левая рука (рука эффектов) показывает тональность, правая — ступени
// по нэшвиллской системе. Число на левой руке — буква: 1 — C, 2 — D, 3 — E, 4 — F, 5 — G, 6 — A, 7 — B (6 и 7 — как
// у правой: большой к мизинцу, к безымянному). Поворот ладони — знак: в одну сторону ♯, в другую ♭, прямо — без знака.
// Чем поворачивать — настраивается (acc): 'rot' — кисть в плоскости кадра, как ручку (по умолчанию), 'turn' — разворот
// ладони ребром, 'tilt' — наклон пальцев к камере и от неё; flip — поменять стороны ♯ и ♭.
// Лад: minor 'back' — тыльной стороной к камере — минорная тональность (кроме acc 'turn': там ладонь и так поворачивается).
// Кулак или рука не видна — тональность прежняя.
export const KEY_LETTERS = [0, 2, 4, 5, 7, 9, 11];
export const ACC_GESTURES = ['rot', 'turn', 'tilt'];
export const ACC_ON = { rot: 28, turn: 40, tilt: 35 }; // столько градусов от прямого — уже знак
export function keySign(sign, p, o = {}) {
  if (!sign || sign.kind !== 'num' || !(sign.n >= 1 && sign.n <= 7)) return null;
  const acc = ACC_GESTURES.includes(o.acc) ? o.acc : 'rot', v = (p && p[acc]) ?? 0;
  let a = v > ACC_ON[acc] ? 1 : v < -ACC_ON[acc] ? -1 : 0;
  if (o.flip) a = -a;
  const letter = sign.n - 1, root = ((KEY_LETTERS[letter] + a) % 12 + 12) % 12;
  const minor = o.minor !== 'off' && acc !== 'turn' && sign.palm === false;
  return { root, mode: minor ? 'min' : 'maj', letter, acc: a };
}
// Название тональности так, как её показали: C♯ или D♭ (одна и та же нота), строчная «m» — минор
export function keyName(k) {
  if (!k) return '';
  return 'CDEFGAB'[k.letter] + (k.acc > 0 ? '♯' : k.acc < 0 ? '♭' : '') + (k.mode === 'min' ? 'm' : '');
}
