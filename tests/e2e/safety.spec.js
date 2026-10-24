// Сохранность данных: копии на устройстве (IndexedDB) — записать, прочитать, лишние убираются
import { test, expect } from './melete.js';

test('копии на устройстве: запись, список, чтение', async ({ page, melete, errors }) => {
  await melete.open();
  const r = await page.evaluate(async () => {
    const m = await import('/src/core/snapshots.js');
    const app = { store: { state: { settings: { profile: { name: 'Тест' } } }, exportBackup: (info) => JSON.stringify({ backupInfo: info, songs: [{ id: 's1', title: 'Песня' }] }) } };
    const S = m.createSnapshots(app);
    for (let i = 0; i < 5; i++) await S.take('update', { build: i });
    const id = await S.take('day');
    const list = await S.list(), back = await S.read(id);
    return { n: list.filter((x) => x.kind === 'update').length, day: list.some((x) => x.kind === 'day'), title: back.songs[0].title, by: back.backupInfo.by };
  });
  expect(r).toEqual({ n: 3, day: true, title: 'Песня', by: 'Тест' });
  void errors;
});

// Идея: строка в профиле, шторка с полем
test('кнопка «Идея» в профиле', async ({ page, melete, errors }) => {
  await melete.open();
  await melete.click('[data-act="panel"]'); await page.waitForTimeout(500);
  await melete.click('[data-act="idea"]'); await page.waitForTimeout(400);
  await expect(page.locator('.sheet .ideatext')).toBeVisible();
  await expect(page.locator('.sheet [data-idea]')).toBeVisible();
  void errors;
});
