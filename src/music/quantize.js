// Ноты со слуха → ритм. Модель (Basic Pitch) даёт высоту, начало и конец в секундах; здесь они ложатся на сетку
// долей записи: доли из разбора (rec.ana.beats, сильные — downbeats, такты по ним) или ровный темп (bpm с подгонкой
// сдвига сетки под начала нот). Начало и конец ноты — к ближайшему делению (div делений на долю), паузы получаются
// сами, короткие тихие призвуки отбрасываются, повторы одной высоты на одном делении сливаются. Инструмент — по тому,
// как ноты живут: долгие тянущиеся — пэд (wair), низкие одноголосные — бас (abass), иначе — пианино.
// Чистые функции без DOM (tests/quantize.test.js).

// Карта «секунды ↔ доли». beats — секунды долей записи (или null), bpm — темп, opts: { downbeats, bpb, offset }.
// Нумерация долей: первая сильная доля — на границе такта (кратна bpb); до неё доли отрицательные
export function beatMap(beats, bpm = 120, { downbeats = null, bpb = 4, offset = 0 } = {}) {
  const spb = 60 / Math.max(1, bpm || 120);
  if (!beats || beats.length < 4) {
    return { bpm: bpm || 120, spb, toBeat: (s) => (s - offset) / spb, toSec: (b) => b * spb + offset, bars: true };
  }
  const B = Float64Array.from(beats);
  let shift = 0;
  if (downbeats && downbeats.length) { // такты: первая сильная доля → кратная bpb
    let k = 0, best = Infinity;
    for (let i = 0; i < B.length; i++) { const d = Math.abs(B[i] - downbeats[0]); if (d < best) { best = d; k = i; } }
    shift = (bpb - (k % bpb)) % bpb;
  }
  const n = B.length, avg = (B[n - 1] - B[0]) / (n - 1);
  const toBeat = (s) => {
    if (s <= B[0]) return shift + (s - B[0]) / avg;
    if (s >= B[n - 1]) return shift + n - 1 + (s - B[n - 1]) / avg;
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (B[mid] <= s) lo = mid; else hi = mid; }
    return shift + lo + (s - B[lo]) / (B[hi] - B[lo]);
  };
  const toSec = (b) => {
    const x = b - shift;
    if (x <= 0) return B[0] + x * avg;
    if (x >= n - 1) return B[n - 1] + (x - (n - 1)) * avg;
    const i = Math.floor(x);
    return B[i] + (x - i) * (B[i + 1] - B[i]);
  };
  return { bpm: Math.round((60 / avg) * 10) / 10, spb: avg, toBeat, toSec, bars: !!(downbeats && downbeats.length) };
}

// Сдвиг ровной сетки (0 … spb) — чтобы начала нот ложились на деления как можно ближе
export function fitOffset(onsets, spb, div = 4) {
  if (!onsets.length) return 0;
  const step = spb / div;
  let best = 0, bestE = Infinity;
  for (let k = 0; k < 24; k++) {
    const off = (k / 24) * step;
    let e = 0;
    for (const t of onsets) { const r = ((t - off) % step + step) % step; e += Math.min(r, step - r); }
    if (e < bestE) { bestE = e; best = off; }
  }
  return best;
}

// notes — [{ t, d, m, v }] в секундах → [{ t, d, m, v }] в долях, по сетке div делений на долю
export function quantizeNotes(notes, map, { div = 4, minV = 0.12 } = {}) {
  const step = 1 / div, q = (b) => Math.round(b * div) / div;
  const out = [];
  for (const n of notes) {
    if (!(n.d > 0) || n.m == null) continue;
    const b0 = map.toBeat(n.t), b1 = map.toBeat(n.t + n.d), v = n.v == null ? 0.8 : n.v;
    const len = b1 - b0;
    if (len < step * 0.4 && v < 0.35) continue; // призвук: короче половины деления и тихий
    if (v < minV) continue;
    let t = Math.max(0, q(b0)), e = q(b1);
    if (e <= t) e = t + step;
    out.push({ t, d: e - t, m: Math.round(n.m), v: Math.max(0.05, Math.min(1, v)) });
  }
  out.sort((a, b) => a.t - b.t || a.m - b.m);
  // та же высота на том же делении — одна нота (длиннее, громче); нахлёст той же высоты — укоротить предыдущую
  const res = [];
  for (const n of out) {
    const p = res.length ? res.findLast((x) => x.m === n.m) : null;
    if (p && p.t === n.t) { p.d = Math.max(p.d, n.d); p.v = Math.max(p.v, n.v); continue; }
    if (p && p.t + p.d > n.t) p.d = Math.max(step, n.t - p.t);
    res.push(n);
  }
  return res;
}

// Инструмент по характеру нот: долгие тянущиеся — пэд, низкие одноголосные — бас, иначе пианино
export function instForNotes(notes) {
  if (!notes.length) return 'piano';
  const ds = notes.map((n) => n.d).sort((a, b) => a - b), med = ds[ds.length >> 1];
  const ms = notes.map((n) => n.m).sort((a, b) => a - b), medM = ms[ms.length >> 1];
  let poly = 0; // сколько нот звучит одновременно в среднем
  for (const n of notes) poly += notes.filter((o) => o !== n && o.t < n.t + n.d && o.t + o.d > n.t).length;
  poly = poly / notes.length;
  if (med >= 1.5) return 'wair';
  if (medM < 50 && poly < 0.5) return 'abass';
  return 'piano';
}

// Ноты в долях → события игры в секундах по карте (src/music/midi.js: on/off)
export function notesToEventsSec(notes, map) {
  const ev = [];
  notes.forEach((n, i) => { const id = 'q' + i, a = map.toSec(n.t), b = map.toSec(n.t + n.d); ev.push({ t: a, k: 'on', id, m: n.m, v: n.v }); ev.push({ t: Math.max(a + 0.03, b), k: 'off', id }); });
  return ev.sort((a, b) => a.t - b.t || (a.k === 'off' ? -1 : 1));
}
