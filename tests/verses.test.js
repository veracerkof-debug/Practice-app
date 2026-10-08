// Библейские названия «Минимала»: у каждого названия из словарей el — свой стих (кроме составных, без одного стиха)
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { verseOf, verseList } from '../src/core/verses.js';

const COMPOSED = ['Melete', 'Ὄργανα καὶ ἔργα', 'Σημεῖα', 'Τέλος', 'Περὶ τοῦ ὀνόματος'];

describe('стихи названий', () => {
  it('у каждого названия — стих с греческим текстом, переводом и ссылкой', () => {
    const core = JSON.parse(readFileSync('src/i18n/el.json', 'utf8'));
    const mods = readdirSync('src/modules').filter((m) => existsSync('src/modules/' + m + '/i18n/el.json'))
      .flatMap((m) => Object.values(JSON.parse(readFileSync('src/modules/' + m + '/i18n/el.json', 'utf8'))));
    const names = [...Object.entries(core).filter(([k]) => !k.startsWith('verse.')).map(([, v]) => v), ...mods];
    const missing = [...new Set(names)].filter((n) => !COMPOSED.includes(n) && !verseOf(n));
    expect(missing).toEqual([]);
    verseList().forEach((v) => { expect(v.gr.length).toBeGreaterThan(10); expect(v.ru.length).toBeGreaterThan(5); expect(v.ref).toMatch(/\d/); });
  });
});
