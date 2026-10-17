import { describe, it, expect } from 'vitest';
import { tuningFor, priorHours, gemSec, estimateHours, saveProfile, applyLevelDefaults, newProfile } from '../src/core/profile.js';
import { createStore } from '../src/core/store.js';
import { profileSeal, DAY_MS } from '../src/core/integrity.js';
import { deviceDefaults } from '../src/core/device.js';

const mem = () => { const m = {}; return { getItem: (k) => m[k] ?? null, setItem: (k, v) => { m[k] = v; } }; };

describe('профиль', () => {
  it('строй — по первому инструменту, у которого он есть', () => {
    expect(tuningFor(['vocal', 'bass', 'guitar'])).toBe('b4');
    expect(tuningFor(['piano', 'vocal'])).toBe(null);
    expect(tuningFor(['uke'])).toBe('u_std');
  });
  it('опыт до приложения — воображаемый: в лигу не идёт', () => {
    const st = { profile: { priorHours: 120, createdAt: 5 } };
    st.profile.sig = profileSeal(st.profile);
    expect(priorHours(st)).toBe(120);
    // правка в файле без печати — опыт не учитывается
    expect(priorHours({ profile: { ...st.profile, priorHours: 9000 } })).toBe(0);
    expect(priorHours({})).toBe(0);
    expect(priorHours({ profile: { priorHours: -5 } })).toBe(0);
    // лига — только практика в приложении, без тишины, отмеченной микрофоном
    expect(gemSec([{ dur: 3600, quiet: 600 }, { dur: 1800 }])).toBe(4800);
  });
  it('оценка опыта: годы × часы в неделю × 52', () => {
    expect(estimateHours(3, 5)).toBe(780);
    expect(estimateHours('', 4)).toBe(0);
  });
  it('сохранение: чистит имя и список, отмечает регистрацию', () => {
    const store = createStore({ storage: mem(), now: () => 7 });
    const p = saveProfile(store, { name: '  Александр  ', instruments: ['vocal', 'nope', 'guitar'], level: 'x', priorHours: '250.4' }, { done: true });
    expect(p).toMatchObject({ name: 'Александр', instruments: ['guitar', 'vocal'], level: 'amateur', priorHours: 250, createdAt: 7 });
    expect(p.sig).toBe(profileSeal(p));
    expect(store.state.settings.configured).toBe(true);
  });
  it('опыт до приложения меняется свободно в любое время', () => {
    let now = 1000;
    const store = createStore({ storage: mem(), now: () => now });
    saveProfile(store, { name: 'A', priorHours: 100 }, { done: true });
    now += 30 * DAY_MS;
    expect(saveProfile(store, { name: 'A', priorHours: 900 }).priorHours).toBe(900);
    expect(saveProfile(store, { name: 'A', priorHours: 50 }).priorHours).toBe(50);
  });
  it('новичку — режим новичка в тюнере и ноты в глайдере, остальным только строй', () => {
    const d = applyLevelDefaults(deviceDefaults(), { ...newProfile(), level: 'beginner', instruments: ['bass'] });
    expect(d.tuner).toMatchObject({ beginner: true, useTuning: true, tuning: 'b4' });
    expect(d.glider).toMatchObject({ snap: 'note', width: 12 });
    const e = applyLevelDefaults(deviceDefaults(), { ...newProfile(), level: 'pro', instruments: ['violin'] });
    expect(e.tuner.beginner).toBeUndefined();
    expect(e.tuner.tuning).toBe('violin');
    expect(e.glider).toBeUndefined();
  });
});

describe('набор инструментов при регистрации', async () => {
  const { toolsFor } = await import('../src/core/profile.js');
  const ALL = ['metro', 'tuner', 'piano', 'glider', 'theremin', 'drone', 'theory', 'timer', 'audio', 'notes', 'spectrum'];
  it('новичку — самое нужное, продвинутым — всё; терменвокс — у всех, кроме новичков', () => {
    expect(toolsFor('beginner', ['guitar'], ALL)).toEqual(['metro', 'tuner', 'audio', 'notes']);
    expect(toolsFor('amateur', ['guitar'], ALL)).toEqual(['metro', 'tuner', 'piano', 'theremin', 'drone', 'theory', 'timer', 'audio', 'notes'].filter((x) => ALL.includes(x)));
    expect(toolsFor('pro', ['guitar'], ALL)).toEqual(ALL);
    expect(toolsFor('beginner', ['guitar'], ALL)).not.toContain('theremin');
  });
  it('поправки на инструмент: вокалу — пианино и дрон, пианисту и барабанщику — без тюнера', () => {
    expect(toolsFor('beginner', ['vocal'], ALL)).toEqual(['metro', 'tuner', 'piano', 'drone', 'audio', 'notes']);
    expect(toolsFor('beginner', ['piano'], ALL)).not.toContain('tuner');
    expect(toolsFor('beginner', ['piano', 'guitar'], ALL)).toContain('tuner');
  });
});
