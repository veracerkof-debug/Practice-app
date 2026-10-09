// Сцена под таймером: как обрабатывается камень, пока идёт помодоро или секундомер.
//   • «Минимал» — свой камень пользователя (та же порода и форма, что на главной): то он в реке — течение,
//     навстречу галька, камни сталкиваются, брызги; то катится по дороге — подскакивает на камешках, пыль.
//     В перерыве река тихая, камень отдыхает. Только линии и оттенки серого.
//   • Обычный вид — текущий самоцвет на станке: камень и сырец обтёсываются зубилом и молотком (сколы летят),
//     самоцветы шлифуются кругом (искры), блеск проходит по камню вместе с ходом интервала.
// Пауза — всё замирает; «меньше движения» в системе — неподвижная картинка.
import { stoneMesh, paintStone, wear, dark, qmul, qaxis } from '../../ui/stone.js';
import { gemSVG } from '../../ui/gems.js';

const nq = (a) => { const l = Math.hypot(...a) || 1; return a.map((x) => x / l); };
function rng(seed) { let a = (seed >>> 0) || 7; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; }
// Состояние между перерисовками окна (таймер перерисовывает разметку при пуске, паузе, смене фазы)
const memo = { q: null, speed: 0, flow: 0, spin: 0 };

// view() → { running, brk, frac }; c — ctx модуля
export function createScene(el, c, view) {
  const cv = el.querySelector('canvas'), g = cv.getContext('2d');
  const S = c.stone(), mono = c.mono, still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const css = getComputedStyle(el), col = (k, d) => (css.getPropertyValue(k) || d).trim();
  const INK = col('--ink', '#111'), L2 = col('--l2', '#666'), L3 = col('--l3', '#999'), SEP = col('--sep', '#ddd'), TINT = col('--tint', '#9C7242');
  const R = rng(S.seed);
  let raf = 0, last = 0, W = 0, H = 0, alive = true;
  const parts = []; // брызги, пыль, искры, сколы: { x, y, vx, vy, life, max, kind, r }

  /* ---------- «Минимал»: река и дорога ---------- */
  const mesh = mono ? stoneMesh(S.seed, S.hours, 2) : null, polish = wear(S.hours).edges;
  if (!memo.q) memo.q = nq(qmul(qaxis(1, 0, 0, 0.5), qaxis(0, 1, 0, 0.6)));
  // река или дорога — по дню (в перерыве — тихая река)
  const scene = () => (view().brk ? 'calm' : Math.floor(Date.now() / 864e5) % 2 ? 'road' : 'river');
  const pebbles = [];
  const pebble = (x) => {
    const n = 7 + Math.floor(R() * 4), r = H * (0.06 + R() * 0.07), rs = Array.from({ length: n }, () => 0.78 + R() * 0.3);
    return { x, y: H * (0.42 + R() * 0.38), r, rs, shade: R(), vy: 0, rot: R() * 6.3, hit: false };
  };
  // камешки дороги (повторяющийся узор на 600 px): мелкий гравий и редкие бугорки
  const ROAD = Array.from({ length: 46 }, () => ({ x: R() * 600, y: R() * 7, r: 0.6 + R() * 1.6 }));
  const BUMPS = [90, 330, 470];
  let hop = 0, hopV = 0, jolt = 0, joltV = 0;

  function stoneAt() { return { x: W * 0.4 + jolt, y: (scene() === 'road' ? H * 0.8 - H * 0.24 - hop : H * 0.56 + Math.sin(performance.now() / 700) * 1.5 * (memo.speed > 1 ? 1 : 0)), r: H * 0.24 }; }

  function monoStep(dt) {
    const v = view(), sc = scene();
    const target = !v.running ? 0 : sc === 'calm' ? 10 : sc === 'road' ? 52 : 44;
    memo.speed += (target - memo.speed) * Math.min(1, dt * 1.6);
    const dx = memo.speed * dt;
    memo.flow += dx;
    const st = stoneAt();
    // вращение: на дороге — честное качение, в реке — течение поворачивает и покачивает
    const ang = sc === 'road' ? dx / st.r : dx / st.r * 0.35;
    if (ang) memo.q = nq(qmul(qaxis(0, 0, 1, ang), memo.q));
    if (sc !== 'road' && memo.speed > 1) memo.q = nq(qmul(qaxis(0, 1, 0, dt * 0.25), memo.q));
    if (memo.spin) { memo.q = nq(qmul(qaxis(0.3, 1, 0.2, memo.spin * dt), memo.q)); memo.spin *= Math.pow(0.08, dt); }
    // пружина толчка
    joltV += (-jolt * 60 - joltV * 9) * dt; jolt += joltV * dt;
    if (sc === 'road') {
      // бугорок под камнем — подскок и пыль
      const under = ((memo.flow + st.x) % 600 + 600) % 600;
      if (memo.speed > 5 && hop <= 0 && BUMPS.some((b) => Math.abs(under - b) < dx + 0.5)) {
        hopV = 70 + R() * 40;
        for (let i = 0; i < 6; i++) parts.push({ x: st.x - st.r * 0.6, y: H * 0.8, vx: -20 - R() * 40, vy: -10 - R() * 25, life: 0, max: 0.6 + R() * 0.4, kind: 'dust', r: 1.2 + R() * 2 });
      }
      hopV -= 420 * dt; hop = Math.max(0, hop + hopV * dt); if (hop === 0 && hopV < 0) hopV = 0;
      if (memo.speed > 20 && R() < dt * 6) parts.push({ x: st.x - st.r * 0.7, y: H * 0.8 - 1, vx: -memo.speed * 0.6, vy: -8 - R() * 10, life: 0, max: 0.5, kind: 'dust', r: 1 + R() });
    } else {
      // галька плывёт навстречу; столкновение — толчок, брызги
      if (sc === 'river' && memo.speed > 5 && (!pebbles.length || pebbles[pebbles.length - 1].x < W - H * (0.6 + R() * 0.9))) pebbles.push(pebble(W + H * 0.2));
      pebbles.forEach((p) => {
        p.x -= dx * (0.9 + p.shade * 0.3); p.y += p.vy * dt; p.vy *= Math.pow(0.3, dt); p.rot -= dx / Math.max(4, p.r) * 0.5;
        const ddx = p.x - st.x, ddy = p.y - st.y, d = Math.hypot(ddx, ddy), min = st.r * 0.9 + p.r;
        if (!p.hit && d < min) {
          p.hit = true;
          p.vy = (ddy >= 0 ? 1 : -1) * (40 + R() * 40);
          joltV -= 40 + p.r * 2; memo.spin += 1.2 + R();
          const cx = st.x + ddx * (st.r * 0.9 / d), cy = st.y + ddy * (st.r * 0.9 / d);
          for (let i = 0; i < 9; i++) parts.push({ x: cx, y: cy, vx: (R() - 0.3) * 90, vy: -40 - R() * 80, life: 0, max: 0.5 + R() * 0.4, kind: 'drop', r: 1 + R() * 1.6 });
        }
      });
      while (pebbles.length && pebbles[0].x < -H * 0.3) pebbles.shift();
    }
  }

  function wavyLine(y, amp, k, off, dash, alpha, w = 1) {
    g.save();
    g.globalAlpha = alpha; g.strokeStyle = L3; g.lineWidth = w; g.setLineDash(dash); g.lineDashOffset = off;
    g.beginPath();
    for (let x = 0; x <= W; x += 6) { const yy = y + Math.sin(x * k + off * 0.02) * amp; x ? g.lineTo(x, yy) : g.moveTo(x, yy); }
    g.stroke(); g.restore();
  }
  function drawPebble(p) {
    g.save(); g.translate(p.x, p.y); g.rotate(p.rot);
    const v = 150 + Math.round(p.shade * 60), dk = dark();
    const c1 = dk ? 'rgb(' + (v - 90) + ',' + (v - 90) + ',' + (v - 88) + ')' : 'rgb(' + v + ',' + v + ',' + (v + 2) + ')';
    g.fillStyle = c1; g.beginPath();
    p.rs.forEach((k, i) => { const a = (i / p.rs.length) * Math.PI * 2, x = Math.cos(a) * p.r * k, y = Math.sin(a) * p.r * k * 0.72; i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.closePath(); g.fill();
    g.globalAlpha = 0.35; g.fillStyle = dk ? '#000' : '#fff'; g.beginPath(); g.ellipse(-p.r * 0.25, -p.r * 0.25, p.r * 0.35, p.r * 0.18, -0.4, 0, Math.PI * 2); g.fill();
    g.restore();
  }
  function monoDraw() {
    const sc = scene(), st = stoneAt(), f = memo.flow, dk = dark();
    if (sc === 'road') {
      const gy = H * 0.8;
      // дальний край дороги — пунктир, ближний — сплошная; гравий
      wavyLine(H * 0.34, 0, 0, f * 0.3, [3, 14], 0.35);
      g.strokeStyle = L2; g.lineWidth = 1; g.globalAlpha = 0.8; g.beginPath(); g.moveTo(0, gy); g.lineTo(W, gy); g.stroke(); g.globalAlpha = 1;
      g.fillStyle = L3;
      for (let k = -1; k <= Math.ceil(W / 600); k++) ROAD.forEach((p) => { const x = p.x + k * 600 - (f % 600); if (x > -4 && x < W + 4) { g.globalAlpha = 0.55; g.beginPath(); g.arc(x, gy + 3 + p.y, p.r, 0, 6.3); g.fill(); } });
      for (let k = -1; k <= Math.ceil(W / 600); k++) BUMPS.forEach((b) => { const x = b + k * 600 - (f % 600); if (x > -8 && x < W + 8) { g.globalAlpha = 0.8; g.beginPath(); g.ellipse(x, gy - 1, 4, 2.4, 0, Math.PI, 0); g.fill(); } });
      g.globalAlpha = 1;
      // тень прижимается к дороге и тает при подскоке
      g.fillStyle = dk ? 'rgba(0,0,0,.4)' : 'rgba(0,0,0,.1)';
      g.beginPath(); g.ellipse(st.x, gy - 1, st.r * 0.8 * (1 - hop / (H * 0.6)), st.r * 0.1, 0, 0, 6.3); g.fill();
      paintStone(g, mesh, memo.q, st.x, st.y, st.r, { dark: dk, polish, shadow: false });
    } else {
      // река: дальние струи, галька, камень, ближние струи поверх — камень в воде
      for (let k = 0; k < 4; k++) wavyLine(H * (0.18 + k * 0.09), 2, 0.02 + k * 0.004, -f * (0.6 + 0.15 * k), [16 + 6 * k, 12 + 5 * k], 0.25 + 0.08 * k);
      pebbles.forEach(drawPebble);
      paintStone(g, mesh, memo.q, st.x, st.y, st.r, { dark: dk, polish, shadow: false });
      for (let k = 0; k < 3; k++) wavyLine(H * (0.66 + k * 0.1), 2.5, 0.018 + k * 0.005, -f * (1 + 0.2 * k), [22 + 8 * k, 14 + 6 * k], 0.5 - 0.1 * k, 1.2);
      // струя огибает камень
      if (memo.speed > 3) { g.save(); g.globalAlpha = Math.min(0.5, memo.speed / 60); g.strokeStyle = L3; g.setLineDash([6, 6]); g.lineDashOffset = -f; g.beginPath(); g.arc(st.x, st.y, st.r * 1.15, Math.PI * 0.55, Math.PI * 1.45); g.stroke(); g.restore(); }
    }
  }

  /* ---------- обычный вид: огранка самоцвета ---------- */
  const gemEl = el.querySelector('.tgem');
  const chisel = !mono && (S.gem.gem.id === 'stone');
  let wheelA = 0, wheelV = 0, strikeT = 0, shake = 0;
  if (!mono && gemEl) gemEl.innerHTML = gemSVG(S.gem.gem.id, S.gem.frac, 86);
  function gemGeo() { return { x: W * 0.56, y: H * 0.5, r: 38 }; }
  function classicStep(dt) {
    const v = view(), on = v.running && !v.brk, gm = gemGeo();
    wheelV += ((on ? 14 : 0) - wheelV) * Math.min(1, dt * 2.2);
    wheelA += wheelV * dt;
    shake *= Math.pow(0.001, dt);
    if (chisel) {
      if (on) {
        strikeT += dt;
        if (strikeT >= 0.95) {
          strikeT = 0; shake = 3;
          const cx = gm.x + gm.r * 0.55, cy = gm.y - gm.r * 0.55;
          for (let i = 0; i < 7; i++) parts.push({ x: cx, y: cy, vx: 30 + R() * 90, vy: -60 - R() * 80, life: 0, max: 0.7 + R() * 0.3, kind: 'chip', r: 1.5 + R() * 2.5, a: R() * 6.3 });
        }
      }
    } else if (on && wheelV > 4) {
      const n = Math.floor(dt * 70 + R());
      const cx = gm.x - gm.r * 0.78, cy = gm.y + gm.r * 0.5;
      for (let i = 0; i < n; i++) parts.push({ x: cx, y: cy, vx: -40 - R() * 120, vy: -60 - R() * 110, life: 0, max: 0.35 + R() * 0.35, kind: 'spark', r: 1 });
    }
    if (gemEl) gemEl.style.transform = 'translate(' + ((R() - 0.5) * shake).toFixed(2) + 'px,' + ((R() - 0.5) * shake).toFixed(2) + 'px) rotate(' + (on ? Math.sin(performance.now() / 900) * 4 : 0).toFixed(2) + 'deg)';
  }
  function classicDraw() {
    const v = view(), gm = gemGeo(), dk = dark();
    // верстак
    g.strokeStyle = SEP; g.lineWidth = 2; g.beginPath(); g.moveTo(W * 0.12, H * 0.9); g.lineTo(W * 0.88, H * 0.9); g.stroke();
    // блеск проходит по камню вместе с ходом интервала
    g.save(); g.beginPath(); g.arc(gm.x, gm.y, gm.r * 0.95, 0, 6.3); g.clip();
    const bx = gm.x - gm.r + v.frac * gm.r * 2, gr = g.createLinearGradient(bx - 18, 0, bx + 18, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,' + (v.running ? 0.45 : 0.2) + ')'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(bx - 18, gm.y - gm.r, 36, gm.r * 2); g.restore();
    if (chisel) {
      // зубило упирается в камень справа сверху, молоток бьёт по нему
      const tx = gm.x + gm.r * 0.6, ty = gm.y - gm.r * 0.6, ang = -Math.PI / 4;
      g.save(); g.translate(tx, ty); g.rotate(ang);
      g.fillStyle = dk ? '#9AA0A6' : '#7C8288'; g.fillRect(4, -3, 34, 6); g.beginPath(); g.moveTo(4, -3); g.lineTo(-2, 0); g.lineTo(4, 3); g.fill();
      g.fillStyle = dk ? '#C9A27A' : '#A47148'; g.fillRect(30, -4.5, 12, 9);
      // молоток: рукоять вращается вокруг конца, бойок замахивается и бьёт в торец зубила
      const p = v.running && !v.brk ? strikeT / 0.95 : 0.98, lift = p < 0.8 ? Math.sin((p / 0.8) * Math.PI * 0.5) : 1 - (p - 0.8) / 0.2;
      g.translate(88, 0); g.rotate(-lift * 0.95);
      g.fillStyle = dk ? '#C9A27A' : '#A47148'; g.fillRect(-42, -1.8, 42, 3.6);
      g.fillStyle = dk ? '#B0B6BC' : '#5F656B'; g.fillRect(-46, -10, 10, 20);
      g.restore();
    } else {
      // шлифовальный круг слева снизу: диск, спицы крутятся, ось
      const wr = 30, wx = gm.x - gm.r - wr * 0.62, wy = gm.y + gm.r * 0.55;
      g.save(); g.translate(wx, wy);
      const rg = g.createRadialGradient(-6, -6, 4, 0, 0, wr);
      rg.addColorStop(0, dk ? '#8A8F95' : '#D7DADD'); rg.addColorStop(1, dk ? '#4A4F55' : '#9AA0A6');
      g.fillStyle = rg; g.beginPath(); g.arc(0, 0, wr, 0, 6.3); g.fill();
      g.strokeStyle = dk ? 'rgba(255,255,255,.25)' : 'rgba(0,0,0,.25)'; g.lineWidth = 1.2;
      for (let i = 0; i < 8; i++) { const a = wheelA + (i * Math.PI) / 4; g.beginPath(); g.moveTo(Math.cos(a) * 6, Math.sin(a) * 6); g.lineTo(Math.cos(a) * (wr - 4), Math.sin(a) * (wr - 4)); g.stroke(); }
      g.fillStyle = dk ? '#2C2F33' : '#5F656B'; g.beginPath(); g.arc(0, 0, 4, 0, 6.3); g.fill();
      g.restore();
      g.strokeStyle = SEP; g.lineWidth = 3; g.beginPath(); g.moveTo(wx, wy); g.lineTo(wx - 8, H * 0.9); g.stroke();
    }
  }

  /* ---------- частицы ---------- */
  function partsStep(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life += dt;
      if (p.life >= p.max) { parts.splice(i, 1); continue; }
      p.px = p.x; p.py = p.y;
      p.vy += (p.kind === 'dust' ? -10 : p.kind === 'spark' ? 260 : 320) * dt;
      if (p.kind === 'dust') { p.vx *= Math.pow(0.2, dt); p.r += dt * 6; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.a != null) p.a += dt * 8;
    }
  }
  function partsDraw() {
    parts.forEach((p) => {
      const k = 1 - p.life / p.max;
      g.globalAlpha = Math.max(0, k);
      if (p.kind === 'spark') { g.strokeStyle = k > 0.5 ? '#FFC24D' : TINT; g.lineWidth = 2; g.beginPath(); g.moveTo(p.px ?? p.x, p.py ?? p.y); g.lineTo(p.x, p.y); g.stroke(); }
      else if (p.kind === 'chip') { g.save(); g.translate(p.x, p.y); g.rotate(p.a); g.fillStyle = L2; g.beginPath(); g.moveTo(-p.r, -p.r * 0.4); g.lineTo(p.r, -p.r * 0.7); g.lineTo(p.r * 0.4, p.r); g.closePath(); g.fill(); g.restore(); }
      else { g.fillStyle = p.kind === 'dust' ? L3 : L2; g.globalAlpha *= p.kind === 'dust' ? 0.45 : 0.8; g.beginPath(); g.arc(p.x, p.y, p.r, 0, 6.3); g.fill(); }
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
    if (!alive || !cv.isConnected) return;
    const dt = Math.min(0.05, last ? (tm - last) / 1000 : 0.016);
    last = tm;
    size();
    if (!W || !H) return;
    if (!still) { (mono ? monoStep : classicStep)(dt); partsStep(dt); }
    g.clearRect(0, 0, W, H);
    (mono ? monoDraw : classicDraw)();
    partsDraw();
    const v = view(), busy = v.running || memo.speed > 0.3 || wheelV > 0.3 || parts.length || Math.abs(joltV) > 0.5 || hop > 0;
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
