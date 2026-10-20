// Стихи разделов: у каждого раздела с греческим названием (i18n/el.json и el.json модулей) — свой стих,
// кроме составных названий без одного стиха; у каждого стиха — греческий текст, перевод и ссылка
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { CORE, MODS, TIMER, EPIGRAPH, verseByKey, verseIn } from '../src/core/verses.js';

const COMPOSED = ['app.title', 'page.feat', 'feat.title', 'libm.title', 'fin.title', 'name.title'];
const el = (m) => JSON.parse(readFileSync('src/modules/' + m + '/i18n/el.json', 'utf8'));

describe('стихи разделов', () => {
  it('у каждого греческого названия — стих', () => {
    const core = JSON.parse(readFileSync('src/i18n/el.json', 'utf8'));
    expect(Object.keys(core).filter((k) => !COMPOSED.includes(k) && !CORE[k])).toEqual([]);
    const mods = readdirSync('src/modules').filter((m) => existsSync('src/modules/' + m + '/i18n/el.json'));
    expect(mods.filter((m) => !MODS[m])).toEqual([]);
    expect(Object.keys(el('timer')).filter((k) => k !== 'name' && !TIMER[k])).toEqual([]);
  });
  it('каждый стих есть и полон', () => {
    [...Object.values(CORE), ...Object.values(MODS), ...Object.values(TIMER), EPIGRAPH].forEach((id) => {
      const v = verseByKey(id);
      expect(v, id).toBeTruthy();
      expect(v.gr.length).toBeGreaterThan(10);
      expect(v.ru.length).toBeGreaterThan(5);
      expect(v.ref).toMatch(/\d/);
      // обычный вид — язык интерфейса; «Минимал» — ещё церковнославянский и английский
      expect(v.cs, id).toMatch(/[\u0400-\u04FF\uA640-\uA69F]/);
      expect(v.en.length, id).toBeGreaterThan(5);
      expect(v.uz.length, id).toBeGreaterThan(5);
      expect(v.enRef, id).toMatch(/^[1-3]? ?[A-Z][a-z]+ \d+:\d+/);
      expect(v.uzRef, id).toMatch(/\d+:\d+/);
      expect(verseIn(v, 'en').text).toBe(v.en);
      expect(verseIn(v, 'uz').ref).toBe(v.uzRef);
      expect(verseIn(v, 'ru').text).toBe(v.ru);
    });
  });
});
