// Рояль по записям настоящего инструмента: Salamander Grand Piano V3 (Alexander Holm, CC BY 3.0).
// Два набора:
//  — полный (APK, Windows; public/models/piano/, пакет build/models.json): 30 нот через малую терцию от A0 до C8 ×
//    16 слоёв силы удара (<нота>v<1…16>.ogg, стерео 48 кГц, Ogg Vorbis) и звуки отпускания клавиш (rel<1…88>.ogg);
//    признак пакета — pack.json. Слой выбирается по силе нажатия; записи раскодируются по мере надобности в моно
//    (вдвое меньше памяти; панорама — узлом) и держатся в кэше ограниченного размера (телефон);
//  — облегчённый (веб-версия, запас): те же 30 нот одним слоем, моно, укорочены (public/piano/<midi>.mp3).
// Остальные ноты — ближайшая запись с другой скоростью (не дальше полутора тонов). Пока запись не готова —
// звучит синтезированное пианино (synth.js).
import { eco } from './perf.js';

export const ROOTS = Array.from({ length: 30 }, (_, i) => 21 + i * 3);
export const LAYERS = 16;
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const noteName = (m) => NAMES[m % 12] + (Math.floor(m / 12) - 1); // 21 → A0, 60 → C4

export const rootOf = (m) => ROOTS[Math.max(0, Math.min(ROOTS.length - 1, Math.round((m - 21) / 3)))];
const base = () => (typeof document !== 'undefined' ? document.baseURI : 'http://localhost/');
const urlLite = (r) => new URL('piano/' + r + '.mp3', base()).href;
const urlFull = (name) => new URL('models/piano/' + name + '.ogg', base()).href;

// Слои силы удара, между которыми выбираем: в экономном режиме — 4 (меньше записей в памяти), иначе 8
const layerSet = () => (eco() ? [2, 6, 10, 14] : [1, 3, 5, 7, 9, 11, 13, 15]);
// Сила нажатия 0…1 → слой 1…16 из набора
export function layerOf(vel, set = layerSet()) {
  const want = 1 + Math.pow(Math.max(0, Math.min(1, vel)), 0.85) * (LAYERS - 1);
  return set.reduce((b, l) => (Math.abs(l - want) < Math.abs(b - want) ? l : b), set[0]);
}

/* ---------- полный набор: есть ли ---------- */
let pack = null; // null — не проверяли, false — нет, { files: Set } — есть
let packWait = null;
export const grandPack = () => pack;
export function checkPack() {
  if (packWait) return packWait;
  packWait = fetch(new URL('models/piano/pack.json', base()).href).then((r) => (r.ok ? r.json() : null)).then((j) => {
    pack = j && Array.isArray(j.files) ? { files: new Set(j.files) } : false;
    return pack;
  }).catch(() => { pack = false; return pack; });
  return packWait;
}

/* ---------- записи ---------- */
const raw = new Map(); // ключ → обещание ArrayBuffer (сам файл)
let cache = { c: null, bufs: new Map(), order: [] }; // ключ → AudioBuffer | обещание; order — для вытеснения
const CACHE_MAX = () => (eco() ? 12 : 24);

const fetchRaw = (key, url) => {
  if (!raw.has(key)) raw.set(key, fetch(url).then((x) => (x.ok ? x.arrayBuffer() : null)).catch(() => null));
  return raw.get(key);
};
// стерео → моно (память вдвое меньше; панорама — в голосе)
function mono(c, b) {
  if (!b || b.numberOfChannels === 1) return b;
  const out = c.createBuffer(1, b.length, b.sampleRate), d = out.getChannelData(0), n = b.numberOfChannels;
  for (let ch = 0; ch < n; ch++) { const x = b.getChannelData(ch); for (let i = 0; i < d.length; i++) d[i] += x[i] / n; }
  return out;
}
function load(c, key, url, toMono = false) {
  if (cache.c !== c) cache = { c, bufs: new Map(), order: [] };
  const B = cache.bufs;
  if (B.has(key)) return B.get(key);
  const p = fetchRaw(key, url).then((ab) => (ab ? c.decodeAudioData(ab.slice(0)) : null)).then((b) => { const r = toMono ? mono(c, b) : b; B.set(key, r); return r; }).catch(() => { B.delete(key); return null; });
  B.set(key, p); cache.order.push(key);
  // лишнее — вон (самое старое из готовых; файлы остаются скачанными, раскодируются заново при надобности)
  while (cache.order.length > CACHE_MAX()) { const k = cache.order.shift(); if (k !== key) { raw.delete(k); B.delete(k); } }
  return p;
}
const ready = (key) => { const b = cache.bufs.get(key); return b && !(b instanceof Promise) && b.duration ? b : null; };

// Запись для ноты m при силе vel: { buf, root, layer } или null — ещё не готова (загрузка идёт; пока — синтезатор)
export function grandBuffer(c, m, vel = 0.6) {
  const r = rootOf(m);
  if (pack === null) checkPack();
  if (pack && pack.files) {
    const L = layerOf(vel), name = noteName(r);
    const want = name + 'v' + L;
    if (pack.files.has(want + '.ogg')) load(c, want, urlFull(want), true);
    if (cache.c !== c) return null;
    const b0 = ready(want);
    if (b0) return { buf: b0, root: r, layer: L };
    // готовая соседняя: другой слой той же ноты (ближайший), потом соседняя нота того же слоя
    const near = [...layerSet()].sort((a, b) => Math.abs(a - L) - Math.abs(b - L));
    for (const l of near) { const b = ready(name + 'v' + l); if (b) return { buf: b, root: r, layer: l }; }
    for (const d of [-3, 3]) { const b = ready(noteName(r + d) + 'v' + L); if (b) return { buf: b, root: r + d, layer: L }; }
    return null;
  }
  load(c, 'lite' + r, urlLite(r));
  if (cache.c !== c) return null;
  for (const d of [0, -3, 3]) { const b = ready('lite' + (r + d)); if (b) return { buf: b, root: r + d, layer: 0 }; }
  return null;
}

// Звук отпускания клавиши m (только полный набор): AudioBuffer или null (грузится)
export function grandRelease(c, m) {
  if (!pack || !pack.files) return null;
  const n = Math.max(1, Math.min(88, m - 20)), key = 'rel' + n;
  if (!pack.files.has(key + '.ogg')) return null;
  load(c, key, urlFull(key), true);
  return ready(key);
}

// Заранее: средние октавы (C3–C6) — их играют чаще всего. Без контекста — только скачать файлы
export function grandPreload(c, lo = 48, hi = 84) {
  const go = () => {
    const rs = ROOTS.filter((r) => r >= lo - 2 && r <= hi + 2);
    if (pack && pack.files) { const L = layerOf(0.6); rs.forEach((r) => { const k = noteName(r) + 'v' + L; if (pack.files.has(k + '.ogg')) (c ? load(c, k, urlFull(k), true) : fetchRaw(k, urlFull(k))); }); }
    else rs.forEach((r) => (c ? load(c, 'lite' + r, urlLite(r)) : fetchRaw('lite' + r, urlLite(r))));
  };
  if (pack === null) checkPack().then(go); else go();
}
