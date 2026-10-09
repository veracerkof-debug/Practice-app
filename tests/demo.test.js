import { describe, it, expect } from 'vitest';
import { demoSessions } from '../src/core/demo.js';
import { splitVerified } from '../src/core/integrity.js';

describe('демо-набор', () => {
  it('история занятий: подтверждается целиком, похожа на живую', () => {
    const from = new Date(2025, 0, 3).getTime(), to = new Date(2026, 9, 1).getTime();
    const songs = [{ id: 'demo-a', since: 0, weight: 1, targetBpm: 100, currentBpm: 90 }, { id: 'demo-b', since: 0.5, weight: 1, targetBpm: 80, currentBpm: 60 }];
    const s = demoSessions(songs, from, to);
    const { ok, bad } = splitVerified(s, to + 1);
    expect(bad.length).toBe(0);
    expect(ok.length).toBeGreaterThan(300);
    const hours = ok.reduce((a, r) => a + r.dur, 0) / 3600;
    expect(hours).toBeGreaterThan(150);
    expect(hours).toBeLessThan(900);
    // вторая песня — только со второй половины
    const firstB = Math.min(...ok.filter((r) => r.songId === 'demo-b').map((r) => r.start));
    expect(firstB).toBeGreaterThan(from + (to - from) * 0.45);
    // одинаковая при каждой загрузке
    expect(demoSessions(songs, from, to).map((r) => r.start)).toEqual(s.map((r) => r.start));
  });
});
