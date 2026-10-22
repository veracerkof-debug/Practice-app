// Самопроверка (панель → «Самопроверка»): все проверки проходят в браузере с поддельными устройствами
import { test, expect } from './melete.js';

test('все проверки в порядке', async ({ page, melete, errors }) => {
  await melete.open();
  await melete.click('[data-act="panel"]'); await page.waitForTimeout(500);
  await melete.click('[data-act="check"]');
  await page.waitForSelector('[data-ck-act="run"]:not([disabled])', { timeout: 60_000 });
  const rows = await page.evaluate(() => [...document.querySelectorAll('.ckrow')].map((r) => ({ id: r.dataset.ck, st: r.dataset.st, info: r.querySelector('.psub')?.textContent || '' })));
  expect(rows.length).toBe(11);
  for (const r of rows) test.info().annotations.push({ type: r.id, description: r.st + ' — ' + r.info });
  const bad = rows.filter((r) => r.st !== 'ok' && r.st !== 'skip');
  expect(bad, 'проверки не в порядке').toEqual([]);
  // итог попал в журнал
  const logged = await page.evaluate(() => JSON.parse(localStorage.getItem('practice.v1.log') || '[]').filter((x) => x[2] === 'check').length);
  expect(logged).toBeGreaterThan(5);
  expect(errors).toEqual([]);
});
