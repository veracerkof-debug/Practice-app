// Формат файла табов и нот — по содержимому, не по расширению (файлы со сторонних сайтов и из мессенджеров часто
// приходят с чужим расширением или без него). Чистые функции, без DOM.
import { hasAsciiTab } from '../../music/asciitab.js';

const ascii = (b, i, n) => String.fromCharCode(...b.subarray(i, i + n));
const findAscii = (b, s, limit = 4096) => { const n = Math.min(b.length, limit); const t = ascii(b, 0, n); return t.includes(s); };

// → 'pdf' | 'gp345' | 'gpx' | 'gp7' | 'mxl' | 'musicxml' | 'capella' | 'ascii' | 'text' | null
export function sniffScore(bytes, name = '') {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), ext = (/\.([a-z0-9]+)$/i.exec(name) || [, ''])[1].toLowerCase();
  if (b.length >= 4 && ascii(b, 0, 4) === '%PDF') return 'pdf';
  if (b.length >= 4 && ascii(b, 0, 4) === 'BCFZ' || ascii(b, 0, 4) === 'BCFS') return 'gpx';
  if (b.length > 24 && b[0] >= 18 && b[0] <= 30 && ascii(b, 1, 20) === 'FICHIER GUITAR PRO v') return 'gp345';
  if (b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 3 && b[3] === 4) { // zip: Guitar Pro 7/8, сжатый MusicXML, Capella
    if (findAscii(b, 'score.gpif') || findAscii(b, 'Content/')) return 'gp7';
    if (findAscii(b, 'container.xml') || ext === 'mxl') return 'mxl';
    if (findAscii(b, 'score.xml') || ext === 'capx') return 'capella';
    return ext === 'gp' ? 'gp7' : null;
  }
  const head = new TextDecoder('utf-8', { fatal: false }).decode(b.subarray(0, Math.min(b.length, 2048)));
  if (/<\?xml|<score-partwise|<score-timewise/i.test(head)) return 'musicxml';
  if (ext === 'cap') return 'capella';
  // текст: табы строками струн или просто текст (аккорды, слова)
  const bin = b.subarray(0, Math.min(b.length, 2048)).filter((c) => c < 9 || (c > 13 && c < 32)).length;
  if (bin > 4) return null;
  return hasAsciiTab(new TextDecoder().decode(b.subarray(0, Math.min(b.length, 200000)))) ? 'ascii' : 'text';
}
