import { describe, it, expect } from 'vitest';
import { stepOf, noteOf, shiftBase, keyLabel, BASE_DEF } from '../src/core/qwerty.js';

describe('клавиатура компьютера', () => {
  it('нижний ряд — от «До» базовой октавы, верхний — октавой выше', () => {
    expect(noteOf('KeyZ')).toBe(BASE_DEF);
    expect(noteOf('KeyS')).toBe(BASE_DEF + 1);
    expect(noteOf('KeyM')).toBe(BASE_DEF + 11);
    expect(noteOf('Comma')).toBe(BASE_DEF + 12);
    expect(noteOf('KeyQ')).toBe(BASE_DEF + 12);
    expect(noteOf('KeyI')).toBe(BASE_DEF + 24);
    expect(noteOf('BracketRight')).toBe(BASE_DEF + 31);
  });
  it('лишние клавиши — не ноты', () => {
    expect(stepOf('KeyA')).toBeNull();
    expect(stepOf('Digit1')).toBeNull();
    expect(stepOf('Space')).toBeNull();
  });
  it('октава — в пределах', () => {
    expect(shiftBase(60, 1)).toBe(72);
    expect(shiftBase(84, 1)).toBe(84);
    expect(shiftBase(24, -1)).toBe(24);
  });
  it('подпись клавиши у ноты', () => {
    expect(keyLabel(60)).toBe('Z');
    expect(keyLabel(61)).toBe('S');
    expect(keyLabel(72)).toBe('Q');
    expect(keyLabel(73)).toBe('2');
    expect(keyLabel(59)).toBe('');
  });
});
