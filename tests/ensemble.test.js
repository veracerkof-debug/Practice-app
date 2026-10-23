import { describe, it, expect, vi, afterEach } from 'vitest';
import { createEnsembleHost, createEnsembleClient, countNum, partOf, memberState, GO } from '../src/core/ensemble.js';
import { handleRequest } from '../src/core/sync.js';
import { chirp, findChirp, OUT_SR } from '../src/audio/align.js';
import { encodeWav, decodeWav } from '../src/audio/voicefx.js';

afterEach(() => { vi.useRealTimers(); delete globalThis.localStorage; });

function memFiles() {
  const m = new Map();
  return { get: (id) => m.get(id) || null, add: async (r) => { m.set(r.id, r); }, save: async () => {}, remove: async (id) => { m.delete(id); }, list: (k) => [...m.values()].filter((r) => r.kind === k), all: () => [...m.values()] };
}
const appOf = () => ({ files: memFiles(), store: { state: { settings: {}, projects: [] }, save() {}, now: () => Date.now(), settingsChanged() {} }, jobs: { supported: () => false, busy: () => false } });

describe('ансамбль: мелочи', () => {
  it('партия по профилю', () => { expect(partOf(['egtr'])).toBe('guitar'); expect(partOf(['vocal', 'piano'])).toBe('vocals'); expect(partOf(['flute'])).toBe('other'); });
  it('число счёта', () => { expect(countNum(3500)).toBe(null); expect(countNum(2999)).toBe(3); expect(countNum(1)).toBe(1); expect(countNum(-100)).toBe(0); expect(countNum(-1000)).toBe(null); });
  it('состояние участника', () => { expect(memberState({ seen: 0 }, 1, 'rec', 10000)).toBe('lost'); expect(memberState({ seen: 9000, rec: 1 }, 1, 'rec', 10000)).toBe('rec'); expect(memberState({ seen: 9000, got: { 1: 'x' } }, 1, 'collect', 10000)).toBe('got'); });
});

describe('ансамбль: дубль целиком', () => {
  it('два телефона с разными часами, задержкой, кварцем и частотой → выровненный проект', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);
    globalThis.localStorage = { getItem: () => JSON.stringify({ pc: { addr: 'http://pc:53319', key: 'x', name: 'PC' } }), setItem() {} };
    const T0 = Date.now(), trueSec = () => (Date.now() - T0) / 1000;
    // звук компьютера: время звука = истинное время; журнал сыгранного
    const played = [];
    const ctx = { sampleRate: 48000, get currentTime() { return trueSec(); } };
    const sound = { ctx: () => ctx, buffer: (x) => ({ len: x.length }), play: (b, at) => played.push({ at, len: b.len }) };
    const hostApp = appOf(), host = createEnsembleHost(hostApp, { sound });
    // телефоны: смещение часов, задержка старта записи, кварц, частота
    const chirpLen = chirp(48000).length;
    const phones = [{ key: 'k1', name: 'Анна', part: 'vocals', off: 5321, lat: 0.21, ppm: 70, sr: 48000 }, { key: 'k2', name: 'Борис', part: 'drums', off: -12007, lat: 0.083, ppm: -45, sr: 44100 }];
    const CLAP = 7.25; // общее событие в комнате: через 7,25 с после сигнала (истинное время от начального сигнала)
    const incoming = new Map(), mem = { peers: { k1: { name: 'A' }, k2: { name: 'B' } } };
    // обработчик запросов компьютера — тот же, что у сервера
    const call = (key) => async (method, url, { json }) => {
      const u = new URL(url), res = await handleRequest({ app: hostApp, mem, ens: host }, { method, path: u.pathname, query: {}, key, json }, incoming);
      if (res.status >= 400) throw Object.assign(new Error('http'), { status: res.status });
      return res.json;
    };
    const clients = phones.map((p) => {
      const rec = {
        start: async () => { p.startTrue = trueSec() + p.lat; return { rate: p.sr }; },
        stop: async () => { p.stopTrue = trueSec(); return { path: 'x', sec: 1 }; },
        read: async () => {
          // запись: от старта до стопа на частоте sr·(1+ppm); сигналы — когда их сыграл компьютер; хлопок; шум
          const k = 1 + p.ppm * 1e-6, n = Math.round((p.stopTrue - p.startTrue) * p.sr * k), x = new Float32Array(n);
          let s = 12345; for (let i = 0; i < n; i++) { s = (s * 1664525 + 1013904223) >>> 0; x[i] = (s / 2 ** 32 - 0.5) * 0.04; }
          const put = (sig, at, amp) => { const i0 = Math.round((at - p.startTrue) * p.sr * k); for (let i = 0; i < sig.length; i++) if (i0 + i >= 0 && i0 + i < n) x[i0 + i] += amp * sig[i]; };
          const c = chirp(p.sr), chirps = played.filter((e) => e.len === chirpLen);
          chirps.forEach((e) => put(c, e.at, 0.6));
          put(chirp(p.sr, { f0: 5000, f1: 1500 }), chirps[0].at + CLAP, 0.5);
          return encodeWav([x], p.sr);
        },
      };
      const app = appOf(); app.store.state.settings.profile = { name: p.name, instruments: [] }; app.store.state.settings.ensPart = p.part;
      const C = createEnsembleClient(app, { rec, H: call(p.key), now: () => Date.now() + p.off });
      return { C, app, p };
    });
    host.open();
    clients.forEach((c) => c.C.join());
    await vi.advanceTimersByTimeAsync(1500);
    expect(host.members().map((m) => m.st)).toEqual(['here', 'here']);
    expect(host.record()).toBe(true);
    await vi.advanceTimersByTimeAsync(2000); // телефоны включили запись → сигнал и счёт
    expect(host.phase).toBe('count');
    // часы телефона сверены: «поехали» на телефоне — почти тогда же, когда у компьютера
    const left = clients[0].C.left();
    expect(Math.abs(left - (host.goAt - Date.now()))).toBeLessThan(5);
    await vi.advanceTimersByTimeAsync((GO + 6) * 1000); // играем
    expect(host.phase).toBe('rec');
    host.stop();
    await vi.advanceTimersByTimeAsync(4000); // сигнал конца, остановка, отправка, сборка
    expect(host.phase).toBe('collect');
    await vi.advanceTimersByTimeAsync(3000);
    // исходник — на каждом телефоне
    clients.forEach((c) => expect(c.app.files.list('audio').filter((r) => r.ens && r.ens.role === 'raw').length).toBe(1));
    const T = host.takes[1];
    expect(T.project).toBeTruthy();
    const proj = hostApp.store.state.projects.find((x) => x.id === T.project);
    expect(proj.tracks.map((x) => x.name)).toEqual(['Анна · Вокал', 'Борис · Барабаны']);
    const aligned = hostApp.files.list('audio').filter((r) => r.ens && r.ens.role === 'aligned');
    expect(aligned.length).toBe(2);
    // хлопок — в одном и том же месте у обеих дорожек (с точностью до отсчёта) и там, где должен быть
    const pos = [];
    for (const r of aligned) {
      const w = decodeWav(new Uint8Array(await r.blob.arrayBuffer()));
      expect(w.sr).toBe(OUT_SR);
      pos.push(findChirp(w.ch[0], OUT_SR, 0, w.ch[0].length, { f0: 5000, f1: 1500 }).pos);
    }
    expect(Math.abs(pos[0] - pos[1])).toBeLessThan(1.5);
    expect(Math.abs(pos[0] - (CLAP - 0.5) * OUT_SR)).toBeLessThan(2);
    clients.forEach((c) => c.C.leave());
    host.close();
  }, 60000);
});
