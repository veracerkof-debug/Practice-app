// Маскот в уведомлениях (src/core/notifymood.js): большая картинка — лицо в белом круге, по выражению
// и варианту (f — Мелета, m — Мелетий) → res/drawable-nodpi/ma_<f|m>_<настроение>.png, 192 px.
// Запуск вручную после правки рисунков маскота: node build/notifyicons.mjs. Нужен Playwright с Chromium.
import { readFileSync, mkdirSync } from 'node:fs';
import { mascotSVG } from '../src/ui/mascot.js';
import { NOTIFY_MOODS } from '../src/core/notifymood.js';

const PW = process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs';
const { chromium } = await import(PW);
const DIR = 'android/app/src/main/res/drawable-nodpi/';
const css = readFileSync('src/ui/screens.css', 'utf8').split('\n').filter((l) => /^\.mascot/.test(l) && !/animation/.test(l)).join('\n');
const PX = 192;
const page = (svg) => '<!doctype html><meta charset="utf-8"><style>:root{--ink:#1D1B18;--cell:#FBF7F0;--sep:#FBF7F0;--tint:#9C7242}html,body{margin:0;background:transparent}' + css +
  '.box{width:' + PX + 'px;height:' + PX + 'px;border-radius:50%;overflow:hidden;background:#FBF7F0}.box svg{display:block;width:100%;height:100%}</style><div class="box">' + svg + '</div>';

mkdirSync(DIR, { recursive: true });
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 300, height: 300 } });
for (const g of ['f', 'm']) for (const mood of NOTIFY_MOODS) {
  await p.setContent(page(mascotSVG(mood, { size: PX, gender: g })));
  await (await p.$('.box')).screenshot({ path: DIR + 'ma_' + g + '_' + mood + '.png', omitBackground: true });
}
// Уведомление «Идёт занятие» (KeepAliveService): лицо без кружка, линии цветом акцента — читается и на светлой,
// и на тёмной шторке → mn_<f|m>_<лицо>.png
const BARE = ['calm', 'sing', 'wait', 'focus', 'calmB', 'singB', 'waitB', 'focusB']; // …B — кадр моргания (глаза закрыты); файл — mn_<f|m>_<лицо>_blink (имена ресурсов — только строчные)
const bare = (svg) => '<!doctype html><meta charset="utf-8"><style>:root{--ink:#9C7242;--cell:transparent;--sep:transparent;--tint:#9C7242}html,body{margin:0;background:transparent}' + css +
  '.mascot .ms{stroke-width:3.8}.mascot .mt{stroke-width:2.8}.box{width:' + PX + 'px;height:' + PX + 'px}.box svg{display:block;width:100%;height:100%}</style><div class="box">' + svg + '</div>';
for (const g of ['f', 'm']) for (const mood of BARE) {
  await p.setContent(bare(mascotSVG(mood, { size: PX, gender: g, ring: false })));
  await (await p.$('.box')).screenshot({ path: DIR + 'mn_' + g + '_' + mood.replace(/B$/, '_blink') + '.png', omitBackground: true });
}
await b.close();
console.log('уведомления:', NOTIFY_MOODS.length * 2 + BARE.length * 2, 'картинок');
