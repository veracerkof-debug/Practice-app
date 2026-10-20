// Плейлист на холсте — по форме FL Studio Mobile: сверху линейка тактов, слева колонка дорожек (цветной значок
// по роду: ударные, клавиши, аккорды, запись), дальше сетка таймлайна и клипы — цветные блоки с рисунком
// содержимого (удары, ноты, названия аккордов, волна записи). Кусок клипа повторяется — границы повторов видны.
// Жесты: касание клипа — редактор; вести клип — перенос (и на другую дорожку того же рода); вести за правый край —
// длина (кусок повторяется дальше); за левый край — обрезка начала; удержать клип — меню; вести по пустому —
// прокрутка; двойное касание пустого места — новый клип на этой дорожке в этом такте; удержать пустое — тоже;
// касание линейки — играть отсюда; вести по линейке — петля (отрезок по кругу), вести край петли — изменить,
// удержать линейку — меню (маркер, снять петлю); щипок — масштаб. Касание значка дорожки — её меню, «+» внизу — новая дорожка.
// Без зависимости от модуля: получает проект и обратные вызовы.
import { clipsOf, trackOf, songBars, moveClip, resizeClip, trimClipStart, dataBeats, chordName, setRegion, DRUMS } from '../../music/project.js';
import { pinch } from '../../ui/gestures.js';
const buzz = () => { try { navigator.vibrate && navigator.vibrate(12); } catch { /* нет вибрации */ } };

const HEAD = 56, RULER = 30, ROW = 64, GAP = 3, EDGE = 16, HOLD_MS = 450, MIN_BARS = 8;

// host — элемент под холст; get() → { p, names(tr) → имя, fileName(id), peaks(id) → Float32Array|null };
// on: { open(clip), menu(clip, x, y), track(tr, x, y), addTrack(x, y), create(tr, beat), empty(tr, beat, x, y) — удержание пустого
//       места (новый клип, вставить), seek(beat), ruler(beat, x, y) — удержание линейки, region() — петля изменена, change() }
export function createPlaylist(host, get, on) {
  const cv = document.createElement('canvas'), g = cv.getContext('2d');
  cv.className = 'plcv';
  host.appendChild(cv);
  const V = { pxb: 0, x: 0, y: 0, dpr: Math.min(2, devicePixelRatio || 1), pos: -1, sel: null, cursor: 0 };
  let W = 0, H = 0, raf = 0, drag = null, holdT = 0, css = null, lastTap = { t: 0, tr: null, beat: -1 };
  const colors = () => css || (css = (() => { const s = getComputedStyle(host); const v = (k) => s.getPropertyValue(k).trim(); return { ink: v('--ink'), l2: v('--l2'), sep: v('--sep'), fill: v('--fill'), fill2: v('--fill2') || v('--fill'), cell: v('--cell'), tint: v('--tint'), bg: v('--bg'), red: v('--red') || '#D2463F' }; })());
  const P = () => get().p;
  const bars = () => Math.max(MIN_BARS, songBars(P()) + 2);
  const snap = () => (V.pxb >= 22 ? 1 : P().num); // крупно — по доле, мелко — по такту
  const xOf = (b) => HEAD + b * V.pxb - V.x, bOf = (x) => (x - HEAD + V.x) / V.pxb;
  const yOf = (i) => RULER + i * ROW - V.y, rowOf = (y) => Math.floor((y - RULER + V.y) / ROW);
  const clampView = () => {
    const p = P();
    V.x = Math.max(0, Math.min(Math.max(0, bars() * p.num * V.pxb - (W - HEAD)), V.x));
    V.y = Math.max(0, Math.min(Math.max(0, (p.tracks.length + 1) * ROW + RULER - H), V.y));
  };

  function size() {
    const r = host.getBoundingClientRect();
    W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
    cv.width = W * V.dpr; cv.height = H * V.dpr;
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    if (!V.pxb) V.pxb = Math.max(10, Math.min(48, (W - HEAD) / (8 * P().num))); // 8 тактов в кадре
    draw();
  }
  function rr(x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

  // Значок дорожки по роду — простыми штрихами
  function icon(kind, x, y, s, col) {
    g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 2.2; g.lineCap = 'round';
    if (kind === 'drums') { [0.3, 0.6, 1].forEach((h, i) => { rr(x + i * s * 0.36, y + s * (1 - h), s * 0.26, s * h, 2); g.fill(); }); }
    else if (kind === 'notes') { for (let i = 0; i < 4; i++) { rr(x + i * s * 0.26, y, s * 0.22, s, 2); g.fill(); } g.fillStyle = colors().cell; [0.2, 0.46, 0.72].forEach((k) => { g.fillRect(x + k * s + s * 0.02, y, s * 0.12, s * 0.55); }); }
    else if (kind === 'chords') { g.font = '700 ' + Math.round(s * 0.95) + 'px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('C', x + s / 2, y + s / 2 + 1); g.textAlign = 'left'; g.textBaseline = 'alphabetic'; }
    else { g.beginPath(); for (let i = 0; i < 5; i++) { const h = [0.35, 0.7, 1, 0.6, 0.3][i] * s; g.moveTo(x + i * s * 0.22 + 1, y + (s - h) / 2); g.lineTo(x + i * s * 0.22 + 1, y + (s + h) / 2); } g.stroke(); }
  }

  function draw() {
    const { p, names, fileName, peaks } = get(), C = colors(), n = p.num, tot = bars() * n, solo = p.tracks.some((t) => t.solo);
    g.setTransform(V.dpr, 0, 0, V.dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    clampView();
    // ряды дорожек
    p.tracks.forEach((tr, i) => {
      const y = yOf(i);
      if (y + ROW < RULER || y > H) return;
      g.fillStyle = i % 2 ? C.fill : C.cell; g.fillRect(HEAD, y, W - HEAD, ROW);
    });
    const yAdd = yOf(p.tracks.length);
    g.fillStyle = C.bg; g.fillRect(HEAD, yAdd, W - HEAD, H - yAdd);
    // сетка: доли тонко, такты толще
    g.save(); g.beginPath(); g.rect(HEAD, RULER, W - HEAD, H - RULER); g.clip();
    for (let b = 0; b <= tot; b++) {
      const x = xOf(b);
      if (x < HEAD - 1 || x > W) continue;
      const bar = b % n === 0;
      if (!bar && V.pxb < 12) continue;
      g.strokeStyle = bar ? C.l2 : C.sep; g.lineWidth = bar ? 1.2 : 0.6; g.globalAlpha = bar ? 0.7 : 0.9;
      g.beginPath(); g.moveTo(x, RULER); g.lineTo(x, Math.min(H, yAdd)); g.stroke();
    }
    g.globalAlpha = 1;
    // петля: отрезок по кругу — лёгкая подсветка по дорожкам
    const R = p.region;
    if (R) { const x0 = xOf(R.a), x1 = xOf(R.b); g.fillStyle = C.tint; g.globalAlpha = 0.08; g.fillRect(Math.max(HEAD, x0), RULER, Math.min(W, x1) - Math.max(HEAD, x0), Math.min(H, yAdd) - RULER); g.globalAlpha = 1; }
    // маркеры — пунктир через дорожки
    (p.marks || []).forEach((m) => { const x = xOf(m.t); if (x < HEAD || x > W) return; g.strokeStyle = C.ink; g.globalAlpha = 0.35; g.setLineDash([3, 5]); g.lineWidth = 1; g.beginPath(); g.moveTo(x, RULER); g.lineTo(x, Math.min(H, yAdd)); g.stroke(); g.setLineDash([]); g.globalAlpha = 1; });
    // клипы
    p.clips.forEach((c) => {
      const i = p.tracks.findIndex((t) => t.id === c.tr), tr = p.tracks[i];
      if (!tr) return;
      const x = xOf(c.at), y = yOf(i) + GAP, w = c.len * V.pxb, h = ROW - GAP * 2, dim = tr.mute || (solo && !tr.solo) || c.mute;
      if (x + w < HEAD || x > W || y + h < RULER || y > H) return;
      const ghost = drag && drag.c === c && drag.moved;
      g.globalAlpha = dim ? 0.35 : ghost ? 0.75 : 1;
      g.fillStyle = tr.color; rr(x, y, Math.max(4, w), h, 7); g.fill();
      if (V.sel === c.id) { g.lineWidth = 2.5; g.strokeStyle = C.ink; g.stroke(); }
      g.save(); rr(x + 1, y + 1, Math.max(2, w - 2), h - 2, 6); g.clip();
      // повторы куска — тонкие линии
      const per = dataBeats(p, c.data);
      if (per && per < c.len) { g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineWidth = 1; for (let o = per; o < c.len - 1e-6; o += per) { const xx = xOf(c.at + o); g.beginPath(); g.moveTo(xx, y); g.lineTo(xx, y + h); g.stroke(); } }
      preview(c, tr, x, y, w, h, per, fileName, peaks);
      if (c.mute) { g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 1; for (let xx = x - h; xx < x + w; xx += 10) { g.beginPath(); g.moveTo(xx, y + h); g.lineTo(xx + h, y); g.stroke(); } }
      // подпись
      g.fillStyle = '#fff'; g.font = '600 12px system-ui'; g.textBaseline = 'top';
      if (w > 36) g.fillText(label(c, tr, names, fileName, w), x + 7, y + 5);
      g.textBaseline = 'alphabetic';
      g.restore();
      g.globalAlpha = 1;
    });
    g.restore();
    // ход и курсор
    const px = xOf(V.pos >= 0 ? V.pos : V.cursor);
    if (px >= HEAD && px <= W) { g.strokeStyle = V.pos >= 0 ? C.red : C.tint; g.lineWidth = 2; g.beginPath(); g.moveTo(px, RULER); g.lineTo(px, H); g.stroke(); }
    // линейка: номера тактов и деления долей
    g.fillStyle = C.cell; g.fillRect(0, 0, W, RULER);
    g.strokeStyle = C.sep; g.beginPath(); g.moveTo(0, RULER - 0.5); g.lineTo(W, RULER - 0.5); g.stroke();
    g.save(); g.beginPath(); g.rect(HEAD, 0, W - HEAD, RULER); g.clip();
    g.font = '600 11px system-ui'; g.fillStyle = C.l2; g.strokeStyle = C.l2;
    for (let b = 0; b <= tot; b++) {
      const x = xOf(b), bar = b % n === 0;
      if (x < HEAD - 20 || x > W) continue;
      g.lineWidth = 1; g.beginPath(); g.moveTo(x, RULER - (bar ? 12 : 5)); g.lineTo(x, RULER); g.stroke();
      if (bar && b < tot) g.fillText(String(b / n + 1), x + 4, 12);
    }
    // петля на линейке — полоса с краями; маркеры — флажки с названием
    if (R) { const x0 = Math.max(HEAD, xOf(R.a)), x1 = Math.min(W, xOf(R.b)); if (x1 > x0) { g.fillStyle = C.tint; g.globalAlpha = 0.25; g.fillRect(x0, 0, x1 - x0, RULER - 1); g.globalAlpha = 1; g.fillRect(x0, 0, 3, RULER - 1); g.fillRect(x1 - 3, 0, 3, RULER - 1); } }
    (p.marks || []).forEach((m) => { // флажок с названием на плашке (поверх номера такта)
      const x = xOf(m.t); if (x < HEAD || x > W) return;
      g.font = '600 10px system-ui'; const nm = m.name ? m.name.slice(0, 14) : '', tw = nm ? g.measureText(nm).width + 10 : 0;
      g.fillStyle = C.ink; rr(x, 2, 10 + tw, 14, 4); g.fill();
      g.fillStyle = C.bg; g.beginPath(); g.moveTo(x + 3, 5); g.lineTo(x + 9, 9); g.lineTo(x + 3, 13); g.closePath(); g.fill();
      if (nm) g.fillText(nm, x + 12, 13);
    });
    g.restore();
    if (px >= HEAD && px <= W) { g.fillStyle = V.pos >= 0 ? C.red : C.tint; g.beginPath(); g.moveTo(px - 6, RULER - 10); g.lineTo(px + 6, RULER - 10); g.lineTo(px, RULER - 2); g.closePath(); g.fill(); }
    // колонка дорожек
    g.fillStyle = C.bg; g.fillRect(0, RULER, HEAD, H - RULER);
    p.tracks.forEach((tr, i) => {
      const y = yOf(i);
      if (y + ROW < RULER || y > H) return;
      const dim = tr.mute || (solo && !tr.solo);
      g.globalAlpha = dim ? 0.4 : 1;
      g.fillStyle = tr.color; rr(6, y + GAP, HEAD - 12, ROW - GAP * 2, 10); g.fill();
      icon(tr.kind, 6 + (HEAD - 12) / 2 - 11, y + ROW / 2 - 11, 22, 'rgba(255,255,255,.95)');
      if (tr.solo) { g.fillStyle = '#fff'; g.font = '700 9px system-ui'; g.fillText('S', 11, y + ROW - 9); }
      g.globalAlpha = 1;
    });
    // «+» — новая дорожка
    g.strokeStyle = C.l2; g.lineWidth = 2; const cx = HEAD / 2, cy = yAdd + ROW / 2;
    if (cy < H + 20) { rr(6, yAdd + GAP, HEAD - 12, ROW - GAP * 2, 10); g.setLineDash([4, 4]); g.stroke(); g.setLineDash([]); g.beginPath(); g.moveTo(cx - 8, cy); g.lineTo(cx + 8, cy); g.moveTo(cx, cy - 8); g.lineTo(cx, cy + 8); g.stroke(); }
    g.fillStyle = C.bg; g.fillRect(0, 0, HEAD, RULER);
  }
  function label(c, tr, names, fileName, w) {
    const max = Math.max(2, Math.floor(w / 7));
    if (tr.kind === 'chords' && c.data.chords.length) return c.data.chords.map((ch) => chordName(ch.pc, ch.type, P().key.minor)).join(' ').slice(0, max);
    if (tr.kind === 'audio') return String(fileName(c.data.fileId) || '').slice(0, max);
    return names(tr).slice(0, max);
  }
  // Рисунок содержимого внутри клипа
  function preview(c, tr, x, y, w, h, per, fileName, peaks) {
    const top = y + 20, ph = h - 24;
    if (ph < 8) return;
    g.fillStyle = 'rgba(255,255,255,.85)';
    if (tr.kind === 'drums') {
      const lanes = DRUMS.length, lh = ph / lanes;
      for (let o = 0; o < c.len - 1e-6; o += per) DRUMS.forEach((lane, li) => (c.data.steps[lane] || []).forEach((i) => { const b = o + i * 0.25; if (b >= c.len) return; const xx = xOf(c.at + b); g.fillRect(xx, top + li * lh + 1, Math.max(2, Math.min(V.pxb * 0.25 - 1, 6)), Math.max(2, lh - 2)); }));
    } else if (tr.kind === 'notes') {
      const ns = c.data.notes; if (!ns.length) return;
      const lo = Math.min(...ns.map((n) => n.m)), hi = Math.max(...ns.map((n) => n.m)), span = Math.max(12, hi - lo + 1);
      for (let o = 0; o < c.len - 1e-6; o += per) ns.forEach((nt) => { if (o + nt.t >= c.len) return; const xx = xOf(c.at + o + nt.t), ww = Math.min(nt.d, c.len - o - nt.t) * V.pxb; g.fillRect(xx, top + (1 - (nt.m - lo + 0.5) / span) * ph, Math.max(2, ww - 1), Math.max(2, ph / span)); });
    } else if (tr.kind === 'chords') {
      for (let o = 0; o < c.len - 1e-6; o += per) c.data.chords.forEach((ch) => { if (o + ch.t >= c.len) return; const xx = xOf(c.at + o + ch.t), ww = Math.min(ch.d, c.len - o - ch.t) * V.pxb; g.globalAlpha *= 0.35; g.fillRect(xx + 1, top, Math.max(2, ww - 2), ph); g.globalAlpha /= 0.35; });
    } else {
      const pk = peaks(c.data.fileId), mid = top + ph / 2;
      if (!pk) { g.fillRect(x + 4, mid - 1, Math.max(2, w - 8), 2); return; }
      const spb = 60 / P().bpm, n = pk.length, x0 = Math.max(HEAD, x), x1 = Math.min(W, x + w);
      for (let xx = x0; xx < x1; xx += 2) { const sec = (c.data.off || 0) + bOf(xx) * spb - c.at * spb, k = Math.floor((sec / Math.max(0.01, pk.dur || 1)) * n) % n; const v = pk[(k + n) % n] || 0; g.fillRect(xx, mid - v * ph / 2, 1.5, Math.max(1, v * ph)); }
    }
  }

  /* ---------- жесты ---------- */
  const pt = (e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const hit = (q) => {
    const p = P(), i = rowOf(q.y), tr = p.tracks[i];
    if (!tr || q.x < HEAD) return null;
    const b = bOf(q.x), c = clipsOf(p, tr).find((x) => b >= x.at && b < x.at + x.len);
    if (!c) return { tr, i, b };
    const x0 = xOf(c.at), x1 = xOf(c.at + c.len), wide = x1 - x0 > EDGE * 3;
    return { tr, i, b, c, edge: wide && x1 - q.x < EDGE ? 'r' : wide && q.x - x0 < EDGE ? 'l' : null };
  };
  cv.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary) { clearTimeout(holdT); drag = null; return; }
    const q = pt(e);
    try { cv.setPointerCapture(e.pointerId); } catch { /* */ }
    clearTimeout(holdT);
    if (q.y < RULER) { // линейка: касание — играть отсюда; вести — петля; край петли — изменить; удержать — меню
      if (q.x < HEAD) return;
      const p = P(), R = p.region, b = bOf(q.x), edge = R && Math.abs(xOf(R.a) - q.x) < EDGE ? 'a' : R && Math.abs(xOf(R.b) - q.x) < EDGE ? 'b' : null;
      drag = { id: e.pointerId, x0: q.x, y0: q.y, ruler: true, b0: edge ? (edge === 'a' ? R.b : R.a) : b, edge, moved: false };
      holdT = setTimeout(() => { if (drag && !drag.moved) { buzz(); drag = null; on.ruler(Math.max(0, Math.round(b / snap()) * snap()), e.clientX, e.clientY); } }, HOLD_MS);
      return;
    }
    if (q.x < HEAD) { // колонка дорожек: дорожка или «+»
      const i = rowOf(q.y), tr = P().tracks[i];
      if (tr) on.track(tr, e.clientX, e.clientY); else if (i === P().tracks.length) on.addTrack(e.clientX, e.clientY);
      return;
    }
    const h = hit(q), now = performance.now();
    drag = { id: e.pointerId, x0: q.x, y0: q.y, vx: V.x, vy: V.y, moved: false, h };
    if (h && h.c) {
      V.sel = h.c.id; drag.c = h.c; drag.at0 = h.c.at; drag.len0 = h.c.len; drag.tr0 = h.c.tr;
      holdT = setTimeout(() => { if (drag && !drag.moved) { buzz(); const c = drag.c; drag = null; on.menu(c, e.clientX, e.clientY); } }, HOLD_MS);
    } else if (h) {
      const bar = Math.floor(h.b / P().num) * P().num;
      if (lastTap.tr === h.tr.id && lastTap.beat === bar && now - lastTap.t < 350) { lastTap = { t: 0 }; drag = null; on.create(h.tr, bar); return; } // двойное касание — новый клип
      lastTap = { t: now, tr: h.tr.id, beat: bar };
      holdT = setTimeout(() => { if (drag && !drag.moved) { buzz(); drag = null; on.empty(h.tr, bar, e.clientX, e.clientY); } }, HOLD_MS);
    }
    draw();
  });
  cv.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const q = pt(e), dx = q.x - drag.x0, dy = q.y - drag.y0, p = P();
    if (!drag.moved && Math.hypot(dx, dy) > 6) { drag.moved = true; clearTimeout(holdT); }
    if (!drag.moved) return;
    if (drag.ruler) { setRegion(p, drag.b0, bOf(q.x), snap()); draw(); return; }
    const c = drag.c;
    if (!c) { V.x = drag.vx - dx; V.y = drag.vy - dy; draw(); return; }
    const grid = snap(), h = drag.h;
    if (h.edge === 'r') resizeClip(p, c, drag.len0 + dx / V.pxb, grid);
    else if (h.edge === 'l') { c.at = drag.at0; c.len = drag.len0; trimClipStart(p, c, drag.at0 + dx / V.pxb, grid); }
    else {
      const i = Math.max(0, Math.min(p.tracks.length - 1, rowOf(q.y))), to = p.tracks[i];
      moveClip(p, c, drag.at0 + dx / V.pxb, to && to.kind === trackOf(p, c).kind ? to.id : c.tr, grid);
    }
    draw();
  });
  const up = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    clearTimeout(holdT);
    const d = drag; drag = null;
    if (d.ruler) {
      if (d.moved) on.region();
      else { V.cursor = Math.max(0, Math.floor(bOf(d.x0) / P().num) * P().num); on.seek(V.cursor); }
    } else if (d.c) { if (d.moved) { p0fix(); on.change(); } else on.open(d.c); }
    draw();
  };
  const p0fix = () => { P().clips.sort((a, b) => a.at - b.at); };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
  const offPinch = pinch(cv, { min: 6, max: 96, get: () => V.pxb, set: (v) => { const mid = bOf(HEAD + (W - HEAD) / 2); V.pxb = v; V.x = mid * v - (W - HEAD) / 2; draw(); } });
  cv.addEventListener('wheel', (e) => { e.preventDefault(); if (e.ctrlKey) { V.pxb = Math.max(6, Math.min(96, V.pxb - e.deltaY / 10)); } else { V.x += e.deltaX; V.y += e.deltaY; } draw(); }, { passive: false });
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  const ro = new ResizeObserver(size);
  ro.observe(host);
  size();

  return {
    draw,
    // ход проигрывания (доля) — линия; -1 — нет
    pos(b) { V.pos = b; cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); },
    // показать нужную долю (начало проигрывания — в кадре)
    follow(b) { const x = b * V.pxb; if (x < V.x || x > V.x + W - HEAD - 20) { V.x = Math.max(0, x - 40); draw(); } },
    get cursor() { return V.cursor; },
    set cursor(b) { V.cursor = Math.max(0, b); draw(); },
    select(id) { V.sel = id; draw(); },
    destroy() { ro.disconnect(); offPinch(); clearTimeout(holdT); cancelAnimationFrame(raf); cv.remove(); },
  };
}
