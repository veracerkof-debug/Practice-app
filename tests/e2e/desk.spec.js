// Компьютер (окно 1536×790, мышь): навигация слева, настройки в две колонки, песни сеткой, игра на пианино с клавиатуры
import { test, expect } from './melete.js';

test.use({ viewport: { width: 1536, height: 790 }, hasTouch: false });

test('настольная раскладка', async ({ page, melete, errors }) => {
  await melete.open();
  expect(await page.evaluate(() => document.documentElement.classList.contains('desk'))).toBe(true);
  const rail = await page.evaluate(() => { const r = document.querySelector('.tabbar').getBoundingClientRect(); return [Math.round(r.left), Math.round(r.width), Math.round(r.height)]; });
  expect(rail[0]).toBe(0);
  expect(rail[1]).toBeLessThan(120);
  expect(rail[2]).toBeGreaterThan(700);
  expect(await melete.overflow()).toEqual([]);
  await melete.click('[data-act="panel"]'); await page.waitForTimeout(500);
  expect(await melete.count('.pdesk .pdnav')).toBe(1);
  await melete.click('.pdnav [data-pp="look"]'); await page.waitForTimeout(400);
  expect(await page.evaluate(() => document.querySelector('.pdpage')?.dataset.shown)).toBe('look');
  expect(errors).toEqual([]);
});

test('пианино с клавиатуры компьютера', async ({ page, melete, errors }) => {
  await melete.open();
  await melete.free('F', ['piano']);
  expect(await melete.count('.kb .kq')).toBeGreaterThan(10);
  await page.mouse.click(5, 5); // фокус — в окне, не в поле ввода
  await page.keyboard.down('KeyZ'); await page.waitForTimeout(150);
  expect(await page.evaluate(() => !!document.querySelector('.kb [data-m="60"].down'))).toBe(true);
  await page.keyboard.up('KeyZ'); await page.waitForTimeout(150);
  expect(await page.evaluate(() => !!document.querySelector('.kb [data-m="60"].down'))).toBe(false);
  // ↑ — октава выше: Z играет C5
  await page.keyboard.press('ArrowUp'); await page.waitForTimeout(300);
  await page.keyboard.down('KeyZ'); await page.waitForTimeout(150);
  expect(await page.evaluate(() => !!document.querySelector('.kb [data-m="72"].down'))).toBe(true);
  await page.keyboard.up('KeyZ');
  await page.keyboard.press('ArrowDown');
  expect(errors).toEqual([]);
});
