// Терменвокс: руки в кадре → звук. Без DOM, камеры и звука — только расчёты (проверяются тестами).
// Точки руки — 21 ориентир MediaPipe в долях кадра (x, y от 0 до 1, y вниз): 0 — запястье, 4/8/12/16/20 — кончики пальцев,
// 5/9/13/17 — основания пальцев. Изображение показывается зеркально, как в зеркале: x здесь уже зеркальный.

const PALM = [0, 5, 9, 13, 17], TIPS = [8, 12, 16, 20];
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const clamp01 = (v) => Math.max(0, Math.min(1, v));

// Центр ладони
export function palm(lm) {
  let x = 0, y = 0;
  PALM.forEach((i) => { x += lm[i].x; y += lm[i].y; });
  return { x: x / PALM.length, y: y / PALM.length };
}

// Раскрытость ладони: 0 — кулак, 1 — раскрыта. Длина пальцев меряется размером самой ладони — не зависит от расстояния до камеры
export function openness(lm) {
  const size = dist(lm[0], lm[9]) || 1e-6;
  const r = TIPS.reduce((s, i) => s + dist(lm[i], lm[0]), 0) / TIPS.length / size;
  // кулак ≈ 0,9–1,1, раскрытая ладонь ≈ 1,8–2,1
  const u = clamp01((r - 1.15) / 0.55);
  return u * u * (3 - 2 * u);
}

// Какая рука ведёт высоту. hands — [{ lm (уже зеркальные x) }]; pitchSide — 'right' | 'left' (рука музыканта).
// В зеркальном кадре правая рука — справа. Две руки — по положению; одна — по половине кадра, где она находится
export function assign(hands, pitchSide = 'right') {
  const withX = hands.map((h) => ({ ...h, c: palm(h.lm) }));
  const right = pitchSide === 'right';
  if (withX.length >= 2) {
    withX.sort((a, b) => a.c.x - b.c.x);
    const [l, r] = [withX[0], withX[withX.length - 1]];
    return right ? { pitch: r, fx: l } : { pitch: l, fx: r };
  }
  if (withX.length === 1) {
    const h = withX[0], onPitchSide = right ? h.c.x >= 0.5 : h.c.x < 0.5;
    return onPitchSide ? { pitch: h, fx: null } : { pitch: null, fx: h };
  }
  return { pitch: null, fx: null };
}

// Высота руки в кадре → положение 0…1 (1 — рука вверху). Края кадра не используются: там рука теряется
export const EDGE = 0.1;
export const heightOf = (y) => clamp01(1 - (y - EDGE) / (1 - 2 * EDGE));

// Характер звука — горизонталь руки высоты: у края кадра — ярче, к середине — мягче
export const characterOf = (x, pitchSide = 'right') => clamp01(pitchSide === 'right' ? (x - 0.5) / 0.45 : (0.5 - x) / 0.45);

/* ---------- рука эффектов: положение и жесты ---------- */

const deg = (r) => (r * 180) / Math.PI;
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: (a.z || 0) - (b.z || 0) });
const unit = (v) => { const l = Math.hypot(v.x, v.y, v.z) || 1e-9; return { x: v.x / l, y: v.y / l, z: v.z / l }; };
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });

// Положение руки: h — { lm (кадр, доли), w (объёмные точки в метрах, если есть), ar (ширина/высота кадра) }.
//   rot  — поворот кисти в плоскости кадра, ° (0 — пальцы вверх): «крутить как ручку»; самый надёжный угол
//   turn — разворот ладони, ° (0 — ладонь к камере, ±90 — ребром); tilt — наклон пальцев к камере (+) и от неё (−), °
//   size — размер ладони в кадре (ближе к камере — больше); pinch — щепоть: расстояние большой–указательный / ладонь
export function pose(h) {
  const lm = h.lm, ar = h.ar || 4 / 3, c = palm(lm);
  const ux = (lm[9].x - lm[0].x) * ar, uy = lm[9].y - lm[0].y;
  const size = Math.hypot(ux, uy) || 1e-6;
  const p = { x: c.x, y: c.y, open: openness(lm), size, rot: deg(Math.atan2(ux, -uy)), turn: null, tilt: null,
    pinch: Math.hypot((lm[4].x - lm[8].x) * ar, lm[4].y - lm[8].y) / size };
  const w = h.w;
  if (w && w.length === 21) {
    const u = unit(sub(w[9], w[0])), n = unit(cross(sub(w[17], w[5]), u));
    p.turn = deg(Math.atan2(n.x, Math.abs(n.z)));
    p.tilt = deg(Math.atan2(-u.z, Math.hypot(u.x, u.y)));
  }
  return p;
}

// Нейтральное положение по умолчанию (пока его не запомнили): ладонь к камере, пальцы вверх, рука на расстоянии вытянутой руки
export const NEUTRAL = { rot: 0, turn: 0, tilt: 0, size: 0.15 };
// Сколько нужно отклониться для полной силы: поворот 60°, разворот 70°, наклон 50°, ближе к камере в 1,6 раза
export const SPAN = { rot: 60, turn: 70, tilt: 50, dist: 0.6 };
const DEAD = 0.08; // небольшое отклонение от нейтрали — не считается (рука не стоит идеально неподвижно)
const dz = (v) => clamp01((v - DEAD) / (1 - DEAD));

// Жесты руки эффектов → силы 0…1. side — сторона руки высоты (рука эффектов — с другой стороны)
export const GESTURES = ['open', 'height', 'rot', 'tilt', 'dist', 'turn', 'x'];
export function gestureValues(p, cal = NEUTRAL, side = 'right') {
  const n = { ...NEUTRAL, ...cal };
  return {
    open: p.open,
    height: heightOf(p.y),
    rot: dz(Math.abs(p.rot - n.rot) / SPAN.rot),
    tilt: p.tilt == null ? 0 : dz(Math.abs(p.tilt - n.tilt) / SPAN.tilt),
    dist: dz((p.size / (n.size || NEUTRAL.size) - 1) / SPAN.dist),
    turn: p.turn == null ? 0 : dz(Math.abs(p.turn - n.turn) / SPAN.turn),
    x: characterOf(p.x, side === 'right' ? 'left' : 'right'), // наружу, к своему краю кадра — сильнее
  };
}
// Щепоть: кончики большого и указательного сведены
export const PINCH_ON = 0.32, PINCH_OFF = 0.45;

// Что можно назначить жесту. space — пространство: реверберация и эхо вместе; vol — громкость
export const TARGETS = ['off', 'vol', 'space', 'tone', 'vib', 'trem', 'drive', 'fuzz', 'echo', 'verb'];
// По умолчанию — просто: ладонь раскрыта — звук, кулак — тишина; остальные движения ничего не меняют
export const DEFAULT_MAP = { open: 'vol', height: 'off', rot: 'off', tilt: 'off', dist: 'off', turn: 'off', x: 'off', pinch: 'off' };
// «Все эффекты» — прежний набор: пространство, тембр, вибрато, перегруз, тремоло, фиксация щепотью
export const RICH_MAP = { open: 'vol', height: 'space', rot: 'tone', tilt: 'vib', dist: 'drive', turn: 'trem', x: 'off', pinch: 'freeze' };

// Силы жестов → эффекты: { bright, vib, trem, drive, fuzz, echo, verb } (наибольшее из назначенных) и vol (произведение; 1 — не назначено)
export function applyGestures(vals, map = DEFAULT_MAP) {
  const out = { bright: 0, vib: 0, trem: 0, drive: 0, fuzz: 0, echo: 0, verb: 0, vol: 1 };
  const put = (k, v) => { out[k] = Math.max(out[k], v); };
  GESTURES.forEach((g) => {
    const tg = map[g] || 'off', v = clamp01(vals[g] || 0);
    if (tg === 'off') return;
    if (tg === 'vol') out.vol *= v;
    else if (tg === 'space') { put('verb', v); put('echo', v * 0.6); }
    else if (tg === 'tone') put('bright', v);
    else put(tg, v);
  });
  return out;
}

// Сглаживание «один евро» (Casiez и др., 2012): почти не дрожит, когда рука стоит, и почти не отстаёт, когда движется
export function oneEuro({ minCutoff = 1.2, beta = 0.6, dCutoff = 1 } = {}) {
  let x = null, dx = 0, t0 = 0;
  const alpha = (cut, dt) => { const r = 2 * Math.PI * cut * dt; return r / (r + 1); };
  return {
    reset() { x = null; dx = 0; },
    next(v, t) {
      if (x == null) { x = v; t0 = t; return v; }
      const dt = Math.max(1e-3, (t - t0) / 1000);
      t0 = t;
      const ad = alpha(dCutoff, dt), d = (v - x) / dt;
      dx = dx + ad * (d - dx);
      const a = alpha(minCutoff + beta * Math.abs(dx), dt);
      x = x + a * (v - x);
      return x;
    },
  };
}

/* ---------- жесты двумя руками: смена звука ---------- */

// Касания рук друг друга меняют звук терменвокса (не эффекты):
// 'palms' — ладони сложены вместе (центры ладоней рядом, обе руки раскрыты) — следующий звук;
// 'tips' — кончики указательных пальцев касаются друг друга, ладони порознь — предыдущий звук.
// Расстояния — в размерах самой ладони (от запястья до основания среднего пальца), с учётом пропорций кадра (ar).
export function twoHandSign(a, b, ar = 4 / 3) {
  if (!a || !b) return null;
  const d = (p, q) => Math.hypot((p.x - q.x) * ar, p.y - q.y);
  const size = (d(a[0], a[9]) + d(b[0], b[9])) / 2 || 1e-6;
  const pa = palm(a), pb = palm(b), palms = d(pa, pb) / size, tips = d(a[8], b[8]) / size;
  if (palms < 0.85 && openness(a) > 0.5 && openness(b) > 0.5) return 'palms';
  if (tips < 0.3 && palms > 1.6) return 'tips';
  return null;
}
