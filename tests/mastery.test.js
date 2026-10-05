import { describe, it, expect } from 'vitest';
import { GEMS, gemOf } from '../src/core/mastery.js';
import { gemSVG } from '../src/ui/gems.js';

describe('значок мастерства', () => {
  it('ступени по часам и путь до следующей', () => {
    expect(gemOf(0)).toMatchObject({ i: 0, frac: 0, left: 10 });
    expect(gemOf(-5).gem.id).toBe('stone');
    expect(gemOf(30)).toMatchObject({ gem: { id: 'quartz' }, frac: 0.5, left: 20 });
    expect(gemOf(9999.9).gem.id).toBe('ruby');          // алмаз — только с профессиональных 10 000 часов
    expect(gemOf(10000).gem.id).toBe('rough');
    expect(gemOf(25000)).toMatchObject({ gem: { id: 'diamond' }, frac: 0.5 });
    expect(gemOf(30000)).toMatchObject({ gem: { id: 'brilliant' }, next: null, frac: 0, left: 0 });
    expect(gemOf(1e6).frac).toBe(1);
    GEMS.slice(1).forEach((g, i) => expect(g.h).toBeGreaterThan(GEMS[i].h));
  });
  it('рисуется каждая ступень; искр больше у алмазов', () => {
    GEMS.forEach((g) => expect(gemSVG(g.id, 0.5, 40, 'x')).toMatch(/^<svg class="gem"[\s\S]*<\/svg>$/));
    const sparks = (id, f) => (gemSVG(id, f).match(/class="gsp"/g) || []).length;
    expect([sparks('stone', 1), sparks('ruby', 0), sparks('ruby', 1), sparks('brilliant', 0)]).toEqual([0, 0, 2, 6]);
  });
});
