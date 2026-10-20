import { describe, it, expect } from 'vitest';
import { PARTS, pickParts, applyParts, partsOf, partCounts, mergeTools } from '../src/core/backupparts.js';
import { isBackup } from '../src/core/store.js';

const base = () => ({
  version: 1, updatedAt: 5,
  songs: [{ id: 's1', title: 'A', updatedAt: 1 }],
  sessions: [{ id: 'x1', start: 1, updatedAt: 1 }],
  events: [{ id: 'e1', title: 'Репетиция', updatedAt: 1 }],
  settings: { theme: 'dark', goalMin: 300, configured: true, profile: { name: 'Анна' }, bible: { plan: 'p1', read: { 'GEN.1': 10 } },
    lib: { genres: [{ id: 'g1', name: 'Рок' }] }, cal: { kinds: [{ id: 'k1', name: 'Репетиция' }] }, updatedAt: 3 },
});

describe('копия по частям', () => {
  it('сохраняет только выбранное, остаётся копией', () => {
    const p = pickParts(base(), ['songs']);
    expect(isBackup(p)).toBe(true);
    expect(p.parts).toEqual(['songs']);
    expect(p.songs.length).toBe(1);
    expect(p.sessions).toEqual([]);
    expect(p.settings.profile).toBeUndefined();
    expect(p.settings.theme).toBeUndefined();
    expect(p.settings.lib.genres[0].name).toBe('Рок');
    expect(partsOf(p)).toEqual(['songs']);
    const s = pickParts(base(), ['settings'], { tools: { mix: { piano: 0.5 } } });
    expect([s.settings.theme, s.settings.configured, s.tools.mix.piano]).toEqual(['dark', undefined, 0.5]);
  });
  it('прежние копии — все части, что в них есть', () => {
    expect(partsOf(base())).toEqual(PARTS);
    expect(partsOf({ version: 1, sessions: [], songs: [], settings: { theme: 'light' } })).toEqual(['settings']);
  });
  it('загрузка выбранного: остальное не трогается, ничего не удаляется', () => {
    const mine = { version: 1, updatedAt: 1, songs: [{ id: 's2', title: 'B' }], sessions: [{ id: 'x2', start: 2 }],
      settings: { theme: 'light', profile: { name: 'Я' }, bible: { read: { 'EXO.1': 5 } }, lib: { genres: [{ id: 'g2', name: 'Джаз' }] }, updatedAt: 1 } };
    const out = applyParts(mine, base(), ['songs', 'reading']);
    expect(out.songs.map((s) => s.id).sort()).toEqual(['s1', 's2']);
    expect(out.sessions.length).toBe(1); // профиль не выбран
    expect(out.settings.profile.name).toBe('Я');
    expect(out.settings.theme).toBe('light'); // настройки не выбраны
    expect(out.settings.lib.genres.map((g) => g.name)).toEqual(['Джаз', 'Рок']);
    expect(Object.keys(out.settings.bible.read).sort()).toEqual(['EXO.1', 'GEN.1']);
    expect(out.settings.bible.plan).toBe('p1');
    const all = applyParts(mine, base(), PARTS);
    expect([all.settings.theme, all.settings.profile.name, all.sessions.length, all.events.length]).toEqual(['dark', 'Анна', 2, 1]);
  });
  it('нельзя загрузить часть, которой нет в копии; счётчики', () => {
    const p = pickParts(base(), ['songs']);
    const out = applyParts({ version: 1, songs: [], sessions: [], settings: { theme: 'x' } }, p, PARTS);
    expect(out.settings.theme).toBe('x');
    expect(partCounts(base())).toMatchObject({ songs: 1, profile: 1, reading: 1, calendar: 1 });
    expect(mergeTools({ a: { x: 1 }, b: { y: 1 } }, { b: { y: 2 } })).toEqual({ a: { x: 1 }, b: { y: 2 } });
  });
});
