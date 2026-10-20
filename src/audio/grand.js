// Рояль по записям настоящего инструмента: Salamander Grand Piano V3 (Alexander Holm, CC BY 3.0) — ноты через
// малую терцию от A0 до C8 (public/piano/<midi>.mp3: моно, обрезаны по высоте — низкие звучат дольше).
// Остальные ноты — ближайшая запись с другой скоростью (не дальше полутора тонов). Файлы скачиваются и
// раскодируются по мере надобности: сначала средние октавы, остальные — когда до них дойдут (память телефона).
export const ROOTS = Array.from({ length: 30 }, (_, i) => 21 + i * 3);

const raw = new Map(); // корень → обещание ArrayBuffer (сам файл)
let cache = { c: null, bufs: new Map() }; // корень → AudioBuffer | обещание (раскодированные — для одного контекста)

export const rootOf = (m) => ROOTS[Math.max(0, Math.min(ROOTS.length - 1, Math.round((m - 21) / 3)))];
const url = (r) => new URL('piano/' + r + '.mp3', document.baseURI).href;

function fetchRaw(r) {
  if (!raw.has(r)) raw.set(r, fetch(url(r)).then((x) => (x.ok ? x.arrayBuffer() : null)).catch(() => null));
  return raw.get(r);
}

// Раскодировать запись r для контекста c (один раз)
function load(c, r) {
  if (cache.c !== c) cache = { c, bufs: new Map() };
  const B = cache.bufs;
  if (B.has(r)) return B.get(r);
  const p = fetchRaw(r).then((ab) => (ab ? c.decodeAudioData(ab.slice(0)) : null)).then((b) => { B.set(r, b); return b; }).catch(() => { B.delete(r); return null; });
  B.set(r, p);
  return p;
}

// Запись для ноты m: { buf, root } или null — ещё не готова (загрузка уже идёт; пока звучит запасной синтезатор)
export function grandBuffer(c, m) {
  const r = rootOf(m);
  load(c, r);
  if (cache.c !== c) return null;
  for (const d of [0, -3, 3]) { // готовая соседняя запись — лучше, чем синтезатор
    const b = cache.bufs.get(r + d);
    if (b && !(b instanceof Promise) && b.duration) return { buf: b, root: r + d };
  }
  return null;
}

// Заранее: средние октавы (C3–C6) — их играют чаще всего. Без контекста — только скачать файлы
export function grandPreload(c, lo = 48, hi = 84) {
  ROOTS.filter((r) => r >= lo - 2 && r <= hi + 2).forEach((r) => (c ? load(c, r) : fetchRaw(r)));
}
