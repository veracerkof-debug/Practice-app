import { describe, it, expect } from 'vitest';
import { seal, sealOf, problemOf, splitVerified, profileSeal, profileOk, priorLocked, PRIOR_FREE_MS } from '../src/core/integrity.js';
import { createStore, LS } from '../src/core/store.js';

const NOW = new Date(2026, 9, 7, 15, 30).getTime(), H = 36e5;
const rec = (o = {}) => seal({ id: 'r' + Math.random(), type: 'free', start: NOW - 2 * H, end: NOW - H, dur: 3600, mode: 'normal', ...o });

describe('подтверждённые часы', () => {
  it('запись с печатью подтверждена; правка длительности или дописанная вручную — нет', () => {
    const r = rec();
    expect(problemOf(r, NOW)).toBe(null);
    expect(problemOf({ ...r, dur: 36000 }, NOW)).toBe('seal');
    expect(problemOf({ ...r, start: r.start - H }, NOW)).toBe('seal');
    const fake = { id: 'x', type: 'free', start: NOW - H, end: NOW, dur: 3600 };
    expect(problemOf(fake, NOW)).toBe('seal');
    // заметку и метку менять можно
    expect(problemOf({ ...r, note: 'новая', tag: 'Джем' }, NOW)).toBe(null);
  });
  it('сбитые часы, будущее, длительность больше промежутка — не подтверждено', () => {
    expect(problemOf(rec({ clk: 'bad' }), NOW)).toBe('clock');
    expect(problemOf(rec({ start: NOW + H, end: NOW + 2 * H }), NOW)).toBe('time');
    expect(problemOf(rec({ dur: 3 * 3600 }), NOW)).toBe('time');
    expect(problemOf(rec({ start: Date.UTC(2002, 0, 1), end: Date.UTC(2002, 0, 1) + H }), NOW)).toBe('time');
  });
  it('больше 24 часов за сутки — весь день не подтверждён', () => {
    const day = new Date(2026, 9, 6, 0, 0).getTime();
    const list = Array.from({ length: 5 }, (_, i) => rec({ start: day + i * 4 * H, end: day + i * 4 * H + 3 * H, dur: 6 * 3600 }));
    // сами записи невозможны (6 ч за 3 ч) — уже 'time'; честные, но сверх суток:
    const many = Array.from({ length: 9 }, (_, i) => rec({ start: day + i * 2.6 * H, end: day + i * 2.6 * H + 2.6 * H, dur: Math.round(2.6 * 3600) }));
    const extra = rec({ start: day + 1000, end: day + 1000 + H, dur: 3600 });
    expect(splitVerified([...many, extra], NOW).ok.length).toBe(0);
    expect(splitVerified(many, NOW).ok.length).toBe(9);
    expect(splitVerified(list, NOW).ok.length).toBe(0);
  });
  it('хранилище: старые записи при переходе подтверждаются, новые без печати — нет', () => {
    const m = new Map([[LS, JSON.stringify({ version: 1, songs: [], sessions: [{ id: 'old', type: 'free', start: NOW - 864e5, end: NOW - 864e5 + H, dur: 3600 }], settings: {} })]]);
    const st = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
    const store = createStore({ storage: st, now: () => NOW });
    expect(store.sessions().length).toBe(1);
    store.state.sessions.push({ id: 'hand', type: 'free', start: NOW - 3 * H, end: NOW - 2 * H, dur: 3600 });
    store.save();
    expect([store.sessions().length, store.unverified().length, store.allSessions().length]).toEqual([1, 1, 2]);
    store.addSession({ id: 'new', type: 'free', start: NOW - H, end: NOW, dur: 3600 });
    expect(store.sessions().length).toBe(2);
    const bad = createStore({ storage: st, now: () => NOW, clockBad: () => true });
    bad.addSession({ id: 'clk', type: 'free', start: NOW - H, end: NOW, dur: 3600 });
    expect(bad.unverified().map((r) => r.id)).toContain('clk');
  });
  it('опыт до приложения: под печатью, после 7 дней — только вниз', () => {
    const p = { priorHours: 500, createdAt: NOW - 864e5 };
    p.sig = profileSeal(p);
    expect(profileOk(p)).toBe(true);
    expect(profileOk({ ...p, priorHours: 5000 })).toBe(false);
    expect(profileOk({ priorHours: 0 })).toBe(true);
    expect(priorLocked(p, NOW)).toBe(false);
    expect(priorLocked(p, NOW + PRIOR_FREE_MS)).toBe(true);
    expect(sealOf({ id: 1 })).toHaveLength(32);
  });
});

describe('часы устройства', async () => {
  const { judge } = await import('../src/core/clock.js');
  const { BUILD_TIME } = await import('../src/core/integrity.js');
  it('дата раньше сборки, время назад, перевод часов', () => {
    expect(judge({ wall: Date.UTC(2002, 0, 1) }).reason).toBe('past');
    expect(judge({ wall: BUILD_TIME + 1e6, seen: BUILD_TIME + 1e6 + 3 * 3600e3 }).reason).toBe('back');
    expect(judge({ wall: BUILD_TIME + 1e9, prev: { wall: BUILD_TIME + 1e6, mono: 0 }, mono: 60000 }).reason).toBe('jump');
    expect(judge({ wall: BUILD_TIME + 60000 + 1e6, prev: { wall: BUILD_TIME + 1e6, mono: 0 }, mono: 60000 }).bad).toBe(false);
  });
});

describe('PDF по содержимому', async () => {
  const { pdfBytes } = await import('../src/modules/notes/pdf.js');
  const enc = (s) => new TextEncoder().encode(s);
  it('«%PDF-» в начале или после мусора — PDF; Guitar Pro и пустое — нет', () => {
    expect(pdfBytes(enc('%PDF-1.7\n...'))).toBe(true);
    expect(pdfBytes(enc('\r\n  junk %PDF-1.4'))).toBe(true);
    expect(pdfBytes(enc('\x18FICHIER GUITAR PRO v5.00'))).toBe(false);
    expect(pdfBytes(new Uint8Array(0))).toBe(false);
  });
});

