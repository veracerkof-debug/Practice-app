import { describe, it, expect } from 'vitest';
import { PALETTES, HUES, TOOL_HUE, registerTools, paintTools, accentVars, onColor } from '../src/core/palettes.js';

describe('палитры', () => {
  it('в каждой палитре есть все оттенки', () => {
    Object.values(PALETTES).forEach((p) => HUES.forEach((h) => expect(p[h]).toMatch(/^#[0-9A-F]{6}$/i)));
  });
  it('у каждого инструмента свой оттенок', () => {
    const hues = Object.values(TOOL_HUE);
    expect(new Set(hues).size).toBe(hues.length);
  });
  it('инструменты перекрашиваются, личные модули — со своим цветом', () => {
    const list = [{ id: 'metro', color: '#111111' }, { id: 'mine', color: '#222222', local: true }];
    registerTools(list);
    paintTools({ palette: 'neon' });
    expect(list[0].color).toBe(PALETTES.neon.orange);
    expect(list[1].color).toBe('#222222');
    paintTools({ palette: 'calm' });
    expect(list[0].color).toBe(PALETTES.calm.orange);
  });
  it('спокойная палитра с охрой — цвета темы как есть', () => {
    expect(accentVars({})).toBe(null);
    expect(accentVars({ palette: 'neon' })['--tint']).toBe(PALETTES.neon.orange);
    expect(accentVars({ palette: 'pastel', accent: 'blue' })['--on-tint']).toBe('#1c1c1e');
    expect(accentVars({ palette: 'pastel' })['--tint']).toContain('color-mix');
  });
  it('значок на светлом — тёмный', () => {
    expect(onColor('#FFEA00')).toBe('#1c1c1e');
    expect(onColor('#1F3F9F')).toBe('#ffffff');
  });
});
