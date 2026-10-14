// Рисунок лиги (SVG), по возможности похожий на настоящий камень:
//   stone    — речная галька: шероховатая фактура (шум), крапинки, мягкий блик;
//   quartz   — друза горного хрусталя: прозрачные шестигранные кристаллы на породе;
//   amethyst — друза аметиста: фиолетовые кристаллы, к вершинам светлее;
//   topaz    — топаз овальной огранки; emerald — изумруд ступенчатой («изумрудной») огранки;
//   sapphire — сапфир овальной огранки; ruby — рубин огранки «кушон»; diamond — бриллиант круглой огранки с «огнём»;
//   obsidian — обсидиан: чёрное вулканическое стекло с раковистым сколом и радужным отливом.
// Огранка — вид сверху: площадка, звёздные, клиньевые и верхние рундистные грани; каждая грань — своей яркости
// (свет сверху-слева и «блеск»: внутренние отражения дают чередование светлых и тёмных граней).
// frac 0…1 — путь до следующей лиги: с ним камень ярче, контрастнее, больше искр.
let uidN = 0;

const hsl = (h, s, l, a = 1) => 'hsla(' + h + ',' + Math.max(0, Math.min(100, s)).toFixed(1) + '%,' + Math.max(0, Math.min(100, l)).toFixed(1) + '%,' + a + ')';
const P = (pts) => pts.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
const poly = (pts, fill, extra = '') => '<polygon points="' + P(pts) + '" fill="' + fill + '"' + extra + '/>';
// детерминированный «случай» для граней: одинаковый рисунок при каждом показе
const rnd = (k) => { const x = Math.sin(k * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
// свет сверху-слева: 1 — грань смотрит на свет, -1 — от света
const lightAt = (cx, cy) => { const a = Math.atan2(cy - 50, cx - 50); return Math.cos(a + (3 * Math.PI) / 4); };
const cen = (pts) => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];

// Искры: четырёхлучевые звёздочки в фиксированных местах
const SPARK = [[26, 24, 1], [74, 30, 0.8], [68, 74, 0.7], [32, 68, 0.6], [52, 14, 0.9], [86, 54, 0.6]];
const spark = ([x, y, s], o, k) => '<path class="gsp" style="animation-delay:' + k * 0.45 + 's" opacity="' + o.toFixed(2) + '" fill="#fff" stroke="rgba(120,140,170,.5)" stroke-width=".5" d="M' + x + ' ' + (y - 6 * s) +
  'Q' + x + ' ' + y + ' ' + (x + 6 * s) + ' ' + y + 'Q' + x + ' ' + y + ' ' + x + ' ' + (y + 6 * s) + 'Q' + x + ' ' + y + ' ' + (x - 6 * s) + ' ' + y + 'Q' + x + ' ' + y + ' ' + x + ' ' + (y - 6 * s) + 'Z"/>';

// тень под камнем — он лежит, а не висит
const shadow = (id, w = 30) => '<filter id="' + id + 'sh" x="-30%" y="-200%" width="160%" height="500%"><feGaussianBlur stdDeviation="2.4"/></filter>' +
  '<ellipse cx="50" cy="92" rx="' + w + '" ry="4.2" fill="#000" opacity=".22" filter="url(#' + id + 'sh)"/>';
// шум для фактуры камня (оттенки серого, прозрачность — по форме)
const noise = (id, freq, alpha, seed = 4) => '<filter id="' + id + 'n" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="' + freq + '" numOctaves="3" seed="' + seed + '"/>' +
  '<feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="table" tableValues="0 ' + alpha + '"/></feComponentTransfer><feComposite in2="SourceGraphic" operator="in"/></filter>';

/* ---------- галька ---------- */
function stone(id, f) {
  const shape = 'M16 60 C12 44 22 28 40 23 C58 18 78 24 86 40 C93 54 86 72 70 79 C54 86 30 84 21 74 C18 70 17 65 16 60Z';
  const specks = [[34, 44, 1.3], [60, 38, 1], [66, 62, 1.5], [44, 66, 1.1], [74, 50, 0.9], [28, 58, 0.8], [52, 52, 0.7], [40, 34, 0.8]];
  return '<defs>' + noise(id, 0.95, 0.55) +
    '<radialGradient id="' + id + 's" cx="36%" cy="30%" r="78%"><stop offset="0" stop-color="' + hsl(32, 7, 74 + f * 8) + '"/><stop offset=".6" stop-color="' + hsl(30, 6, 52) + '"/><stop offset="1" stop-color="' + hsl(28, 7, 33) + '"/></radialGradient>' +
    '<radialGradient id="' + id + 'h" cx="38%" cy="30%" r="30%"><stop offset="0" stop-color="#fff" stop-opacity="' + (0.35 + 0.25 * f).toFixed(2) + '"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>' +
    shadow(id, 34) +
    '<path d="' + shape + '" fill="url(#' + id + 's)"/>' +
    '<path d="' + shape + '" fill="#000" filter="url(#' + id + 'n)" opacity=".85"/>' +
    // прожилка кварца через гальку
    '<path d="M24 70 C38 58 56 54 84 46" fill="none" stroke="' + hsl(40, 15, 88, 0.55) + '" stroke-width="1.6" stroke-linecap="round"/>' +
    specks.map(([x, y, r], k) => '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + (k % 3 ? hsl(25, 10, 22, 0.55) : hsl(40, 20, 90, 0.6)) + '"/>').join('') +
    '<path d="' + shape + '" fill="url(#' + id + 'h)"/>' +
    '<path d="' + shape + '" fill="none" stroke="' + hsl(28, 8, 26, 0.6) + '" stroke-width=".8"/>';
}

/* ---------- кристаллы (кварц, аметист) ---------- */
// Шестигранный кристалл с вершиной: x — центр, w — полуширина, y0 — основание, ys — плечи, yt — вершина
function crystal(x, w, y0, ys, yt, col, k) {
  const [h, s, l, a] = col, L = [x - w, x - w * 0.35, x + w * 0.35, x + w];
  const face = (i, dl) => hsl(h, s, l + dl, a);
  // три видимые грани призмы: слева светлее (свет), справа темнее; блик — вдоль ребра
  let g = poly([[L[0], y0], [L[0], ys], [L[1], ys - w * 0.18], [L[1], y0]], face(0, 14)) +
    poly([[L[1], y0], [L[1], ys - w * 0.18], [L[2], ys - w * 0.18], [L[2], y0]], face(1, 2)) +
    poly([[L[2], y0], [L[2], ys - w * 0.18], [L[3], ys], [L[3], y0]], face(2, -14));
  // вершина: три грани к острию
  g += poly([[L[0], ys], [L[1], ys - w * 0.18], [x, yt]], face(0, 24)) +
    poly([[L[1], ys - w * 0.18], [L[2], ys - w * 0.18], [x, yt]], face(1, 12)) +
    poly([[L[2], ys - w * 0.18], [L[3], ys], [x, yt]], face(2, -6));
  // рёбра и блик
  g += '<path d="M' + L[1] + ' ' + y0 + 'V' + (ys - w * 0.18) + 'L' + x + ' ' + yt + 'M' + L[2] + ' ' + y0 + 'V' + (ys - w * 0.18) + 'L' + x + ' ' + yt + '" fill="none" stroke="' + hsl(h, s * 0.5, 96, 0.45) + '" stroke-width=".7"/>' +
    '<path d="M' + (L[0] + w * 0.22) + ' ' + (y0 - 4) + 'V' + (ys + 2) + '" stroke="#fff" stroke-opacity="' + (0.35 + 0.1 * (k % 2)) + '" stroke-width="' + (w * 0.16).toFixed(1) + '" stroke-linecap="round"/>' +
    // внутренние трещинки («перья») — у настоящих кристаллов
    '<path d="M' + (x - w * 0.2) + ' ' + (y0 - (y0 - ys) * 0.35) + 'l' + (w * 0.4) + ' ' + (-w * 0.3) + '" stroke="' + hsl(h, s * 0.4, 98, 0.35) + '" stroke-width=".6"/>';
  return '<g>' + g + '</g>';
}
function druse(id, f, kind) {
  // кварц — прозрачный, серо-голубой; аметист — от тёмно-фиолетового у основания к светлому у вершин
  const am = kind === 'amethyst';
  const col = am ? [276, 52 + 18 * f, 42 + 6 * f, 0.95] : [205, 14, 82 + 4 * f, 0.72];
  const matrix = 'M10 84 C14 74 26 70 36 72 C46 66 60 66 70 71 C80 68 90 74 92 84 Z';
  return '<defs>' + noise(id, 1.1, 0.6, 7) +
    '<clipPath id="' + id + 'c"><rect x="0" y="0" width="100" height="80"/></clipPath></defs>' +
    shadow(id, 38) +
    '<g clip-path="url(#' + id + 'c)">' +
    // задние кристаллы наклонены, передний — прямо
    '<g transform="rotate(-24 34 80)">' + crystal(34, 9, 84, 44, 28, [col[0], col[1], col[2] - 6, col[3]], 1) + '</g>' +
    '<g transform="rotate(22 68 80)">' + crystal(68, 10, 84, 40, 22, [col[0], col[1], col[2] - 4, col[3]], 2) + '</g>' +
    crystal(50, 13, 84, 32, 8, col, 0) +
    '<g transform="rotate(-48 26 82)">' + crystal(26, 5, 84, 66, 56, col, 3) + '</g>' +
    '</g>' +
    // порода-основание
    '<path d="' + matrix + '" fill="' + hsl(30, 6, 34) + '"/><path d="' + matrix + '" fill="#000" filter="url(#' + id + 'n)" opacity=".8"/>' +
    (am ? '<path d="M18 80 C30 74 46 75 60 74 C72 73 82 76 88 80" fill="none" stroke="' + hsl(280, 30, 70, 0.5) + '" stroke-width="1.4"/>' : '');
}

/* ---------- огранка «бриллиант» (круг, овал, кушон) ---------- */
// R(a) — радиус контура по углу; n — главных граней (8)
function brilliant(id, f, R, look) {
  const n = 8, off = -Math.PI / 2 + Math.PI / n, step = (2 * Math.PI) / n;
  const at = (r, a) => [50 + r * R(a) * Math.cos(a), 50 + r * R(a) * Math.sin(a)];
  const T = 0.54, S = 0.8; // площадка и концы звёздных граней — доли радиуса
  const facets = [];
  for (let k = 0; k < n; k++) {
    const a0 = off + k * step, a1 = a0 + step, m = a0 + step / 2, mp = a0 - step / 2;
    const t0 = at(T, a0), t1 = at(T, a1), sm = at(S, m), smp = at(S, mp), g0 = at(1, a0), gm = at(1, m), gq1 = at(1, a0 + step / 4), gq3 = at(1, a0 + (3 * step) / 4);
    facets.push(['star', [t0, t1, sm]]);
    facets.push(['kite', [t0, smp, g0, sm]]);
    facets.push(['ug', [sm, g0, gq1]], ['ug', [sm, gq1, gm]], ['ug', [sm, gm, gq3]], ['ug', [sm, gq3, at(1, a1)]]);
  }
  const table = Array.from({ length: n }, (_, k) => at(T, off + k * step)), outline = Array.from({ length: 64 }, (_, k) => at(1, (k / 64) * 2 * Math.PI));
  let g = '';
  facets.forEach(([kind, pts], k) => {
    const [cx, cy] = cen(pts), li = lightAt(cx, cy), r = rnd(k + (look.seed || 0));
    // блеск: часть граней отражает свет (светлая), часть — тёмное (контраст растёт с прогрессом)
    const flash = r > 0.62 ? 1 : r < 0.3 ? -1 : 0, depth = kind === 'ug' ? -4 : kind === 'kite' ? 2 : 6;
    g += poly(pts, look.face(li, flash, depth, k, f));
  });
  g += poly(table, 'url(#' + id + 't)');
  // отражение площадки: силуэт павильона («стрелы»), сквозь площадку
  g += Array.from({ length: n }, (_, k) => { const a = off + k * step + step / 2; return poly([at(0.08, a - 0.25), at(T * 0.92, a), at(0.08, a + 0.25)], look.arrow(k), ' opacity=".3"'); }).join('');
  g += '<polygon points="' + P(table) + '" fill="none" stroke="' + look.edge(0.5) + '" stroke-width=".6"/>';
  g += '<polygon points="' + P(outline) + '" fill="none" stroke="' + look.rim + '" stroke-width="1.3" stroke-linejoin="round"/>';
  return '<defs><radialGradient id="' + id + 't" cx="36%" cy="30%" r="85%"><stop offset="0" stop-color="' + look.tableHi(f) + '"/><stop offset="1" stop-color="' + look.tableLo(f) + '"/></radialGradient></defs>' +
    shadow(id, 30) + g + '<ellipse cx="38" cy="30" rx="10" ry="4.5" transform="rotate(-28 38 30)" fill="#fff" opacity="' + (0.28 + 0.3 * f).toFixed(2) + '"/>';
}
// Цвет граней цветного камня: тон h, насыщенность s, светлота l
const colored = (h, s, l, seed) => ({
  seed,
  face: (li, flash, depth, k, f) => hsl(h + (rnd(k * 3) - 0.5) * 8, s * (0.75 + 0.25 * f) + flash * 6, l + li * (8 + 10 * f) + flash * (10 + 12 * f) + depth),
  arrow: () => hsl(h, s, Math.max(6, l - 22)),
  edge: (a) => hsl(h, s * 0.4, 96, a),
  rim: hsl(h, s, Math.max(10, l - 28)),
  tableHi: (f) => hsl(h, s * 0.6, Math.min(94, l + 26 + 8 * f)),
  tableLo: () => hsl(h, s, l + 2),
});
// Бриллиант: бесцветный, огромный контраст светлых и тёмных граней, отдельные грани — «огонь» (дисперсия)
const diamondLook = {
  seed: 5,
  face: (li, flash, depth, k, f) => {
    if (rnd(k * 7 + 1) > 0.93 - 0.04 * f) return hsl((k * 47) % 360, 30 + 20 * f, 72 + li * 8); // огонь
    return hsl(210, 10, 64 + li * 16 + flash * (20 + 10 * f) + depth);
  },
  arrow: () => hsl(215, 14, 30),
  edge: (a) => 'rgba(255,255,255,' + a + ')',
  rim: hsl(212, 14, 46),
  tableHi: (f) => hsl(200, 30, 98 - 2 * (1 - f)),
  tableLo: () => hsl(210, 12, 78),
};
const round = () => 44;
const oval = (rx, ry) => (a) => 1 / Math.sqrt((Math.cos(a) / rx) ** 2 + (Math.sin(a) / ry) ** 2);
const cushion = (r, p = 3.2) => (a) => r / Math.pow(Math.abs(Math.cos(a)) ** p + Math.abs(Math.sin(a)) ** p, 1 / p);

/* ---------- ступенчатая огранка (изумруд) ---------- */
function stepCut(id, f, h, s, l) {
  const W = 34, H = 26, C = 9; // полуширина, полувысота, срез угла
  const ring = (k) => { const q = 1 - k * 0.15; const w = W * q, hh = H * q, c = C * q;
    return [[50 - w + c, 50 - hh], [50 + w - c, 50 - hh], [50 + w, 50 - hh + c], [50 + w, 50 + hh - c], [50 + w - c, 50 + hh], [50 - w + c, 50 + hh], [50 - w, 50 + hh - c], [50 - w, 50 - hh + c]]; };
  let g = '';
  for (let k = 0; k < 3; k++) {
    const A = ring(k), B = ring(k + 1);
    for (let i = 0; i < 8; i++) {
      const pts = [A[i], A[(i + 1) % 8], B[(i + 1) % 8], B[i]], [cx, cy] = cen(pts), li = lightAt(cx, cy);
      const alt = (k + i) % 2 ? 1 : -1; // ступени чередуют светлое и тёмное — «зал зеркал» изумрудной огранки
      g += poly(pts, hsl(h, s * (0.8 + 0.2 * f), l + li * (12 + 8 * f) + alt * (5 + 6 * f) - k * 3));
    }
  }
  const tb = ring(3);
  g += poly(tb, 'url(#' + id + 't)');
  // включения («сад» изумруда) и диагональный отблеск на площадке
  g += '<path d="M42 46 q4 2 6 -1 M54 54 q3 -3 7 -1 M46 58 l3 -2" fill="none" stroke="' + hsl(h, s, l - 18, 0.45) + '" stroke-width=".8" stroke-linecap="round"/>';
  g += '<path d="M' + (50 - W * 0.4) + ' ' + (50 + H * 0.3) + 'L' + (50 + W * 0.1) + ' ' + (50 - H * 0.45) + '" stroke="#fff" stroke-opacity="' + (0.22 + 0.25 * f).toFixed(2) + '" stroke-width="5" stroke-linecap="round"/>';
  g += '<polygon points="' + P(ring(0)) + '" fill="none" stroke="' + hsl(h, s, Math.max(8, l - 26)) + '" stroke-width="1.3" stroke-linejoin="round"/>';
  return '<defs><linearGradient id="' + id + 't" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + hsl(h, s * 0.7, l + 18 + 6 * f) + '"/><stop offset="1" stop-color="' + hsl(h, s, l - 6) + '"/></linearGradient></defs>' +
    shadow(id, 34) + g;
}

/* ---------- обсидиан ---------- */
function obsidian(id, f) {
  const shape = 'M50 10 C70 10 88 26 89 48 C90 70 72 86 50 86 C28 86 11 72 11 50 C11 28 28 10 50 10Z';
  return '<defs>' + noise(id, 0.6, 0.18, 11) +
    '<radialGradient id="' + id + 'o" cx="34%" cy="28%" r="80%"><stop offset="0" stop-color="' + hsl(250, 14, 30 + f * 8) + '"/><stop offset=".55" stop-color="' + hsl(250, 18, 9) + '"/>' +
    '<stop offset="1" stop-color="' + hsl(260, 25, 4) + '"/></radialGradient><linearGradient id="' + id + 'b" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0" stop-color="' + hsl(190, 80, 60, 0) + '"/><stop offset=".45" stop-color="' + hsl(190, 80, 62, 0.35 + 0.35 * f) + '"/><stop offset=".55" stop-color="' + hsl(290, 70, 62, 0.3 + 0.35 * f) + '"/>' +
    '<stop offset="1" stop-color="' + hsl(290, 70, 60, 0) + '"/></linearGradient></defs>' +
    shadow(id, 32) +
    '<path d="' + shape + '" fill="url(#' + id + 'o)" stroke="' + hsl(250, 20, 18) + '" stroke-width="1.2"/>' +
    '<path d="' + shape + '" fill="#fff" filter="url(#' + id + 'n)" opacity=".5"/>' +
    // раковистые сколы — концентрические дуги
    '<path d="M24 32 Q40 24 58 30 M20 48 Q42 36 70 44 M26 64 Q46 56 76 62" fill="none" stroke="' + hsl(240, 20, 60, 0.18 + 0.2 * f) + '" stroke-width="1.1"/>' +
    '<path d="M18 58 C34 40 58 36 84 40" fill="none" stroke="url(#' + id + 'b)" stroke-width="5" stroke-linecap="round"/>' +
    '<ellipse cx="36" cy="26" rx="11" ry="5" transform="rotate(-24 36 26)" fill="#fff" opacity="' + (0.22 + 0.3 * f).toFixed(2) + '"/>';
}

// Тон сияния вокруг камня
const GLOW = { quartz: [205, 30], amethyst: [280, 70], topaz: [38, 90], emerald: [150, 70], sapphire: [220, 80], ruby: [350, 80], diamond: [200, 30], obsidian: [270, 50] };

function bodyOf(gem, id, f) {
  switch (gem) {
    case 'stone': return stone(id, f);
    case 'quartz': case 'amethyst': return druse(id, f, gem);
    case 'topaz': return brilliant(id, f, oval(42, 34), colored(36, 88, 56, 2));
    case 'emerald': return stepCut(id, f, 152, 62, 34);
    case 'sapphire': return brilliant(id, f, oval(36, 44), colored(222, 72, 40, 3));
    case 'ruby': return brilliant(id, f, cushion(41), colored(348, 76, 42, 4));
    case 'obsidian': return obsidian(id, f);
    default: return brilliant(id, f, round, diamondLook); // diamond и прежние ступени
  }
}

// id ступени (GEMS в src/core/mastery.js), frac — прогресс внутри ступени; label — подпись для чтения с экрана
export function gemSVG(gem, frac = 0, size = 48, label = '') {
  const id = 'gm' + ++uidN, f = Math.max(0, Math.min(1, frac));
  const [h, s] = GLOW[gem] || GLOW.diamond;
  // сияние вокруг: у самоцветов растёт с прогрессом, у бриллианта сильнее; у гальки — нет
  const glowO = gem === 'stone' ? 0 : (gem === 'diamond' ? 0.3 : 0.12) + 0.3 * f;
  const glow = glowO ? '<radialGradient id="' + id + 'g"><stop offset="0" stop-color="' + hsl(h, s, 72, glowO) + '"/><stop offset="1" stop-color="' + hsl(h, s, 72, 0) + '"/></radialGradient>' : '';
  // искры: кристаллы и самоцветы — до 2, бриллиант — до 5, обсидиан — 1–3
  const nSp = { stone: 0, diamond: 3 + Math.round(2 * f), obsidian: 1 + Math.round(2 * f) }[gem] ?? Math.round(2 * f);
  return '<svg class="gem" width="' + size + '" height="' + size + '" viewBox="0 0 100 100"' + (label ? ' role="img" aria-label="' + label + '"' : ' aria-hidden="true"') + '>' +
    (glow ? '<defs>' + glow + '</defs><circle cx="50" cy="50" r="50" fill="url(#' + id + 'g)"/>' : '') +
    '<g transform="translate(5 5) scale(.9)">' + bodyOf(gem, id, f) + '</g>' +
    SPARK.slice(0, nSp).map((p, k) => spark(p, 0.55 + 0.45 * f, k)).join('') + '</svg>';
}
