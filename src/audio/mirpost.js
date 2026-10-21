// Чистая обработка выходов моделей разбора (src/audio/mir.worker.js): словари и пост-обработка — без DOM и без ORT,
// проверяется тестами (tests/mir.test.js).

// S-KEY: 24 класса в порядке модели (config.json: keyMap) → ступень и лад
const PC = { A: 9, Bb: 10, B: 11, C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8 };
export const KEYMAP = ['A Major', 'Bb Major', 'B Major', 'C Major', 'C# Major', 'D Major', 'D# Major', 'E Major', 'F Major', 'F# Major', 'G Major', 'G# Major',
  'B minor', 'C minor', 'C# minor', 'D minor', 'D# minor', 'E minor', 'F minor', 'F# minor', 'G minor', 'G# minor', 'A minor', 'Bb minor']
  .map((s) => { const [n, q] = s.split(' '); return { pc: PC[n], minor: q === 'minor' }; });

// ChordMini: 170 подписей — 12 корней × 14 видов, затем X (неясно) и N (нет аккорда)
const ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const QUALS = ['min', '', 'dim', 'aug', 'min6', 'maj6', 'min7', 'minmaj7', 'maj7', '7', 'dim7', 'hdim7', 'sus2', 'sus4'];
export const CHORD_LABELS = [...ROOTS.flatMap((r) => QUALS.map((q) => (q ? r + ':' + q : r))), 'X', 'N'];
// подпись → { pc, q } ; X и N → null
export const parseChord = (lab) => { if (!lab || lab === 'X' || lab === 'N') return null; const [r, q = ''] = lab.split(':'); return { pc: ROOTS.indexOf(r), q }; };

// Логиты [frames × NL] → отрезки [{ t, d, c }] (t — начало, с; d — длительность; c — подпись):
// сглаживание скользящим средним по 9 кадрам, argmax, слияние одинаковых соседей; X и N — «нет аккорда» (c: null)
export function segmentsOf(logits, frames, NL, frameSec, { smooth = 9 } = {}) {
  const h = smooth >> 1, lab = new Int16Array(frames), acc = new Float32Array(NL);
  for (let t = 0; t < frames; t++) {
    acc.fill(0);
    const a = Math.max(0, t - h), b = Math.min(frames - 1, t + h);
    for (let j = a; j <= b; j++) for (let k = 0; k < NL; k++) acc[k] += logits[j * NL + k];
    let best = 0; for (let k = 1; k < NL; k++) if (acc[k] > acc[best]) best = k;
    lab[t] = best;
  }
  const segs = [];
  for (let t = 0; t < frames; t++) {
    const l = CHORD_LABELS[lab[t]], c = l === 'X' || l === 'N' ? null : l;
    const last = segs[segs.length - 1];
    if (last && last.c === c) last.n++; else segs.push({ t0: t, n: 1, c });
  }
  return segs.map((s) => ({ t: Math.round(s.t0 * frameSec * 100) / 100, d: Math.round(s.n * frameSec * 100) / 100, c: s.c }));
}

// Темп по долям: интервалы группируются с допуском ±4 %, берётся самая населённая группа (лишние и пропущенные
// доли её не сдвигают), темп — по среднему интервалу группы
export function tempoOf(beats) {
  const iv = beats.slice(1).map((t, i) => t - beats[i]).filter((d) => d > 0.2 && d < 2);
  if (!iv.length) return 0;
  iv.sort((a, b) => a - b);
  let best = null;
  for (let i = 0; i < iv.length; i++) {
    let j = i, sum = 0;
    while (j < iv.length && iv[j] <= iv[i] * 1.08) sum += iv[j++];
    if (!best || j - i > best.n) best = { n: j - i, mean: sum / (j - i) };
  }
  return Math.round(60 / best.mean);
}
// Beat This!, «minimal»: пик — логит > 0 и максимум в окне ±3 кадра; соседние пики (разница ≤ 1 кадр) — среднее;
// сильные доли притягиваются к ближайшей доле. → { beats: [с], downbeats: [с], bpm, beatsPerBar }
export function beatsFromLogits(beat, down, fps) {
  const peaks = (a) => {
    const out = [];
    for (let i = 0; i < a.length; i++) {
      if (a[i] <= 0) continue;
      let ok = true;
      for (let j = Math.max(0, i - 3); j <= Math.min(a.length - 1, i + 3); j++) if (a[j] > a[i]) { ok = false; break; }
      if (ok) out.push(i);
    }
    // слияние соседей
    const m = [];
    for (let i = 0; i < out.length;) { let j = i; while (j + 1 < out.length && out[j + 1] - out[j] <= 1) j++; m.push((out[i] + out[j]) / 2); i = j + 1; }
    return m.map((f) => f / fps);
  };
  const beats = peaks(beat);
  let downbeats = peaks(down);
  if (beats.length) {
    downbeats = [...new Set(downbeats.map((t) => { let b = beats[0]; for (const x of beats) if (Math.abs(x - t) < Math.abs(b - t)) b = x; return b; }))].sort((a, b) => a - b);
  }
  // темп — медиана интервалов; доли в такте — самое частое число долей между сильными
  let bpm = 0, beatsPerBar = 0;
  if (beats.length > 2) bpm = tempoOf(beats);
  if (downbeats.length > 1) {
    const cnt = {};
    for (let i = 1; i < downbeats.length; i++) { const n = beats.filter((t) => t >= downbeats[i - 1] && t < downbeats[i]).length; if (n >= 2 && n <= 12) cnt[n] = (cnt[n] || 0) + 1; }
    const ks = Object.keys(cnt); if (ks.length) beatsPerBar = +ks.sort((a, b) => cnt[b] - cnt[a])[0];
  }
  const r2 = (a) => a.map((t) => Math.round(t * 100) / 100);
  return { beats: r2(beats), downbeats: r2(downbeats), bpm, beatsPerBar };
}
