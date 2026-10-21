import { describe, it, expect } from 'vitest';
import { beatMap, fitOffset, quantizeNotes, instForNotes, notesToEventsSec } from '../src/music/quantize.js';

describe('ноты со слуха → ритм', () => {
  it('ровный темп: начала и концы на шестнадцатые, паузы сами собой', () => {
    const map = beatMap(null, 120); // доля 0,5 с
    const q = quantizeNotes([{ t: 0.01, d: 0.48, m: 60, v: 0.8 }, { t: 0.52, d: 0.2, m: 62, v: 0.7 }, { t: 1.49, d: 1.02, m: 64, v: 0.9 }], map);
    expect(q).toEqual([{ t: 0, d: 1, m: 60, v: 0.8 }, { t: 1, d: 0.5, m: 62, v: 0.7 }, { t: 3, d: 2, m: 64, v: 0.9 }]);
  });
  it('призвуки и тихое — вон, минимальная длина — деление', () => {
    const map = beatMap(null, 120);
    const q = quantizeNotes([{ t: 0, d: 0.02, m: 60, v: 0.2 }, { t: 0.5, d: 0.01, m: 62, v: 0.9 }, { t: 1, d: 0.3, m: 64, v: 0.05 }], map);
    expect(q).toEqual([{ t: 1, d: 0.25, m: 62, v: 0.9 }]);
  });
  it('повтор той же высоты на том же делении — одна нота; нахлёст укорачивает предыдущую', () => {
    const map = beatMap(null, 120);
    const q = quantizeNotes([{ t: 0, d: 0.5, m: 60, v: 0.5 }, { t: 0.02, d: 1, m: 60, v: 0.9 }, { t: 0.5, d: 0.5, m: 60, v: 0.6 }], map);
    expect(q).toEqual([{ t: 0, d: 1, m: 60, v: 0.9 }, { t: 1, d: 1, m: 60, v: 0.6 }]);
  });
  it('доли записи с сильными: первая сильная — начало такта, неровный темп следует за записью', () => {
    const beats = [0.3, 0.8, 1.3, 1.85, 2.4, 2.95, 3.5, 4.05];
    const map = beatMap(beats, 110, { downbeats: [1.3], bpb: 4 });
    expect(map.toBeat(1.3)).toBeCloseTo(4, 6); // третья доля (индекс 2) → 4: такт
    expect(map.toBeat(0.3)).toBeCloseTo(2, 6);
    expect(map.toSec(4)).toBeCloseTo(1.3, 6);
    expect(map.toSec(map.toBeat(3.7))).toBeCloseTo(3.7, 6);
    const q = quantizeNotes([{ t: 1.31, d: 0.54, m: 67, v: 0.8 }, { t: 2.42, d: 0.26, m: 69, v: 0.8 }], map);
    expect(q).toEqual([{ t: 4, d: 1, m: 67, v: 0.8 }, { t: 6, d: 0.5, m: 69, v: 0.8 }]);
    expect(map.bars).toBe(true);
  });
  it('сдвиг ровной сетки подгоняется под начала нот', () => {
    const spb = 0.5, off = fitOffset([0.13, 0.63, 1.13, 1.38], spb);
    expect(Math.abs(((off - 0.13) % 0.125 + 0.125) % 0.125) < 0.011 || Math.abs(off - 0.125) < 0.011).toBe(true);
    const map = beatMap(null, 120, { offset: off });
    expect(quantizeNotes([{ t: 0.13, d: 0.5, m: 60, v: 0.8 }], map)[0].d).toBe(1);
  });
  it('инструмент: долгие — пэд, низкие одноголосные — бас, иначе пианино', () => {
    expect(instForNotes([{ t: 0, d: 4, m: 60, v: 1 }, { t: 0, d: 4, m: 64, v: 1 }, { t: 4, d: 2, m: 62, v: 1 }])).toBe('wair');
    expect(instForNotes([{ t: 0, d: 0.5, m: 40, v: 1 }, { t: 1, d: 0.5, m: 43, v: 1 }, { t: 2, d: 0.5, m: 45, v: 1 }])).toBe('abass');
    expect(instForNotes([{ t: 0, d: 0.5, m: 60, v: 1 }, { t: 0, d: 0.5, m: 64, v: 1 }, { t: 1, d: 0.25, m: 67, v: 1 }])).toBe('piano');
    expect(instForNotes([])).toBe('piano');
  });
  it('события игры из долей — по карте записи', () => {
    const map = beatMap(null, 120);
    const ev = notesToEventsSec([{ t: 1, d: 0.5, m: 60, v: 0.8 }], map);
    expect(ev).toEqual([{ t: 0.5, k: 'on', id: 'q0', m: 60, v: 0.8 }, { t: 0.75, k: 'off', id: 'q0' }]);
  });
});
