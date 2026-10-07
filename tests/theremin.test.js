import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { palm, openness, assign, heightOf, characterOf, oneEuro } from '../src/modules/theremin/map.js';
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
