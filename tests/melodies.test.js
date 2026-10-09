import { describe, it, expect } from 'vitest';
import { MELODIES, createFollower, fitRange, melodySpan, melodyWindow } from '../src/music/melodies.js';
import { WIDTHS } from '../src/modules/glider/scale.js';

describe('мелодии', () => {
  it('данные целые: высоты и длительности', () => {
    MELODIES.forEach((m) => {
      expect(m.notes.length).toBeGreaterThan(10);
      m.notes.forEach(([n, d]) => { expect(n).toBeGreaterThanOrEqual(48); expect(n).toBeLessThanOrEqual(84); expect(d).toBeGreaterThan(0); });
    });
  });
  it('«Ода к радости»: 30 нот, начинается с ми', () => {
    const o = MELODIES.find((m) => m.id === 'ode');
    expect(o.notes.length).toBe(30);
    expect(o.notes[0][0]).toBe(64);
  });
  it('диапазон вмещает мелодию', () => {
    MELODIES.forEach((m) => {
      const r = fitRange(m, WIDTHS), { lo, hi } = melodySpan(m);
      expect(r.lo).toBeLessThanOrEqual(lo);
      expect(r.lo + r.width).toBeGreaterThanOrEqual(hi);
    });
  });
  it('нота засчитывается после удержания; повтор — после нового звукоизвлечения', () => {
    const f = createFollower(MELODIES.find((m) => m.id === 'ode'), { hold: 90, repeat: 380 });
    expect(f.feed(64.1, 0, true)).toBe(null);
    expect(f.feed(64.1, 100)).toBe('hit');
    expect(f.index).toBe(1);
    expect(f.feed(64, 150)).toBe(null); // та же нота держится — вторая «ми» ещё не взята
    expect(f.feed(64, 200, true)).toBe(null);
    expect(f.feed(64, 300)).toBe('hit');
    expect(f.feed(62, 400, true)).toBe(null); // не та нота
    expect(f.index).toBe(2);
  });
  it('окно нот: сыгранная, текущая и следующие', () => {
    const w = melodyWindow(MELODIES[0], 3);
    expect(w.map((x) => x.k)).toEqual(['past', 'cur', 'next', 'next', 'next', 'next']);
  });
});
