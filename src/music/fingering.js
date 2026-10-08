// Пальцы на грифе и аккорд по виду; звук только проверяет. Рука — 21 точка MediaPipe в пикселях кадра
// (не зеркальных): 0 — запястье, 5/9/13/17 — основания пальцев, кончики 8/12/16/20 и суставы перед ними 7/11/15/19.
// Струны здесь — по-музыкальному: 0 — 6-я (низкая ми) … 5 — 1-я (высокая ми). Только расчёты, без DOM.
import { locate } from './fretboard.js';
import { TEMPLATES, notesOf } from './guitarchords.js';

// [кончик, сустав перед ним, номер пальца]: указательный 1 … мизинец 4
const FINGERS = [[8, 7, 1], [12, 11, 2], [16, 15, 3], [20, 19, 4]];
const PAD = 0.22; // давит подушечка, а MediaPipe даёт самый кончик: точка нажатия — на 22 % от кончика к суставу
// за порожком тоже: если палец там, номера ладов занижены — это решит схема аккорда (запасные сдвиги)
const onBoard = (L) => L && L.v > -0.08 && L.v < 1.08 && L.pos > -6 && L.pos < 22;
const median = (a) => { const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// Рука, которая зажимает струны: больше всего кончиков на грифе в первых 15 ладах (другая рука — у розетки или бриджа)
export function frettingHand(fb, hands) {
  let best = null;
  hands.forEach((lm) => {
    const ls = FINGERS.map(([t]) => locate(fb, lm[t].x, lm[t].y)).filter((L) => onBoard(L) && L.pos < 15);
    // (рука у розетки или бриджа на грифе не бывает дальше 15-го лада)
    if (ls.length && (!best || ls.length > best.n || (ls.length === best.n && median(ls.map((L) => L.pos)) < best.pos))) best = { lm, n: ls.length, pos: median(ls.map((L) => L.pos)) };
  });
  return best ? best.lm : null;
}

// Где басы: ладонь и запястье всегда со стороны тонких струн (большой палец — за грифом, со стороны басов).
// true — 6-я струна у края A, false — у края B, null — не понять (ладонь над серединой грифа)
export function bassAtA(fb, lm) {
  const vs = [0, 5, 9, 13, 17].map((i) => locate(fb, lm[i].x, lm[i].y)).filter(Boolean).map((L) => L.v);
  if (!vs.length) return null;
  const v = median(vs);
  return Math.abs(v - 0.5) < 0.3 ? null : v > 0.5;
}

// Пальцы на струнах: [{ finger, string, fret, pos, sd }] и баррэ { fret, from, to } (указательный лежит поперёк струн:
// его кончик и суставы — на одном ладу, на трёх и больше струнах)
export function placements(fb, lm, bassA = true) {
  const conv = (i) => (bassA ? i : 5 - i), out = [];
  FINGERS.forEach(([t, d, finger]) => {
    const x = lm[t].x + PAD * (lm[d].x - lm[t].x), y = lm[t].y + PAD * (lm[d].y - lm[t].y), L = locate(fb, x, y);
    if (!onBoard(L) || L.sd > 0.75) return; // между струнами далеко от обеих — палец не на струне
    out.push({ finger, string: conv(L.near), fret: L.fret, pos: L.pos, sd: L.sd });
  });
  let barre = null;
  const ix = [8, 7, 6].map((i) => locate(fb, lm[i].x, lm[i].y)).filter((L) => L && L.v > -0.15 && L.v < 1.15 && L.pos > -6);
  if (ix.length === 3) {
    const vs = ix.map((L) => L.v), ps = ix.map((L) => L.pos);
    if (Math.max(...vs) - Math.min(...vs) >= 0.45 && Math.max(...ps) - Math.min(...ps) < 0.9) {
      const ss = ix.map((L) => conv(L.near));
      barre = { fret: Math.ceil(median(ps) - 1e-9), from: Math.min(...ss), to: Math.max(...ss) };
      if (barre.to - barre.from < 2) barre = null;
    }
  }
  return { list: out, barre };
}

// Насколько пальцы похожи на схему t (≤ 1): каждый зажатый лад схемы — палец на нём (1) или рядом (0,35: соседний лад
// или струна — погрешность камеры); баррэ схемы закрывается найденным баррэ. Лишний палец — минус; палец на струне,
// которая в схеме звучит открытой или заглушена, — минус больше: так отличаются аккорды с одинаковой формой на разных ладах
function visualScore(t, list, barre) {
  const need = [];
  t.frets.forEach((f, s) => { if (f > 0) need.push({ s, f }); });
  if (!need.length) return list.length ? -list.length * 0.5 : 0.3;
  const used = new Set();
  let sum = 0;
  need.forEach(({ s, f }) => {
    if (t.barre && f === t.barre && barre && barre.fret === f && s >= barre.from - 1 && s <= barre.to + 1) { sum += 1; return; }
    let bi = -1, bv = 0;
    list.forEach((p, i) => {
      if (used.has(i)) return;
      const v = p.string === s && p.fret === f ? 1 : (p.string === s && Math.abs(p.fret - f) === 1) || (Math.abs(p.string - s) === 1 && p.fret === f) ? 0.35 : 0;
      if (v > bv) { bv = v; bi = i; }
    });
    if (bi >= 0) { used.add(bi); sum += bv; }
  });
  list.forEach((p, i) => {
    if (used.has(i)) return;
    if (barre && t.barre && p.fret === t.barre && p.finger === 1) return; // кончик указательного на баррэ
    sum -= t.frets[p.string] == null || t.frets[p.string] === 0 ? 0.8 : 0.5;
  });
  return sum / need.length;
}

// Звук против схемы: сходство хромы (12 сил по высотам) с тем, что должна дать схема, 0…1
export function chromaFit(frets, chroma) {
  const want = new Array(12).fill(0);
  notesOf(frets).forEach((m) => { if (m != null) want[m % 12] += 1; });
  let num = 0, a = 0, b = 0;
  for (let i = 0; i < 12; i++) { num += want[i] * chroma[i]; a += want[i] ** 2; b += chroma[i] ** 2; }
  return a && b ? num / Math.sqrt(a * b) : 0;
}

// Аккорды-кандидаты по пальцам (лучшие первыми). alts — варианты номера ладов от определителя грифа: { shift, prior }
export function matchChords({ list, barre }, { alts = [{ shift: 0, prior: 1 }], templates = TEMPLATES } = {}) {
  const best = new Map();
  alts.forEach(({ shift, prior }) => {
    const L = list.map((p) => ({ ...p, fret: p.fret + shift })), B = barre ? { ...barre, fret: barre.fret + shift } : null;
    if (L.some((p) => p.fret < 1) || (B && B.fret < 1)) return; // палец за порожком — такого сдвига быть не может
    templates.forEach((t) => {
      const visual = visualScore(t, L, B) + (t.common ? 0.15 : 0) + 0.25 * (prior - 1);
      const key = t.name + ':' + t.frets.join(',');
      if (!best.has(key) || best.get(key).visual < visual) best.set(key, { name: t.name, frets: t.frets, type: t.type, root: t.root, shift, visual });
    });
  });
  return [...best.values()].sort((a, b) => b.visual - a.visual);
}

// Всё вместе: гриф, руки (массивы из 21 точки в пикселях кадра), необязательная хрома звука.
// { hand, bassA, placements, best: { name, frets, shift, visual, audio, score }, cands, heard: 'match' | 'mismatch' | null }
export function recognize(fb, hands, { chroma = null } = {}) {
  if (!fb || !fb.ok) return null;
  const lm = frettingHand(fb, hands);
  if (!lm) return null;
  const side = bassAtA(fb, lm), bassA = side == null ? true : side, pl = placements(fb, lm, bassA);
  // варианты номера: от определителя грифа и, с малым доверием, любые сдвиги до 5 ладов в обе стороны
  const alts = [...(fb.alts || [{ shift: 0, prior: 1 }])];
  for (let s = -5; s <= 5; s++) if (!alts.some((a) => a.shift === s)) alts.push({ shift: s, prior: 0.2 });
  const cands = matchChords(pl, { alts }).slice(0, 12);
  cands.forEach((c) => {
    c.audio = chroma ? chromaFit(c.frets, chroma) : null;
    c.score = c.visual + (chroma ? 0.8 * (c.audio - 0.7) : 0); // звук только поправляет выбор между похожими по виду
  });
  cands.sort((a, b) => b.score - a.score);
  const best = cands[0] && cands[0].visual > 0.3 ? cands[0] : null;
  const heard = best && chroma ? (best.audio >= 0.75 ? 'match' : best.audio < 0.5 ? 'mismatch' : null) : null;
  return { hand: lm, bassA, sideSure: side != null, placements: pl, best, cands: cands.slice(0, 5), heard };
}
