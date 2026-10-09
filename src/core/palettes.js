// Цветовые палитры: каждый инструмент закреплён за своим оттенком (TOOL_HUE), а палитра задаёт, как эти оттенки
// выглядят — сдержанно (классическая, по умолчанию), по-детски мягко, ярко или «вырвиглазно». Человек выбирает палитру целиком; акцент
// (settings.accent) — оттенок той же палитры. Свои цвета меток, категорий и событий человек выбирает сам — палитра их не трогает.

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
};
export const PALETTE_IDS = Object.keys(PALETTES);
export const paletteOf = (settings) => (PALETTES[settings && settings.palette] ? settings.palette : 'classic');

// Инструмент → оттенок: у каждого свой (неизвестные и личные модули — со своим цветом)
export const TOOL_HUE = {
  metro: 'orange', timer: 'red', bible: 'yellow', tuner: 'green', theremin: 'mint', drone: 'teal', spectrum: 'cyan',
  theory: 'blue', piano: 'indigo', glider: 'purple', audio: 'pink', notes: 'brown',
};
// Акцент (названия — как в settings.ACCENTS) → оттенок
export const ACCENT_HUE = { orange: 'orange', red: 'red', pink: 'pink', purple: 'purple', indigo: 'indigo', blue: 'blue', teal: 'mint', green: 'green', graphite: 'graphite' };

export const hueColor = (settings, hue) => PALETTES[paletteOf(settings)][hue];

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
  const c = hueColor(settings, ACCENT_HUE[accent] || 'orange'), P = PALETTES[p];
  const deep = (x, k) => 'color-mix(in srgb,' + x + ' ' + k + '%,var(--ink))';
  return {
    '--tint': P.soft ? deep(c, 80) : c, // пастель на светлом фоне: акцент чуть глубже, иначе вкладки и ссылки не читаются
    '--tint-text': deep(c, P.soft || accent === 'graphite' ? 62 : p === 'neon' ? 72 : 78),
    '--on-tint': onColor(c),
    ...(p === 'classic' ? {} : { '--red': P.soft ? deep(P.red, 70) : P.red }),
  };
}
