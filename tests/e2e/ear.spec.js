// Тренажёр слуха, «Ступени»: смахивание по карточке меняет вид вопроса (нота → аккорд → цепочка → …)
import { test, expect } from './melete.js';

test('смахивание меняет вид вопроса', async ({ page, melete, errors }) => {
  await melete.open({ tools: { ear: { sec: 'dg', level: 'mid', dgKind: 'note' } } });
  await melete.tab('tools');
  await melete.click('[data-open-tool="ear"]'); await page.waitForTimeout(900);
  const kind = async () => (await melete.toolsNow()).ear.dgKind;
  expect(await kind()).toBe('note');
  await melete.swipe('.ecard', -160, 0, { fx: 0.8 });
  const k1 = await kind();
  expect(k1).not.toBe('note');
  await melete.swipe('.ecard', -160, 0, { fx: 0.8 });
  const k2 = await kind();
  expect(k2).not.toBe(k1);
  await melete.swipe('.ecard', 160, 0, { fx: 0.2 });
  expect(await kind()).toBe(k1);
  expect(errors).toEqual([]);
});
