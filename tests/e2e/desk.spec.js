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

// Окно Windows (Tauri подменён): «Телефон и компьютер» — один раздел; «Принимать телефон» показывает адрес и код
test('телефон и компьютер — одно место в настройках', async ({ page, melete, errors }) => {
  await page.addInitScript(() => {
    let cb = 0;
    const st = { on: false, port: 53319, ips: ['192.168.1.23'], name: 'PC' };
    window.__TAURI_INTERNALS__ = {
      transformCallback: () => ++cb,
      unregisterCallback: () => {},
      convertFileSrc: (p) => p,
      metadata: { currentWindow: { label: 'main' }, currentWebview: { windowLabel: 'main', label: 'main' } },
      invoke: async (cmd) => {
        if (cmd === 'sync_start') { st.on = true; return st; }
        if (cmd === 'sync_status') return st;
        if (cmd === 'sync_stop') { st.on = false; return null; }
        if (cmd === 'guest_status') return { on: false, ips: st.ips, name: 'PC', port: 53320 };
        if (cmd === 'localsend_status') return { on: false, ips: st.ips, alias: 'Melete · PC' };
        if (cmd === 'startup_files') return [];
        return null;
      },
    };
  });
  await melete.open();
  await melete.click('[data-act="panel"]'); await page.waitForTimeout(500);
  await melete.click('.pdnav [data-pp="link"]'); await page.waitForTimeout(400);
  const pg = page.locator('.pdpage');
  await expect(pg.locator('[data-psw="syncSrv"]')).toHaveCount(1);
  await expect(pg.locator('[data-act="ens"]')).toHaveCount(1);
  await expect(pg.locator('[data-psw="guestOn"]')).toHaveCount(1);
  await pg.locator('[data-psw="syncSrv"]').check({ force: true }); await page.waitForTimeout(400);
  await expect(pg.locator('.sypair')).toContainText('192.168.1.23');
  await page.screenshot({ path: 'test-results/link-page.png' });
  // «Данные и копии» — без связи
  await melete.click('.pdnav [data-pp="data"]'); await page.waitForTimeout(400);
  await expect(page.locator('.pdpage [data-psw="syncSrv"]')).toHaveCount(0);
  void errors;
});
