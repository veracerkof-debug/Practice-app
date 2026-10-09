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
