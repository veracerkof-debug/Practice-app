// Режим «Гитара»: камера видит гриф и пальцы и называет аккорд по схеме; звук только проверяет.
// Гриф ищется в отдельном потоке (fretboard.worker.js): полный поиск — до секунды, слежение за найденным — десятые
// доли. Руки (MediaPipe) приходят каждый кадр и сразу ложатся на последний найденный гриф. Кадры и звук
// обрабатываются только на устройстве. Здесь — поток, микрофон, аккорд во времени и рисунок поверх камеры;
// подыгрывание (звук терменвокса) — в index.js.
import { recognize, createChordTracker } from '../../music/fingering.js';
import { pointAt, fretLine, locate } from '../../music/fretboard.js';
import { chromaOfSpectrum } from '../../music/analyze.js';

const MAX_SIDE = 1280; // кадр для поиска грифа — не крупнее
const GRAB_MS = 200; // кадры в поток — не чаще: слежение успевает за гитарой, батарея — тоже
const HOLD_MS = 1500; // гриф пропал из вида (рука на мгновение закрыла бридж) — прежний ещё столько на экране
const MIC_MS = 60;
const PAD = 0.22; // точка нажатия — на 22 % от кончика пальца к суставу (как в fingering.js)
const TIPS = [[8, 7], [12, 11], [16, 15], [20, 19]]; // кончик и сустав перед ним: указательный … мизинец
const DOTS = { 3: 1, 5: 1, 7: 1, 9: 1, 12: 2, 15: 1, 17: 1, 19: 1, 21: 1 }; // точки-маркеры на накладке
const NUMS = [3, 5, 7, 9, 12, 15, 17];

const rgba = (hex, a) => { const h = hex.replace('#', ''), v = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16); return 'rgba(' + ((v >> 16) & 255) + ',' + ((v >> 8) & 255) + ',' + (v & 255) + ',' + a + ')'; };
const rrect = (g, x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
const mid = (p, q) => p && q && { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
const seg = (g, a, b) => { if (!a || !b) return; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); };

// onChange — изменилось состояние (найден гриф, пропал, причина) или аккорд: index.js обновляет подписи
export function createGuitar(onChange) {
  let worker = null, video = null, busy = false, lastGrab = 0, canvas = null, frame = { W: 0, H: 0 };
  let fb = null, lastOk = 0, state = 'find', lastHands = [];
  let mic = null, micTok = 0, freq = null, lastMic = 0, chroma = null, level = 0;
  let rec = null, stable = null, bassA = true;
  // порожек, отмеченный касанием: сдвиг номеров ладов; держится, пока гриф ведётся слежением (номера не меняются)
  let manual = null;
  const tracker = createChordTracker();
  const setState = (st) => { if (st !== state) { state = st; onChange(); } };

  // кадр камеры — в поток (не крупнее MAX_SIDE; буфер передаётся, не копируется)
  function grab(t) {
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh || video.readyState < 2) return;
    const k = Math.min(1, MAX_SIDE / Math.max(vw, vh)), W = Math.round(vw * k), H = Math.round(vh * k);
    canvas ||= document.createElement('canvas');
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    const g = canvas.getContext('2d', { willReadFrequently: true });
    g.drawImage(video, 0, 0, W, H);
    const img = g.getImageData(0, 0, W, H);
    busy = true; lastGrab = t; frame = { W, H };
    // руки — чтобы лады под ними считались закрытыми, а не отсутствующими (точки в пикселях этого кадра)
    const hands = lastHands.map((h) => h.lm.map((p) => ({ x: (1 - p.x) * W, y: p.y * H })));
    worker.postMessage({ img, hands }, [img.data.buffer]);
  }

  function onBoard(e) {
    busy = false;
    const r = e.data, now = performance.now();
    if (r && r.ok) {
      if (!r.kept) manual = null; // гриф найден заново — прежняя отметка порожка не годится
      fb = { ...r, W: frame.W, H: frame.H }; lastOk = now; setState('ok'); return;
    }
    if (fb && now - lastOk < HOLD_MS) return;
    fb = null; rec = null; manual = null;
    setState((r && r.reason) || 'none');
  }

  // микрофон: хрома живого звука, сглаженная; тишина — проверять нечего
  async function micOn(request) {
    if (mic) return null;
    const tok = ++micTok;
    try {
      const m = await request();
      if (tok !== micTok) { m.stop(); return null; } // пока открывался — выключили
      m.analyser.fftSize = 16384; // ≈ 3 Гц на полосу: низкие струны различимы
      m.analyser.smoothingTimeConstant = 0.6;
      mic = m; freq = new Float32Array(m.analyser.frequencyBinCount);
      return null;
    } catch (e) { return (e && e.reason) || 'unavailable'; }
  }
  function micOff() { micTok++; if (mic) { mic.stop(); mic = null; } chroma = null; level = 0; }
  function hear(t) {
    if (!mic || t - lastMic < MIC_MS) return;
    lastMic = t;
    mic.analyser.getFloatFrequencyData(freq);
    const r = chromaOfSpectrum(freq, mic.sampleRate);
    level = level * 0.6 + r.level * 0.4;
    if (r.level > 0.12) chroma = chroma ? chroma.map((v, i) => v * 0.7 + r.chroma[i] * 0.3) : r.chroma;
    else if (level < 0.06) chroma = null;
  }

  // Рисунок поверх камеры. map — доли кадра (зеркальные, как у рук) → точки окна; o: { tint, hud, size, dia }
  function draw(g, W, H, map, o) {
    if (!fb) return;
    const quiet = o.hud === 'quiet', D = (p) => p && { x: map.x(1 - p.x / fb.W), y: map.y(p.y / fb.H) };
    const shift = manual != null ? manual : stable ? stable.shift : rec && rec.best ? rec.best.shift : 0, ei = (s) => (bassA ? s : 5 - s);
    const last = Math.min(22, fb.frets.length - 1 + shift), at = (s, n, back) => D(pointAt(fb, ei(s), n - shift, back));
    const s0 = at(0, 5, 0.5), s5 = at(5, 5, 0.5), gap = s0 && s5 ? Math.hypot(s5.x - s0.x, s5.y - s0.y) / 5 : 8;
    const r = Math.max(5, Math.min(15, gap * 0.46));
    g.save();
    g.lineCap = 'round';
    // лады, порожек (жирнее) и бридж
    for (let n = last; n >= 0; n--) {
      const L = fretLine(fb, n - shift);
      if (!L) continue;
      g.strokeStyle = n === 0 ? 'rgba(255,255,255,.85)' : 'rgba(255,255,255,' + (quiet ? 0.14 : 0.28) + ')';
      g.lineWidth = n === 0 ? 3.2 : 1.1;
      seg(g, D(L.a), D(L.b));
    }
    g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 2.4;
    seg(g, D(fb.bridge.a), D(fb.bridge.b));
    // струны — от порожка до бриджа, басы толще
    for (let i = 0; i < 6; i++) {
      const s = bassA ? i : 5 - i;
      g.strokeStyle = 'rgba(255,246,232,' + (quiet ? 0.28 : 0.5) + ')';
      g.lineWidth = 2.1 - s * 0.24;
      seg(g, D(pointAt(fb, i, -shift, 0)), D(fb.strings[i].b));
    }
    if (!quiet) {
      // точки-маркеры (как на настоящей накладке — по ним видно, верно ли сосчитаны лады) и номера ладов у басов
      g.fillStyle = 'rgba(255,255,255,.24)';
      Object.entries(DOTS).forEach(([N, k]) => {
        if (+N > last) return;
        const ps = k === 1 ? [mid(at(2, +N, 0.5), at(3, +N, 0.5))] : [mid(at(1, +N, 0.5), at(2, +N, 0.5)), mid(at(3, +N, 0.5), at(4, +N, 0.5))];
        ps.forEach((p) => { if (p) { g.beginPath(); g.arc(p.x, p.y, Math.max(2, gap * 0.2), 0, Math.PI * 2); g.fill(); } });
      });
      g.font = '600 11px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = 'rgba(255,255,255,.62)';
      NUMS.forEach((N) => {
        if (N > last) return;
        const p = at(0, N, 0.5), q = at(5, N, 0.5);
        if (!p || !q) return;
        const d = Math.hypot(p.x - q.x, p.y - q.y) || 1, k = (gap * 0.9 + 9) / d;
        g.fillText(String(N), p.x + (p.x - q.x) * k, p.y + (p.y - q.y) * k);
      });
    }
    const list = rec ? rec.placements.list : [], barre = rec ? rec.placements.barre : null;
    const pressed = (s, f) => list.some((p) => p.string === s && p.fret + shift === f) || (barre && barre.fret + shift === f && s >= barre.from && s <= barre.to);
    // схема аккорда на самом грифе: куда ставить пальцы (кольца), у порожка — открытые (○) и заглушённые (×) струны
    if (stable && !quiet) {
      stable.frets.forEach((f, s) => {
        if (f == null || f === 0) {
          const p = at(s, 0, 0.62);
          if (!p) return;
          g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 1.6;
          const k = r * 0.42;
          if (f === 0) { g.beginPath(); g.arc(p.x, p.y, k, 0, Math.PI * 2); g.stroke(); }
          else { seg(g, { x: p.x - k, y: p.y - k }, { x: p.x + k, y: p.y + k }); seg(g, { x: p.x - k, y: p.y + k }, { x: p.x + k, y: p.y - k }); }
        } else if (!pressed(s, f)) {
          const p = at(s, f, 0.35);
          if (!p) return;
          g.setLineDash([3, 3]); g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 1.5;
          g.beginPath(); g.arc(p.x, p.y, r, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
        }
      });
    }
    // пальцы: точка нажатия, номер пальца; совпал со схемой — залит, нет — только обведён
    if (rec) {
      if (barre) {
        const a = D(pointAt(fb, ei(barre.from), barre.fret)), b = D(pointAt(fb, ei(barre.to), barre.fret));
        g.strokeStyle = rgba(o.tint, 0.55); g.lineWidth = r * 1.5; seg(g, a, b);
      }
      g.font = '700 ' + Math.round(r * 1.05) + 'px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      list.forEach((p) => {
        const [ti, di] = TIPS[p.finger - 1], tip = rec.hand[ti], dip = rec.hand[di];
        const q = D({ x: tip.x + PAD * (dip.x - tip.x), y: tip.y + PAD * (dip.y - tip.y) }), hit = stable && stable.frets[p.string] === p.fret + shift;
        g.save(); g.shadowColor = rgba(o.tint, 0.9); g.shadowBlur = hit ? 14 : 6;
        g.fillStyle = hit ? rgba(o.tint, 0.95) : 'rgba(0,0,0,.45)'; g.strokeStyle = rgba(o.tint, 0.95); g.lineWidth = 2;
        g.beginPath(); g.arc(q.x, q.y, r, 0, Math.PI * 2); g.fill(); g.stroke(); g.restore();
        g.fillStyle = hit ? '#fff' : rgba(o.tint, 1); g.fillText(String(p.finger), q.x, q.y + 0.5);
      });
    }
    g.restore();
    // схема — справа под панелью (слева сверху — кнопки окна)
    if (stable && o.dia && !quiet && (o.size === 'full' || o.size === 'half')) chordBox(g, stable.frets, W - 100, 62, o.tint);
  }

  return {
    get state() { return state; },
    get chord() { return stable; },
    get heard() { return stable ? stable.heard : null; },
    get listening() { return !!mic; },
    // video — элемент камеры; request — открыть микрофон (ctx.mic.request); sound — проверять звуком
    start(v, { request, sound }) {
      video = v;
      if (!worker) { worker = new Worker(new URL('./fretboard.worker.js', import.meta.url), { type: 'module' }); worker.onmessage = onBoard; }
      worker.postMessage({ reset: true });
      fb = null; rec = null; stable = null; busy = false; lastGrab = 0; tracker.reset();
      state = 'find'; onChange();
      return sound ? micOn(request) : Promise.resolve(null);
    },
    stop() {
      if (worker) { worker.terminate(); worker = null; }
      micOff();
      video = null; fb = null; rec = null; stable = null; busy = false; tracker.reset();
      state = 'find';
    },
    // долгое касание по грифу: «здесь порожек» — ближайшая линия лада становится нулевой. x, y — точки окна,
    // map — как у draw. true — отмечено
    markNut(x, y, map) {
      if (!fb) return false;
      const fx = (1 - map.ix(x)) * fb.W, fy = map.iy(y) * fb.H, L = locate(fb, fx, fy);
      if (!L || L.v < -0.6 || L.v > 1.6) return false;
      manual = -Math.round(L.pos);
      tracker.reset(); stable = null; onChange();
      return true;
    },
    sound(on, request) { if (on) return micOn(request); micOff(); return Promise.resolve(null); },
    // кадр рук (как у терменвокса: точки в долях кадра, x зеркальный); true — аккорд сменился
    frame(hands, t) {
      if (!worker || !video) return false;
      hear(t);
      lastHands = hands;
      if (!busy && t - lastGrab >= GRAB_MS) grab(t);
      const before = stable ? stable.name + stable.frets : '';
      if (fb) {
        const pts = hands.map((h) => h.lm.map((p) => ({ x: (1 - p.x) * fb.W, y: p.y * fb.H })));
        const alts = manual != null ? [{ shift: manual, prior: 1 }] : tracker.alts(fb.alts);
        rec = pts.length ? recognize(fb, pts, { chroma, alts, side: bassA }) : null;
        if (rec && rec.sideSure) bassA = rec.bassA;
      } else rec = null;
      stable = tracker.push(rec, fb, t);
      return (stable ? stable.name + stable.frets : '') !== before;
    },
    draw,
  };
}

// Схема аккорда, как в сборниках: струны вертикально (басы слева), лады сверху вниз; у открытой позиции —
// жирный порожек, выше — номер первого лада сбоку; над струнами — ○ (открытая) и × (заглушена)
function chordBox(g, frets, x, y, tint) {
  const pressed = frets.filter((f) => f > 0), hi = pressed.length ? Math.max(...pressed) : 0, lo = pressed.length ? Math.min(...pressed) : 1;
  const base = hi <= 4 ? 1 : lo, rows = 4, w = 88, h = 112, px = 18, top = 30, cw = (w - 2 * px) / 5, rh = (h - top - 12) / rows;
  g.save();
  g.fillStyle = 'rgba(0,0,0,.42)'; rrect(g, x, y, w, h, 14); g.fill();
  g.lineCap = 'round';
  g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1;
  for (let i = 0; i < 6; i++) { const cx = x + px + i * cw; seg(g, { x: cx, y: y + top }, { x: cx, y: y + top + rows * rh }); }
  for (let k = 0; k <= rows; k++) {
    const cy = y + top + k * rh;
    g.strokeStyle = k === 0 && base === 1 ? 'rgba(255,255,255,.9)' : 'rgba(255,255,255,.45)'; g.lineWidth = k === 0 && base === 1 ? 3 : 1;
    seg(g, { x: x + px, y: cy }, { x: x + px + 5 * cw, y: cy });
  }
  g.font = '600 10px system-ui, sans-serif'; g.textBaseline = 'middle';
  if (base > 1) { g.fillStyle = 'rgba(255,255,255,.75)'; g.textAlign = 'right'; g.fillText(String(base), x + px - 5, y + top + rh / 2); }
  const r = cw * 0.36;
  frets.forEach((f, i) => {
    const cx = x + px + i * cw, my = y + top - 9;
    g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 1.4;
    if (f === 0) { g.beginPath(); g.arc(cx, my, 3.2, 0, Math.PI * 2); g.stroke(); }
    else if (f == null) { seg(g, { x: cx - 3, y: my - 3 }, { x: cx + 3, y: my + 3 }); seg(g, { x: cx - 3, y: my + 3 }, { x: cx + 3, y: my - 3 }); }
  });
  // баррэ: самый низкий лад на нескольких струнах подряд (между ними ни одной открытой или заглушённой)
  const first = frets.findIndex((f) => f === lo), lastI = frets.lastIndexOf(lo);
  const barre = lastI > first && frets.slice(first, lastI + 1).every((f) => f != null && f >= lo) && frets.filter((f) => f === lo).length >= 2 && !frets.slice(first).includes(0);
  g.fillStyle = rgba(tint, 0.95); g.strokeStyle = rgba(tint, 0.95);
  if (barre) { g.lineWidth = r * 2; seg(g, { x: x + px + first * cw, y: y + top + (lo - base + 0.5) * rh }, { x: x + px + lastI * cw, y: y + top + (lo - base + 0.5) * rh }); }
  frets.forEach((f, i) => {
    if (!(f > 0) || (barre && f === lo && i >= first && i <= lastI)) return;
    g.beginPath(); g.arc(x + px + i * cw, y + top + (f - base + 0.5) * rh, r, 0, Math.PI * 2); g.fill();
  });
  g.restore();
}
