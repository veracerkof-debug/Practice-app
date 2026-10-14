import { describe, it, expect } from 'vitest';
import { createTama, tamaOf } from '../src/core/tama.js';
import { TAMA_TEXTS, tamaLine } from '../src/core/tamatexts.js';

const run = (tm, from, to, x) => { const out = []; for (let t = from; t <= to; t += 1000) { const r = tm.step({ now: t, active: true, ...x(t) }); if (r) out.push([t, r.key]); } return out; };

describe('Мелета-тамагочи', () => {
  it('по умолчанию выключена', () => { expect(tamaOf({})).toMatchObject({ on: false, listen: false, chat: 'normal' }); });
  it('здоровается, отмечает вехи, не чаще раза в 2,5 минуты', () => {
    const tm = createTama();
    expect(tm.step({ now: 0, active: true }).key).toBe('hello');
    const said = run(tm, 1000, 31 * 60e3, () => ({}));
    expect(said.map((x) => x[1])).toEqual(['m15', 'm30']);
    expect(tm.step({ now: 32 * 60e3, active: false })).toBe(null);
    expect(tm.step({ now: 33 * 60e3, active: true }).key).toBe('hello'); // новое занятие
  });
  it('со слухом: поток, тишина, возвращение', () => {
    const tm = createTama();
    tm.step({ now: 0, active: true });
    // 7 минут игры → поток; затем 2 минуты тишины → пауза; снова игра → возвращение
    const said = run(tm, 1000, 13 * 60e3, (t) => ({ listening: true, playing: t < 7 * 60e3 || t > 10 * 60e3, db: -25 }));
    expect(said.map((x) => x[1])).toEqual(['flow', 'quiet', 'back']);
  });
  it('без слуха — только время и перерывы', () => {
    const tm = createTama();
    tm.step({ now: 0, active: true });
    expect(tm.step({ now: 1000, active: true, brk: true }).key).toBe('brk');
    const said = run(tm, 2000, 10 * 60e3, () => ({ playing: true, db: -5 }));
    expect(said).toEqual([]);
  });
  it('реплики на трёх языках', () => {
    const keys = Object.keys(TAMA_TEXTS.ru);
    ['uz', 'en'].forEach((l) => expect(Object.keys(TAMA_TEXTS[l]).sort()).toEqual(keys.sort()));
    keys.forEach((k) => ['ru', 'uz', 'en'].forEach((l) => expect(TAMA_TEXTS[l][k].length).toBeGreaterThan(0)));
    expect(tamaLine('hello', 'en')).toMatch(/\w/);
    // без обращения на «ты/вы»
    expect(JSON.stringify(TAMA_TEXTS.ru)).not.toMatch(/(^|[^а-яё])(ты|вы|тебя|вас|твой|ваш)([^а-яё]|$)/i);
  });
});

import { setMascotGender, makeT } from '../src/i18n/index.js';
import { mascotSVG, setMascotLook } from '../src/ui/mascot.js';
import { remindText } from '../src/core/remindtexts.js';
describe('Мелета и Мелетий', () => {
  it('строки с вариантом @m — для Мелетия, без него — общие', () => {
    const tt = makeT({ ru: { a: 'Мелета рада', 'a@m': 'Мелетий рад', b: 'Общее' } });
    setMascotGender('m');
    expect([tt('a'), tt('b')]).toEqual(['Мелетий рад', 'Общее']);
    expect(remindText({ slot: 'lead:60', mode: 'pushy' }, { lang: 'ru' }).body).toMatch(/Мелетий уже настроил/);
    expect(tamaLine('hello', 'ru') + tamaLine('hello', 'ru')).toMatch(/Мелетий рядом/);
    setMascotGender('f');
    expect(tt('a')).toBe('Мелета рада');
    expect(remindText({ slot: 'lead:60', mode: 'pushy' }, { lang: 'ru' }).body).toMatch(/Мелета уже настроила/);
  });
  it('лицо: у Мелеты бантик, у Мелетия бородка', () => {
    expect(mascotSVG('calm', { gender: 'f' })).toMatch(/mbow/);
    expect(mascotSVG('calm', { gender: 'm' })).not.toMatch(/mbow/);
    setMascotLook('m');
    expect(mascotSVG('calm')).toMatch(/data-g="m"/);
    setMascotLook('f');
  });
});
