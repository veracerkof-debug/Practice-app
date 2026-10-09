import { describe, it, expect } from 'vitest';
import { boardFromPoints, pointAt, locate } from '../src/music/fretboard.js';
import { TEMPLATES, TYPE_IVS, pcsOf, shape } from '../src/music/guitarchords.js';
import { placements, matchChords, recognize, chromaFit, bassAtA } from '../src/music/fingering.js';

// Гриф лежит горизонтально: порожек слева, бридж справа, край A сверху
const FB = boardFromPoints({ a: { x: 100, y: 100 }, b: { x: 100, y: 140 } }, { a: { x: 900, y: 92 }, b: { x: 900, y: 160 } });

// Рука: запястье и ладонь под грифом (side 'B') или над ним ('A'); presses — [струна от края A, лад, палец];
// barre — лад, на котором указательный лежит поперёк всех струн
function hand(fb, presses, { side = 'B', barre = null } = {}) {
  const wy = side === 'B' ? 240 : 0, lm = Array.from({ length: 21 }, (_, i) => ({ x: 300 + i * 3, y: wy }));
  const dir = side === 'B' ? 1 : -1;
  presses.forEach(([i, n, f]) => {
    const p = pointAt(fb, i, n), tip = [8, 12, 16, 20][f - 1];
    lm[tip] = { x: p.x, y: p.y };
    lm[tip - 1] = { x: p.x - 4, y: p.y + dir * 10 };
  });
  if (barre) {
    const top = side === 'B' ? 0 : 5, bot = 5 - top;
    lm[8] = pointAt(fb, top, barre); lm[7] = pointAt(fb, 3, barre); lm[6] = pointAt(fb, bot, barre);
  }
  return lm;
}
// схема (6-я … 1-я струна) → нажатия при басах у края A: [струна, лад, палец]
const pressesOf = (s, fingers) => shape(s).map((f, i) => (f > 0 ? [i, f] : null)).filter(Boolean).map((p, k) => [...p, fingers ? fingers[k] : k + 1]);

describe('схемы аккордов', () => {
  it('каждая схема звучит своим аккордом: тоника есть, чужих звуков нет', () => {
    TEMPLATES.forEach((t) => {
      const pcs = pcsOf(t.frets), want = TYPE_IVS[t.type].map((iv) => (t.root + iv) % 12);
      expect(pcs, t.name + ' ' + t.frets).toContain(t.root);
      pcs.forEach((pc) => expect(want, t.name + ' ' + t.frets.join(',')).toContain(pc));
    });
  });
  it('подвижные формы — на всех ладах, с правильными названиями', () => {
    const f5 = TEMPLATES.find((t) => t.name === 'A' && t.frets.join() === '5,7,7,6,5,5');
    expect(f5 && f5.barre).toBe(5);
    expect(TEMPLATES.find((t) => t.name === 'C♯m' && t.frets[1] === 4)).toBeTruthy();
  });
});

describe('гриф по точкам и точки пальцев', () => {
  it('точка на струне и ладу распознаётся обратно', () => {
    for (const [i, n] of [[0, 1], [3, 5], [5, 12]]) {
      const p = pointAt(FB, i, n), L = locate(FB, p.x, p.y);
      expect(L.string).toBe(i);
      expect(L.fret).toBe(n);
    }
  });
});

describe('аккорд по пальцам', () => {
  const name = (lm) => recognize(FB, [lm]).best.name;
  it('открытые аккорды', () => {
    expect(name(hand(FB, pressesOf('x32010', [3, 2, 1])))).toBe('C');
    expect(name(hand(FB, pressesOf('x02210', [2, 3, 1])))).toBe('Am');
    expect(name(hand(FB, pressesOf('320003', [2, 1, 3])))).toBe('G');
    expect(name(hand(FB, pressesOf('xx0232', [1, 3, 2])))).toBe('D');
    expect(name(hand(FB, pressesOf('xx0231', [2, 3, 1])))).toBe('Dm');
    expect(name(hand(FB, pressesOf('020100', [2, 1])))).toBe('E7');
  });
  it('басы — по ладони: гитара «наоборот» (ладонь сверху) читается так же', () => {
    const flip = pressesOf('x32010', [3, 2, 1]).map(([i, n, f]) => [5 - i, n, f]), lm = hand(FB, flip, { side: 'A' });
    expect(bassAtA(FB, lm)).toBe(false);
    expect(name(lm)).toBe('C');
  });
  it('баррэ: F и форма «ля» на 5-м ладу (D)', () => {
    const f = hand(FB, [[1, 3, 3], [2, 3, 4], [3, 2, 2]], { barre: 1 }), pl = placements(FB, f, true);
    expect(pl.barre && pl.barre.fret).toBe(1);
    expect(name(f)).toBe('F');
    expect(name(hand(FB, [[2, 7, 2], [3, 7, 3], [4, 7, 4]], { barre: 5 }))).toBe('D');
  });
  it('номер лада неточен: схема открытого аккорда выбирает верный сдвиг', () => {
    // пальцы стоят как C, а определитель грифа ошибся на 2 лада вверх (запасной вариант — минус 2)
    const lm = hand(FB, pressesOf('x32010', [3, 2, 1]).map(([i, n, f]) => [i, n + 2, f]));
    const r = recognize({ ...FB, alts: [{ shift: 0, prior: 1 }, { shift: -2, prior: 0.5 }] }, [lm]);
    expect(r.best.name).toBe('C');
    expect(r.best.shift).toBe(-2);
  });
  it('палец на струне, которая в схеме открыта, снижает её оценку', () => {
    const base = [{ string: 1, fret: 3, finger: 3 }, { string: 2, fret: 2, finger: 2 }, { string: 4, fret: 1, finger: 1 }];
    const vis = (list) => matchChords({ list, barre: null }).find((c) => c.name === 'C' && c.frets.join() === shape('x32010').join()).visual;
    expect(vis([...base, { string: 3, fret: 2, finger: 4 }])).toBeLessThan(vis(base) - 0.2); // 3-я струна в C открытая
  });
});

describe('звук проверяет', () => {
  const chromaOf = (pcs) => { const c = new Array(12).fill(0.05); pcs.forEach((p) => { c[p] = 1; }); return c; };
  it('сходство со схемой', () => {
    const C = shape('x32010');
    expect(chromaFit(C, chromaOf([0, 4, 7]))).toBeGreaterThan(0.85);
    expect(chromaFit(C, chromaOf([2, 6, 9]))).toBeLessThan(0.3);
  });
  it('одинаковые по виду Em и E5 различает звук', () => {
    const lm = hand(FB, pressesOf('022000', [2, 3]));
    expect(recognize(FB, [lm], { chroma: chromaOf([4, 7, 11]) }).best.name).toBe('Em');
    const r = recognize(FB, [lm], { chroma: chromaOf([2, 6, 9]) });
    expect(r.heard).toBe('mismatch');
  });
});

describe('живой звук и устойчивость во времени', () => {
  it('хрома по спектру анализатора: аккорд C (с обертонами) даёт до, ми и соль', async () => {
    const { chromaOfSpectrum } = await import('../src/music/analyze.js');
    const sr = 48000, N = 8192, hz = sr / (N * 2), db = new Float32Array(N).fill(-100);
    [48, 52, 55, 60, 64].forEach((m) => { // C3 E3 G3 C4 E4 — как в x32010
      const f0 = 440 * 2 ** ((m - 69) / 12);
      for (let h = 1; h <= 6; h++) {
        const k = Math.round((f0 * h) / hz), amp = -20 - 20 * Math.log10(h);
        db[k] = Math.max(db[k], amp); db[k - 1] = Math.max(db[k - 1], amp - 9); db[k + 1] = Math.max(db[k + 1], amp - 10);
      }
    });
    const { chroma, level } = chromaOfSpectrum(db, sr);
    const top = chroma.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).slice(0, 3).map((x) => x[1]).sort((a, b) => a - b);
    expect(top).toEqual([0, 4, 7]);
    expect(level).toBeGreaterThan(0.5);
    expect(chromaFit(shape('x32010'), chroma)).toBeGreaterThan(0.85);
    expect(chromaOfSpectrum(new Float32Array(N).fill(-100), sr).level).toBe(0); // тишина
  });
  it('новый аккорд — после удержания; сдвиг номера закрепляется голосами', async () => {
    const { createChordTracker } = await import('../src/music/fingering.js');
    const tr = createChordTracker({ hold: 200, lose: 500 }), fb = { ok: true, kept: true, tracked: true };
    const rec = (name, shift, visual = 0.9, audio = null) => ({ best: { name, frets: [null, 3, 2, 0, 1, 0], shift, visual, audio }, heard: audio != null && audio >= 0.75 ? 'match' : null });
    expect(tr.push(rec('C', 2), fb, 0)).toBe(null);
    expect(tr.push(rec('C', 2), fb, 100)).toBe(null);
    expect(tr.push(rec('C', 2, 0.9, 0.9), fb, 250).name).toBe('C');
    expect(tr.push(rec('Am', 2), fb, 300).name).toBe('C'); // мелькнул другой — пока прежний
    for (let t = 350; t < 900; t += 50) tr.push(rec('C', 2, 0.9, 0.9), fb, t);
    const a = tr.alts([{ shift: 0, prior: 1 }]);
    expect(a.find((x) => x.shift === 2).prior).toBeGreaterThan(a.find((x) => x.shift === 0).prior);
    expect(tr.push(null, fb, 1000).name).toBe('C'); // пропал ненадолго — держится
    expect(tr.push(null, fb, 1600)).toBe(null);
  });
});

describe('трекер и новый гриф', () => {
  it('голоса за сдвиг сбрасываются только с новым грифом без перенесённых номеров', async () => {
    const { createChordTracker } = await import('../src/music/fingering.js');
    const tr = createChordTracker(), fb1 = { ok: true, kept: false }, rec = { best: { name: 'C', frets: [null, 3, 2, 0, 1, 0], shift: 3, visual: 0.95, audio: null }, heard: null };
    for (let t = 0; t < 1000; t += 50) tr.push(rec, fb1, t); // тот же гриф кадр за кадром — голоса копятся
    expect(tr.alts([{ shift: 0, prior: 1 }]).find((a) => a.shift === 3).prior).toBeGreaterThan(1);
    tr.push(rec, { ok: true, kept: true }, 1050); // слежение с перенесёнными номерами — голоса остаются
    expect(tr.alts([{ shift: 0, prior: 1 }]).find((a) => a.shift === 3).prior).toBeGreaterThan(1);
    tr.push(null, { ok: true, kept: false }, 1100); // найден заново — сброс
    expect(tr.alts([{ shift: 0, prior: 1 }]).find((a) => a.shift === 0).prior).toBe(1);
  });
});
