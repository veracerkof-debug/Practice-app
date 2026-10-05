// Рисунок значка мастерства (SVG): камень → самоцветы с огранкой → алмаз-сырец → алмаз → бриллиант.
// frac 0…1 — путь до следующей ступени: с ним камень ярче, грани контрастнее, больше искр.
let uidN = 0;

// Тон, насыщенность, светлота основы
const BASE = {
  quartz: [270, 18, 86], amethyst: [280, 58, 56], topaz: [36, 92, 55], emerald: [150, 62, 40],
  sapphire: [220, 74, 50], ruby: [346, 78, 48], diamond: [200, 30, 93], brilliant: [200, 40, 96],
};
const hsl = (h, s, l, a = 1) => 'hsla(' + h + ',' + Math.max(0, Math.min(100, s)) + '%,' + Math.max(0, Math.min(100, l)) + '%,' + a + ')';
const pt = (r, a) => [50 + r * Math.cos(a), 50 + r * Math.sin(a)];
const P = (pts) => pts.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');

// Искры: четырёхлучевые звёздочки в фиксированных местах
const SPARK = [[24, 22, 1], [76, 30, 0.8], [70, 76, 0.7], [30, 70, 0.6], [52, 12, 0.9], [88, 56, 0.6]];
const spark = ([x, y, s], o, k) => '<path class="gsp" style="animation-delay:' + k * 0.45 + 's" opacity="' + o.toFixed(2) + '" fill="#fff" stroke="rgba(120,140,170,.55)" stroke-width=".6" d="M' + x + ' ' + (y - 6 * s) +
  'Q' + x + ' ' + y + ' ' + (x + 6 * s) + ' ' + y + 'Q' + x + ' ' + y + ' ' + x + ' ' + (y + 6 * s) + 'Q' + x + ' ' + y + ' ' + (x - 6 * s) + ' ' + y + 'Q' + x + ' ' + y + ' ' + x + ' ' + (y - 6 * s) + 'Z"/>';

function stone(id, f) {
  const shape = '12,58 18,34 36,18 60,16 80,28 88,52 78,76 54,86 28,80';
  return '<defs><radialGradient id="' + id + 's" cx="38%" cy="32%" r="75%"><stop offset="0" stop-color="' + hsl(30, 4, 70 + f * 10) + '"/><stop offset="1" stop-color="' + hsl(30, 4, 36) + '"/></radialGradient></defs>' +
    '<polygon points="' + shape + '" fill="url(#' + id + 's)" stroke="' + hsl(30, 4, 30) + '" stroke-width="1.2" stroke-linejoin="round"/>' +
    '<path d="M36 18L44 44L18 34M44 44L60 16M44 44L54 86M44 44L88 52" fill="none" stroke="' + hsl(30, 4, 30, 0.35) + '" stroke-width="1"/>' +
    [[30, 50], [62, 58], [50, 34], [68, 42]].map(([x, y]) => '<circle cx="' + x + '" cy="' + y + '" r="1.6" fill="' + hsl(30, 4, 25, 0.5) + '"/>').join('');
}

function rough(id, f) {
  const out = '50,8 82,32 74,78 50,92 24,76 16,34', o = 0.75 + f * 0.2;
  return '<defs><linearGradient id="' + id + 'r" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + hsl(200, 20, 92, o) + '"/><stop offset="1" stop-color="' + hsl(210, 15, 62, o) + '"/></linearGradient></defs>' +
    '<polygon points="' + out + '" fill="url(#' + id + 'r)" stroke="' + hsl(210, 15, 45) + '" stroke-width="1.2" stroke-linejoin="round"/>' +
    '<path d="M16 34L50 44L82 32M50 44L50 8M50 44L50 92M50 44L24 76M50 44L74 78" fill="none" stroke="' + hsl(210, 20, 100, 0.55 + f * 0.3) + '" stroke-width="1.1"/>';
}

function cut(id, gem, f) {
  // бриллиант — круглая огранка на 16 граней, остальные — восьмигранник
  const [h, s0, l0] = BASE[gem], s = s0 * (0.55 + 0.45 * f), l = l0, R = 44, r = 21, n = gem === 'brilliant' ? 16 : 8, off = Math.PI / n;
  const fire = gem === 'diamond' || gem === 'brilliant';
  let facets = '';
  for (let k = 0; k < n; k++) {
    const a1 = off + (k * 2 * Math.PI) / n, a2 = off + ((k + 1) * 2 * Math.PI) / n, mid = (a1 + a2) / 2;
    // свет сверху-слева: грани к нему светлее; с прогрессом контраст сильнее
    const lit = Math.cos(mid - (-3 * Math.PI) / 4), dl = lit * (10 + 18 * f);
    const fill = fire ? hsl((h + k * (360 / n)) % 360, 25 + 30 * f, l - 4 + dl * 0.5) : hsl(h, s, l + dl);
    facets += '<polygon points="' + P([pt(R, a1), pt(R, a2), pt(r, a2), pt(r, a1)]) + '" fill="' + fill + '"/>';
    // звёздные грани: от середины ребра стола к углу контура
    facets += '<polygon points="' + P([pt(r, a1), pt(r, a2), pt(R * 0.86, mid)]) + '" fill="' + (fire ? hsl((h + 180 + k * (360 / n)) % 360, 20 + 25 * f, l + dl * 0.4) : hsl(h, s, l + 6 + dl * 0.6)) + '" opacity=".85"/>';
  }
  const outline = [], table = [];
  for (let k = 0; k < n; k++) { outline.push(pt(R, off + (k * 2 * Math.PI) / n)); table.push(pt(r, off + (k * 2 * Math.PI) / n)); }
  return '<defs><radialGradient id="' + id + 't" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="' + hsl(h, s * 0.6, Math.min(98, l + 26 + 8 * f)) + '"/><stop offset="1" stop-color="' + hsl(h, s, l + 4) + '"/></radialGradient></defs>' +
    facets + '<polygon points="' + P(table) + '" fill="url(#' + id + 't)"/>' +
    '<polygon points="' + P(outline) + '" fill="none" stroke="' + (fire ? hsl(210, 22, 52) : hsl(h, s, Math.max(12, l - 28))) + '" stroke-width="1.4" stroke-linejoin="round"/>' +
    '<polygon points="' + P(table) + '" fill="none" stroke="' + hsl(h, s * 0.4, 100, 0.5) + '" stroke-width=".8"/>';
}

// id ступени (GEMS в src/core/mastery.js), frac — прогресс внутри ступени; label — подпись для чтения с экрана
export function gemSVG(gem, frac = 0, size = 48, label = '') {
  const id = 'gm' + ++uidN, f = Math.max(0, Math.min(1, frac));
  const body = gem === 'stone' ? stone(id, f) : gem === 'rough' ? rough(id, f) : cut(id, gem, f);
  const [h] = BASE[gem] || [40];
  // сияние вокруг: у самоцветов растёт с прогрессом, у алмазов сильнее
  const glowO = gem === 'stone' ? 0 : (gem === 'diamond' || gem === 'brilliant' ? 0.35 : 0.15) + 0.35 * f;
  const glow = glowO ? '<radialGradient id="' + id + 'g"><stop offset="0" stop-color="' + hsl(h, gem === 'diamond' || gem === 'brilliant' || gem === 'rough' ? 30 : 80, 70, glowO) + '"/><stop offset="1" stop-color="' + hsl(h, 60, 70, 0) + '"/></radialGradient>' : '';
  // искры: самоцветы — до 2, алмаз-сырец — 1, алмаз — до 4, бриллиант — все
  const nSp = { stone: 0, rough: Math.round(f), diamond: 2 + Math.round(2 * f), brilliant: SPARK.length }[gem] ?? Math.round(2 * f);
  return '<svg class="gem" width="' + size + '" height="' + size + '" viewBox="0 0 100 100"' + (label ? ' role="img" aria-label="' + label + '"' : ' aria-hidden="true"') + '>' +
    (glow ? '<defs>' + glow + '</defs><circle cx="50" cy="50" r="50" fill="url(#' + id + 'g)"/>' : '') +
    '<g transform="translate(9 9) scale(.82)">' + body + '</g>' +
    SPARK.slice(0, nSp).map((p, k) => spark(p, 0.55 + 0.45 * f, k)).join('') + '</svg>';
}
