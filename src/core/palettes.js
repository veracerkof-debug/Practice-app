// Цветовые палитры: каждый инструмент закреплён за своим оттенком (TOOL_HUE), а палитра задаёт, как эти оттенки
// выглядят — сдержанно (классическая, по умолчанию), по-детски мягко, ярко или «вырвиглазно». Человек выбирает палитру целиком; акцент
// (settings.accent) — оттенок той же палитры. Свои цвета меток, категорий и событий человек выбирает сам — палитра их не трогает.
// Отдельно: «Лунный свет» — только оттенки серого (для любителей), и «Свой цвет» — все оттенки из одного основного
// цвета (settings.ownMain), хоть всё красное, хоть всё фиолетовое. Свой фон (settings.ownBg) — в settings.applyTheme.

export const HUES = ['orange', 'red', 'yellow', 'green', 'mint', 'teal', 'cyan', 'blue', 'indigo', 'purple', 'pink', 'brown', 'graphite'];

// soft — светлые цвета: текст акцентом и «опасные» кнопки темнее самого цвета (иначе на белом не читается)
export const PALETTES = {
  classic: { orange: '#9C7242', red: '#A75750', yellow: '#AE934D', green: '#5F8568', mint: '#4A8681', teal: '#548591', cyan: '#5988A7',
    blue: '#567198', indigo: '#646493', purple: '#866B9D', pink: '#A95E72', brown: '#A2845E', graphite: '#8E8E93' },
  bright: { orange: '#FF9500', red: '#FF3B30', yellow: '#FFCC00', green: '#34C759', mint: '#00C7BE', teal: '#30B0C7', cyan: '#32ADE6',
    blue: '#007AFF', indigo: '#5856D6', purple: '#AF52DE', pink: '#FF2D55', brown: '#A2845E', graphite: '#8E8E93' },
  pastel: { soft: true, orange: '#FFB37A', red: '#FF8E8E', yellow: '#FFD86B', green: '#8FD69A', mint: '#79DCC8', teal: '#7CC7D8', cyan: '#8CC7F2',
    blue: '#93A9F6', indigo: '#AA9DF0', purple: '#D0A2EA', pink: '#F6A5C8', brown: '#D6B48E', graphite: '#B4B4BC' },
  neon: { orange: '#FF6A00', red: '#FF1744', yellow: '#FFEA00', green: '#00E676', mint: '#1DE9B6', teal: '#00E5FF', cyan: '#00B0FF',
    blue: '#2962FF', indigo: '#651FFF', purple: '#D500F9', pink: '#FF00A0', brown: '#FF9E40', graphite: '#9E9E9E' },
  jewel: { orange: '#D2691E', red: '#B71C3C', yellow: '#C9A227', green: '#1E7D4E', mint: '#13907A', teal: '#127A9C', cyan: '#1B6FC2',
    blue: '#1F3F9F', indigo: '#43329E', purple: '#7B2D9E', pink: '#AD1457', brown: '#7A4A2B', graphite: '#5E5E66' },
  // «Лунный свет»: серебро и пепел — оттенки серого чуть теплее или холоднее и разной светлоты, чтобы инструменты различались
  lunar: { orange: '#8C8782', red: '#6E6A69', yellow: '#B3B0A8', green: '#7D837F', mint: '#98A09F', teal: '#66706F', cyan: '#A7AFB5',
    blue: '#717A86', indigo: '#5E6170', purple: '#8A8592', pink: '#A39CA0', brown: '#857C72', graphite: '#9A9A9E' },
};
// Обычные палитры — сеткой; «Лунный свет» — отдельно; «Свой цвет» — из основного цвета (ownPalette)
export const PALETTE_IDS = ['classic', 'bright', 'pastel', 'neon', 'jewel'];
export const SPECIAL_PALETTES = ['lunar'];
export const OWN_DEFAULT = '#B0304A';
export const isHex = (x) => typeof x === 'string' && /^#[0-9a-f]{6}$/i.test(x);

/* ---------- свой цвет: оттенки из одного ---------- */
const hex2hsl = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
};
export const hsl2hex = (h, s, l) => {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return '#' + [r, g, b].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
};
export { hex2hsl };
// 13 оттенков одного цвета: тон чуть гуляет (±24°), светлота и насыщенность — разные, чтобы инструменты различались
const OWN_STEPS = { orange: [0, 0, 0], red: [-10, .1, -.1], yellow: [14, -.1, .14], green: [-18, -.2, .06], mint: [20, -.25, -.04], teal: [-24, -.15, -.16],
  cyan: [24, -.05, .1], blue: [-6, .05, -.2], indigo: [8, -.1, -.24], purple: [-14, .1, .2], pink: [12, .05, .06], brown: [4, -.35, -.06], graphite: [0, -.7, 0] };
const ownCache = {};
export function ownPalette(main) {
  const c = isHex(main) ? main.toUpperCase() : OWN_DEFAULT;
  if (ownCache[c]) return ownCache[c];
  const [h, s, l] = hex2hsl(c), out = {};
  const L0 = Math.max(0.3, Math.min(0.62, l)); // основной цвет — узнаваемый, но не белый и не чёрный
  HUES.forEach((k) => { const [dh, ds, dl] = OWN_STEPS[k]; out[k] = k === 'orange' && l >= 0.3 && l <= 0.62 ? c : hsl2hex((h + dh + 360) % 360, Math.max(0, Math.min(1, s + ds)), Math.max(0.2, Math.min(0.78, L0 + dl))); });
  return (ownCache[c] = out);
}

export const paletteOf = (settings) => (settings && settings.palette === 'own' ? 'own' : PALETTES[settings && settings.palette] ? settings.palette : 'classic');
const palOf = (settings) => (paletteOf(settings) === 'own' ? ownPalette(settings.ownMain) : PALETTES[paletteOf(settings)]);

// Инструмент → оттенок: у каждого свой (неизвестные и личные модули — со своим цветом)
export const TOOL_HUE = {
  metro: 'orange', timer: 'red', bible: 'yellow', tuner: 'green', theremin: 'mint', drone: 'teal', spectrum: 'cyan',
  theory: 'blue', piano: 'indigo', glider: 'purple', audio: 'pink', notes: 'brown',
};
// Акцент (названия — как в settings.ACCENTS) → оттенок
export const ACCENT_HUE = { orange: 'orange', red: 'red', pink: 'pink', purple: 'purple', indigo: 'indigo', blue: 'blue', teal: 'mint', green: 'green', graphite: 'graphite' };

export const hueColor = (settings, hue) => palOf(settings)[hue];

// Цвет текста и значков на цветном (settings.onText): 'auto' — по светлоте цвета, 'white' или 'black' — всегда такой
const FORCED = { white: '#ffffff', black: '#000000' };
let forced = null;
export const TEXT_MODES = ['auto', 'white', 'black'];
export const setTextMode = (mode) => { forced = FORCED[mode] || null; };
export const forcedText = () => forced;

// Цвет значка поверх цвета: тёмный на светлом, белый на тёмном (или выбранный человеком)
export function onColor(hex) {
  if (forced) return forced;
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
  if (!m) return '#fff';
  const [r, g, b] = [1, 2, 3].map((i) => parseInt(m[i], 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.6 ? '#1c1c1e' : '#ffffff';
}

// Инструменты перекрашиваются на месте (их цвет читают все экраны): own — цвет из описания модуля
let tools = [];
export function registerTools(list) {
  tools = list;
  tools.forEach((m) => { if (m.ownColor == null) m.ownColor = m.color; });
}
export function paintTools(settings) {
  setTextMode(settings.onText);
  tools.forEach((m) => {
    const hue = TOOL_HUE[m.id];
    m.color = hue && !m.local ? hueColor(settings, hue) : m.ownColor;
    m.on = onColor(m.color);
  });
}

// Переменные акцента для <html>: null — оставить цвета темы как есть (классическая палитра, охра)
export function accentVars(settings) {
  const p = paletteOf(settings), accent = settings.accent || 'orange';
  if (p === 'classic' && accent === 'orange') return forced ? { '--on-tint': forced } : null; // цвета темы как есть
  // свой цвет: акцент — сам основной цвет
  const c = p === 'own' ? palOf(settings).orange : hueColor(settings, ACCENT_HUE[accent] || 'orange'), P = palOf(settings);
  const deep = (x, k) => 'color-mix(in srgb,' + x + ' ' + k + '%,var(--ink))';
  return {
    '--tint': P.soft ? deep(c, 80) : c, // пастель на светлом фоне: акцент чуть глубже, иначе вкладки и ссылки не читаются
    '--tint-text': deep(c, P.soft || accent === 'graphite' ? 62 : p === 'neon' ? 72 : 78),
    '--on-tint': onColor(c),
    // «опасные» кнопки остаются красными в серой и своей палитре — смысл важнее цвета
    ...(p === 'classic' || p === 'lunar' || p === 'own' ? {} : { '--red': P.soft ? deep(P.red, 70) : P.red }),
  };
}

/* ---------- свой фон ---------- */
// Из одного цвета фона — все цвета поверхности: ячейки, текст, вторичный текст, линии; тёмный фон — тёмная схема
const mix = (a, b, k) => { // k — доля a
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16)), pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return '#' + pa.map((v, i) => Math.round(v * k + pb[i] * (1 - k)).toString(16).padStart(2, '0')).join('').toUpperCase();
};
const lum = (hex) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export function bgVars(bg) {
  if (!isHex(bg)) return null;
  const dark = lum(bg) < 0.4, ink = dark ? mix('#FFFFFF', bg, 0.94) : mix('#141312', bg, 0.94);
  const rgb = (hex, a) => 'rgba(' + [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(',') + ',' + a + ')';
  return {
    dark,
    vars: {
      '--bg': bg.toUpperCase(),
      '--cell': dark ? mix('#FFFFFF', bg, 0.1) : mix('#FFFFFF', bg, 0.6),
      '--ink': ink, '--l2': mix(ink, bg, 0.58), '--l3': mix(ink, bg, 0.26),
      '--sep': rgb(ink, dark ? 0.22 : 0.15), '--fill': rgb(ink, dark ? 0.16 : 0.08), '--fill2': rgb(ink, dark ? 0.26 : 0.14),
      '--bar': rgb(bg, 0.86),
    },
  };
}
