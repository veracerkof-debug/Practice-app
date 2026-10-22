// Плеер медиатеки: запись звучит через движок, ступени скорости — касание ставит, касание значения — следующая,
// удержание — шторка с правкой, по умолчанию — возврат
import { test, expect } from './melete.js';

test('ступени скорости', async ({ page, melete, errors }) => {
  await melete.open({ settings: { autoStems: 'off', autoAna: false } });
  await page.evaluate(async () => {
    const { createFiles } = await import('/src/core/files.js'); const { encodeWav } = await import('/src/audio/voicefx.js');
    const f = createFiles(); await f.ready;
    const SR = 44100, N = SR * 6, x = new Float32Array(N); for (let i = 0; i < N; i++) x[i] = 0.3 * Math.sin((2 * Math.PI * 220 * i) / SR);
    await f.add({ id: 'r1', name: 'tone.wav', size: 1, type: 'audio/wav', kind: 'audio', songs: [], created: Date.now(), blob: new Blob([encodeWav([x, x], SR)], { type: 'audio/wav' }), dur: 6 });
  });
  await melete.free('F', ['audio']);
  await melete.click('[data-x="mlplay"][data-id="r1"]'); await page.waitForTimeout(1500);
  await melete.click('[data-x="mlopen"]'); await page.waitForTimeout(800);
  expect(await melete.count('.rpre')).toBe(4);
  await melete.click('.rpre[data-rpre="0.75"]'); await page.waitForTimeout(300);
  expect(await melete.text('#ratev')).toMatch(/0[,.]75|75/);
  await melete.click('#ratev'); await page.waitForTimeout(300);
  expect(await melete.text('#ratev')).toMatch(/0[,.]9|90/);
  await melete.hold('.rpre[data-rpre="0.5"]');
  expect(await melete.count('[data-rpv]')).toBe(1);
  await page.evaluate(() => { const i = document.querySelector('[data-rpv]'); i.value = 60; i.dispatchEvent(new Event('input', { bubbles: true })); }); await page.waitForTimeout(300);
  expect((await melete.toolsNow()).audio.rates[0]).toBeCloseTo(0.6, 2);
  await melete.click('[data-rpdef]'); await page.waitForTimeout(300);
  expect((await melete.toolsNow()).audio.rates).toBeUndefined();
  expect(errors).toEqual([]);
});
