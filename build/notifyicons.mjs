// Маскот в уведомлениях (src/core/notifymood.js, src/core/background.js): лицо — одно, маленьким значком в строке
// состояния и слева в шторке (Android красит значок сам: белые линии на прозрачном, цвет — акцент), по выражению и
// варианту (f — Мелета, m — Мелетий) → res/drawable-nodpi/ns_<f|m>_<лицо>.png, 96 px; …_blink — кадр моргания
// для уведомления «Идёт занятие». Большой картинки нет (автор: «одна тематическая рожа, без значка»).
// Запуск вручную после правки рисунков маскота: node build/notifyicons.mjs. Нужен Playwright с Chromium.
import { readFileSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { mascotSVG } from '../src/ui/mascot.js';
import { NOTIFY_MOODS } from '../src/core/notifymood.js';

const PW = process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs';
const { chromium } = await import(PW);
const DIR = 'android/app/src/main/res/drawable-nodpi/';
const css = readFileSync('src/ui/screens.css', 'utf8').split('\n').filter((l) => /^\.mascot/.test(l) && !/animation/.test(l)).join('\n');
const PX = 96;
// белые линии потолще (значок мелкий), без заливок
const page = (svg) => '<!doctype html><meta charset="utf-8"><style>:root{--ink:#fff;--cell:transparent;--sep:transparent;--tint:#fff}html,body{margin:0;background:transparent}' + css +
  '.mascot .ms{stroke-width:5}.mascot .mt{stroke-width:4}.mascot *{fill-opacity:1}.box{width:' + PX + 'px;height:' + PX + 'px}.box svg{display:block;width:100%;height:100%}</style><div class="box">' + svg + '</div>';

mkdirSync(DIR, { recursive: true });
for (const f of readdirSync(DIR)) if (/^(ma|mn|ns)_[fm]_/.test(f)) unlinkSync(DIR + f); // старые картинки — вон
const b = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {});
const p = await b.newPage({ viewport: { width: 200, height: 200 } });
const BARE = ['focus', 'focusB', 'calmB', 'singB', 'waitB']; // …B — кадр моргания (глаза закрыты) → ns_<f|m>_<лицо>_blink
const ALL = [...new Set([...NOTIFY_MOODS, ...BARE])];
let n = 0;
for (const g of ['f', 'm']) for (const mood of ALL) {
  await p.setContent(page(mascotSVG(mood, { size: PX, gender: g, ring: false })));
  await (await p.$('.box')).screenshot({ path: DIR + 'ns_' + g + '_' + mood.replace(/B$/, '_blink') + '.png', omitBackground: true });
  n++;
}
await b.close();
console.log('уведомления:', n, 'значков');
