// Иконки приложения для Android из src/ui/appicons.js (запуск вручную после правки рисунков: node build/appicons.mjs).
// Для каждой иконки: mipmap-xxxhdpi/ic_launcher_<id>.png (обычная, 192), _round.png (круглая), _fg.png (передний слой
// адаптивной иконки, 432), mipmap-anydpi-v26/ic_launcher_<id>.xml и цвет фона в values/appicons.xml.
// «classic» — прежняя иконка (ic_launcher), её не перерисовываем. Нужен Playwright с Chromium.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { APP_ICONS, APP_ICON_IDS, appIconSVG } from '../src/ui/appicons.js';

const PW = process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs';
const { chromium } = await import(PW);
const RES = 'android/app/src/main/res/';
const css = readFileSync('src/ui/screens.css', 'utf8').split('\n').filter((l) => /^\.mascot|^:root\[data-style="mono"\] \.mascot/.test(l) && !/animation/.test(l)).join('\n');
const page = (svg, px, round) => '<!doctype html><meta charset="utf-8"><style>:root{--ink:#1D1B18;--cell:#fff;--sep:#ddd;--tint:#9C7242}html,body{margin:0;background:transparent}' + css +
  '.box{width:' + px + 'px;height:' + px + 'px;' + (round ? 'border-radius:50%;overflow:hidden;' : '') + '}.box svg{display:block;width:100%;height:100%}.mascot .mf{display:none}</style><div class="box">' + svg + '</div>';

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 500, height: 500 } });
async function shot(svg, px, file, round = false) {
  await p.setContent(page(svg, px, round));
  await (await p.$('.box')).screenshot({ path: file, omitBackground: true });
}
mkdirSync(RES + 'mipmap-xxxhdpi', { recursive: true });
mkdirSync(RES + 'mipmap-anydpi-v26', { recursive: true });
const ids = APP_ICON_IDS.filter((id) => id !== 'classic');
for (const id of ids) {
  const d = RES + 'mipmap-xxxhdpi/ic_launcher_' + id;
  await shot(appIconSVG(id, { size: 192, shape: 'square' }), 192, d + '.png');
  await shot(appIconSVG(id, { size: 192, shape: 'full' }), 192, d + '_round.png', true);
  await shot(appIconSVG(id, { size: 432, shape: 'fg' }), 432, d + '_fg.png');
  writeFileSync(RES + 'mipmap-anydpi-v26/ic_launcher_' + id + '.xml', '<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n' +
    '    <background android:drawable="@color/ic_bg_' + id + '"/>\n    <foreground android:drawable="@mipmap/ic_launcher_' + id + '_fg"/>\n</adaptive-icon>\n');
}
writeFileSync(RES + 'values/appicons.xml', '<?xml version="1.0" encoding="utf-8"?>\n<!-- Фон иконок на выбор (build/appicons.mjs) -->\n<resources>\n' +
  ids.map((id) => '    <color name="ic_bg_' + id + '">' + APP_ICONS[id].bg + '</color>').join('\n') + '\n</resources>\n');
await b.close();
console.log('иконки:', ids.join(', '));
