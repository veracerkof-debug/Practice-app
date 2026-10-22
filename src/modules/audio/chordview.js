// Вид «Аккорды» плеера: схема аккорда на грифе, ступень (по-нэшвилльски) и функция в тональности записи.
// Чистые функции; рисунок — SVG строкой. Аккорды записи — словарь ChordMini (pc 0–11, качество: '', min, 7, maj7, …).
import { TEMPLATES } from '../../music/guitarchords.js';

// Качество словаря → вид схемы в сборнике аппликатур (чего нет — ближайшее трезвучие)
const TYPE_OF = { '': 'maj', maj6: 'maj', aug: 'maj', min: 'min', min6: 'min', dim: 'min', minmaj7: 'min', '7': '7', maj7: 'maj7', min7: 'm7', hdim7: 'm7', dim7: 'm7', sus2: 'sus2', sus4: 'sus4' };

// Аппликатура аккорда: открытая из сборника, иначе — самая низкая на грифе; null — нет подходящей
export function shapeFor(pc, q) {
  const type = TYPE_OF[q] ?? 'maj';
  const all = TEMPLATES.filter((t) => t.root === pc && t.type === type);
  if (!all.length) return null;
  const low = (t) => Math.min(...t.frets.filter((f) => f != null && f > 0).concat([99]));
  return all.slice().sort((a, b) => (b.common - a.common) || (low(a) - low(b)))[0];
}

// Схема на грифе: 6 струн, 4 лада (с первого, иначе — с нижнего нажатого, номер лада сбоку), x и o над порожком
export function diagramSVG(frets, { w = 92, h = 112, barre = null } = {}) {
  if (!frets) return '';
  const pressed = frets.filter((f) => f != null && f > 0), lo = pressed.length ? Math.min(...pressed) : 1, hi = pressed.length ? Math.max(...pressed) : 1;
  const base = hi <= 4 ? 1 : lo, N = 4, x0 = 14, y0 = 20, gw = w - 24, gh = h - 30, dx = gw / 5, dy = gh / N;
  let s = '<svg class="chdia" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-hidden="true">';
  s += base === 1 ? '<rect x="' + x0 + '" y="' + (y0 - 3) + '" width="' + gw + '" height="3" class="nut"/>' : '<text x="' + (x0 + gw + 4) + '" y="' + (y0 + dy * 0.7) + '" class="fn">' + base + '</text>';
  for (let i = 0; i <= N; i++) s += '<line x1="' + x0 + '" x2="' + (x0 + gw) + '" y1="' + (y0 + i * dy) + '" y2="' + (y0 + i * dy) + '" class="fr"/>';
  for (let k = 0; k < 6; k++) s += '<line x1="' + (x0 + k * dx) + '" x2="' + (x0 + k * dx) + '" y1="' + y0 + '" y2="' + (y0 + gh) + '" class="st"/>';
  if (barre && barre >= base) { const y = y0 + (barre - base + 0.5) * dy, ks = frets.map((f, k) => (f === barre ? k : -1)).filter((k) => k >= 0); s += '<rect x="' + (x0 + ks[0] * dx - 5) + '" y="' + (y - 5) + '" width="' + ((ks[ks.length - 1] - ks[0]) * dx + 10) + '" height="10" rx="5" class="dot"/>'; }
  frets.forEach((f, k) => {
    const x = x0 + k * dx;
    if (f == null) s += '<text x="' + x + '" y="' + (y0 - 7) + '" class="mk">×</text>';
    else if (f === 0) s += '<circle cx="' + x + '" cy="' + (y0 - 10) + '" r="3.2" class="op"/>';
    else s += '<circle cx="' + x + '" cy="' + (y0 + (f - base + 0.5) * dy) + '" r="5.2" class="dot"/>';
  });
  return s + '</svg>';
}

// Ступень аккорда в тональности (тоника — 1; в миноре 1m) и функция: t — тоника, s — субдоминанта, d — доминанта
const DEG = ['1', '♭2', '2', '♭3', '3', '4', '♯4', '5', '♭6', '6', '♭7', '7'];
const SUF = { min: 'm', min6: 'm6', min7: 'm7', minmaj7: 'mΔ', dim: '°', dim7: '°7', hdim7: 'ø', aug: '+', '7': '7', maj7: 'Δ', maj6: '6', sus2: 'sus2', sus4: 'sus4' };
export function degreeOf(pc, q, keyPc, minor) {
  if (keyPc == null || pc == null || pc < 0) return { deg: '', fn: '' };
  const rel = (((pc - keyPc) % 12) + 12) % 12;
  // доминантсептаккорд — всегда доминанта (и побочная: E7 в до мажоре тянет к ля минору)
  const fn = q === '7' ? 'd' : rel === 0 || (minor && rel === 3) || (!minor && rel === 9) ? 't' : rel === 5 || rel === 2 || (minor && rel === 8) ? 's' : rel === 7 || rel === 11 || (minor && rel === 10) ? 'd' : '';
  return { deg: DEG[rel] + (SUF[q] ?? ''), fn };
}
