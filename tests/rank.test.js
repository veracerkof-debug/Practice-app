import { describe, it, expect } from 'vitest';

import { isOn, toolsOnly } from '../src/core/settings.js';
import { recordToolTime } from '../src/core/session.js';

describe('режим «Только инструменты»', () => {
  it('ударный режим и значок выключены, модули — нет; время инструмента не пишется', () => {
    const st = { toolsOnly: true };
    expect([toolsOnly(st), isOn(st, 'streak'), isOn(st, 'mastery'), isOn(st, 'metro')]).toEqual([true, false, false, true]);
    expect(isOn({}, 'mastery')).toBe(true);
    const store = { state: { settings: st, sessions: [] }, save() {} };
    expect(recordToolTime(store, 'metro', 0, 600000, 600000)).toBe(false);
    expect(store.state.sessions.length).toBe(0);
  });
});
