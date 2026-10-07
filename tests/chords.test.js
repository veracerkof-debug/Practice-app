import { describe, it, expect } from 'vitest';
import { fingers, readSign, palmFacing, chordOf, chordName, voicing, shapeOf, harmOffsets, harmOf } from '../src/modules/theremin/chords.js';

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

describe('наклон руки — вид аккорда', () => {
  const C = { root: 0, mode: 'maj' };
  it('прямо — трезвучие, наружу — септ, внутрь — maj7 / уменьшённый, вперёд — sus4, назад — sus2', () => {
    expect(shapeOf('M', 0, 0)).toBe('M');
    expect(shapeOf('M', 40, 0)).toBe('7');
    expect(shapeOf('M', -40, 0)).toBe('M7');
    expect(shapeOf('m', 40, 0)).toBe('m7');
    expect(shapeOf('m', -40, 0)).toBe('d');
    expect(shapeOf('d', 40, 0)).toBe('hd');
    expect(shapeOf('d', -40, 0)).toBe('d7');
    expect(shapeOf('m', 0, 40)).toBe('sus4');
    expect(shapeOf('M', 0, -40)).toBe('sus2');
  });
  it('названия и ступени', () => {
    expect(chordName({ root: 7, q: '7', n: 5 }, C)).toEqual({ name: 'G7', roman: 'V7' });
    expect(chordName({ root: 0, q: 'M7', n: 1 }, C)).toEqual({ name: 'Cmaj7', roman: 'Imaj7' });
    expect(chordName({ root: 2, q: 'm7', n: 2 }, C)).toEqual({ name: 'Dm7', roman: 'iim7' });
    expect(chordName({ root: 11, q: 'hd', n: 7 }, C)).toEqual({ name: 'Bø', roman: 'viiø' });
    expect(chordName({ root: 2, q: 'sus4', n: 2 }, C).name).toBe('Dsus4');
  });
  it('септаккорд — бас и четыре голоса', () => {
    const v = voicing({ root: 7, q: '7' }, 64);
    expect(v.length).toBe(5);
    expect(new Set(v.slice(1).map((m) => m % 12))).toEqual(new Set([7, 11, 2, 5]));
    expect(v[0] % 12).toBe(7);
  });
});

describe('гармония соло пальцами', () => {
  const C = { root: 0, mode: 'maj' };
  it('пальцы → вид гармонии; ладонь, кулак и один палец — без гармонии', () => {
    expect(harmOf({ kind: 'num', n: 1 })).toBe(null);
    expect(harmOf({ kind: 'num', n: 5 })).toBe(null);
    expect(harmOf({ kind: 'fist' })).toBe(null);
    expect(harmOf({ kind: 'num', n: 2 }, 'jazz')).toBe('jazz:2');
  });
  it('классика: терции и трезвучие по ступеням тональности', () => {
    expect(harmOffsets('classic:2', 60, C)).toEqual([4]); // C → E
    expect(harmOffsets('classic:2', 62, C)).toEqual([3]); // D → F
    expect(harmOffsets('classic:3', 71, C)).toEqual([3, 6]); // B → D, F
    expect(harmOffsets('classic:2', 69, { root: 9, mode: 'min' })).toEqual([3]); // A → C в ля миноре
    expect(harmOffsets('classic:7', 60, C)).toEqual([-8]); // секста снизу: C → E
  });
  it('джаз: блок-аккорд под мелодией и кварты', () => {
    expect(harmOffsets('jazz:2', 64, C)).toEqual([-4, -7, -11]); // мелодия E, под ней C, A, F — Fmaj7
    expect(harmOffsets('jazz:3', 62, C)).toEqual([-5, -10]); // D, под ним кварты A, E
    expect(harmOffsets('jazz:4', 60, C)).toEqual([2, 6, 9]); // верхняя структура на тон выше
  });
  it('рок и кино — точные интервалы', () => {
    expect(harmOffsets('rock:3', 60, C)).toEqual([7, 12]);
    expect(harmOffsets('rock:2', 64, C)).toEqual([3]); // E → G: терции двух гитар по тональности
    expect(harmOffsets('rock:7', 60, C)).toEqual([-7, 4]);
    expect(harmOffsets('classic:6', 60, C)).toEqual([9]); // секста сверху: C → A
    expect(harmOffsets('film:4', 60, C)).toEqual([5, 9]);
    expect(harmOffsets('film:2', 61, C)).toEqual([4, 7]);
    expect(harmOffsets(null, 60, C)).toEqual([]);
  });
});
