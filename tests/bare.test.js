import { describe, it, expect } from 'vitest';
import { stripWords, makeT, setBare, bareScope, withText } from '../src/i18n/index.js';

describe('«Минимал» без текста', () => {
  it('слова уходят, цифры и подстановки остаются', () => {
    expect(stripWords('Записать')).toBe('');
    expect(stripWords('{n} мин')).toBe('{n}');
    expect(stripWords('Осталось {n} мин из {m}')).toBe('{n} {m}');
    expect(stripWords('Выход — «Назад»')).toBe('');
    expect(stripWords('5 дней подряд!')).toBe('5');
    expect(stripWords('12:30')).toBe('12:30');
    expect(stripWords('Oʻzbekcha 3-kun')).toBe('3');
  });
  it('ядро — только внутри bareScope, инструменты — везде, кроме withText', () => {
    const core = makeT({ ru: { a: 'Готово {n}' } }), mod = makeT({ ru: { a: 'Готово {n}' } }, false);
    setBare(true);
    expect(core('a', { n: 'Песня' })).toBe('Готово Песня');
    expect(bareScope(() => core('a', { n: 'Песня' }))).toBe('Песня');
    expect(mod('a', { n: 3 })).toBe('3');
    expect(withText(() => mod('a', { n: 3 }))).toBe('Готово 3');
    expect(bareScope(() => withText(() => core('a', { n: 1 })))).toBe('Готово 1');
    setBare(false);
    expect(mod('a', { n: 3 })).toBe('Готово 3');
  });
});
