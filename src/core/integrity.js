// Подтверждённые часы. Каждая запись о занятии при создании получает печать (sig) — хеш её содержимого с ключом
// приложения. Правка записи в файле копии или дописанная вручную сессия печать не проходят и становятся
// «не подтверждено»: в статистику, неделю, камень и звание такие часы не идут (решение автора — строгий режим),
// видны только в истории. Так же не подтверждаются записи, сделанные при сбитых часах устройства, и невозможные
// (больше суток за сутки, из будущего, длительность больше промежутка).
// Ключ лежит в открытом коде — это защита от правки файла, а не от того, кто перепишет приложение.

const KEY = 'μελέτα·1Tim4:15·Melete';

/* ---------- SHA-256 (синхронно: проверка нужна при каждом подсчёте статистики) ---------- */
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);

export function sha256(str) {
  const bytes = new TextEncoder().encode(str), len = bytes.length;
  const n = (((len + 9) >> 6) + 1) << 6, m = new Uint8Array(n);
  m.set(bytes);
  m[len] = 0x80;
  const bits = len * 8;
  for (let i = 0; i < 8; i++) m[n - 1 - i] = Math.floor(bits / 2 ** (8 * i)) & 255;
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]), W = new Uint32Array(64);
  const rotr = (x, r) => (x >>> r) | (x << (32 - r));
  for (let o = 0; o < n; o += 64) {
    for (let i = 0; i < 16; i++) W[i] = (m[o + i * 4] << 24) | (m[o + i * 4 + 1] << 16) | (m[o + i * 4 + 2] << 8) | m[o + i * 4 + 3];
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(W[i - 15], 7) ^ rotr(W[i - 15], 18) ^ (W[i - 15] >>> 3), s1 = rotr(W[i - 2], 17) ^ rotr(W[i - 2], 19) ^ (W[i - 2] >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
  }
  return [...H].map((x) => x.toString(16).padStart(8, '0')).join('');
}

/* ---------- печать записи ---------- */

// Поля, которые нельзя менять: что, когда, сколько; заметка и метка — можно (их печать не касается)
const sealed = (r) => [r.id, r.type, r.songId || '', r.tool || '', r.start, r.end, r.dur, r.mode || 'normal', r.quiet || 0, r.src || '', r.clk || ''].join('|');
export const sealOf = (r) => sha256(KEY + '|' + sealed(r)).slice(0, 32);
export function seal(r) { r.sig = sealOf(r); return r; }

/* ---------- проверка ---------- */

export const DAY_MS = 864e5;
export const BUILD_TIME = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : 1790000000000; // дата сборки (vite.config.js)
// Раньше этого занятий в приложении быть не могло (первые версии — 2026 год)
export const EARLIEST = Date.UTC(2025, 0, 1);

// Почему запись не подтверждена: null — всё в порядке
export function problemOf(r, now = Date.now()) {
  if (!r.sig || r.sig !== sealOf(r)) return 'seal';
  if (r.clk) return 'clock';
  const end = r.end ?? r.start + (r.dur || 0) * 1000; // в записях прототипа конца может не быть
  if (!(r.start >= EARLIEST) || !(end >= r.start) || end > now + 10 * 60000) return 'time';
  if (!(r.dur >= 0) || r.dur * 1000 > end - r.start + 60000 || r.dur > DAY_MS / 1000) return 'time';
  return null;
}

// Подтверждённые записи. Сверх того: за одни календарные сутки не больше 24 часов — иначе весь день не подтверждён
export function splitVerified(list, now = Date.now()) {
  const ok = [], bad = [];
  list.forEach((r) => (problemOf(r, now) ? bad : ok).push(r));
  const perDay = new Map();
  ok.forEach((r) => { const d = new Date(r.start); const k = d.getFullYear() * 400 + d.getMonth() * 32 + d.getDate(); perDay.set(k, (perDay.get(k) || 0) + r.dur); });
  const over = new Set([...perDay].filter(([, s]) => s > DAY_MS / 1000).map(([k]) => k));
  if (!over.size) return { ok, bad };
  const keep = [];
  ok.forEach((r) => { const d = new Date(r.start); (over.has(d.getFullYear() * 400 + d.getMonth() * 32 + d.getDate()) ? bad : keep).push(r); });
  return { ok: keep, bad };
}

/* ---------- опыт до приложения ---------- */
// Профиль тоже под печатью: часы до приложения и дата регистрации. Чужая правка в файле — часы не учитываются.
export const profileSeal = (p) => sha256(KEY + '|profile|' + (p.priorHours || 0) + '|' + (p.createdAt || 0)).slice(0, 32);
export const profileOk = (p) => !!p && (!(p.priorHours > 0) || p.sig === profileSeal(p));
// Первые 7 дней после регистрации опыт меняется свободно, потом — только в меньшую сторону (решение автора)
export const PRIOR_FREE_MS = 7 * DAY_MS;
export const priorLocked = (p, now = Date.now()) => !!p && !!p.createdAt && now - p.createdAt > PRIOR_FREE_MS;
