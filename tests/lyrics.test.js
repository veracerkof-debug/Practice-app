import { describe, it, expect } from 'vitest';
import { linesOf, lineAt, toLrc, lyricsText } from '../src/audio/lyrics.js';

const tk = (words, t0, step = 0.4) => words.map((w, i) => ({ t0: t0 + i * step, t1: t0 + (i + 1) * step, p: 0.9, text: (i ? ' ' : '') + w }));

describe('lyrics: строки из отрезков whisper', () => {
  it('короткий отрезок — одна строка с временем отрезка', () => {
    const L = linesOf([{ t0: 1, t1: 3.5, text: ' Ночь тиха ', tokens: tk(['Ночь', 'тиха'], 1) }]);
    expect(L).toEqual([{ t: 1, d: 2.5, text: 'Ночь тиха' }]);
  });
  it('длинный отрезок режется по знакам препинания, время — по токенам', () => {
    const words = ['Над', 'полями', 'да', 'над', 'чистыми,', 'месяц', 'птицею', 'летит,', 'серебристыми', 'крылами', 'машет'];
    const L = linesOf([{ t0: 0, t1: 5, text: words.join(' '), tokens: tk(words, 0) }], { max: 30 });
    expect(L.map((l) => l.text)).toEqual(['Над полями да над чистыми,', 'месяц птицею летит,', 'серебристыми крылами машет']);
    expect(L[1].t).toBeCloseTo(2, 5);
    expect(L[0].t + L[0].d).toBeLessThanOrEqual(L[1].t + 1e-9);
  });
  it('без знаков — по пробелу, не разрывая слово', () => {
    const words = 'раз два три четыре пять шесть семь восемь девять десять'.split(' ');
    const L = linesOf([{ t0: 0, t1: 4, text: words.join(' '), tokens: tk(words, 0) }], { max: 20 });
    expect(L.every((l) => l.text.length <= 20)).toBe(true);
    expect(L.map((l) => l.text).join(' ')).toBe(words.join(' '));
  });
  it('выдумки на тишине выбрасываются', () => {
    const L = linesOf([{ t0: 0, t1: 2, text: 'Субтитры сделал DimaTorzok', tokens: [] }, { t0: 2, t1: 3, text: '♪', tokens: [] }, { t0: 3, t1: 4, text: 'Аллилуйя', tokens: [] }]);
    expect(L.map((l) => l.text)).toEqual(['Аллилуйя']);
  });
  it('lineAt: текущая строка с запасом после конца, иначе -1', () => {
    const L = [{ t: 1, d: 2, text: 'a' }, { t: 10, d: 2, text: 'b' }];
    expect(lineAt(L, 0.5)).toBe(-1);
    expect(lineAt(L, 1.5)).toBe(0);
    expect(lineAt(L, 4)).toBe(0);
    expect(lineAt(L, 6)).toBe(-1);
    expect(lineAt(L, 11)).toBe(1);
  });
  it('lrc и текст', () => {
    const L = [{ t: 61.5, d: 2, text: 'Строка' }];
    expect(toLrc(L, { title: 'T' })).toBe('[ti:T]\n[re:Melete]\n[01:01.50]Строка\n');
    expect(lyricsText(L)).toBe('Строка');
  });
});
