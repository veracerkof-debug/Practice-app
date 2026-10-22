// Табы и тексты: капо — кнопка, шторка 0…7, аккорды формами ниже, удержание снимает; сохраняется в песне
import { test, expect } from './melete.js';

test('капо', async ({ page, melete, errors }) => {
  const songs = [{ id: 's1', title: 'Песня', key: 'G', notes: 'G       C\nСлово ещё\n', created: Date.now() }];
  await melete.open({ songs, tools: { notes: { sec: 'text', textPick: { id: 's1', sess: null } } } });
  await melete.free('F', ['notes']);
  expect(await melete.count('[data-x="ncapo"]')).toBe(1);
  await melete.click('[data-x="ncapo"]'); await page.waitForTimeout(400);
  expect(await melete.count('[data-capo]')).toBe(8);
  await melete.click('[data-capo="3"]'); await page.waitForTimeout(400);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('practice.v1')).songs[0].capo)).toBe(3);
  expect(await melete.text('[data-x="ncapo"]')).toContain('3');
  await melete.hold('[data-x="ncapo"]');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('practice.v1')).songs[0].capo || 0)).toBe(0);
  expect(errors).toEqual([]);
});
