import { describe, it, expect } from 'vitest';
import { buildQuery, parseResults, lookup, keyName, parseKey, KEYS } from '../src/core/songinfo.js';

const rec = (title, artist, { score = 100, date, rel = 1, tags } = {}) => ({
  title, score, 'first-release-date': date, releases: Array(rel).fill({}), tags,
  'artist-credit': [{ name: artist }],
});

describe('поиск песни (MusicBrainz)', () => {
  it('запрос: название и исполнитель, спецсимволы экранируются', () => {
    expect(buildQuery('Nothing Else Matters', 'Metallica')).toBe('recording:(Nothing Else Matters) AND artist:(Metallica)');
    expect(buildQuery('AC/DC: T.N.T.')).toBe('recording:(AC\\/DC\\: T.N.T.)');
    expect(buildQuery('', '')).toBe('');
  });
  it('записи одной песни собираются вместе; оригинал с множеством изданий — первым', () => {
    const r = parseResults({ recordings: [
      rec('Кукушка', 'Би-2', { date: '2000-11-17' }),
      rec('Кукушка', 'Кино', { date: '1990', rel: 5, tags: [{ name: 'rock', count: 3 }] }),
      rec('Кукушка (live)', 'Кино', { date: '1989-06', rel: 3 }),
      rec('Кукушка', 'Кино', { date: '2012', rel: 4, tags: [{ name: 'post-punk', count: 1 }] }),
      rec('Совсем другое', 'X', { score: 30 }),
    ] });
    expect(r.map((x) => x.artist)).toEqual(['Кино', 'Би-2']);
    expect(r[0]).toEqual({ title: 'Кукушка', artist: 'Кино', year: 1989, tags: ['rock', 'post-punk'] });
  });
  it('нет сети и занятая база — понятные причины', async () => {
    await expect(lookup('a', '', { fetch: () => Promise.reject(new Error('net')) })).rejects.toMatchObject({ reason: 'offline' });
    await expect(lookup('a', '', { fetch: async () => ({ ok: false, status: 503 }) })).rejects.toMatchObject({ reason: 'busy' });
    expect(await lookup('', '', { fetch: () => { throw new Error('не должен вызываться'); } })).toEqual([]);
  });
  it('тональность: 24 названия туда и обратно', () => {
    expect(KEYS.length).toBe(24);
    expect([keyName(9, true), keyName(6, false), keyName(3, false)]).toEqual(['Am', 'F♯', 'E♭']);
    KEYS.forEach((k) => { const p = parseKey(k); expect(keyName(p.pc, p.minor)).toBe(k); });
    expect(parseKey('H')).toBe(null);
  });
});
