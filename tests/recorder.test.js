import { describe, it, expect } from 'vitest';
import { pickType, extOf, recName } from '../src/core/recorder.js';

describe('запись', () => {
  it('выбирает первый поддерживаемый формат', () => {
    expect(pickType(['a', 'b', 'c'], (t) => t !== 'a')).toBe('b');
    expect(pickType(['a'], () => false)).toBe('');
  });
  it('расширение файла по формату', () => {
    expect(extOf('audio/webm;codecs=opus')).toBe('webm');
    expect(extOf('audio/mp4')).toBe('m4a');
    expect(extOf('video/mp4')).toBe('mp4');
    expect(extOf('audio/ogg;codecs=opus')).toBe('ogg');
  });
  it('имя записи — инструмент и время', () => {
    expect(recName('Метроном', new Date(2026, 9, 9, 18, 42).getTime())).toMatch(/^Метроном — .*18:42/);
  });
});

import { createGate, dbOf } from '../src/core/recorder.js';
describe('гейт мониторинга', () => {
  it('открыт выше порога и ещё немного после', () => {
    const g = createGate();
    expect(g.step(-60, -50, 0).open).toBe(false);
    expect(g.step(-30, -50, 10).open).toBe(true);
    expect(g.step(-60, -50, 100).open).toBe(true);   // удержание
    expect(g.step(-60, -50, 400).open).toBe(false);
  });
  it('долгий громкий звук — похоже на обратную связь', () => {
    const g = createGate();
    expect(g.step(-2, -50, 0).howl).toBe(false);
    expect(g.step(-2, -50, 300).howl).toBe(false);
    expect(g.step(-2, -50, 500).howl).toBe(true);
    expect(g.step(-20, -50, 600).howl).toBe(false);  // стихло — сброс
  });
  it('уровень в децибелах', () => {
    expect(dbOf(1)).toBe(0);
    expect(Math.round(dbOf(0.1))).toBe(-20);
    expect(dbOf(0)).toBe(-120);
  });
});
