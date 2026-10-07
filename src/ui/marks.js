// «Минимал»: цвета меток (категории, жанры, теги, события календаря) передаются знаками, раз цвета нет.
// Каждый цвет палитры — свой знак; свой цвет пользователя получает знак ближайшего цвета палитры.
// Знак записывается в CSS-переменную --mg на цветном элементе (у него --c или --g) и виден его потомкам:
// стили «Минимала» показывают его перед названием метки, у песни и события.
import { PALETTE } from '../core/library.js';

// Порядок — как в палитре: красный ●, оранжевый ▲, жёлтый ★, зелёный ■, бирюзовый ◆, голубой ▼, синий ✚,
// индиго ○, фиолетовый △, розовый □, коричневый ◇, серый ◐, графит ✕, светлый ☆
export const MARKS = ['●', '▲', '★', '■', '◆', '▼', '✚', '○', '△', '□', '◇', '◐', '✕', '☆'];

const rgb = (hex) => { const h = hex.replace('#', ''); const v = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
const PAL = PALETTE.map(rgb);

// Знак цвета; null — не цвет палитры (var(--tint) и т. п.)
export function markOf(color) {
  const c = String(color || '').trim();
  if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c)) return null;
  const [r, g, b] = rgb(c);
  let best = 0, d0 = Infinity;
  PAL.forEach(([R, G, B], i) => { const d = (r - R) ** 2 * 0.3 + (g - G) ** 2 * 0.59 + (b - B) ** 2 * 0.11; if (d < d0) { d0 = d; best = i; } });
  return MARKS[best];
}

function mark(el) {
  if (!el.style) return;
  const c = el.style.getPropertyValue('--c') || el.style.getPropertyValue('--g');
  const m = c && markOf(c);
  if (m) el.style.setProperty('--mg', '"' + m + '"');
}
const scan = (root) => {
  if (root.nodeType !== 1) return;
  if (root.matches && root.matches('[style*="--c:"],[style*="--g:"]')) mark(root);
  root.querySelectorAll && root.querySelectorAll('[style*="--c:"],[style*="--g:"]').forEach(mark);
};

// Включить или выключить (по стилю интерфейса)
let obs = null;
export function watchMarks(on) {
  if (on && !obs) {
    obs = new MutationObserver((list) => list.forEach((m) => m.addedNodes.forEach(scan)));
    obs.observe(document.body, { childList: true, subtree: true });
    scan(document.body);
  } else if (!on && obs) { obs.disconnect(); obs = null; }
}
