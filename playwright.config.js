// Сквозные проверки приложения в браузере (tests/e2e/*.spec.js): Chromium на сервере разработки Vite.
// Локально: npm run e2e (сервер поднимается сам; уже запущенный на 5173 — используется). В GitHub Actions —
// .github/workflows/e2e.yml при каждом пуше. Без сети: поддельные микрофон и камера браузера, звук идёт в никуда.
// PW_CHROMIUM — путь к своему Chromium (когда браузеры Playwright не скачаны); PW_URL — готовый адрес приложения.
import { defineConfig } from '@playwright/test';

const url = process.env.PW_URL || 'http://localhost:5173/';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,                 // звук и жесты — по одному, иначе кадры и таймеры плывут
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]] : [['list']],
  outputDir: 'test-results',
  use: {
    baseURL: url,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: true,
    locale: 'ru-RU',
    trace: process.env.CI ? 'retain-on-failure' : 'off',
    launchOptions: {
      executablePath: process.env.PW_CHROMIUM || undefined,
      args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
    },
  },
  webServer: process.env.PW_URL ? undefined : {
    command: 'npx vite --port 5173 --strictPort',
    url,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
