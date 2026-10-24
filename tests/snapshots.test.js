// Копии на устройстве (src/core/snapshots.js): сколько хранить
import { describe, it, expect } from 'vitest';
import { toPrune, dayId, KEEP_DAY, KEEP_UPD } from '../src/core/snapshots.js';

describe('копии на устройстве', () => {
  it('суточных — 7 свежих, перед обновлением — 3 свежих', () => {
    const list = [...Array(10)].map((_, i) => ({ id: 'd' + i, at: i, kind: 'day' })).concat([...Array(5)].map((_, i) => ({ id: 'u' + i, at: i, kind: 'update' })));
    const gone = toPrune(list);
    expect(gone.filter((x) => x[0] === 'd').sort()).toEqual(['d0', 'd1', 'd2']);
    expect(gone.filter((x) => x[0] === 'u').sort()).toEqual(['u0', 'u1']);
    expect(KEEP_DAY).toBe(7); expect(KEEP_UPD).toBe(3);
  });
  it('одна суточная на день', () => {
    expect(dayId(new Date(2026, 9, 24, 1).getTime())).toBe(dayId(new Date(2026, 9, 24, 23).getTime()));
    expect(dayId(new Date(2026, 9, 24).getTime())).not.toBe(dayId(new Date(2026, 9, 25).getTime()));
  });
});
