import { describe, it, expect } from 'vitest';
import { GEMS, gemOf } from '../src/core/mastery.js';
import { gemSVG } from '../src/ui/gems.js';

describe('лиги', () => {
  it('лиги по часам и путь до следующей', () => {
    expect(gemOf(0)).toMatchObject({ i: 0, frac: 0, left: 10 });
    expect(gemOf(-5).gem.id).toBe('stone');
    expect(gemOf(30)).toMatchObject({ gem: { id: 'quartz' }, frac: 0.5, left: 20 });
    expect(gemOf(4999).gem.id).toBe('ruby');
    expect(gemOf(5000).gem.id).toBe('diamond');
    expect(gemOf(9999.9).gem.id).toBe('diamond');       // обсидиан — легенда, с 10 000 часов
    expect(gemOf(10000)).toMatchObject({ gem: { id: 'obsidian' }, next: null, frac: 0, left: 0 });
    expect(gemOf(15000).frac).toBe(0.5);
    expect(gemOf(1e6).frac).toBe(1);
    GEMS.slice(1).forEach((g, i) => expect(g.h).toBeGreaterThan(GEMS[i].h));
  });
  it('рисуется каждая ступень; искр больше у алмазов', () => {
    GEMS.forEach((g) => expect(gemSVG(g.id, 0.5, 40, 'x')).toMatch(/^<svg class="gem"[\s\S]*<\/svg>$/));
    const sparks = (id, f) => (gemSVG(id, f).match(/class="gsp"/g) || []).length;
    expect([sparks('stone', 1), sparks('ruby', 0), sparks('ruby', 1), sparks('diamond', 0), sparks('obsidian', 1)]).toEqual([0, 0, 2, 3, 3]);
  });
});
