// Текст песни с аккордами: распознавание аккордов, транспонирование, разметка.
// Перенесено из legacy/practice.html (CH_RE, trChord, lyricsHTML).
import { SH, FL, NAT } from './notes.js';
import { transposeChord } from './transpose.js';

export const CH_RE = /^\(?[A-H](?:#|b|♯|♭)?(?:maj|min|m|M|dim|aug|sus|add|°|ø|\+)?[0-9]*(?:(?:sus|add|maj|b|#|♭|♯)[0-9]+)*(?:\/[A-H](?:#|b|♯|♭)?)?\)?$/;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Сдвиг аккорда на n полутонов; бемольное написание сохраняется (и выбирается при сдвиге вниз)
export function trChord(ch, n) {
  if (!n) return ch.replace(/#/g, '♯').replace(/([A-H])b/g, '$1♭');
  const flat = /[A-H](b|♭)/.test(ch) || (n < 0 && !/[#♯]/.test(ch));
  return ch.replace(/([A-H])(#|b|♯|♭)?/g, (m, L, acc) => {
    const base = L === 'H' ? 11 : NAT[L];
    const pc = (base + (acc === '#' || acc === '♯' ? 1 : acc === 'b' || acc === '♭' ? -1 : 0) + n + 24) % 12;
    return (flat ? FL : SH)[pc];
  });
}

const isChordLine = (line) => { const toks = line.trim().split(/\s+/).filter(Boolean); return toks.length > 0 && toks.every((t) => CH_RE.test(t) || /^[|\-–/x]+$/.test(t)); };

// Все аккорды текста по порядку: строки только из аккордов и аккорды в квадратных скобках
export function chordsIn(txt) {
  const out = [];
  String(txt || '').split('\n').forEach((line) => {
    if (isChordLine(line)) line.trim().split(/\s+/).forEach((t) => { if (CH_RE.test(t)) out.push(t.replace(/^\(|\)$/g, '')); });
    else line.replace(/\[([^\]]+)\]/g, (m, c) => { if (CH_RE.test(c)) out.push(c.replace(/^\(|\)$/g, '')); return m; });
  });
  return out;
}

// Строки только из аккордов подсвечиваются целиком; в тексте — аккорды в квадратных скобках [Am].
// key — исходная тональность { pc, minor, sharp }: тогда написание по ступеням (src/music/transpose.js);
// без неё — простой сдвиг, как в прототипе
export function lyricsHTML(txt, n, key = null) {
  const tr = (c) => (key ? transposeChord(c, n, key) : trChord(c, n));
  return txt.split('\n').map((line) => {
    if (isChordLine(line)) return line.replace(/\S+/g, (t) => (CH_RE.test(t) ? '<b class="chd">' + esc(tr(t)) + '</b>' : esc(t)));
    return esc(line).replace(/\[([^\]]+)\]/g, (m, c) => (CH_RE.test(c) ? '<b class="chd">' + esc(tr(c)) + '</b>' : m));
  }).join('\n');
}
