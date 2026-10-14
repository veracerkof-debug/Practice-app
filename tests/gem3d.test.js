import { describe, it, expect } from 'vitest';
import { gemMesh } from '../src/ui/gem3d.js';
import { GEMS } from '../src/core/mastery.js';

describe('камни лиг в 3D', () => {
  it('каждая лига строится для любого зерна: замкнутый многогранник в единичной сфере', () => {
    GEMS.filter((g) => g.id !== 'stone').forEach((g) => [1, 42, 20260915, 987654321].forEach((seed) => {
      const m = gemMesh(g.id, seed);
      expect(m.F.length).toBeGreaterThanOrEqual(5);
      m.F.forEach((f) => expect(f.v.length).toBeGreaterThanOrEqual(3));
      const r = Math.max(...m.V.map((p) => Math.hypot(...p)));
      expect(r).toBeCloseTo(1, 5);
    }));
  });
  it('у разных людей — разная форма, у одного — та же', () => {
    const a = gemMesh('ruby', 11), b = gemMesh('ruby', 12), c = gemMesh('ruby', 11);
    expect(JSON.stringify(a.V)).not.toBe(JSON.stringify(b.V));
    expect(c).toBe(a);
  });
});
