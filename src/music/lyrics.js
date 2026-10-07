// Текст песни с аккордами: распознавание аккордов, транспонирование, разметка.
// Перенесено из legacy/practice.html (CH_RE, trChord, lyricsHTML).
import { SH, FL, NAT } from './notes.js';
import { transposeChord, shiftKey } from './transpose.js';
import { parseDegree, chordToDegree, degreeToChord, degreeToRoman, degreeToNash } from './degrees.js';

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

// Аккорды могут быть записаны и ступенями (src/music/degrees.js): римскими цифрами — всегда, числами
// нэшвиллской системы — только если в тексте нет буквенных аккордов (иначе «1» или «2» могли бы быть просто числами)
const letterChords = (txt) => String(txt || '').split('\n').some((line) =>
  (isLine(line, true) && line.trim().split(/\s+/).some((t) => CH_RE.test(t))) || [...line.matchAll(/\[([^\]]+)\]/g)].some((m) => CH_RE.test(m[1])));
const tokOf = (t, numbers) => (CH_RE.test(t) ? 'chord' : parseDegree(t, { numbers }) ? 'deg' : null);
const isLine = (line, numbers) => { const toks = line.trim().split(/\s+/).filter(Boolean); return toks.length > 0 && toks.every((t) => tokOf(t, numbers) || /^[|\-–/x]+$/.test(t)); };
const isChordLine = (line) => isLine(line, false) && line.trim().split(/\s+/).some((t) => CH_RE.test(t));

// Все аккорды текста по порядку: строки только из аккордов и аккорды в квадратных скобках
export function chordsIn(txt) {
  const out = [];
  String(txt || '').split('\n').forEach((line) => {
    if (isChordLine(line)) line.trim().split(/\s+/).forEach((t) => { if (CH_RE.test(t)) out.push(t.replace(/^\(|\)$/g, '')); });
    else line.replace(/\[([^\]]+)\]/g, (m, c) => { if (CH_RE.test(c)) out.push(c.replace(/^\(|\)$/g, '')); return m; });
  });
  return out;
}

// Ступени, записанные в тексте (римские цифры или числа)
export function degreesIn(txt) {
  const numbers = !letterChords(txt), out = [];
  String(txt || '').split('\n').forEach((line) => {
    if (isLine(line, numbers)) line.trim().split(/\s+/).forEach((t) => { const d = !CH_RE.test(t) && parseDegree(t, { numbers }); if (d) out.push(d); });
    else line.replace(/\[([^\]]+)\]/g, (m, c) => { const d = !CH_RE.test(c) && parseDegree(c, { numbers }); if (d) out.push(d); return m; });
  });
  return out;
}

// Строки только из аккордов подсвечиваются целиком; в тексте — аккорды в квадратных скобках [Am].
// key — исходная тональность { pc, minor, sharp }: тогда написание по ступеням (src/music/transpose.js);
// без неё — простой сдвиг, как в прототипе.
// view: 'chords' — аккордами в тональности со сдвигом n; 'degrees' — ступенями, style: 'roman' | 'nash'.
// Что бы ни было в тексте (аккорды или ступени), показывается выбранный вид.
export function lyricsHTML(txt, n, key = null, { view = 'chords', style = 'roman' } = {}) {
  const numbers = !letterChords(txt);
  const asDeg = (x) => (style === 'nash' ? degreeToNash(x) : degreeToRoman(x));
  const tr = (c) => {
    if (CH_RE.test(c)) {
      if (view === 'degrees' && key) { const x = chordToDegree(c, key); if (x) return asDeg(x); }
      return key ? transposeChord(c, n, key) : trChord(c, n);
    }
    const x = parseDegree(c, { numbers });
    if (!x) return c;
    if (view === 'degrees') return asDeg(x);
    return key ? degreeToChord(x, shiftKey(key, n)) : asDeg(x);
  };
  const b = (c) => '<b class="chd">' + esc(tr(c)) + '</b>';
  return txt.split('\n').map((line) => {
    if (isLine(line, numbers)) return line.replace(/\S+/g, (t) => (tokOf(t, numbers) ? b(t) : esc(t)));
    return esc(line).replace(/\[([^\]]+)\]/g, (m, c) => (tokOf(c, numbers) ? b(c) : m));
  }).join('\n');
}
