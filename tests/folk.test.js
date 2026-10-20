import { describe, it, expect } from 'vitest';
import { allowedPcs, notesIn, neighbors, snapPitch } from '../src/modules/glider/scale.js';
import { FOLK, FOLK_IDS, folkCents, cleanCustom, microLabel } from '../src/music/folk.js';
import { mName } from '../src/music/notes.js';

describe('народные лады', () => {
  it('у каждого лада — тоника 0, ступени по возрастанию внутри октавы', () => {
    expect(FOLK_IDS.length).toBe(16);
    FOLK.forEach(([, list]) => list.forEach(([, c]) => {
      expect(c[0]).toBe(0);
      c.forEach((v, i) => { if (i) expect(v).toBeGreaterThan(c[i - 1]); expect(v).toBeLessThan(1200); });
    }));
  });
  it('Раст от до: ми и си на четверть тона ниже', () => {
    const pcs = allowedPcs({ scale: 'rast', root: 0 });
    expect(notesIn(60, 12, pcs)).toEqual([60, 62, 63.5, 65, 67, 69, 70.5, 72]);
    expect(neighbors(63.7, pcs)).toEqual([63.5, 65]);
    expect(snapPitch(63.6, 'note', pcs)).toBe(63.5);
    expect(snapPitch(64.4, 'note', pcs)).toBe(65);
  });
  it('один лад разных традиций — одна строка; прежний выбор ведёт к общему', () => {
    expect(folkCents('shur')).toEqual(folkCents('bayati'));
    expect(folkCents('thijaz')).toEqual(folkCents('hijaz'));
    expect(folkCents('trast')).toEqual(folkCents('just'));
    const all = FOLK.flatMap(([, l]) => l);
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
      const [a, x] = all[i], [b, y] = all[j];
      if (x.length === y.length) expect(Math.max(...x.map((v, k) => Math.abs(v - y[k]))), a + ' ' + b).toBeGreaterThan(21);
    }
  });
  it('тоника сдвигает лад, свой лад чистится', () => {
    expect(allowedPcs({ scale: 'slendro', root: 2 }).map((x) => +x.toFixed(2))).toEqual([2, 4.4, 6.8, 9.2, 11.6]);
    expect(cleanCustom([500, 150, 150, 2000, -5])).toEqual([0, 150, 500]);
    expect(folkCents('custom', { custom: [0, 350, 700] })).toEqual([0, 350, 700]);
  });
  it('подписи: E↓ для ми на четверть тона ниже, обычные ноты — без стрелки', () => {
    expect(microLabel(63.5, mName)).toBe('E4↓');
    expect(microLabel(62, mName)).toBe('D4');
    expect(microLabel(61.35, mName)).toBe('C♯4↑');
  });
});
