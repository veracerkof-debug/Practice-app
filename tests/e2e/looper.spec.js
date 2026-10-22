// Лупер: четыре слоя — кадры без провалов в обоих видах; жесты — удержание (multiply), двойное касание (replace),
// смахивание по кнопке (отмена / возврат)
import { test, expect } from './melete.js';

const state = (page) => page.evaluate(() => (document.querySelector('.lptime')?.textContent || '') + ' | ' + (document.querySelector('[data-x="main"]')?.getAttribute('aria-label') || '') + ' | layers=' + document.querySelectorAll('.lplayer').length);

test('четыре слоя без лагов', async ({ page, melete, errors }) => {
  await melete.open({ tools: { looper: { metro: false, view: 'reels' } } });
  await melete.free('F', ['looper']);
  const tap = () => melete.click('[data-x="main"]');
  await tap(); await page.waitForTimeout(1500); await tap(); await page.waitForTimeout(600);
  for (let i = 0; i < 3; i++) { await tap(); await page.waitForTimeout(1200); await tap(); await page.waitForTimeout(400); }
  expect(await melete.count('.lpreel:not(.lpnone)')).toBe(4);
  const reels = await melete.frames();
  await melete.click('[data-x="view"]'); await page.waitForTimeout(500);
  expect(await melete.count('.lplanecv')).toBeGreaterThan(0);
  const tracks = await melete.frames();
  test.info().annotations.push({ type: 'frames', description: 'катушки ' + JSON.stringify(reels) + ', дорожки ' + JSON.stringify(tracks) });
  expect(reels.med, 'катушки: медиана кадра').toBeLessThan(40);
  expect(tracks.med, 'дорожки: медиана кадра').toBeLessThan(40);
  await melete.click('[data-x="stop"]');
  expect(errors).toEqual([]);
});

test('жесты: удвоить, заменить, отменить, вернуть', async ({ page, melete, errors }) => {
  await melete.open({ tools: { looper: { metro: false } } });
  await melete.free('F', ['looper']);
  const tap = () => melete.click('[data-x="main"]');
  await tap(); await page.waitForTimeout(2000); await tap(); await page.waitForTimeout(800);
  const loop = await state(page);
  expect(loop).toMatch(/layers=1/);
  await melete.hold('[data-x="main"]');
  const mult = await state(page);
  expect(mult.split(' | ')[0]).not.toBe(loop.split(' | ')[0]); // петля стала вдвое длиннее
  await tap(); await page.waitForTimeout(150); await tap(); await page.waitForTimeout(400);
  await tap(); await page.waitForTimeout(1200);
  expect(await state(page)).toMatch(/layers=2/);
  await melete.swipe('[data-x="main"]', -90);
  expect(await state(page), 'смахивание влево — отмена слоя').toMatch(/layers=1/);
  await melete.swipe('[data-x="main"]', 90);
  expect(await state(page), 'смахивание вправо — вернуть').toMatch(/layers=2/);
  await melete.click('[data-x="stop"]');
  expect(errors).toEqual([]);
});
