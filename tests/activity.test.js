import { describe, it, expect } from 'vitest';
import { levelDb, createLevelGate } from '../src/core/activity.js';
import { silenceReason, LOW_VOLUME } from '../src/core/nosound.js';

describe('уровень шума', () => {
  it('громкость кадра в дБ', () => {
    expect(levelDb(new Float32Array(100).fill(1))).toBeCloseTo(0, 3);
    expect(levelDb(new Float32Array(100).fill(0.1))).toBeCloseTo(-20, 3);
  });
  it('постоянный фон — не игра, звук заметно громче фона — игра', () => {
    const g = createLevelGate();
    let heard = 0;
    for (let i = 0; i < 400; i++) heard += g.push(-50 + (i % 2)) ? 1 : 0; // вентилятор
    expect(heard).toBeLessThan(5);
    expect(g.push(-30)).toBe(true);
    expect(g.push(-49)).toBe(false);
  });
  it('очень тихо — не игра, даже если фон ещё тише', () => {
    const g = createLevelGate();
    for (let i = 0; i < 40; i++) g.push(-90);
    expect(g.push(-70)).toBe(false);
  });
});

describe('«Звука нет»', () => {
  const val = (m) => (b) => m[b] ?? 1;
  it('шина выключена в микшере, звук устройства выключен или слишком тихий', () => {
    expect(silenceReason(['metro'], val({ metro: 0 }), null)).toEqual({ k: 'mixer', bus: 'metro' });
    expect(silenceReason(['metro'], val({}), { level: 0, muted: true })).toEqual({ k: 'mute' });
    expect(silenceReason(['metro'], val({}), { level: LOW_VOLUME / 2, muted: false })).toEqual({ k: 'low' });
    expect(silenceReason(['metro'], val({}), { level: 0.5, muted: false })).toBe(null);
    expect(silenceReason(['metro'], val({}), null)).toBe(null);
  });
});
