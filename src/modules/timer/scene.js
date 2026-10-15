// Сцена под таймером (помодоро и секундомер): спокойная анимация на выбор (settings.scene), без камня и звания.
//   • strings — струны: по очереди мягко колеблются (стоячая волна затухает), сыгранная часть интервала — светлее;
//   • water   — вода: волны текут, уровень поднимается вместе с ходом интервала;
//   • off     — без анимации.
// Перерыв — всё медленнее и тише; пауза — замирает; «меньше движения» в системе — неподвижная картинка.
// «Минимал» — линии и оттенки серого; обычный вид — оттенок инструмента (--tint).
export const SCENES = ['strings', 'water', 'off']; // песочные часы убраны (решение автора)

// view() → { running, brk, frac }; kind — вид сцены; c — ctx модуля
export function createScene(el, c, view, kind = 'strings') {
  const cv = el.querySelector('canvas'), g = cv.getContext('2d');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const css = getComputedStyle(el), col = (k, d) => (css.getPropertyValue(k) || d).trim();
  const INK = col('--ink', '#111'), L3 = col('--l3', '#bbb'), TINT = c.mono ? INK : col('--tint', '#9C7242');
  let raf = 0, last = 0, W = 0, H = 0, alive = true, T = 0, energy = 0;

  /* ---------- струны ---------- */
  const NS = 6, pluck = Array.from({ length: NS }, (_, i) => ({ amp: 0, t: 0, mode: 1 + (i % 3) }));
  let nextPluck = 0, order = 0;
  function stringsStep(dt, v) {
    // струна за струной, как перебор: каждые ~1,6 с (в перерыве — реже и тише)
    nextPluck -= dt;
    if (v.running && nextPluck <= 0) {
      const s = pluck[[0, 3, 1, 4, 2, 5][order++ % NS]];
      s.amp = v.brk ? 0.45 : 1; s.t = 0;
      nextPluck = v.brk ? 2.8 : 1.6;
    }
    pluck.forEach((s) => { s.t += dt; s.amp *= Math.pow(v.brk ? 0.4 : 0.3, dt); });
  }
  function stringsDraw(v) {
    const top = H * 0.16, gap = (H * 0.68) / (NS - 1), x0 = W * 0.06, x1 = W * 0.94, len = x1 - x0;
    for (let i = 0; i < NS; i++) {
      const s = pluck[i], y = top + i * gap, A = s.amp * gap * 0.42 * energy, w = 2 * Math.PI * (2.2 + i * 0.35);
      const lw = 0.8 + (NS - 1 - i) * 0.28; // басовые — толще
      // сыгранная часть интервала — оттенком, остальное — тихой линией
      const split = x0 + len * Math.max(0, Math.min(1, v.frac || 0));
      for (const [a, b, color, alpha] of [[x0, split, TINT, 0.9], [split, x1, c.mono ? L3 : TINT, c.mono ? 0.9 : 0.35]]) {
        if (b - a < 0.5) continue;
        g.beginPath();
        for (let x = a; x <= b + 0.1; x += 3) {
          const u = (x - x0) / len, yy = y + A * Math.sin(Math.PI * s.mode * u) * Math.cos(w * s.t);
          if (x === a) g.moveTo(x, yy); else g.lineTo(x, yy);
        }
        g.strokeStyle = color; g.globalAlpha = alpha; g.lineWidth = lw; g.stroke();
      }
    }
    g.globalAlpha = 1;
  }

  /* ---------- вода ---------- */
  let level = null;
  function waterDraw(v) {
    const want = 0.14 + 0.72 * Math.max(0, Math.min(1, v.frac || 0));
    level = level == null ? want : level + (want - level) * 0.05;
    const base = H * (1 - level), amp = H * 0.035 * (0.35 + 0.65 * energy);
    const layers = [[0.55, 1.2, 0.0, 0.28], [0.85, 0.8, 1.7, 0.45], [1.0, 1.5, 3.1, 0.9]];
    layers.forEach(([k, sp, ph, alpha], li) => {
      g.beginPath();
      g.moveTo(0, H);
      for (let x = 0; x <= W + 4; x += 4) {
        const y = base + li * 3 + amp * k * (Math.sin(x / (W * 0.18) + T * sp + ph) + 0.5 * Math.sin(x / (W * 0.07) - T * sp * 1.3 + ph));
        g.lineTo(x, y);
      }
      g.lineTo(W, H); g.closePath();
      if (c.mono) { g.strokeStyle = INK; g.globalAlpha = alpha * 0.8; g.lineWidth = 1; g.stroke(); }
      else { g.fillStyle = TINT; g.globalAlpha = alpha * 0.32; g.fill(); }
    });
    g.globalAlpha = 1;
  }

  /* ---------- кадр ---------- */
  function size() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    W = cv.clientWidth; H = cv.clientHeight;
    if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function frame(tm) {
    raf = 0;
    if (!alive || !cv.isConnected || kind === 'off') return;
    const dt = Math.min(0.05, last ? (tm - last) / 1000 : 0.016);
    last = tm;
    size();
    if (!W || !H) return;
    const v = view();
    const target = still || !v.running ? 0 : v.brk ? 0.45 : 1;
    energy += (target - energy) * Math.min(1, dt * 1.5);
    if (!still) {
      T += dt * (0.3 + 0.7 * energy);
      if (kind === 'strings') stringsStep(dt, v);
    }
    g.clearRect(0, 0, W, H);
    (kind === 'water' ? waterDraw : stringsDraw)(v);
    const busy = v.running || energy > 0.02 || pluck.some((s) => s.amp > 0.01);
    if (!still && busy && document.visibilityState === 'visible') raf = requestAnimationFrame(frame);
  }
  const kick = () => { if (!raf && alive) { last = 0; raf = requestAnimationFrame(frame); } };
  const onVis = () => { if (document.visibilityState === 'visible') kick(); };
  document.addEventListener('visibilitychange', onVis);
  kick();
  return {
    kick,
    destroy() { alive = false; cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', onVis); },
  };
}
