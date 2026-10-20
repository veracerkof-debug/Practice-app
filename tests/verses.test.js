// Стихи разделов (церковный режим): у раздела или инструмента — свой стих; у каждого стиха — греческий текст
// (Септуагинта, Новый Завет), перевод и ссылка. Греческие названия интерфейса убраны (2026-10)
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { CORE, MODS, TIMER, EPIGRAPH, verseByKey, verseIn } from '../src/core/verses.js';

const ru = (m) => JSON.parse(readFileSync('src/modules/' + m + '/i18n/ru.json', 'utf8'));

describe('стихи разделов', () => {
  it('каждый стих привязан к существующему разделу или инструменту', () => {
    const core = JSON.parse(readFileSync('src/i18n/ru.json', 'utf8'));
    expect(Object.keys(CORE).filter((k) => !(k in core))).toEqual([]);
    const mods = readdirSync('src/modules').filter((m) => existsSync('src/modules/' + m + '/i18n/ru.json'));
    expect(Object.keys(MODS).filter((m) => !mods.includes(m))).toEqual([]);
    expect(Object.keys(TIMER).filter((k) => !(k in ru('timer')))).toEqual([]);
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
