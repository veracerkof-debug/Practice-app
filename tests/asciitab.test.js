import { describe, it, expect } from 'vitest';
import { asciiToTex, tabSystems, tuningOf, hasAsciiTab } from '../src/music/asciitab.js';

const TAB = `Intro (Am  F)
e|-------0--------|----------------|
B|-----1---1------|-----1-------1--|
G|---2-------2----|---2---2---2----|
D|-2--------------|-3--------------|
A|----------------|----------------|
E|----------------|----------------|

Куплет: Am F C G
`;

describe('текстовые табы → alphaTex', () => {
  it('находит системы и строй', () => {
    const s = tabSystems(TAB);
    expect(s.length).toBe(1);
    expect(s[0].labels).toEqual(['e', 'b', 'g', 'd', 'a', 'e']);
    expect(tuningOf(['d', 'a', 'd', 'g', 'b', 'e'].reverse(), 6)).toEqual([64, 59, 55, 50, 45, 38]); // Drop D
    expect(tuningOf([], 4)).toEqual([43, 38, 33, 28]);
    expect(hasAsciiTab('просто текст\nAm F C G')).toBe(false);
  });
  it('ноты, аккорды и такты с длительностями по ширине такта', () => {
    const tex = asciiToTex(TAB, { title: 'Тест' });
    expect(tex).toContain('\\title "Тест"');
    expect(tex).toContain('\\tuning e4 b3 g3 d3 a2 e2');
    const bars = tex.split('\n').at(-1).split(' | ');
    expect(bars.length).toBe(2);
    // такт 16 символов = 4 доли: 1 символ = шестнадцатая; ноты на 1, 3, 5, 7, 9, 11 → восьмые
    expect(bars[0].split(' ')).toEqual(['r.16', '2.4.8', '2.3.8', '1.2.8', '0.1.8', '1.2.8', '2.3.4']);
    expect(bars[1]).toContain('3.4.8');
  });
  it('двузначные лады, глушёные, легато; без тактовых черт — по символам', () => {
    const t = asciiToTex('e|--12h14--x--\nB|------------\nG|------------\nD|------------\nA|------------\nE|--0---------');
    expect(t).toContain('(12.1{h} 0.6)');
    expect(t).toContain('14.1');
    expect(t).toContain('x.1');
  });
});
