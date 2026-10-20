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
await b.close();
console.log('уведомления:', NOTIFY_MOODS.length * 2, 'картинок');
