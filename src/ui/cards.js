// Кольцо цели (круги перевыполнения другим цветом), огонёк серии.
// Перенесено из legacy/practice.html (ring, FLAME, streakPill).
import './cards.css';

export const FLAME = '<svg viewBox="0 0 24 24" class="flame" aria-hidden="true"><path d="M12 2.5c.6 3.2 4.8 5.6 4.8 10.4A4.8 4.8 0 0 1 12 17.7a4.8 4.8 0 0 1-4.8-4.8c0-2 1-3.4 2-4.5.2 1.6 1 2.6 2 2.9-.4-2.8.2-6.1.8-8.8z"/><path d="M12 21.5a3 3 0 0 1-3-3c0-1.6 1.6-2.6 3-4.4 1.4 1.8 3 2.8 3 4.4a3 3 0 0 1-3 3z" opacity=".55"/></svg>';

// Цвета кругов: первый — акцент, дальше — каждый следующий круг перевыполнения
const LAPC = ['var(--tint)', '#FF2D55', '#AF52DE', '#5856D6', '#007AFF', '#00C7BE', '#34C759'];

// p — доля цели (1 = 100 %, 1.5 = перевыполнено на 50 %); label — подпись для чтения с экрана
export function goalRing(p, big, label) {
  const r = 42, c = 2 * Math.PI * r, pct = Math.round(p * 100), lap = Math.floor(Math.max(0, p)), frac = p - lap, col = (k) => LAPC[Math.min(k, LAPC.length - 1)];
  let s = '<svg class="gring' + (big ? ' big' : '') + '" viewBox="0 0 96 96" role="img" aria-label="' + (label || pct + '%') + '"><circle cx="48" cy="48" r="' + r + '" stroke="var(--fill)"/>';
  if (lap >= 1) s += '<circle cx="48" cy="48" r="' + r + '" stroke="' + col(lap - 1) + '"/>';
  if (frac > 0.001) s += '<circle cx="48" cy="48" r="' + r + '" class="' + (lap >= 1 ? 'rover' : '') + '" stroke="' + col(lap) + '" stroke-dasharray="' + c * frac + ' ' + c + '" transform="rotate(-90 48 48)"/>';
  s += '<text x="48" y="' + (p > 1 ? 46 : 52) + '" text-anchor="middle" class="rpct">' + pct + '%</text>' +
    (p > 1 ? '<text x="48" y="62" text-anchor="middle" class="rover2" style="fill:' + col(lap >= 1 && frac > 0.001 ? lap : lap - 1) + '">' +
      (lap >= 2 ? '×' + (Math.round(p * 10) / 10).toString().replace('.', ',') : '+' + (pct - 100) + '%') + '</text>' : '');
  return s + '</svg>';
}
