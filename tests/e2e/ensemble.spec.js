// «Ансамбль»: шторки компьютера и телефона (связь — подставная, звук и микрофон — подставные): счёт, запись, сборка
import { test, expect, sleep } from './melete.js';

test('ансамбль: компьютер ведёт дубль, телефон пишет и отправляет', async ({ page, melete, errors }) => {
  await melete.open();
  await page.evaluate(async () => {
    const E = await import('/src/core/ensemble.js'), U = await import('/src/core/screens/ensemble.js'), Sy = await import('/src/core/sync.js');
    const store = { state: { settings: { profile: { name: 'Анна', instruments: ['vocal'] } }, projects: [] }, save() {}, now: () => Date.now(), settingsChanged() {} };
    const files = new Map(), F = { get: (id) => files.get(id) || null, add: async (r) => { files.set(r.id, r); }, save: async () => {}, list: (k) => [...files.values()].filter((r) => r.kind === k) };
    const ctx = new AudioContext();
    const host = E.createEnsembleHost({ files: F, store, jobs: { supported: () => true, busy: () => false } }, { sound: { ctx: () => ctx, buffer: (x, sr) => { const b = ctx.createBuffer(1, x.length, sr); b.copyToChannel(x, 0); return b; }, play() {} } });
    const srv = { state: { on: true, ips: ['192.168.1.5'], code: '123456' }, subscribe: () => () => {} };
    // телефон говорит с этим же ведущим напрямую
    localStorage.setItem('melete.sync', JSON.stringify({ pc: { addr: 'http://pc:53319', key: 'k', name: 'Студия' } }));
    const H = async (m, url, { json }) => { const r = await Sy.handleRequest({ app: { files: F, store }, mem: { peers: { k: { name: 'Телефон' } } }, ens: host }, { method: m, path: new URL(url).pathname, query: {}, key: 'k', json }, new Map()); if (r.status >= 400) throw Object.assign(new Error('x'), { status: r.status }); return r.json; };
    const rec = { start: async () => ({}), stop: async () => ({ path: 'p' }), read: async () => { const { encodeWav } = await import('/src/audio/voicefx.js'); return encodeWav([new Float32Array(48000)], 48000); } };
    const cli = E.createEnsembleClient({ files: new Map() && { add: async () => {}, get: () => null }, store }, { rec, H });
    window.__ens = { host, cli };
    U.ensembleSheet({ ens: host, syncSrv: srv, jobs: { supported: () => true }, store });
    U.ensembleSheet({ ensCli: cli, store });
  });
  await sleep(page, 1500);
  const sheets = page.locator('.sheet');
  await expect(sheets).toHaveCount(2);
  // телефон: на связи, своя партия — по профилю
  await expect(sheets.nth(1)).toContainText('Компьютер: Студия');
  await expect(sheets.nth(1).locator('[data-seg="enspart"] [aria-pressed="true"]')).toHaveText('Вокал');
  // компьютер: телефон в списке, адрес и код
  await expect(sheets.nth(0)).toContainText('192.168.1.5');
  await expect(sheets.nth(0)).toContainText('Анна');
  await page.evaluate(() => window.__ens.host.record());
  await sleep(page, 1200);
  expect(await page.evaluate(() => window.__ens.host.phase)).toBe('count');
  await expect(sheets.nth(1)).toContainText('Счёт');
  await page.screenshot({ path: 'test-results/ensemble-count.png' });
  await sleep(page, 4200);
  expect(await page.evaluate(() => window.__ens.host.phase)).toBe('rec');
  await page.screenshot({ path: 'test-results/ensemble-phone.png' });
  await page.evaluate(() => { document.querySelectorAll('.scrim')[1].style.visibility = 'hidden'; });
  await page.screenshot({ path: 'test-results/ensemble-host.png' });
  await page.evaluate(() => { document.querySelectorAll('.scrim')[1].style.visibility = ''; });
  await page.evaluate(() => window.__ens.host.stop());
  await sleep(page, 2500);
  expect(await page.evaluate(() => window.__ens.host.phase)).toBe('collect');
  void errors;
});
