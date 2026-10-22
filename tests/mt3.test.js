import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { decodeTokens, decodeSegment, tokenEvent, toParts } from '../src/music/mt3.js';

// Эталон — декодер оригинала YourMT3 (Python) на тех же токенах: запись с электропиано, басом и ударными, 10 кусков
const fx = JSON.parse(readFileSync(new URL('./fixtures/ymt-dense.json', import.meta.url), 'utf8'));
const key = (n) => [n[0], n[1], n[2], n[3], n[4] ? 1 : 0].join(',');

describe('YourMT3: токены → ноты', () => {
  it('словарь событий', () => {
    expect(tokenEvent(1).type).toBe('EOS');
    expect(tokenEvent(3)).toEqual({ type: 'shift', value: 0 });
    expect(tokenEvent(269)).toEqual({ type: 'pitch', value: 60 });
    expect(tokenEvent(338)).toEqual({ type: 'velocity', value: 1 });
    expect(tokenEvent(339).type).toBe('tie');
    expect(tokenEvent(364)).toEqual({ type: 'program', value: 24 });
    expect(tokenEvent(504)).toEqual({ type: 'drum', value: 36 });
  });
  it('совпадает с оригиналом нота в ноту', () => {
    const notes = decodeTokens(fx.tokens, { seg: fx.seg, sr: fx.sr });
    const mine = notes.map((n) => [Math.round(n.on * 1e4) / 1e4, Math.round(n.off * 1e4) / 1e4, n.m, n.prog, n.drum]).map(key).sort();
    const ref = fx.notes.map(key).sort();
    expect(mine.length).toBe(ref.length);
    expect(mine).toEqual(ref);
  });
  it('без токена связки кусок пуст', () => {
    expect(decodeSegment([364, 269, 4, 338, 269, 1], 0).ne).toEqual([]);
  });
  it('нота через границу кусков — одна нота', () => {
    // кусок 0: на 0,1 с гитара до 60 нажата; кусок 1: связка (гитара 60), снята на 0,5 с от начала куска
    const seg0 = [339, 13, 338, 364, 269, 1], seg1 = [364, 269, 339, 53, 337, 364, 269, 1];
    const tk = Array.from({ length: 2 }, (_, s) => Array.from({ length: 13 }, (_, c) => (c === 3 ? (s ? seg1 : seg0) : [339, 1])));
    const ns = decodeTokens(tk);
    expect(ns.length).toBe(1);
    expect(ns[0].on).toBeCloseTo(0.1, 6);
    expect(ns[0].off).toBeCloseTo(32767 / 16000 + 0.5, 2);
  });
  it('партии: группы, ударные последними, голос — программа хора GM', () => {
    const parts = toParts([{ on: 0, off: 1, m: 40, prog: 33, drum: false }, { on: 0, off: 0.01, m: 36, prog: 128, drum: true }, { on: 0, off: 1, m: 64, prog: 100, drum: false }]);
    expect(parts.map((p) => p.key)).toEqual(['bass', 'voice', 'drums']);
    expect(parts[1].program).toBe(53);
    expect(parts[2].drum).toBe(true);
  });
});
