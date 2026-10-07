import { describe, it, expect } from 'vitest';
import { fingers, readSign, palmFacing, chordOf, chordName, voicing } from '../src/modules/theremin/chords.js';

// Правая рука в зеркальном кадре, ладонь к камере: большой палец слева. up — какие пальцы вытянуты
// (большой, указательный, средний, безымянный, мизинец); touch — кончик большого к кончику этого пальца
function hand(up = [1, 1, 1, 1, 1], { touch = null, back = false } = {}) {
  const lm = Array.from({ length: 21 }, () => ({ x: 0, y: 0 }));
  const X = [0.44, 0.48, 0.52, 0.56], f = (x) => (back ? 1 - x : x); // тыльной стороной — зеркально по горизонтали
  lm[0] = { x: f(0.5), y: 0.8 };
  [1, 2, 3, 4].forEach((k, i) => {
    const mcp = 1 + k * 4, x = X[i], ext = up[k];
    lm[mcp] = { x: f(x), y: 0.62 };
    lm[mcp + 1] = { x: f(x), y: ext ? 0.54 : 0.57 };
    lm[mcp + 2] = { x: f(x), y: ext ? 0.48 : 0.62 };
    lm[mcp + 3] = { x: f(x), y: ext ? 0.42 : 0.66 };
  });
  lm[1] = { x: f(0.46), y: 0.76 };
  lm[2] = { x: f(0.42), y: 0.72 };
  lm[3] = up[0] ? { x: f(0.38), y: 0.68 } : { x: f(0.45), y: 0.69 };
  lm[4] = up[0] ? { x: f(0.34), y: 0.64 } : { x: f(0.49), y: 0.67 };
  if (touch) lm[4] = { ...lm[{ index: 8, ring: 16, pinky: 20 }[touch]] };
  return { lm, ar: 1 };
}

describe('аккорды правой рукой: знаки', () => {
  it('пальцы: вытянут или согнут', () => {
    expect(fingers(hand([1, 1, 1, 1, 1])).ext).toEqual([true, true, true, true, true]);
    expect(fingers(hand([0, 1, 1, 0, 0])).ext).toEqual([false, true, true, false, false]);
  });
  it('число пальцев — ступень, кулак — тишина, один большой — тоже кулак', () => {
    expect(readSign(hand([0, 1, 0, 0, 0]))).toMatchObject({ kind: 'num', n: 1 });
    expect(readSign(hand([0, 1, 1, 1, 0]))).toMatchObject({ kind: 'num', n: 3 });
    expect(readSign(hand([1, 1, 1, 0, 0]))).toMatchObject({ kind: 'num', n: 3 }); // «три» с большим пальцем
    expect(readSign(hand([1, 1, 1, 1, 1]))).toMatchObject({ kind: 'num', n: 5 });
    expect(readSign(hand([0, 0, 0, 0, 0])).kind).toBe('fist');
    expect(readSign(hand([1, 0, 0, 0, 0])).kind).toBe('fist');
  });
  it('жестовые 6 и 7 и «окей»', () => {
    expect(readSign(hand([1, 1, 1, 1, 0], { touch: 'pinky' }))).toMatchObject({ kind: 'num', n: 6 });
    expect(readSign(hand([1, 1, 1, 0, 1], { touch: 'ring' }))).toMatchObject({ kind: 'num', n: 7 });
    expect(readSign(hand([1, 0, 1, 1, 1], { touch: 'index' })).kind).toBe('ok');
  });
  it('ладонь к камере или тыльной стороной (у левой руки — наоборот)', () => {
    expect(palmFacing(hand().lm, true)).toBe(true);
    expect(palmFacing(hand([1, 1, 1, 1, 1], { back: true }).lm, true)).toBe(false);
    expect(palmFacing(hand().lm, false)).toBe(false);
  });
});

describe('аккорды правой рукой: ступень → аккорд', () => {
  const C = { root: 0, mode: 'maj' };
  it('ладонь — мажор, тыльная — минор, на любой ступени', () => {
    expect(chordOf(1, true, C)).toMatchObject({ root: 0, q: 'M' });
    expect(chordOf(6, false, C)).toMatchObject({ root: 9, q: 'm' });
    expect(chordOf(2, true, C)).toMatchObject({ root: 2, q: 'M' }); // D — явно мажор
  });
  it('по тональности: ладонь — как в ладу, тыльная — наоборот', () => {
    expect(chordOf(2, true, C, 'key')).toMatchObject({ root: 2, q: 'm' });
    expect(chordOf(2, false, C, 'key')).toMatchObject({ root: 2, q: 'M' });
    expect(chordOf(7, true, C, 'key').q).toBe('d');
    expect(chordOf(1, true, { root: 9, mode: 'min' }, 'key')).toMatchObject({ root: 9, q: 'm' });
  });
  it('название и римская цифра; бемоли в бемольных тональностях', () => {
    expect(chordName(chordOf(6, false, C), C)).toEqual({ name: 'Am', roman: 'vi' });
    expect(chordName(chordOf(4, true, { root: 5, mode: 'maj' }), { root: 5, mode: 'maj' }).name).toBe('B♭');
  });
  it('расположение: бас снизу, обращение ближе к высоте руки', () => {
    const c = chordOf(1, true, C), lo = voicing(c, 55), hi = voicing(c, 76);
    expect(lo[0] % 12).toBe(0);
    expect(lo[0]).toBeLessThan(lo[1]);
    expect(hi[1]).toBeGreaterThan(lo[1]);
    expect(new Set(hi.slice(1).map((m) => m % 12))).toEqual(new Set([0, 4, 7]));
  });
});
