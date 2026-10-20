import { describe, it, expect, vi } from 'vitest';
import { after, every, cancel } from '../src/audio/clock.js';

// Часы звука без контекста работают на запасном setInterval (25 мс)
describe('audio clock', () => {
  it('after fires once, every repeats, cancel stops', async () => {
    vi.useFakeTimers();
    const a = vi.fn(), e = vi.fn();
    after(40, a);
    const id = every(30, e);
    await vi.advanceTimersByTimeAsync(100);
    expect(a).toHaveBeenCalledTimes(1);
    expect(e.mock.calls.length).toBeGreaterThanOrEqual(2);
    cancel(id);
    const n = e.mock.calls.length;
    await vi.advanceTimersByTimeAsync(100);
    expect(e.mock.calls.length).toBe(n);
    vi.useRealTimers();
  });
  it('a throwing timer does not break the others', async () => {
    vi.useFakeTimers();
    const ok = vi.fn();
    after(10, () => { throw new Error('x'); });
    after(20, ok);
    await vi.advanceTimersByTimeAsync(60);
    expect(ok).toHaveBeenCalled();
    vi.useRealTimers();
  });
});
