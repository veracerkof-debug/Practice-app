// Метроном: полиритм «на долю» — точки внутри кольца; размер 7/8 с группами 3+2+2 — акценты и подпись; звучит
import { test, expect } from './melete.js';

test('полиритм и группы долей', async ({ page, melete, errors }) => {
  await melete.open();
  await melete.free('F', ['metro']);
  await melete.click('[data-s="more"]'); await page.waitForTimeout(500);
  await melete.click('[data-seg="poly"] [data-v="3"]'); await page.waitForTimeout(300);
  await melete.click('[data-seg="polyper"] [data-v="beat"]'); await page.waitForTimeout(300);
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  expect(await melete.count('.wpoly')).toBeGreaterThan(0);
  const m = (await melete.settings()).metro;
  expect(m.poly + '/' + m.polyPer).toBe('3/beat');
  await melete.click('[data-s="meter"]'); await page.waitForTimeout(500);
  await melete.click('[data-pre="7/8"]'); await page.waitForTimeout(300);
  await melete.click('[data-grp="3+2+2"]'); await page.waitForTimeout(200);
  await melete.click('#ok'); await page.waitForTimeout(500);
  expect((await melete.settings()).metro.accents.join('')).toBe('3112121') // 3 — сильная, 2 — средняя, 1 — слабая;
  expect(await melete.text('[data-s="meter"]')).toContain('3+2+2');
  await melete.click('[data-s="metro"]'); await page.waitForTimeout(1500);
  await melete.click('[data-s="metro"]');
  expect(errors).toEqual([]);
});
