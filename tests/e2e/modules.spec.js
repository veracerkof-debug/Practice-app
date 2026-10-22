// Все инструменты во всех размерах окна свободной сессии: монтируются, не пустые, без ошибок
import { test, expect } from './melete.js';

const PLAN = [['F', 1], ['HH', 2], ['QQ', 4], ['SS', 4]];

for (const [layout, per] of PLAN) {
  test('окна ' + layout, async ({ page, melete, errors }) => {
    test.setTimeout(240_000);
    await melete.open({ settings: { church: true, feat: { studio: true } } });
    const ids = await melete.modules();
    expect(ids.length).toBeGreaterThan(8);
    for (let i = 0; i < ids.length; i += per) {
      const panes = ids.slice(i, i + per);
      await melete.free(layout, panes);
      const got = await page.evaluate(() => [...document.querySelectorAll('.session .pane')].length);
      expect(got, layout + ':' + panes.join('+')).toBeGreaterThanOrEqual(panes.length); // в раскладке могут быть и пустые места
      const filled = await page.evaluate(() => [...document.querySelectorAll('.session .pane')].filter((x) => x.innerText.trim().length > 0 || x.querySelector('canvas, svg')).length);
      expect(filled, 'окна с содержимым ' + panes.join('+')).toBeGreaterThanOrEqual(panes.length);
      expect(errors, layout + ':' + panes.join('+')).toEqual([]);
    }
  });
}
