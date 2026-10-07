import { describe, it, expect } from 'vitest';
import { tuningFor, priorHours, lifetimeSec, gemSec, estimateHours, saveProfile, applyLevelDefaults, newProfile } from '../src/core/profile.js';
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
  it('опыт до приложения входит в общее время', () => {
    const st = { profile: { priorHours: 120, createdAt: 5 } };
    st.profile.sig = profileSeal(st.profile);
    expect(priorHours(st)).toBe(120);
    // правка в файле без печати — опыт не учитывается
    expect(priorHours({ profile: { ...st.profile, priorHours: 9000 } })).toBe(0);
    expect(priorHours({})).toBe(0);
    expect(priorHours({ profile: { priorHours: -5 } })).toBe(0);
    expect(lifetimeSec([{ dur: 3600 }, { dur: 1800 }], st)).toBe(5400 + 120 * 3600);
    // камень — только практика в приложении, без тишины, отмеченной микрофоном
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
  it('опыт до приложения: 7 дней свободно, потом только в меньшую сторону', () => {
    let now = 1000;
    const store = createStore({ storage: mem(), now: () => now });
    saveProfile(store, { name: 'A', priorHours: 100 }, { done: true });
    now += 3 * DAY_MS;
    expect(saveProfile(store, { name: 'A', priorHours: 200 }).priorHours).toBe(200);
    now += 5 * DAY_MS;
    const up = saveProfile(store, { name: 'A', priorHours: 900 });
    expect(up.priorHours).toBe(200);
    expect(up.locked).toBe(true);
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
