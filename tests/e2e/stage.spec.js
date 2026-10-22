// Сцена: автопрокрутка по длительности, касание текста — пауза, педаль (клавиши) листает, «Ночь» из меню удержания названия
import { test, expect } from './melete.js';

test('автопрокрутка, педаль, ночь', async ({ page, melete, errors }) => {
  const notes = Array.from({ length: 60 }, (_, i) => (i % 4 === 0 ? 'G       C       D\n' : '') + 'Строка текста номер ' + (i + 1) + '\n').join('');
  const songs = [{ id: 's1', title: 'Длинная', key: 'G', notes, created: Date.now() }, { id: 's2', title: 'Вторая', key: 'C', notes: 'C F\nКороткая', created: Date.now() }];
  await melete.open({ songs });
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('practice.v1'));
    s.events = [{ id: 'ev1', title: 'Концерт', kind: 'concert', start: Date.now(), end: Date.now() + 3600000, songs: ['s1', 's2'], stage: { s1: { dur: 20, click: false, pad: false } } }];
    localStorage.setItem('practice.v1', JSON.stringify(s));
    localStorage.setItem('melete.stage', JSON.stringify({ ev: 'ev1', i: 0, at: Date.now() }));
  });
  await page.reload(); await page.waitForTimeout(1500);
  if (!(await melete.count('.stage'))) { await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /сцен|Resume|Sahna/i.test(x.textContent)); b && b.click(); }); await page.waitForTimeout(800); }
  expect(await melete.count('.stage')).toBe(1);
  await melete.click('[data-sg="play"]'); await page.waitForTimeout(2500);
  const top = () => page.evaluate(() => document.querySelector('.sgtext')?.scrollTop);
  expect(await top()).toBeGreaterThan(0);
  await melete.click('.sgtext .lyr'); await page.waitForTimeout(800);
  const paused = await top(); await page.waitForTimeout(1200);
  expect(await top(), 'касание — пауза').toBe(paused);
  await melete.click('.sgtext .lyr'); await page.waitForTimeout(1500);
  expect(await top()).toBeGreaterThan(paused);
  for (let i = 0; i < 9; i++) { await page.keyboard.press('PageDown'); await page.waitForTimeout(250); }
  expect(await melete.text('.sghead b')).toBe('Вторая');
  await page.keyboard.press('PageUp'); await page.waitForTimeout(400);
  expect(await melete.text('.sghead b')).toBe('Длинная');
  await melete.hold('.sghead');
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /Ночь|Night|Tun/.test(x.textContent)); b && b.click(); }); await page.waitForTimeout(400);
  expect(await page.evaluate(() => document.querySelector('.stage')?.classList.contains('night'))).toBe(true);
  expect(errors).toEqual([]);
});
