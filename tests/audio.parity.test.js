// Сверка звукового ядра с прототипом: планировщик метронома, акценты, YIN, спектры, настройки устройства.
import { describe, it, expect } from 'vitest';
import { runLegacy } from './legacy.js';
import { defaultAccents, tempoName, step, newPosition } from '../src/audio/metronome.js';
import { yin } from '../src/audio/pitch.js';
import { harmAmp } from '../src/audio/waves.js';
import { normalizeDrone, droneNotes, tanpuraPattern } from '../src/audio/drone.js';
import { pianoPatch, PRESETS } from '../src/audio/synth.js';
import { normalizeMix, createMixer } from '../src/audio/mixer.js';
import { loadDevice, LS_T } from '../src/core/device.js';
import { blank, METRO_DEF } from '../src/core/store.js';

const clone = (o) => JSON.parse(JSON.stringify(o));
const memStorage = (init = {}) => ({ getItem: (k) => init[k] ?? null, setItem: (k, v) => { init[k] = v; } });

describe('метроном', () => {
  const L = runLegacy([/^function defaultAccents\(/, /^const TEMPO_NAMES=/, /^const tempoName=/],
    '{defaultAccents,tempoName}');

  it('акценты по умолчанию для всех размеров', () => {
    for (const den of [2, 4, 8, 16]) for (let num = 1; num <= 16; num++) expect(defaultAccents(num, den)).toEqual([...L.defaultAccents(num, den)]);
  });
  it('названия темпа', () => {
    for (let b = 20; b <= 300; b++) expect(tempoName(b)).toBe(L.tempoName(b));
  });

  function ourRun(cfg, steps) {
    const log = [], queue = [], pos = newPosition();
    let t = 0;
    while (queue.length < steps) {
      const ev = step(pos, cfg);
      if (ev.level) log.push({ kind: 'voice', t, l: ev.level });
      queue.push({ t, b: ev.b, s: ev.s, bar: ev.bar, silent: ev.silent });
      t += ev.dur;
    }
    return { log, queue, bpm: cfg.bpm };
  }

  const CASES = [
    { },
    { num: 3, accents: [3, 1, 0] },
    { sub: 2, swing: true },
    { sub: 3, num: 6, den: 8, accents: defaultAccents(6, 8) },
    { sub: 4, gap: { on: true, play: 1, mute: 2 } },
    { trainer: { on: true, step: 5, every: 2, max: 120 }, bpm: 100 },
    { num: 7, den: 8, accents: defaultAccents(7, 8), sub: 2, trainer: { on: true, step: 3, every: 1, max: 200 }, gap: { on: true, play: 3, mute: 1 } },
  ];
  it.each(CASES.map((c, i) => [i, c]))('расписание ударов совпадает — случай %i', (_, over) => {
    const base = Object.assign(clone(METRO_DEF), over);
    const a = ourRun(clone(base), 400);
    // Исходный планировщик работает пачками до currentTime+0.12, но порядок и время ударов те же
    const b = runLegacyQueue(clone(base), 400);
    expect(a.queue.map((q) => [q.b, q.s, q.bar, q.silent])).toEqual(b.queue.map((q) => [q.b, q.s, q.bar, q.silent]));
    a.queue.forEach((q, i) => expect(q.t).toBeCloseTo(b.queue[i].t, 9));
    expect(a.log.map((x) => x.l)).toEqual(b.log.slice(0, a.log.length).map((x) => x.l));
    expect(a.bpm).toBe(b.bpm);
  });

  function runLegacyQueue(cfg, steps) {
    const log = [];
    const P = runLegacy([/^const M=/], 'M', { tickBpm: () => {}, ac: () => null, mixV: () => 1, __S0: blank() });
    P.cfg = cfg;
    P.ctx = { currentTime: 0 };
    P.voice = (t, l) => log.push({ t, l });
    P.next = 0; P.beat = 0; P.subI = 0; P.bar = 0; P.queue = [];
    // по одному удару за раз, чтобы остановиться ровно на steps (и темп тренера совпал)
    while (P.queue.length < steps) { P.ctx.currentTime = P.next - 0.12 + 1e-9; P.sched(); }
    return { log, queue: P.queue, bpm: cfg.bpm };
  }
});

describe('тюнер (YIN)', () => {
  const L = runLegacy([/^function yin\(/], '{yin}');
  const sr = 48000;
  const tone = (f, n = 4096, harm = [1], noise = 0, seed = 1) => {
    let s = seed;
    const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32 - 0.5);
    const b = new Float32Array(n);
    for (let i = 0; i < n; i++) b[i] = harm.reduce((t, a, k) => t + a * Math.sin(2 * Math.PI * f * (k + 1) * i / sr), 0) * 0.3 + noise * r();
    return b;
  };
  it.each([41.2, 55, 82.41, 110, 146.83, 196, 246.94, 329.63, 440, 659.25, 880, 1318.5])('%f Гц — как в прототипе и верно', (f) => {
    for (const [harm, noise] of [[[1], 0], [[1, 0.5, 0.3, 0.2], 0], [[0.6, 1, 0.4], 0.05]]) {
      const b = tone(f, 4096, harm, noise);
      const ours = yin(b, sr);
      expect(ours).toBe(L.yin(b, sr));
      expect(Math.abs(1200 * Math.log2(ours / f))).toBeLessThan(5); // точнее 5 центов
    }
  });
  it('тишина и шум — нет ноты', () => {
    expect(yin(new Float32Array(4096), sr)).toBe(0);
    expect(yin(tone(0, 4096, [0], 0.004), sr)).toBe(L.yin(tone(0, 4096, [0], 0.004), sr));
  });
});

describe('звук: синтезатор, пэды, микшер, настройки устройства', () => {
  const stored = { piano: { sound: 'pad', oct: 3 }, drone: { sound: 'flute', pc: 2, oct: 2 }, mix: { piano: 0.5, mute: { drone: true } }, tuner: { a4: 442 } };
  const L = runLegacy([
    /^const LS_T=/, /^const T=/, /^if\(!\["soft"/, /^if\(!T\.drone\.layers\)/, /^const saveT=/, /^function harmAmp\(/,
    /^const SYNP=/, /^function SP\(/, /^function MIX\(/, /^const mixV=/,
    /^const DSND=/, /^const DCH=/, /^function DC\(/,
  ], '{T,harmAmp,SP,MIX,mixV,DC,DCH}', { localStorage: memStorage({ 'practice.v1.tools': JSON.stringify(stored) }) });

  it('настройки устройства грузятся так же', () => {
    const d = loadDevice(memStorage({ [LS_T]: JSON.stringify(stored) }));
    // режим звука: в прототипе «баланс», теперь по умолчанию большой буфер и режим ресурсов (2026-10) — сверяем остальное
    const { mode, perf, ...mix } = d.mix;
    expect([mode, perf]).toEqual(['smooth', 'full']);
    expect({ ...d, mix }).toEqual({ ...clone(L.T), mix: (({ mode: _m, ...r }) => r)(clone(L.T).mix) });
  });
  it('спектры синтезатора', () => {
    for (const kind of ['piano', 'organ', 'saw', 'soft']) for (let tone = 0; tone <= 1; tone += 0.1)
      for (let i = 1; i <= 24; i++) expect(harmAmp(kind, tone, i)).toBe(L.harmAmp(kind, tone, i));
  });
  it('патч пианино по умолчанию', () => {
    const d = loadDevice(memStorage({ [LS_T]: JSON.stringify(stored) }));
    // прототип выбирал «Пэд»; пэд убран (10.2026) — вместо него воздушный пэд, без прочих полей прежнего звука
    const { n, ...proto } = clone(L.SP());
    expect(proto.preset).toBe('pad');
    const p = pianoPatch(d.piano);
    expect(p.preset).toBe('wair');
    expect(p.air).toBe('air');
    expect(Object.keys(PRESETS)).toEqual(['piano', 'wfelt', 'wkpad', 'wair', 'wlight', 'wwarm', 'wchoir', 'wflute', 'organ', 'sine', 'bell', 'fmep', 'abass']);
    // рояль (записи) + воздушный набор для поклонения + орган, синус, колокол + FM-пиано и аналоговый бас
  });
  it('пэды: значения по умолчанию, ноты, тампура', () => {
    const d = loadDevice(memStorage({ [LS_T]: JSON.stringify(stored) }));
    // поверх прототипа — новые настройки поклонения (длинный зал и «Air»), по умолчанию выключены
    expect(normalizeDrone(d.drone)).toEqual({ ...clone(L.DC()), hall: 0, air: 0 });
    d.drone.layers = { 2: true, 3: true, 4: true };
    for (const chord of ['root', 'fifth', 'maj', 'min', 'sus4']) {
      d.drone.chord = chord;
      const offs = L.DCH.find((x) => x[0] === chord)[2];
      expect(droneNotes(d.drone)).toHaveLength(3 * offs.length);
      expect(droneNotes(d.drone)[0]).toEqual([12 * 3 + 2, 1]);
      expect(tanpuraPattern(d.drone).pat[0]).toBe(36 + 2 + (chord === 'root' || chord === 'sus4' ? 5 : 7));
    }
  });
  it('микшер: громкость и выключение как mixV', () => {
    const mx = normalizeMix(clone(L.T.mix));
    const m = createMixer(mx);
    L.MIX();
    for (const [bus, key] of [['metro', 'metro'], ['piano', 'piano'], ['drone', 'drone'], ['media', 'audio'], ['theory', 'theory']])
      expect(m.value(bus)).toBe(L.mixV(key));
    m.set('drone', 1.234);
    expect([m.value('drone'), mx.mute.drone]).toEqual([1.25, false]);
    m.set('piano', 9);
    expect(m.value('piano')).toBe(1.5);
    m.toggleMute('media');
    expect(m.value('media')).toBe(0);
  });
  it('метроном по умолчанию в данных', () => {
    expect(blank().settings.metro).toEqual(METRO_DEF);
  });
});
