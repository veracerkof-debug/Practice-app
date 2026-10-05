import { describe, it, expect } from 'vitest';
import { addMark, markSpan, nearMark, currentMark, isVideo, VIDEO_EXT } from '../src/modules/audio/marks.js';

describe('тайм-коды', () => {
  it('добавляются по порядку времени', () => {
    let r = addMark([], 30);
    r = addMark(r.marks, 10);
    expect(r.i).toBe(0);
    r = addMark(r.marks, 20.04);
    expect(r.marks.map((m) => m.t)).toEqual([10, 20, 30]);
    expect(r.i).toBe(1);
  });
  it('рядом с существующей новая не ставится', () => {
    const r = addMark([{ t: 10, name: 'Куплет' }], 10.3);
    expect(r.added).toBe(false);
    expect(r.i).toBe(0);
    expect(r.marks).toHaveLength(1);
  });
  it('исходный массив не меняется', () => {
    const m = [{ t: 5, name: '' }];
    addMark(m, 50);
    expect(m).toHaveLength(1);
  });
  it('отрезок до следующей метки или до конца', () => {
    const m = [{ t: 10 }, { t: 25 }];
    expect(markSpan(m, 0, 100)).toEqual([10, 25]);
    expect(markSpan(m, 1, 100)).toEqual([25, 100]);
  });
  it('ближайшая и текущая метка', () => {
    const m = [{ t: 10 }, { t: 25 }];
    expect(nearMark(m, 24, 2)).toBe(1);
    expect(nearMark(m, 17, 2)).toBe(-1);
    expect(currentMark(m, 5)).toBe(-1);
    expect(currentMark(m, 12)).toBe(0);
    expect(currentMark(m, 25)).toBe(1);
  });
});

describe('вид файла', () => {
  it('видео по проверке файла важнее типа', () => {
    expect(isVideo({ type: 'video/mp4' })).toBe(true);
    expect(isVideo({ type: 'video/mp4', video: false })).toBe(false);
    expect(isVideo({ type: 'audio/mpeg' })).toBe(false);
    expect(isVideo({ type: '', video: true })).toBe(true);
    expect(VIDEO_EXT.test('урок.MOV')).toBe(true);
    expect(VIDEO_EXT.test('minus.mp3')).toBe(false);
  });
});
