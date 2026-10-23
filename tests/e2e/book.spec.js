// «Теория» → «Учебник»: оглавление, глава со схемами, термин-ссылка → определение → глава; ссылка из раздела «Гаммы»;
// три языка
import { test, expect, sleep } from './melete.js';

const open = async (melete, page, sec, extra = {}) => {
  await melete.tools({ theory: { sec, ...extra } });
  await melete.free('F', ['theory']);
  await page.waitForSelector('.pane .book, .pane .bklink', { timeout: 15_000 });
};

test('учебник: оглавление, глава, схемы, термины', async ({ page, melete, errors }) => {
  await melete.open();
  await open(melete, page, 'book');
  await expect(page.locator('.book .bcard')).toHaveCount(16);
  await page.screenshot({ path: 'test-results/book-toc.png' });
  // поиск термина
  await page.fill('.book [data-bq]', 'тритон');
  await expect(page.locator('.book .bfrow').first()).toBeVisible();
  await page.fill('.book [data-bq]', '');
  // глава «Аккорды»: схемы нарисованы, кнопки отвечают
  await page.locator('.book [data-bch="chords"]').click();
  await sleep(page, 400);
  await expect(page.locator('.book .bkhead h2')).toHaveText('Аккорды');
  const labs = page.locator('.book .blab');
  expect(await labs.count()).toBeGreaterThan(3);
  for (let i = 0; i < await labs.count(); i++) expect((await labs.nth(i).innerHTML()).length, 'схема ' + i).toBeGreaterThan(100);
  await page.locator('.book .blab [data-a="u:9M"]').first().click();
  await expect(page.locator('.book .us.on')).toHaveCount(1);
  await page.screenshot({ path: 'test-results/book-chapter.png' });
  // назад на главу «Интервалы»; термин → шторка → глава термина
  await page.locator('.book .bpn button').first().click();
  await sleep(page, 400);
  await expect(page.locator('.book .bkhead h2')).toHaveText('Интервалы');
  await page.locator('.book .bterm[data-term="guide"]').first().click();
  await expect(page.locator('.sheet .btdef')).toBeVisible();
  await page.locator('.sheet [data-go]').click();
  await sleep(page, 500);
  await expect(page.locator('.book .bkhead h2')).toHaveText('ii–V–I');
  // назад к оглавлению
  await page.locator('.book [data-btoc]').click();
  await expect(page.locator('.book .bcard')).toHaveCount(16);
  void errors;
});

test('учебник: ссылка из раздела «Гаммы» ведёт в главу', async ({ page, melete, errors }) => {
  await melete.open();
  await open(melete, page, 'scales');
  await page.locator('.pane .bklink').click();
  await page.waitForSelector('.book .bkhead', { timeout: 15_000 });
  await expect(page.locator('.book .bkhead h2')).toHaveText('Гаммы и лады');
  void errors;
});

for (const [lang, title] of [['en', 'Intervals'], ['uz', 'Intervallar']]) {
  test('учебник: язык ' + lang, async ({ page, melete, errors }) => {
    await melete.open({ settings: { lang } });
    await open(melete, page, 'book', { book: { ch: 'iv' } });
    await expect(page.locator('.book .bkhead h2')).toHaveText(title);
    expect(await page.locator('.book .bktext').innerText()).not.toMatch(/[А-Яа-яЁё]/);
    void errors;
  });
}
