// Гостевая страница раздачи в своей сети (guest.html, src/guest/): ответы компьютера подменены — список, сет-лист,
// аккорды в своём строе, «за лидером», запись грузится только по «▶» и только своей песни
import { test, expect } from './melete.js';

function fakeHost(page, { mode = 'open' } = {}) {
  const H = { live: { ver: 0, live: null }, waiting: [], audioHits: [], approved: mode === 'open', leadPosts: [] };
  const songs = [{ id: 's1', title: 'Вечер', artist: 'Народная', key: 'Am', bpm: 90, audio: 1, text: true }, { id: 's2', title: 'Аве', artist: '', key: 'C', bpm: 0, audio: 0, text: true }];
  const detail = { s1: { ...songs[0], notes: '[Am]Ой то не [C]вечер', capo: 0, k: { pc: 9, minor: true, sharp: null }, files: [{ id: 'a1', name: 'Вечер.mp3', dur: 3 }] },
    s2: { ...songs[1], notes: '[C]Аве [G]Мария', capo: 0, k: { pc: 0, minor: false, sharp: null }, files: [] } };
  page.route('**/g/v1/**', async (route) => {
    const u = new URL(route.request().url()), p = u.pathname.replace('/g/v1/', '');
    const json = (j, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(j) });
    if (p === 'hello') return json({ app: 'melete', name: 'Студия', mode, audio: true });
    if (p === 'join') { if (mode === 'closed' && !JSON.parse(route.request().postData() || '{}').t) return json({}, 403); return json({ gid: 'G1', state: H.approved ? 'ok' : 'wait' }); }
    if (p === 'me') return json({ state: H.approved ? 'ok' : 'wait', lead: !!H.lead });
    if (p === 'songs') return json({ songs });
    if (p === 'set') return json(null);
    if (p === 'song') return json(detail[u.searchParams.get('id')]);
    if (p === 'lead') { H.leadPosts.push(JSON.parse(route.request().postData())); return json({ ok: true }); }
    if (p === 'audio') { H.audioHits.push(u.searchParams.get('id')); return route.fulfill({ status: 200, contentType: 'audio/wav', body: Buffer.alloc(0) }); }
    if (p === 'live') { const since = +u.searchParams.get('since'); if (H.live.ver > since) return json(H.live); await new Promise((r) => setTimeout(r, 300)); return json(H.live); }
    return json({}, 404);
  });
  return H;
}

test('гость: список, аккорды под свой строй, за лидером, запись по одной', async ({ page, errors }) => {
  const H = fakeHost(page);
  await page.goto('guest.html');
  await page.fill('[data-k="name"]', 'Иван');
  await page.click('[data-a="join"]');
  await expect(page.locator('.grow')).toHaveCount(2);
  await expect(page.locator('.ghost')).toContainText('Студия');
  // поиск
  await page.fill('[data-k="q"]', 'аве');
  await expect(page.locator('.grow')).toHaveCount(1);
  await page.fill('[data-k="q"]', '');
  // песня: аккорды, сдвиг и строй B♭ (+2)
  await page.click('[data-song="s1"]');
  await expect(page.locator('.gtext .chd').first()).toHaveText('Am');
  await page.click('[data-a="tr+"]');
  await expect(page.locator('.gtext .chd').first()).toHaveText('B♭m');
  await page.click('[data-a="tr-"]');
  await page.selectOption('[data-k="inst"]', 'Bb');
  await expect(page.locator('.gtext .chd').first()).toHaveText('Bm');
  await page.selectOption('[data-k="inst"]', 'C');
  // запись не грузится, пока не нажали «▶»
  expect(H.audioHits).toEqual([]);
  await page.evaluate(() => document.querySelector('audio').play().catch(() => {}));
  await expect.poll(() => H.audioHits).toEqual(['a1']);
  // лидер открыл другую песню со сдвигом — открылась сама
  H.live = { ver: 1, live: { song: 's2', tr: 2, by: '', leader: '' } };
  await expect(page.locator('.gsong h1')).toHaveText('Аве');
  await expect(page.locator('.gtext .chd').first()).toHaveText('D');
  await expect(page.locator('audio')).toHaveCount(0); // запись прежней песни выгружена
  // «за лидером» выключено — не переключает
  await page.click('[data-a="follow"]');
  H.live = { ver: 2, live: { song: 's1', tr: 0, by: '', leader: '' } };
  await page.waitForTimeout(800);
  await expect(page.locator('.gsong h1')).toHaveText('Аве');
  expect(errors).toEqual([]);
});

test('гость: закрытый вход без QR-кода не пускает, с кодом — ждёт подтверждения', async ({ page }) => {
  const H = fakeHost(page, { mode: 'closed' });
  await page.goto('guest.html');
  await expect(page.locator('.gcenter')).toContainText('QR');
  await page.goto('guest.html?t=abc');
  await page.click('[data-a="join"]');
  await expect(page.locator('.gcenter')).toContainText('подтверждения');
  H.approved = true;
  await expect(page.locator('.grow')).toHaveCount(2, { timeout: 8000 });
});

test('гость, которому передали ведение: его песня уходит всем', async ({ page }) => {
  const H = fakeHost(page);
  H.lead = true;
  await page.goto('guest.html');
  await page.click('[data-a="join"]');
  await expect(page.locator('.gchip.on')).toContainText('ведёте');
  await page.click('[data-song="s2"]');
  await expect.poll(() => H.leadPosts).toEqual([{ song: 's2', tr: 0 }]);
});
