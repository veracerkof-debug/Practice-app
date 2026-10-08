// Доступ к дополнительному оформлению. Настоящие коды в репозиторий не пишутся: механизм проверяется
// на выдуманных кодах (их хеши передаются в extTry вместо настоящих)
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { extOn, extOwner, extWho, extTry, extCheck, codeHash, EXT_TEMP_MS } from '../src/core/ext.js';

const KEYS = { t: codeHash('1111'), p: codeHash('2222'), b: codeHash('3333'), m: codeHash('4444'), r: codeHash('5555') };

describe('дополнительное оформление: доступ', () => {
  it('по умолчанию закрыто, неверный код — ничего', () => {
    const st = { profile: { createdAt: 5 } };
    expect(extOn(st)).toBe(false);
    expect(extTry(st, '0000', Date.now(), KEYS)).toBe(null);
    expect(extOn(st)).toBe(false);
  });
  it('временный код — на 5 минут, потом вид возвращается к обычному', () => {
    const st = { profile: { createdAt: 5 } }, now = 1e12;
    expect(extTry(st, '1111', now, KEYS)).toBe('t');
    expect(extOn(st, now + EXT_TEMP_MS - 1)).toBe(true);
    expect(extOwner(st)).toBe(false);
    st.uiStyle = 'mono';
    expect(extCheck(st, now + 60000).changed).toBe(false);
    const r = extCheck(st, now + EXT_TEMP_MS + 1);
    expect(r).toMatchObject({ changed: true, lang: true });
    expect(st.uiStyle).toBe('default');
    expect(extOn(st, now + EXT_TEMP_MS + 1)).toBe(false);
  });
  it('код создателя — навсегда и с обращением; перенос в чужой профиль не работает', () => {
    const st = { profile: { createdAt: 5 } };
    expect(extTry(st, '2222', Date.now(), KEYS)).toBe('p');
    expect(extOn(st, Date.now() + 1e12)).toBe(true);
    expect(extOwner(st)).toBe(true);
    expect(extOn({ profile: { createdAt: 6 }, vx: st.vx })).toBe(false);
  });
  it('код бета-тестера — навсегда, но без обращения «создатель»; создателя не понижает', () => {
    const st = { profile: { createdAt: 5 } };
    expect(extTry(st, '3333', Date.now(), KEYS)).toBe('b');
    expect(extOn(st, Date.now() + 1e12)).toBe(true);
    expect(extOwner(st)).toBe(false);
    expect(extOn({ profile: { createdAt: 6 }, vx: st.vx })).toBe(false);
    const owner = { profile: { createdAt: 5 } };
    extTry(owner, '2222', Date.now(), KEYS);
    extTry(owner, '3333', Date.now(), KEYS);
    expect(extOwner(owner)).toBe(true);
  });
  it('личные коды: навсегда, обращение по имени; создателя не понижают', () => {
    const m = { profile: { createdAt: 5 } }, r = { profile: { createdAt: 5 } };
    expect(extTry(m, '4444', Date.now(), KEYS)).toBe('m');
    expect(extTry(r, '5555', Date.now(), KEYS)).toBe('r');
    expect(extOn(m, Date.now() + 1e12) && extOn(r, Date.now() + 1e12)).toBe(true);
    expect([extWho(m), extWho(r), extOwner(m)]).toEqual(['m', 'r', false]);
    expect(extOn({ profile: { createdAt: 6 }, vx: m.vx })).toBe(false);
    const owner = { profile: { createdAt: 5 } };
    extTry(owner, '2222', Date.now(), KEYS);
    extTry(owner, '4444', Date.now(), KEYS);
    expect(extWho(owner)).toBe('p');
  });
  it('без доступа выбранный ранее вид сбрасывается', () => {
    const st = { profile: { createdAt: 5 }, uiStyle: 'mono', monoLang: false };
    expect(extCheck(st)).toEqual({ changed: true, lang: false });
    expect(st.uiStyle).toBe('default');
  });
  it('в коде — только хеши кодов: пять, по 24 знака', () => {
    const src = readFileSync('src/core/ext.js', 'utf8');
    const ks = [...src.matchAll(/[tpbmr]: '([0-9a-f]+)'/g)].map((m) => m[1]);
    expect(ks.length).toBe(5);
    ks.forEach((k) => expect(k).toHaveLength(24));
  });
});
