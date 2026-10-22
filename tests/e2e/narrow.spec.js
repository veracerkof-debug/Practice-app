// Узкий телефон 360×740: ничего не шире окна — вкладки, страницы панели, каждый инструмент в full и half
import { test, expect } from './melete.js';

test.use({ viewport: { width: 360, height: 740 } });

test('без горизонтального переполнения', async ({ page, melete, errors }) => {
  test.setTimeout(240_000);
  await melete.open({ settings: { church: true, feat: { studio: true } } });
  const found = [];
  const check = async (label) => { const r = await melete.overflow(); if (r.length) found.push(label + ': ' + r.join('; ')); };
  const tabs = await page.evaluate(() => [...document.querySelectorAll('.tabbar .tab')].map((x) => x.dataset.tab));
  for (const tb of tabs) { await melete.tab(tb); await check('tab:' + tb); }
  await melete.tab('home');
  await melete.click('[data-act="panel"]'); await page.waitForTimeout(500); await check('panel');
  const pages = await page.evaluate(() => [...document.querySelectorAll('[data-pp]')].map((x) => x.dataset.pp).filter((x) => x !== 'root'));
  for (const pg of pages) { await melete.click('[data-pp="' + pg + '"]'); await page.waitForTimeout(450); await check('panel:' + pg); await melete.click('[data-pp="root"]'); await page.waitForTimeout(200); }
  const ids = await melete.modules();
  for (const L of ['F', 'HH']) for (let i = 0; i < ids.length; i += (L === 'F' ? 1 : 2)) { const panes = ids.slice(i, i + (L === 'F' ? 1 : 2)); await melete.free(L, panes); await check(L + ':' + panes.join('+')); }
  expect(found).toEqual([]);
  expect(errors).toEqual([]);
});
