import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { extOn, extTry, extCheck, EXT_TEMP_MS } from '../src/core/ext.js';

describe('дополнительное оформление: доступ', () => {
  it('по умолчанию закрыто, неверный код — ничего', () => {
    const st = { profile: { createdAt: 5 } };
    expect(extOn(st)).toBe(false);
    expect(extTry(st, '0000')).toBe(null);
    expect(extOn(st)).toBe(false);
  });
  it('временный код — на 5 минут, потом вид возвращается к обычному', () => {
    const st = { profile: { createdAt: 5 } }, now = 1e12;
    expect(extTry(st, '2003', now)).toBe('t');
    expect(extOn(st, now + EXT_TEMP_MS - 1)).toBe(true);
    st.uiStyle = 'mono';
    expect(extCheck(st, now + 60000).changed).toBe(false);
    const r = extCheck(st, now + EXT_TEMP_MS + 1);
    expect(r).toMatchObject({ changed: true, lang: true });
    expect(st.uiStyle).toBe('default');
    expect(extOn(st, now + EXT_TEMP_MS + 1)).toBe(false);
  });
  it('постоянный код — навсегда; перенос в чужой профиль не работает', () => {
    const st = { profile: { createdAt: 5 } };
    expect(extTry(st, '2211')).toBe('p');
    expect(extOn(st, Date.now() + 1e12)).toBe(true);
    expect(extOn({ profile: { createdAt: 6 }, vx: st.vx })).toBe(false);
  });
  it('без доступа выбранный ранее вид сбрасывается', () => {
    const st = { profile: { createdAt: 5 }, uiStyle: 'mono', monoLang: false };
    expect(extCheck(st)).toEqual({ changed: true, lang: false });
    expect(st.uiStyle).toBe('default');
  });
  it('кодов открытым текстом в коде нет', () => {
    const src = readFileSync('src/core/ext.js', 'utf8') + readFileSync('src/core/screens/ext.js', 'utf8');
    expect(src).not.toMatch(/2003|2211/);
  });
});
