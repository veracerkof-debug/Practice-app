// Общее для сквозных проверок: приложение с готовым профилем (без регистрации и соглашения), сбор ошибок
// страницы и консоли, свободная сессия с нужными окнами, жесты пальцем (CDP) и удержание.
import { test as base, expect } from '@playwright/test';

export { expect };

// Шум браузера, который не считается ошибкой приложения
const NOISE = /favicon|Autoplay|DevTools|preload|sw\.js|Deprecat|ERR_BLOCKED_BY_CLIENT|AudioContext was not allowed/i;

export const test = base.extend({
  // errors — собранные ошибки; в конце каждого теста их не должно быть
  errors: async ({ page }, use) => {
    const list = [];
    page.on('pageerror', (e) => list.push('page: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') { const t = m.text(); if (!NOISE.test(t)) list.push('console: ' + t.slice(0, 300)); } });
    await use(list);
    expect(list, 'ошибки страницы и консоли').toEqual([]);
  },
  // melete — помощники поверх страницы
  melete: async ({ page }, use) => {
    await use(helpers(page));
  },
});

export const sleep = (page, ms) => page.waitForTimeout(ms);

function helpers(page) {
  const h = {
    // Открыть приложение с настроенным профилем. opts: { mono, songs, settings (в settings), tools (в practice.v1.tools), fresh }
    async open({ mono = false, songs = [], settings = {}, tools = null, fresh = false } = {}) {
      await page.goto('/');
      await page.waitForTimeout(600);
      if (fresh) return;
      const ver = await page.evaluate(async () => (await import('/src/core/legal.js')).TOS_VER);
      await page.evaluate(({ ver, mono, songs, settings, tools }) => {
        const s = JSON.parse(localStorage.getItem('practice.v1') || '{"settings":{}}');
        s.settings = s.settings || {};
        Object.assign(s.settings, { configured: true, tosOk: ver, lang: 'ru', profile: { name: 'A', instruments: ['guitar'], level: 'amateur', priorHours: 0, createdAt: 1760000000000 } }, mono ? { uiStyle: 'mono' } : {}, settings);
        s.songs = songs;
        localStorage.setItem('practice.v1', JSON.stringify(s));
        if (tools) { const d = JSON.parse(localStorage.getItem('practice.v1.tools') || '{}'); localStorage.setItem('practice.v1.tools', JSON.stringify(Object.assign(d, tools))); }
      }, { ver, mono, songs, settings, tools });
      await page.reload();
      await page.waitForTimeout(1200);
    },
    // Настройки инструментов на устройстве (practice.v1.tools) — слить и перезагрузить
    async tools(patch) {
      await page.evaluate((patch) => { const d = JSON.parse(localStorage.getItem('practice.v1.tools') || '{}'); localStorage.setItem('practice.v1.tools', JSON.stringify(Object.assign(d, patch))); }, patch);
      await page.reload();
      await page.waitForTimeout(900);
    },
    // Свободная сессия с окнами: layout — F | HH | QQ | SS, panes — идентификаторы модулей
    async free(layout, panes) {
      await h.tools({ wsMap: { free: { layout, panes, focus: 0, sub: {}, ratio: 0.5 } } });
      await page.waitForSelector('[data-act="free"]', { timeout: 10_000 });
      await page.evaluate(() => document.querySelector('[data-act="free"]')?.click());
      await page.waitForSelector('.session .pane', { timeout: 10_000 });
      await page.waitForTimeout(1200);
    },
    // Нажатие по селектору через DOM (как касание без наведения)
    click: (sel) => page.evaluate((s) => { const el = document.querySelector(s); if (!el) return false; el.click(); return true; }, sel),
    tab: async (id) => { await h.click('.tabbar [data-tab="' + id + '"]'); await page.waitForTimeout(500); },
    // Все инструменты (без вкладок и внутренних)
    modules: () => page.evaluate(async () => (await import('/src/modules/index.js')).modules.filter((m) => !m.tab && !m.inner).map((m) => m.id)),
    centre: (sel, fx = 0.5, fy = 0.5) => page.evaluate(({ sel, fx, fy }) => { const b = document.querySelector(sel)?.getBoundingClientRect(); return b ? [b.x + b.width * fx, b.y + b.height * fy] : null; }, { sel, fx, fy }),
    // Удержание (мышь), ms — дольше порога hold.js
    async hold(sel, ms = 650) {
      const c = await h.centre(sel);
      if (!c) throw new Error('нет ' + sel);
      await page.mouse.move(c[0], c[1]); await page.mouse.down(); await page.waitForTimeout(ms); await page.mouse.up(); await page.waitForTimeout(400);
    },
    // Смахивание пальцем по элементу на dx, dy пикселей (события касания через CDP — как на телефоне)
    async swipe(sel, dx, dy = 0, { fx = 0.5, fy = 0.5, steps = 6 } = {}) {
      const c = await h.centre(sel, fx, fy);
      if (!c) throw new Error('нет ' + sel);
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: c[0], y: c[1] }] });
      for (let i = 1; i <= steps; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: c[0] + (dx * i) / steps, y: c[1] + (dy * i) / steps }] }); await page.waitForTimeout(20); }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await cdp.detach();
      await page.waitForTimeout(450);
    },
    text: (sel) => page.evaluate((s) => document.querySelector(s)?.textContent?.trim() ?? null, sel),
    count: (sel) => page.evaluate((s) => document.querySelectorAll(s).length, sel),
    settings: () => page.evaluate(() => JSON.parse(localStorage.getItem('practice.v1')).settings),
    toolsNow: () => page.evaluate(() => JSON.parse(localStorage.getItem('practice.v1.tools') || '{}')),
    // Элементы шире окна (горизонтальное переполнение) — кроме прокручиваемых по горизонтали
    overflow: () => page.evaluate(() => {
      const W = innerWidth, bad = [];
      if (document.documentElement.scrollWidth > W + 1) bad.push('document ' + document.documentElement.scrollWidth);
      for (const e of document.querySelectorAll('body *')) {
        if (e.closest('[hidden], .sheet, .hmenu, canvas')) continue;
        const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'fixed') continue;
        const r = e.getBoundingClientRect(); if (r.width === 0) continue;
        if (r.right > W + 2 && r.left < W) {
          const o = e.closest('[style*="overflow"], .scrollx, .tabbar .in, .hscroll'); if (o && getComputedStyle(o).overflowX !== 'visible') continue;
          const po = e.parentElement && getComputedStyle(e.parentElement).overflowX; if (po === 'auto' || po === 'scroll' || po === 'hidden') continue;
          bad.push(e.tagName + '.' + [...e.classList].slice(0, 2).join('.') + ' right=' + Math.round(r.right)); if (bad.length > 4) break;
        }
      }
      return bad;
    }),
    // Время кадра за n кадров: { med, p95, max } в мс
    frames: (n = 120) => page.evaluate((n) => new Promise((res) => { const ts = []; let last = performance.now(); const f = () => { const t = performance.now(); ts.push(t - last); last = t; if (ts.length < n) requestAnimationFrame(f); else { ts.sort((a, b) => a - b); res({ med: +ts[n >> 1].toFixed(1), p95: +ts[Math.floor(n * 0.95)].toFixed(1), max: +ts[n - 1].toFixed(1) }); } }; requestAnimationFrame(f); }), n),
  };
  return h;
}
