// Сверка ядра с прототипом на случайных данных: результаты должны совпадать один в один.
import { describe, it, expect } from 'vitest';
import { loadLegacy } from './legacy.js';
import { blank, merge, liveSessions, liveSongs } from '../src/core/store.js';
import { weekData, songStats, streakInfo } from '../src/core/stats.js';
import { autoText, getPct, toScale, fromScale } from '../src/core/library.js';
import { DAY } from '../src/core/time.js';

const L = loadLegacy();

// Детерминированный генератор, чтобы падения воспроизводились
function rng(seed) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

function randomState(seed, now) {
  const r = rng(seed), s = blank();
  const nSongs = Math.floor(r() * 6);
  for (let i = 0; i < nSongs; i++) {
    s.songs.push({ id: 'song' + i, title: 'Song ' + i, createdAt: now - r() * 400 * DAY,
      genre: ['', 'Рок', 'Джаз', 'Своё'][Math.floor(r() * 4)], difficulty: 1 + Math.floor(r() * 5),
      deleted: r() < 0.15, updatedAt: Math.floor(r() * 1000) });
  }
  const density = r(); // от редкой до ежедневной практики
  for (let d = 0; d < 730; d++) {
    if (r() > density) continue;
    const start = now - d * DAY - Math.floor(r() * DAY);
    const type = ['free', 'song', 'tool'][Math.floor(r() * 3)];
    s.sessions.push({ id: 's' + d, type, songId: type === 'song' && nSongs ? 'song' + Math.floor(r() * nSongs) : null,
      tool: type === 'tool' ? 'metro' : null, start, dur: Math.floor(r() * 5400), bpm: r() < 0.3 ? 60 + Math.floor(r() * 120) : null,
      deleted: r() < 0.05, updatedAt: Math.floor(r() * 1000) });
  }
  s.settings.goalMin = [0, 30, 120, 300, 900][Math.floor(r() * 5)];
  s.settings.days = Array.from({ length: 7 }, () => (r() < 0.6 ? 1 : 0));
  s.settings.scale = ['5', '10', '100'][Math.floor(r() * 3)];
  return s;
}

const NOW = new Date(2026, 9, 7, 15, 30).getTime(); // среда
const SEEDS = Array.from({ length: 60 }, (_, i) => i + 1);

describe('сверка с прототипом', () => {
  it.each(SEEDS)('недели, ударный режим, песни — seed %i', (seed) => {
    const st = randomState(seed, NOW);
    L.setS(JSON.parse(JSON.stringify(st)));
    const realNow = Date.now;
    Date.now = () => NOW;
    try {
      const ses = liveSessions(st);
      expect(weekData(ses, NOW)).toEqual(L.weekData());
      expect(streakInfo(ses, st.settings, NOW)).toEqual(L.streakInfo());
      for (const so of liveSongs(st)) expect(songStats(ses, so.id)).toEqual(L.songStats(so.id));
    } finally {
      Date.now = realNow;
    }
  });

  it.each(SEEDS.slice(0, 20))('слияние резервных копий — seed %i', (seed) => {
    const a = randomState(seed, NOW), b = randomState(seed + 1000, NOW);
    a.settings.updatedAt = seed % 3; b.settings.updatedAt = 1;
    expect(merge(a, b)).toEqual(JSON.parse(JSON.stringify(L.merge(a, b))));
  });

  it('пустое состояние', () => {
    expect(blank()).toEqual(JSON.parse(JSON.stringify(L.blank())));
  });

  it('цвет надписи и шкала выученности', () => {
    for (const c of ['#FFCC00', '#3A3A3C', '#F2F2F7', '#007AFF', 'oops', '']) expect(autoText(c)).toBe(L.autoText(c));
    for (const scale of ['5', '10', '100']) {
      L.setS({ settings: { scale } });
      for (let p = 0; p <= 100; p += 5) {
        expect(toScale(p, +scale)).toBe(L.toScale(p));
        expect(getPct({ masteryPct: p })).toBe(L.getPct({ masteryPct: p }));
      }
      for (let v = 1; v <= +scale; v++) expect(fromScale(v, +scale)).toBe(L.fromScale(v));
    }
    expect(getPct({ mastery: 3 })).toBe(L.getPct({ mastery: 3 }));
  });
});
