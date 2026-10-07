// Значок звания (SVG): медальон с символом звания и тремя делениями уровня внизу.
// Символы по нарастанию: восьмая, две восьмые, скрипичный ключ, ключ в лавровом венке, ключ в венке с короной.
import { t } from '../i18n/index.js';
import { ROMAN } from '../core/rank.js';

export const RANK_COLORS = { student: '#8E8E93', amateur: '#34C759', musician: '#007AFF', master: '#AF52DE', virtuoso: '#FF9500' };

const NOTE = 'M44 28v28.5a8 8 0 1 0 4 6.9V36c6 1 10 5 11 11 3-10-5-17-15-19z';
const BEAM = 'M38 34l26-7v27.5a7 7 0 1 0 4 6.3V23L34 32v26.5a7 7 0 1 0 4 6.3z';
const CLEF = 'M52 22c-7 0-10 8-6 17l2 7c-9 5-14 11-12 18 2 8 13 10 20 5 5-4 4-11-1-13-4-2-9 0-9 4s5 5 7 3m-3-17c5-3 10-8 10-14 0-5-4-9-8-7-5 2-4 10-1 17l7 33c1 5-2 8-6 8';
const CROWN = 'M37 17l3-11 6 6 4-8 4 8 6-6 3 11z';

// Лавровый венок: листья по дуге слева, правая половина — зеркальная
const half = [128, 148, 168, 188, 208].map((d) => {
  const a = (d * Math.PI) / 180, x = (50 + 35 * Math.cos(a)).toFixed(1), y = (50 + 35 * Math.sin(a)).toFixed(1);
  return '<ellipse cx="' + x + '" cy="' + y + '" rx="2.8" ry="6.5" transform="rotate(' + (d + 25) + ' ' + x + ' ' + y + ')"/>';
}).join('');
const LAUREL = '<g class="rkf">' + half + '<g transform="matrix(-1 0 0 1 100 0)">' + half + '</g></g>';

export function rankSVG(id, level, size = 56, label = '') {
  const c = RANK_COLORS[id] || '#8E8E93';
  const top = id === 'master' || id === 'virtuoso';
  const sym = id === 'student' ? '<path d="' + NOTE + '" class="rkf"/>' : id === 'amateur' ? '<path d="' + BEAM + '" class="rkf"/>'
    : (top ? LAUREL : '') + '<path d="' + CLEF + '" class="rks" transform="translate(6 1) scale(.88)"/>' + (id === 'virtuoso' ? '<path d="' + CROWN + '" class="rkf rkcrown"/>' : '');
  // три деления уровня по нижней дуге
  const pips = [0, 1, 2].map((k) => {
    const a = ((110 - k * 20) * Math.PI) / 180, x = 50 + 40 * Math.cos(a), y = 50 + 40 * Math.sin(a);
    return '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="4.2" class="rkp' + (k < level ? ' on' : '') + '"/>';
  }).join('');
  return '<svg class="rank" width="' + size + '" height="' + size + '" viewBox="0 0 100 100"' + (label ? ' role="img" aria-label="' + label + '"' : ' aria-hidden="true"') + ' style="--rk:' + c + '">' +
    '<circle cx="50" cy="50" r="46" class="rkbg"/><circle cx="50" cy="50" r="46" class="rkring"/>' + sym + pips + '</svg>';
}

// «Музыкант II»
export const rankName = (id, level) => t('rank.' + id) + ' ' + ROMAN[level];
