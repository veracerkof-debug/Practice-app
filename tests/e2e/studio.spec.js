// Студия: пауза запоминает место, старт продолжает оттуда, «в начало» сбрасывает; выключение в «Модулях» убирает вкладку
import { test, expect } from './melete.js';

const pos = (page) => page.evaluate(() => document.querySelector('#stpos')?.textContent);

test('пауза и продолжение', async ({ page, melete, errors }) => {
  await melete.open({ settings: { feat: { studio: true } } });
  // проект: одна дорожка пианино, клип на 16 долей
  await page.evaluate(async () => {
    const { newProject, newTrack, newClip, newData } = await import('/src/music/project.js');
    const pr = newProject({ name: 'P', bpm: 120 }); pr.tracks = [newTrack('notes', 0, { name: 'A', inst: 'piano' })]; pr.clips = [];
    const d = newData('notes', 4); for (let i = 0; i < 16; i++) d.notes.push({ t: i, d: 0.5, m: 60 + (i % 5), v: 0.8 });
    pr.clips.push(newClip(pr, pr.tracks[0], 0, 16, d));
    const s = JSON.parse(localStorage.getItem('practice.v1')); s.projects = [pr]; localStorage.setItem('practice.v1', JSON.stringify(s));
  });
  await page.reload(); await page.waitForTimeout(1200);
  await melete.tab('studio');
  await melete.click('[data-open]'); await page.waitForTimeout(600);
  await page.evaluate(() => document.querySelector('.toast')?.remove());
  await melete.click('[data-x="play"]'); await page.waitForTimeout(2600);
  const p1 = await pos(page);
  expect(p1).not.toBe('1.1');
  await melete.click('[data-x="play"]'); await page.waitForTimeout(400);
  expect(await pos(page), 'на паузе — место остановки').toBe(p1);
  await melete.click('[data-x="play"]'); await page.waitForTimeout(300);
  expect(await pos(page), 'старт — с того же места').toBe(p1);
  await page.waitForTimeout(1500);
  expect(await pos(page)).not.toBe(p1);
  await melete.click('[data-x="rewind"]'); await page.waitForTimeout(300);
  expect(await pos(page)).toBe('1.1');
  await melete.click('[data-x="play"]');
  expect(errors).toEqual([]);
});

test('студия выключается в «Модулях и функциях»', async ({ page, melete, errors }) => {
  await melete.open();
  const tabs0 = await page.evaluate(() => [...document.querySelectorAll('.tabbar .tab')].map((x) => x.dataset.tab));
  expect(tabs0).toContain('studio');
  await melete.click('[data-act="panel"]'); await page.waitForTimeout(400);
  await melete.click('[data-pp="feat"]'); await page.waitForTimeout(500);
  await page.evaluate(() => { const c = document.querySelector('[data-feat="studio"]'); c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true })); }); await page.waitForTimeout(500);
  expect(await page.evaluate(() => [...document.querySelectorAll('.tabbar .tab')].map((x) => x.dataset.tab))).not.toContain('studio');
  await page.evaluate(() => { const c = document.querySelector('[data-feat="studio"]'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); }); await page.waitForTimeout(500);
  expect(await page.evaluate(() => [...document.querySelectorAll('.tabbar .tab')].map((x) => x.dataset.tab))).toContain('studio');
  expect(errors).toEqual([]);
});
