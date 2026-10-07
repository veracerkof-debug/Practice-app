import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { palm, openness, assign, heightOf, characterOf, oneEuro, pose, gestureValues, applyGestures, DEFAULT_MAP, NEUTRAL } from '../src/modules/theremin/map.js';
import { stripTelemetry, TELEMETRY_HOST } from '../build/mediapipe.js';

// Рука-заготовка: 21 точка вокруг (cx, cy); open — пальцы вытянуты, иначе сжаты
function hand(cx, cy, open = true) {
  const lm = Array.from({ length: 21 }, () => ({ x: cx, y: cy }));
  lm[0] = { x: cx, y: cy + 0.1 }; // запястье
  [5, 9, 13, 17].forEach((i, k) => { lm[i] = { x: cx - 0.03 + k * 0.02, y: cy }; });
  [8, 12, 16, 20].forEach((i, k) => { lm[i] = { x: cx - 0.03 + k * 0.02, y: open ? cy - 0.1 : cy + 0.02 }; });
  return { lm };
}

describe('терменвокс: руки', () => {
  it('центр ладони и раскрытость', () => {
    expect(palm(hand(0.5, 0.5).lm).y).toBeCloseTo(0.52, 2);
    expect(openness(hand(0.5, 0.5, true).lm)).toBeGreaterThan(0.9);
    expect(openness(hand(0.5, 0.5, false).lm)).toBeLessThan(0.1);
  });
  it('какая рука ведёт высоту: две руки — по сторонам, одна — по половине кадра', () => {
    const l = hand(0.2, 0.5), r = hand(0.8, 0.3);
    expect(assign([l, r], 'right').pitch.lm).toBe(r.lm);
    expect(assign([l, r], 'left').pitch.lm).toBe(l.lm);
    expect(assign([l], 'right')).toMatchObject({ pitch: null });
    expect(assign([r], 'right').fx).toBe(null);
    expect(assign([], 'right')).toEqual({ pitch: null, fx: null });
  });
  it('высота и характер', () => {
    expect(heightOf(0.1)).toBe(1);
    expect(heightOf(0.9)).toBe(0);
    expect(heightOf(0.5)).toBeCloseTo(0.5);
    expect(characterOf(0.95, 'right')).toBeCloseTo(1);
    expect(characterOf(0.5, 'right')).toBe(0);
    expect(characterOf(0.05, 'left')).toBeCloseTo(1);
  });
  it('сглаживание: стоящая рука не дрожит, движение догоняется', () => {
    const f = oneEuro();
    let v = 0;
    for (let i = 0; i < 30; i++) v = f.next(0.5 + (i % 2 ? 0.01 : -0.01), i * 33);
    expect(Math.abs(v - 0.5)).toBeLessThan(0.006);
    for (let i = 30; i < 60; i++) v = f.next(0.9, i * 33);
    expect(v).toBeGreaterThan(0.85);
  });
});

// Повернуть точки руки вокруг запястья в плоскости кадра на a градусов
const rotated = (h, a) => {
  const r = (a * Math.PI) / 180, o = h.lm[0];
  return { ...h, ar: 1, lm: h.lm.map((p) => ({ x: o.x + (p.x - o.x) * Math.cos(r) - (p.y - o.y) * Math.sin(r), y: o.y + (p.x - o.x) * Math.sin(r) + (p.y - o.y) * Math.cos(r) })) };
};
// Объёмная ладонь: к камере или ребром, пальцы вверх или к камере
function world({ turn = 0, tilt = 0 } = {}) {
  const w = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  const t = (turn * Math.PI) / 180, k = (tilt * Math.PI) / 180;
  w[0] = { x: 0, y: 0.04, z: 0 };
  w[9] = { x: 0, y: 0.04 - 0.08 * Math.cos(k), z: -0.08 * Math.sin(k) };
  w[5] = { x: -0.03 * Math.cos(t), y: 0, z: 0.03 * Math.sin(t) };
  w[17] = { x: 0.03 * Math.cos(t), y: 0, z: -0.03 * Math.sin(t) };
  return w;
}

describe('терменвокс: рука эффектов', () => {
  it('поворот кисти в плоскости кадра', () => {
    const base = pose({ ...hand(0.3, 0.5), ar: 1 }).rot;
    expect(Math.abs(base)).toBeLessThan(10); // пальцы почти вверх
    expect(Math.abs(pose(rotated(hand(0.3, 0.5), 40)).rot - base)).toBeCloseTo(40, 0);
  });
  it('разворот ладони и наклон — по объёмным точкам', () => {
    expect(Math.abs(pose({ ...hand(0.3, 0.5), w: world() }).turn)).toBeLessThan(2);
    expect(Math.abs(pose({ ...hand(0.3, 0.5), w: world({ turn: 60 }) }).turn)).toBeCloseTo(60, 0);
    expect(pose({ ...hand(0.3, 0.5), w: world({ tilt: 30 }) }).tilt).toBeCloseTo(30, 0);
    expect(pose(hand(0.3, 0.5)).turn).toBe(null); // без объёмных точек — нет
  });
  it('силы жестов: нейтраль — ноль, полное отклонение — единица, мелкая дрожь не считается', () => {
    const p = { x: 0.3, y: 0.5, open: 1, size: NEUTRAL.size, rot: 3, turn: 2, tilt: -2, pinch: 1 };
    const v = gestureValues(p);
    expect(v.rot).toBe(0);
    expect(v.turn).toBe(0);
    expect(v.dist).toBe(0);
    expect(gestureValues({ ...p, rot: 70 }).rot).toBe(1);
    expect(gestureValues({ ...p, size: NEUTRAL.size * 1.6 }).dist).toBe(1);
    expect(gestureValues({ ...p, rot: 25 }, { rot: 25 }).rot).toBe(0); // от своей нейтрали
  });
  it('назначения: пространство — реверберация и эхо, громкость — от ладони', () => {
    const o = applyGestures({ open: 0.5, height: 1, rot: 0.4, tilt: 0, dist: 0, turn: 0, x: 0 }, DEFAULT_MAP);
    expect(o).toMatchObject({ vol: 0.5, verb: 1, echo: 0.6, bright: 0.4, vib: 0 });
    expect(applyGestures({ open: 0, rot: 1 }, { ...DEFAULT_MAP, open: 'off', rot: 'fuzz' })).toMatchObject({ vol: 1, fuzz: 1 });
  });
});

describe('MediaPipe без сбора статистики', () => {
  it('отправка вырезается из настоящего кода пакета', () => {
    const src = readFileSync('node_modules/@mediapipe/tasks-vision/vision_bundle.mjs', 'utf8');
    expect(src).toContain(TELEMETRY_HOST);
    const out = stripTelemetry(src);
    expect(out).not.toContain(TELEMETRY_HOST);
    expect(out).toContain('flush(t,e){this.i=[];t?.();return;');
    expect(out).not.toMatch(/setInterval\(\(\)=>\{this\.flush\(\)\},6e4\)/);
  });
  it('незнакомый код — ошибка, а не тихий пропуск', () => {
    expect(() => stripTelemetry('fetch("https://' + TELEMETRY_HOST + '/v2")')).toThrow();
  });
});
