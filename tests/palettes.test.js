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
    paintTools({ palette: 'classic' });
    expect(list[0].color).toBe(PALETTES.classic.orange);
  });
  it('классическая палитра с охрой — цвета темы как есть', () => {
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

describe('свои цвета', () => {
  it('свой цвет: все оттенки из одного, акцент — сам цвет', async () => {
    const { ownPalette, hueColor, accentVars } = await import('../src/core/palettes.js');
    const P = ownPalette('#C0392B');
    HUES.forEach((h) => expect(P[h]).toMatch(/^#[0-9A-F]{6}$/));
    expect(P.orange).toBe('#C0392B');
    expect(new Set(Object.values(P)).size).toBe(HUES.length);
    expect(hueColor({ palette: 'own', ownMain: '#C0392B' }, 'orange')).toBe('#C0392B');
    expect(accentVars({ palette: 'own', ownMain: '#C0392B', accent: 'blue' })['--tint']).toBe('#C0392B');
  });
  it('свой фон: тёмный — тёмная схема и светлый текст', async () => {
    const { bgVars } = await import('../src/core/palettes.js');
    expect(bgVars('nope')).toBe(null);
    const d = bgVars('#2A0A3A'), l = bgVars('#FFD0E0');
    expect(d.dark).toBe(true); expect(l.dark).toBe(false);
    expect(onColor(d.vars['--ink'])).toBe('#1c1c1e'); // светлый текст на тёмном
    expect(onColor(l.vars['--ink'])).toBe('#ffffff');
  });
});
