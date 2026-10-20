import { describe, it, expect } from 'vitest';
import { shifted, peaksOf } from '../src/audio/looper.js';

describe('лупер: сдвиг слоя и огибающая', () => {
  it('сдвиг вперёд берёт хвост записи, назад — конец петли по кругу', () => {
    const full = new Float32Array([1, 2, 3, 4, 5, 6]); // петля 4 + хвост 2
    expect([...shifted(full, 4, 0)]).toEqual([1, 2, 3, 4]);
    expect([...shifted(full, 4, 2)]).toEqual([3, 4, 5, 6]);
    expect([...shifted(full, 4, -1)]).toEqual([4, 1, 2, 3]);
  });
  it('огибающая: n отрезков, 0…1', () => {
    const b = new Float32Array(100).map((_, i) => (i < 50 ? 0.5 : 0.1));
    const p = peaksOf(b, 4);
    expect(p.length).toBe(4);
    expect(p[0]).toBe(1); expect(p[3]).toBeCloseTo(0.2, 5);
  });
});
