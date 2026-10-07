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
