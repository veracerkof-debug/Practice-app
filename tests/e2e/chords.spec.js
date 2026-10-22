// Вид «Аккорды» плеера (chordview.js): «сейчас» — аккорд, ступень, схема на грифе, следующий; такты с аккордами по
// функциям; текущий такт идёт за воспроизведением; касание такта — перемотка
import { test, expect } from './melete.js';

test('вид «Аккорды»: сейчас, схема, такты, перемотка', async ({ page, melete, errors }) => {
  await melete.open({ settings: { autoStems: 'off', autoAna: false } });
  await page.evaluate(async () => {
    const { createFiles } = await import('/src/core/files.js'); const { encodeWav } = await import('/src/audio/voicefx.js');
    const f = createFiles(); await f.ready;
    const SR = 44100, D = 40, N = SR * D, x = new Float32Array(N); for (let i = 0; i < N; i++) x[i] = 0.2 * Math.sin((2 * Math.PI * 220 * i) / SR);
    const bpm = 96, b = 60 / bpm, beats = [], downbeats = []; for (let t = 0.2; t < D; t += b) { beats.push(+t.toFixed(3)); if (beats.length % 4 === 1) downbeats.push(+t.toFixed(3)); }
    const prog = ['C', 'G', 'A:min', 'F', 'D:min7', 'G:7', 'C', 'C:maj7', 'A:min7', 'E:7'];
    const chords = []; for (let i = 0; i * 4 < beats.length; i++) { const t0 = beats[i * 4], t1 = beats[i * 4 + 4] ?? D; chords.push({ t: t0, d: +(t1 - t0).toFixed(2), c: prog[i % prog.length] }); }
    await f.add({ id: 'r1', name: 'chords.wav', size: 1, type: 'audio/wav', kind: 'audio', songs: [], created: Date.now(), blob: new Blob([encodeWav([x, x], SR)], { type: 'audio/wav' }), dur: D,
      ana: { pc: 0, minor: false, bpm, bpb: 4, beats, downbeats, chords, v: 3, at: Date.now() } });
  });
  await melete.free('F', ['audio']);
  await melete.click('[data-x="mlplay"][data-id="r1"]'); await page.waitForTimeout(1000);
  await melete.click('[data-x="mlopen"]'); await page.waitForTimeout(600);
  await melete.click('[data-x="apv"][data-v="chords"]'); await page.waitForTimeout(600);
  await expect(page.locator('#chn')).toHaveText('C');
  await expect(page.locator('#chdeg')).toHaveText('1');
  await expect(page.locator('#chdg svg.chdia')).toHaveCount(1);
  await expect(page.locator('#chx')).toHaveText('G');
  expect(await page.locator('.chb').count()).toBeGreaterThan(10);
  await expect(page.locator('.chb[data-bar="5"] .chps i')).toHaveText('G7');
  await expect(page.locator('.chb[data-bar="5"] .chps i')).toHaveClass(/fn-d/);
  // касание 4-го такта — перемотка туда: сейчас F, ступень 4, такт подсвечен
  await page.locator('.chb[data-bar="3"]').click(); await page.waitForTimeout(600);
  await expect(page.locator('#chn')).toHaveText('F');
  await expect(page.locator('#chdeg')).toHaveText('4');
  await expect(page.locator('.chb.on')).toHaveAttribute('data-bar', '3');
  expect(errors).toEqual([]);
});
