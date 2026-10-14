// Иконка приложения на выбор (settings.appIcon, «Оформление»): маскот — Мелета или Мелетий — и музыкальные значки.
// Один источник рисунков: превью в приложении и PNG для Android (build/appicons.mjs → res/mipmap-*). Поле 108×108,
// как у адаптивной иконки Android: всё важное — в центральном круге диаметром 66 (лаунчер обрезает края по-своему).
// На Android смена — через activity-alias (IconPlugin.java), в браузере — значок вкладки.
import { mascotSVG } from './mascot.js';

const INK = '#1D1B18', CREAM = '#F5F1E8', TINT = '#9C7242', GREEN = '#5F8568', NIGHT = '#23262E';
const face = (g) => mascotSVG('glad', { size: 108, ring: false, gender: g }).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
const st = (c, w = 4) => 'fill="none" stroke="' + c + '" stroke-width="' + w + '" stroke-linecap="round" stroke-linejoin="round"';

export const APP_ICONS = {
  // лицо крупно: черты — в безопасном круге, бантик — на его краю
  melete: { bg: CREAM, fg: INK, body: () => '<g class="mascot" transform="translate(9 11) scale(.9)">' + face('f') + '</g>' },
  meletiy: { bg: CREAM, fg: INK, body: () => '<g class="mascot" transform="translate(9 11) scale(.9)">' + face('m') + '</g>' },
  note: { bg: TINT, fg: CREAM, body: () => '<ellipse cx="47" cy="68" rx="9.5" ry="7" transform="rotate(-22 47 68)" fill="' + CREAM + '"/><path d="M55.5 66 V36 q2 9 13 15" ' + st(CREAM, 4.4) + '/>' },
  clef: { bg: NIGHT, fg: CREAM, body: () => '<g transform="translate(14 18) scale(.8)"><path d="M52 22c-7 0-10 8-6 17l2 7c-9 5-14 11-12 18 2 8 13 10 20 5 5-4 4-11-1-13-4-2-9 0-9 4s5 5 7 3m-3-17c5-3 10-8 10-14 0-5-4-9-8-7-5 2-4 10-1 17l7 33c1 5-2 8-6 8" ' + st(CREAM, 4.6) + '/></g>' },
  fork: { bg: GREEN, fg: CREAM, body: () => '<path d="M46 32 v24 q0 8 8 8 q8 0 8 -8 v-24 M54 64 v16" ' + st(CREAM, 5) + '/>' },
  keys: { bg: CREAM, fg: INK, body: () => '<rect x="31" y="34" width="46" height="40" rx="5" ' + st(INK, 3.4) + '/>' + [42.5, 54, 65.5].map((x) => '<path d="M' + x + ' 34 v40" ' + st(INK, 2.4) + '/>').join('') +
    [38.5, 50, 61.5, 72].slice(0, 3).map((x, i) => '<rect x="' + (x + (i === 2 ? 0.5 : 0)) + '" y="34" width="8" height="23" rx="1.5" fill="' + INK + '"/>').join('') },
  classic: { bg: CREAM, fg: INK, body: () => '<text x="54" y="70" text-anchor="middle" font-family="Georgia,serif" font-size="46" fill="' + INK + '">M</text><path d="M40 80 h28" ' + st(TINT, 3) + '/>' },
};
export const APP_ICON_IDS = Object.keys(APP_ICONS);
export const DEFAULT_ICON = 'melete';

// SVG иконки: shape — 'square' (превью: скруглённый квадрат), 'full' (фон и рисунок — для PNG), 'fg' (только рисунок — передний слой Android)
export function appIconSVG(id, { size = 56, shape = 'square' } = {}) {
  const ic = APP_ICONS[id] || APP_ICONS[DEFAULT_ICON];
  const bg = shape === 'fg' ? '' : shape === 'full' ? '<rect width="108" height="108" fill="' + ic.bg + '"/>' : '<rect width="108" height="108" rx="26" fill="' + ic.bg + '"/>';
  return '<svg class="appic" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108" width="' + size + '" height="' + size + '" aria-hidden="true" style="color:' + ic.fg + '">' + bg + ic.body() + '</svg>';
}
