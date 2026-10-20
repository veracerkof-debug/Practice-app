// Графический эквалайзер: полотно с кривой и точками-полосами. Частота — по горизонтали (логарифм, 20 Гц … 20 кГц),
// усиление — по вертикали (±15 дБ). Вести точку — частота и усиление (в простом виде частоты закреплены — только
// усиление); двойное касание точки — в ноль; щипок — ширина полосы (Q); двойное касание пустого места — новая полоса
// (продвинутый вид). Срезы (низа и верха) ходят только по частоте. Кривая — eqResponse (fx.js), без звука.
import { eqResponse, logFreqs, freqAt, posOf, G_MAX, Q_MIN, Q_MAX, BANDS_MAX, normalizeBand } from '../audio/fx.js';

export const BAND_COLORS = { highpass: '#8D8D93', lowshelf: '#C98A3A', peaking: '#5F8568', highshelf: '#5B86B8', lowpass: '#8D8D93' };
const R = 9, HIT = 24, PAD = { l: 6, r: 6, t: 10, b: 18 };

// cv — <canvas>; get() → полосы (массив, правится на месте); simple — частоты закреплены;
// onChange() — после правки; onSelect(i) — выбор полосы; sr — частота дискретизации для кривой
export function eqCanvas(cv, { get, simple = false, onChange = () => {}, onSelect = () => {}, sr = 48000 }) {
  let sel = 0, drag = null, pinch = null, lastTap = { t: 0, i: -1 }, w = 0, h = 0;
  const pts = new Map();
  const css = (k, d) => (getComputedStyle(cv).getPropertyValue(k) || '').trim() || d;
  const x2f = (x) => freqAt((x - PAD.l) / (w - PAD.l - PAD.r)), f2x = (f) => PAD.l + posOf(f) * (w - PAD.l - PAD.r);
  const y2g = (y) => (0.5 - (y - PAD.t) / (h - PAD.t - PAD.b)) * 2 * G_MAX, g2y = (g) => PAD.t + (0.5 - g / (2 * G_MAX)) * (h - PAD.t - PAD.b);
  const isCut = (b) => b.type === 'highpass' || b.type === 'lowpass';
  const handleY = (b) => (isCut(b) ? g2y(0) : g2y(b.g));

  function draw() {
    const dpr = Math.min(2, devicePixelRatio || 1), r = cv.getBoundingClientRect();
    if (!r.width) return;
    w = r.width; h = r.height;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const g = cv.getContext('2d'), bands = get(), ink = css('--ink', '#111'), l2 = css('--l2', '#888'), tint = css('--tint', '#5F8568');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    // сетка: частоты и уровни
    g.lineWidth = 1; g.strokeStyle = l2; g.globalAlpha = 0.18; g.fillStyle = l2; g.font = '10px system-ui, sans-serif'; g.textAlign = 'center';
    [50, 100, 200, 500, 1000, 2000, 5000, 10000].forEach((f) => { const x = f2x(f); g.beginPath(); g.moveTo(x, PAD.t); g.lineTo(x, h - PAD.b); g.stroke(); });
    [-12, -6, 0, 6, 12].forEach((d) => { const y = g2y(d); g.beginPath(); g.moveTo(PAD.l, y); g.lineTo(w - PAD.r, y); g.stroke(); });
    g.globalAlpha = 0.7;
    [[50, '50'], [100, '100'], [200, '200'], [500, '500'], [1000, '1k'], [2000, '2k'], [5000, '5k'], [10000, '10k']].forEach(([f, s]) => g.fillText(s, f2x(f), h - 5));
    g.textAlign = 'left'; g.fillText('+12', PAD.l + 2, g2y(12) - 3); g.fillText('−12', PAD.l + 2, g2y(-12) - 3);
    g.globalAlpha = 1;
    // кривая
    const n = Math.max(60, Math.round(w / 3)), fr = logFreqs(n), dbs = eqResponse(bands, fr, sr);
    g.beginPath();
    dbs.forEach((d, i) => { const x = f2x(fr[i]), y = g2y(Math.max(-G_MAX * 1.4, Math.min(G_MAX * 1.4, d))); i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.strokeStyle = tint; g.lineWidth = 2.5; g.lineJoin = 'round'; g.stroke();
    g.lineTo(f2x(fr[n - 1]), g2y(0)); g.lineTo(f2x(fr[0]), g2y(0)); g.closePath();
    g.fillStyle = tint; g.globalAlpha = 0.14; g.fill(); g.globalAlpha = 1;
    // точки полос
    bands.forEach((b, i) => {
      const x = f2x(b.f), y = handleY(b), on = b.on !== false, c = BAND_COLORS[b.type] || tint;
      g.beginPath(); g.arc(x, y, i === sel ? R + 3 : R, 0, Math.PI * 2);
      g.fillStyle = on ? c : css('--fill', '#ddd'); g.fill();
      g.lineWidth = i === sel ? 3 : 1.5; g.strokeStyle = on ? '#fff' : l2; g.stroke();
      if (!on) { g.beginPath(); g.moveTo(x - 5, y + 5); g.lineTo(x + 5, y - 5); g.strokeStyle = l2; g.lineWidth = 2; g.stroke(); }
      g.fillStyle = ink; g.font = (i === sel ? '700 ' : '') + '11px system-ui, sans-serif'; g.textAlign = 'center';
      g.fillText(String(i + 1), x, y - R - 6);
    });
  }

  const pos = (e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const hit = (p) => {
    const bands = get();
    let best = -1, bd = HIT;
    bands.forEach((b, i) => { const d = Math.hypot(p.x - f2x(b.f), p.y - handleY(b)); if (d < bd) { bd = d; best = i; } });
    return best;
  };
  const select = (i) => { if (i < 0 || i >= get().length) return; sel = i; onSelect(i); draw(); };

  cv.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    e.preventDefault();
    try { cv.setPointerCapture(e.pointerId); } catch { /* синтетический указатель */ }
    const p = pos(e);
    pts.set(e.pointerId, p);
    if (pts.size === 2) { // щипок — ширина выбранной полосы
      const [a, b] = [...pts.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), q: get()[sel] ? get()[sel].q : 1 };
      drag = null;
      return;
    }
    const i = hit(p), now = performance.now(), bands = get();
    if (i >= 0) {
      if (lastTap.i === i && now - lastTap.t < 320) { // двойное касание — в ноль
        if (!isCut(bands[i])) { bands[i].g = 0; onChange(); }
        lastTap = { t: 0, i: -1 }; draw(); return;
      }
      lastTap = { t: now, i };
      select(i);
      drag = { i, id: e.pointerId, f0: bands[i].f, g0: bands[i].g, x0: p.x, y0: p.y, moved: false };
      return;
    }
    if (!simple && lastTap.i === -2 && now - lastTap.t < 320 && bands.length < BANDS_MAX) { // двойное касание пустого — новая полоса
      bands.push(normalizeBand({ type: 'peaking', f: x2f(p.x), g: Math.round(y2g(p.y) * 2) / 2, q: 1, on: true }));
      lastTap = { t: 0, i: -1 };
      onChange(); select(bands.length - 1); return;
    }
    lastTap = { t: now, i: -2 };
  });
  cv.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    const p = pos(e);
    pts.set(e.pointerId, p);
    const bands = get();
    if (pinch && pts.size === 2) {
      const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y), bd = bands[sel];
      if (bd && d > 10) { bd.q = Math.round(Math.max(Q_MIN, Math.min(Q_MAX, pinch.q * Math.pow(pinch.d / d, 1.2))) * 100) / 100; onChange(); draw(); }
      return;
    }
    if (!drag || e.pointerId !== drag.id) return;
    const b = bands[drag.i];
    if (!b) return;
    if (Math.hypot(p.x - drag.x0, p.y - drag.y0) > 3) drag.moved = true;
    if (!drag.moved) return;
    if (!simple) b.f = Math.round(x2f(f2x(drag.f0) + p.x - drag.x0));
    if (!isCut(b)) b.g = Math.round(Math.max(-G_MAX, Math.min(G_MAX, drag.g0 + y2g(p.y) - y2g(drag.y0))) * 2) / 2;
    Object.assign(b, normalizeBand(b));
    onChange(); draw();
  });
  const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; if (drag && e.pointerId === drag.id) drag = null; };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', (e) => { // колесо над точкой — ширина полосы (на компьютере)
    const b = get()[sel];
    if (!b) return;
    e.preventDefault();
    b.q = Math.round(Math.max(Q_MIN, Math.min(Q_MAX, b.q * (e.deltaY > 0 ? 0.9 : 1.11))) * 100) / 100;
    onChange(); draw();
  }, { passive: false });
  cv.addEventListener('keydown', (e) => {
    const bands = get(), b = bands[sel];
    if (!b) return;
    const st = e.shiftKey ? 5 : 1;
    if (e.key === 'ArrowUp' && !isCut(b)) b.g = Math.min(G_MAX, b.g + 0.5 * st);
    else if (e.key === 'ArrowDown' && !isCut(b)) b.g = Math.max(-G_MAX, b.g - 0.5 * st);
    else if (e.key === 'ArrowRight' && !simple) b.f = Math.round(b.f * Math.pow(1.05, st));
    else if (e.key === 'ArrowLeft' && !simple) b.f = Math.round(b.f / Math.pow(1.05, st));
    else if (e.key === 'Tab' && bands.length > 1) { e.preventDefault(); select((sel + (e.shiftKey ? bands.length - 1 : 1)) % bands.length); return; }
    else return;
    e.preventDefault();
    Object.assign(b, normalizeBand(b));
    onChange(); draw();
  });
  draw();
  return { draw, select, get sel() { return sel; } };
}
