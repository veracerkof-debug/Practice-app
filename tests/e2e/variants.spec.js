// Варианты (dev): раздел в профиле, переключатель ревербов; ревербы Airwindows работают в звуковом движке браузера
import { test, expect } from './melete.js';

test('варианты: ревербы Airwindows', async ({ page, melete, errors }) => {
  await melete.open();
  // сам звук: OfflineAudioContext с worklet — удар → хвост, без NaN
  const r = await page.evaluate(async () => {
    const out = {};
    for (const algo of ['galactic', 'verbity']) {
      const c = new OfflineAudioContext(2, 48000 * 3, 48000);
      await c.audioWorklet.addModule('/src/audio/wl/airwin.worklet.js');
      const b = c.createBuffer(1, 128, 48000); b.getChannelData(0)[0] = 1;
      const s = c.createBufferSource(); s.buffer = b;
      const n = new AudioWorkletNode(c, 'melete-airwin', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], processorOptions: { algo, a: 0.5, b: 0.5, c: 0.5, d: 0.6, lvl: 1 } });
      s.connect(n).connect(c.destination); s.start();
      const buf = await c.startRendering(), d = buf.getChannelData(0);
      let e1 = 0, ok = true; for (let i = 0; i < 48000; i++) { e1 += d[i] * d[i]; if (!Number.isFinite(d[i])) ok = false; }
      out[algo] = { ok, loud: e1 > 1e-8 };
    }
    return out;
  });
  expect(r).toEqual({ galactic: { ok: true, loud: true }, verbity: { ok: true, loud: true } });
  // раздел «Варианты» (сборка у себя — канал dev)
  await melete.click('[data-act="panel"]'); await page.waitForTimeout(500);
  await melete.click('[data-act="variants"]'); await page.waitForTimeout(400);
  const seg = page.locator('.sheet [data-seg="var-verb"]');
  await expect(seg.locator('[data-v="melete"]')).toHaveAttribute('aria-pressed', 'true');
  await seg.locator('[data-v="galactic"]').click();
  await expect(seg.locator('[data-v="galactic"]')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('melete.variants')).verb)).toBe('galactic');
  await page.screenshot({ path: 'test-results/variants.png' });
  void errors;
});
