// Студия: проект песни по образцу FL Studio Mobile — плейлист: дорожки (инструменты) и клипы на таймлайне.
// Чистые функции, без звука и DOM.
// Дорожка: { id, kind: 'notes' | 'chords' | 'drums' | 'audio', name, color, inst, vol, pan (−1…1), mute, solo, oct, mode, arp, fx }.
// Клип: { id, tr, at, len, data, gain (0…2), mute } — на дорожке tr с доли at длиной len долей; содержимое data — по роду дорожки,
// это короткий кусок на data.bars тактов, который повторяется по кругу на всю длину клипа (растянул — звучит дальше):
//   ноты    { bars, notes: [{ t, d, m, v }] }   — t и d в долях от начала куска, m — высота MIDI;
//   аккорды { bars, chords: [{ t, d, pc, type }] } — разворачиваются в ноты по режиму дорожки (hold | rhythm | arp);
//   ударные { bars, steps: { kick: [i…], snare: [i…] … } } — номера шестнадцатых, где есть удар;
//   запись  { fileId, off, fadeIn, fadeOut } — запись из медиатеки с секунды off, по кругу на длину клипа; затухания в долях.
// Время всегда в долях: смена темпа ничего не двигает. Свинг — отдельное число проекта (0…1).
// Петля region { a, b } — играть по кругу этот отрезок песни (доли); маркеры marks [{ t, name }] — места в песне.
// Автоматизация дорожки auto { vol: [{ t, v }], pan: [{ t, v }] } — точки по песне (доли), между ними — прямая:
// vol — множитель к фейдеру (0…1, 1 — как фейдер), pan — панорама (−1…1); без точек — как ручки.
// Старые проекты (паттерны × дорожки и плейлист из паттернов, 2026-10) переезжают в клипы при нормализации.
import { uid } from '../core/time.js';
import { CHORDS, keyInfo } from './theory.js';
import { MAJ_NAMES, MIN_NAMES } from './notes.js';

export const INSTRUMENTS = ['piano', 'wfelt', 'wkpad', 'wair', 'wlight', 'wwarm', 'wchoir', 'wflute', 'organ', 'fmep', 'abass', 'bell', 'sine', 'sample'];
// Ударные со своими записями: tr.kit = { kick: fileId, … } — ряд звучит записью из медиатеки (как есть) вместо синтеза.
// Сэмплер: звук дорожки 'sample' — запись из медиатеки (tr.sample = { fileId, root }) по нотам: высота — скорость
// воспроизведения относительно ноты root (C4 = 60), длина — пока держится нота или пока не кончится запись
export const COLORS = ['#567198', '#5F8568', '#B5533C', '#9C7242', '#646493', '#A95E72', '#3E8C8C', '#8E8E93'];
export const KINDS = ['notes', 'chords', 'drums', 'audio'];
export const MODES = ['hold', 'rhythm', 'arp'];
export const ARP_DIRS = ['up', 'down', 'updown'];
export const GRIDS = [1, 0.5, 0.25]; // сетка: доля, половина, четверть доли
export const DRUMS = ['kick', 'snare', 'hat', 'ohat', 'clap'];
export const DRUM_MIDI = { kick: 36, snare: 38, hat: 42, ohat: 46, clap: 39 }; // General MIDI, канал ударных
export const STEP = 0.25; // шаг ударных — шестнадцатая (четверть доли)
export const BARS_MAX = 64, SONG_BARS_MAX = 512, CLIPS_MAX = 256, NOTE_LO = 24, NOTE_HI = 96;

export function newTrack(kind = 'notes', i = 0, patch = {}) {
  const base = { id: 'tr' + uid(), kind: KINDS.includes(kind) ? kind : 'notes', name: '', color: COLORS[i % COLORS.length],
    inst: kind === 'chords' ? 'wair' : kind === 'notes' && i === 1 ? 'abass' : 'piano', vol: 0.9, pan: 0, mute: false, solo: false, oct: 0 };
  if (kind === 'chords') return { ...base, mode: 'hold', arp: { dir: 'up', step: 0.5 }, ...patch };
  return { ...base, ...patch };
}
// Пустое содержимое клипа по роду дорожки
export const newData = (kind, bars = 1) => (kind === 'audio' ? { fileId: null, off: 0 } : kind === 'chords' ? { bars, chords: [] } : kind === 'drums' ? { bars, steps: {} } : { bars, notes: [] });
// Клип на дорожке tr с доли at длиной len долей (по умолчанию — длина куска)
export function newClip(p, tr, at, len = 0, data = null) {
  const d = data || newData(tr.kind, 1);
  return { id: 'cl' + uid(), tr: tr.id, at: Math.max(0, at), len: len > 0 ? len : dataBeats(p, d), data: d, gain: 1, mute: false };
}
export function newProject(patch = {}) {
  const p = { id: 'pj' + uid(), name: '', bpm: 90, num: 4, den: 4, key: { pc: 0, minor: false }, swing: 0, songId: null, region: null, marks: [],
    tracks: [newTrack('drums', 2), newTrack('chords', 0), newTrack('notes', 1)], clips: [],
    createdAt: Date.now(), updatedAt: Date.now(), ...patch };
  delete p.bars;
  return p;
}
export const secPerBeat = (p) => 60 / p.bpm;
// Длина куска содержимого в долях (у записи — не задана: 0)
export const dataBeats = (p, d) => (d && d.bars ? d.bars * p.num : 0);
export const clipsOf = (p, tr) => p.clips.filter((c) => c.tr === tr.id).sort((a, b) => a.at - b.at);
export const clipById = (p, id) => p.clips.find((c) => c.id === id) || null;
export const trackOf = (p, clip) => p.tracks.find((t) => t.id === clip.tr) || null;
// Длина песни в долях: до конца последнего клипа, целыми тактами, не меньше такта
export const songBeats = (p) => Math.max(1, Math.ceil(Math.max(0, ...p.clips.map((c) => c.at + c.len)) / p.num - 1e-6)) * p.num;
export const songBars = (p) => songBeats(p) / p.num;

// Сколько в содержимом (для подписи клипа и пустоты проекта)
export const countOf = (tr, d) => {
  if (!d) return 0;
  return tr.kind === 'chords' ? d.chords.length : tr.kind === 'drums' ? Object.values(d.steps).reduce((s, a) => s + a.length, 0) : tr.kind === 'audio' ? (d.fileId ? 1 : 0) : d.notes.length;
};
export const isEmptyProject = (p) => p.clips.every((c) => { const tr = trackOf(p, c); return !tr || !countOf(tr, c.data); });

// Привести проект в порядок: границы, числа, порядок нот; старые проекты — в клипы
export function normalizeProject(p) {
  p.bpm = Math.max(20, Math.min(300, Math.round(+p.bpm || 90)));
  p.num = Math.max(1, Math.min(12, Math.round(+p.num || 4)));
  p.den = [2, 4, 8].includes(+p.den) ? +p.den : 4;
  p.swing = Math.max(0, Math.min(1, +p.swing || 0));
  p.key = p.key && Number.isFinite(+p.key.pc) ? { pc: ((+p.key.pc % 12) + 12) % 12, minor: !!p.key.minor } : { pc: 0, minor: false };
  p.tracks = (p.tracks || []).filter((t) => t && t.id).map((t) => {
    t.vol = Math.max(0, Math.min(1.5, +t.vol || 0)); t.oct = Math.max(-2, Math.min(2, Math.round(+t.oct || 0))); t.pan = Math.max(-1, Math.min(1, +t.pan || 0));
    if (!INSTRUMENTS.includes(t.inst)) t.inst = 'piano';
    if (t.kind === 'drums' && t.kit && typeof t.kit === 'object') { const kit = {}; DRUMS.forEach((l) => { if (typeof t.kit[l] === 'string' && t.kit[l]) kit[l] = t.kit[l]; }); t.kit = Object.keys(kit).length ? kit : undefined; }
    if (t.kit === undefined || t.kind !== 'drums') delete t.kit;
    t.auto = normalizeAuto(t.auto, SONG_BARS_MAX * p.num);
    if (!t.auto) delete t.auto;
    t.sample = t.inst === 'sample' ? { fileId: (t.sample && t.sample.fileId) || null, root: Math.max(24, Math.min(96, Math.round(+(t.sample && t.sample.root) || 60))) } : undefined;
    if (t.sample === undefined) delete t.sample;
    if (t.fx && typeof t.fx !== 'object') delete t.fx; // эффекты дорожки (src/audio/fx.js), полный вид — там
    if (!KINDS.includes(t.kind)) t.kind = 'notes';
    if (t.kind === 'chords') { if (!MODES.includes(t.mode)) t.mode = 'hold'; t.arp = { dir: ARP_DIRS.includes(t.arp && t.arp.dir) ? t.arp.dir : 'up', step: [1, 0.5, 0.25].includes(t.arp && t.arp.step) ? t.arp.step : 0.5 }; }
    return t;
  });
  if (!Array.isArray(p.clips)) migrate(p);
  p.clips = (p.clips || []).filter((c) => c && c.id && p.tracks.some((t) => t.id === c.tr)).slice(0, CLIPS_MAX).map((c) => {
    const tr = trackOf(p, c);
    c.at = Math.max(0, Math.min(SONG_BARS_MAX * p.num, Math.round((+c.at || 0) * 64) / 64));
    c.data = normalizeData(p, tr, c.data);
    c.len = Math.max(STEP, Math.min(SONG_BARS_MAX * p.num - c.at, Math.round((+c.len || dataBeats(p, c.data) || p.num) * 64) / 64));
    c.gain = c.gain == null ? 1 : Math.max(0, Math.min(2, +c.gain || 0)); c.mute = !!c.mute;
    return c;
  }).sort((a, b) => a.at - b.at);
  const maxB = SONG_BARS_MAX * p.num, snapQ = (x) => Math.max(0, Math.min(maxB, Math.round((+x || 0) * 64) / 64));
  p.region = p.region && Number.isFinite(+p.region.a) && Number.isFinite(+p.region.b) && +p.region.b - +p.region.a >= STEP ? { a: snapQ(p.region.a), b: snapQ(p.region.b) } : null;
  if (p.region && p.region.b <= p.region.a) p.region = null;
  p.marks = (Array.isArray(p.marks) ? p.marks : []).filter((m) => m && Number.isFinite(+m.t)).map((m) => ({ t: snapQ(m.t), name: String(m.name || '').slice(0, 30) })).sort((a, b) => a.t - b.t).slice(0, 64);
  delete p.bars; delete p.loop; delete p.patterns; delete p.song; delete p.cur;
  return p;
}
// Содержимое клипа — в порядок: границы куска, числа, порядок нот
export function normalizeData(p, tr, d) {
  const o = { ...newData(tr.kind, 1), ...(d && typeof d === 'object' ? d : {}) };
  if (tr.kind === 'audio') { o.fileId = o.fileId || null; o.off = Math.max(0, +o.off || 0); o.fadeIn = Math.max(0, Math.min(64, +o.fadeIn || 0)); o.fadeOut = Math.max(0, Math.min(64, +o.fadeOut || 0)); delete o.bars; return o; }
  o.bars = Math.max(1, Math.min(BARS_MAX, Math.round(+o.bars || 1)));
  const total = o.bars * p.num, steps = total / STEP;
  if (tr.kind === 'chords') { o.chords = (o.chords || []).filter((c) => c && c.d > 0 && c.t >= 0 && c.t < total).map((c) => ({ ...c, d: Math.min(c.d, total - c.t) })).sort((a, b) => a.t - b.t); delete o.notes; delete o.steps; }
  else if (tr.kind === 'drums') { const st = {}; DRUMS.forEach((l) => { const a = Array.from(new Set((o.steps && o.steps[l]) || [])).filter((i) => Number.isInteger(i) && i >= 0 && i < steps).sort((a, b) => a - b); if (a.length) st[l] = a; }); o.steps = st; delete o.notes; delete o.chords; }
  else { o.notes = (o.notes || []).filter((n) => n && n.d > 0 && n.m >= 0 && n.m <= 127 && n.t >= 0 && n.t < total).map((n) => ({ ...n, d: Math.min(n.d, total - n.t) })).sort((a, b) => a.t - b.t || a.m - b.m); delete o.chords; delete o.steps; }
  delete o.fileId; delete o.off;
  return o;
}
// Старый проект (паттерны × дорожки, плейлист из паттернов; совсем старый — ноты в дорожках) → клипы
function migrate(p) {
  p.clips = [];
  const pats = Array.isArray(p.patterns) && p.patterns.length ? p.patterns : [{ id: 'p0', bars: Math.max(1, Math.round(+p.bars || 4)), data: Object.fromEntries(p.tracks.map((t) => [t.id, t.notes ? { notes: t.notes } : t.chords ? { chords: t.chords } : null]).filter(([, v]) => v)) }];
  p.tracks.forEach((t) => { delete t.notes; delete t.chords; });
  const order = (Array.isArray(p.song) && p.song.length ? p.song : pats.map((x) => x.id)).map((id) => pats.find((x) => x.id === id)).filter(Boolean);
  let off = 0;
  order.forEach((pat) => {
    const bars = Math.max(1, Math.round(+pat.bars || 4)), len = bars * p.num;
    p.tracks.forEach((tr) => {
      const cell = pat.data && pat.data[tr.id];
      if (!cell || tr.kind === 'audio') return;
      const d = { bars, ...cell }, prev = p.clips.filter((c) => c.tr === tr.id).at(-1);
      // одинаковый кусок подряд — один клип подлиннее (как растянутый), иначе новый
      if (prev && prev.at + prev.len === off && JSON.stringify(prev.data) === JSON.stringify(d)) prev.len += len;
      else p.clips.push(newClip(p, tr, off, len, d));
    });
    off += len;
  });
  p.tracks.forEach((tr) => { if (tr.kind === 'audio' && tr.fileId) { p.clips.push(newClip(p, tr, 0, Math.max(p.num, off), { fileId: tr.fileId, off: 0 })); } delete tr.fileId; });
}

/* ---------- автоматизация ---------- */

export const AUTO_KINDS = ['vol', 'pan'], AUTO_MAX = 64;
const autoRange = (kind) => (kind === 'pan' ? [-1, 1] : [0, 1]);
// Точки в порядок: числа, границы, без двух в одной доле; пусто — null
export function normalizeAuto(a, maxT) {
  if (!a || typeof a !== 'object') return null;
  const out = {};
  AUTO_KINDS.forEach((k) => {
    const [lo, hi] = autoRange(k), seen = new Set();
    const pts = (Array.isArray(a[k]) ? a[k] : []).filter((q) => q && Number.isFinite(+q.t) && Number.isFinite(+q.v)).map((q) => ({ t: Math.max(0, Math.min(maxT, Math.round(+q.t * 64) / 64)), v: Math.max(lo, Math.min(hi, Math.round(+q.v * 100) / 100)) }))
      .sort((x, y) => x.t - y.t).filter((q) => { if (seen.has(q.t)) return false; seen.add(q.t); return true; }).slice(0, AUTO_MAX);
    if (pts.length) out[k] = pts;
  });
  return Object.keys(out).length ? out : null;
}
// Значение в доле t: между точками — прямая, до первой и после последней — крайняя; без точек — def
export function autoAt(pts, t, def) {
  if (!pts || !pts.length) return def;
  if (t <= pts[0].t) return pts[0].v;
  const last = pts[pts.length - 1];
  if (t >= last.t) return last.v;
  for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i]; if (t <= b.t) return a.v + (b.v - a.v) * ((t - a.t) / Math.max(1e-9, b.t - a.t)); }
  return last.v;
}
// Поставить точку (в той же доле — заменить); по сетке
export function setAutoPoint(tr, kind, t, v, grid = 1) {
  const [lo, hi] = autoRange(kind), T = snapBeat(t, grid), pts = ((tr.auto = tr.auto || {})[kind] = (tr.auto[kind] || []).filter((q) => Math.abs(q.t - T) > 1e-6));
  if (pts.length >= AUTO_MAX) return null;
  const q = { t: T, v: Math.max(lo, Math.min(hi, Math.round(v * 100) / 100)) };
  pts.push(q); pts.sort((x, y) => x.t - y.t);
  return q;
}
export function removeAutoPoint(tr, kind, q) {
  if (!tr.auto || !tr.auto[kind]) return;
  tr.auto[kind] = tr.auto[kind].filter((x) => x !== q);
  if (!tr.auto[kind].length) delete tr.auto[kind];
  if (!Object.keys(tr.auto).length) delete tr.auto;
}
export const autoPointAt = (tr, kind, t, tol) => (tr.auto && tr.auto[kind] ? tr.auto[kind].find((q) => Math.abs(q.t - t) <= tol) || null : null);

// Склеить два соседних клипа одной дорожки в один (кусок — обе партии подряд; записи не склеиваются)
export function joinClips(p, a, b) {
  const tr = trackOf(p, a);
  if (!tr || b.tr !== a.tr || tr.kind === 'audio') return null;
  const [x, y] = a.at <= b.at ? [a, b] : [b, a];
  if (Math.abs(x.at + x.len - y.at) > 1e-6) return null;
  const bars = Math.ceil((x.len + y.len) / p.num - 1e-6);
  if (bars > BARS_MAX) return null;
  const d = newData(tr.kind, bars), shift = (c, off) => {
    if (tr.kind === 'drums') { const per = dataBeats(p, c.data), steps = c.len / STEP; DRUMS.forEach((l) => (c.data.steps[l] || []).forEach((i) => { for (let o = 0; o < c.len - 1e-6; o += per) { const k = Math.round((o + i * STEP) / STEP); if (k < steps) setStep(d, l, Math.round(off / STEP) + k, true); } })); }
    else if (tr.kind === 'chords') clipNotesRaw(p, c).forEach((q) => d.chords.push({ ...q, t: q.t + off }));
    else clipNotes(p, tr, c).forEach((n) => d.notes.push({ t: n.t - c.at + off, d: n.d, m: n.m - 12 * (tr.oct || 0), v: n.v }));
  };
  shift(x, 0); shift(y, x.len);
  if (tr.kind === 'chords') d.chords.sort((q, r) => q.t - r.t);
  x.data = normalizeData(p, tr, d); x.len = x.len + y.len;
  removeClip(p, y);
  return x;
}
// Аккорды клипа по всей его длине (кусок повторяется), от начала клипа
function clipNotesRaw(p, c) {
  const per = dataBeats(p, c.data), out = [];
  for (let off = 0; off < c.len - 1e-6; off += per) c.data.chords.forEach((q) => { if (q.t + off < c.len) out.push({ ...q, t: q.t + off, d: Math.min(q.d, c.len - off - q.t) }); });
  return out;
}

/* ---------- клипы на таймлайне ---------- */

export const snapBeat = (b, grid = 1) => Math.max(0, Math.round(b / grid) * grid);
export function addClip(p, tr, at, len, data) {
  if (p.clips.length >= CLIPS_MAX) return null;
  const c = newClip(p, tr, snapBeat(at), len, data);
  p.clips.push(c); p.clips.sort((a, b) => a.at - b.at);
  return c;
}
export function removeClip(p, c) { p.clips = p.clips.filter((x) => x !== c); }
export function dupClip(p, c) {
  if (p.clips.length >= CLIPS_MAX) return null;
  const n = { ...c, id: 'cl' + uid(), at: c.at + c.len, data: JSON.parse(JSON.stringify(c.data)) };
  p.clips.push(n); p.clips.sort((a, b) => a.at - b.at);
  return n;
}
// Передвинуть: at по сетке, не раньше нуля и не дальше конца; на другую дорожку — только того же рода
export function moveClip(p, c, at, trId = c.tr, grid = 1) {
  const to = p.tracks.find((t) => t.id === trId), from = trackOf(p, c);
  if (to && from && to.kind === from.kind) c.tr = to.id;
  c.at = Math.min(SONG_BARS_MAX * p.num - c.len, snapBeat(at, grid));
}
// Длина за правый край: по сетке, не меньше шага
export function resizeClip(p, c, len, grid = 1) { c.len = Math.max(grid, Math.min(SONG_BARS_MAX * p.num - c.at, Math.round(len / grid) * grid)); }
// Левый край: начало двигается, конец стоит; у записи сдвигается и место в файле (обрезка начала)
export function trimClipStart(p, c, at, grid = 1) {
  const end = c.at + c.len, nat = Math.max(0, Math.min(end - grid, snapBeat(at, grid)));
  if (c.data && c.data.fileId !== undefined) c.data.off = Math.max(0, (c.data.off || 0) + (nat - c.at) * secPerBeat(p));
  c.at = nat; c.len = end - nat;
}
// Копия клипа на дорожку tr (того же рода) с доли at — вставка из буфера
export function pasteClip(p, src, tr, at, grid = 1) {
  if (p.clips.length >= CLIPS_MAX || !src || tr.kind !== src.kind) return null;
  const c = newClip(p, tr, snapBeat(at, grid), src.len, JSON.parse(JSON.stringify(src.data)));
  c.gain = src.gain == null ? 1 : src.gain; c.mute = false;
  c.at = Math.min(SONG_BARS_MAX * p.num - c.len, c.at);
  p.clips.push(c); p.clips.sort((a, b) => a.at - b.at);
  return c;
}
// Слепок клипа для буфера обмена (род дорожки — чтобы вставлять только на такую же)
export const clipCopy = (p, c) => ({ kind: trackOf(p, c).kind, len: c.len, gain: c.gain, data: JSON.parse(JSON.stringify(c.data)) });
// Петля: отрезок [a, b) в долях (по сетке), не короче шага; a ≥ b или не числа — снять
export function setRegion(p, a, b, grid = 1) {
  const A = snapBeat(Math.min(a, b), grid), B = snapBeat(Math.max(a, b), grid);
  p.region = Number.isFinite(A) && Number.isFinite(B) && B - A >= Math.min(grid, STEP) ? { a: A, b: Math.min(SONG_BARS_MAX * p.num, B) } : null;
  return p.region;
}
// Отрезок, который играет по кругу: петля или вся песня (один клип — его длина)
export const loopOf = (p, onlyClip = null) => (onlyClip ? { a: 0, b: onlyClip.len } : p.region && p.region.b > p.region.a ? { a: p.region.a, b: p.region.b } : { a: 0, b: songBeats(p) });
// Маркер: место в песне с названием; в той же доле — заменяется
export function setMark(p, t, name = '') {
  const T = Math.max(0, Math.round(t * 64) / 64);
  p.marks = (p.marks || []).filter((m) => Math.abs(m.t - T) > 1e-6);
  p.marks.push({ t: T, name: String(name || '').slice(0, 30) });
  p.marks.sort((a, b) => a.t - b.t);
  return p.marks.at(-1);
}
export const removeMark = (p, m) => { p.marks = (p.marks || []).filter((x) => x !== m); };
export const markAt = (p, t, tol = 0.5) => (p.marks || []).find((m) => Math.abs(m.t - t) <= tol) || null;
// Клип на дорожке в доле t (или null)
export const clipAt = (p, tr, t) => clipsOf(p, tr).find((c) => t >= c.at && t < c.at + c.len) || null;
// Разрезать клип в доле t на два
export function splitClip(p, c, t, grid = 1) {
  const cut = snapBeat(t, grid);
  if (cut <= c.at || cut >= c.at + c.len || p.clips.length >= CLIPS_MAX) return null;
  const n = { ...c, id: 'cl' + uid(), at: cut, len: c.at + c.len - cut, data: JSON.parse(JSON.stringify(c.data)) };
  if (n.data.fileId !== undefined) n.data.off = (c.data.off || 0) + (cut - c.at) * secPerBeat(p);
  c.len = cut - c.at;
  p.clips.push(n); p.clips.sort((a, b) => a.at - b.at);
  return n;
}

/* ---------- ноты (содержимое d = { bars, notes }) ---------- */

// Добавить или снять ноту в клетке (t — доля с сеткой, m — высота): есть такая — убирается, иначе — ставится длиной len
export function toggleNote(d, t, m, len) {
  const i = d.notes.findIndex((n) => n.m === m && t >= n.t && t < n.t + n.d);
  if (i >= 0) { d.notes.splice(i, 1); return null; }
  const n = { t, d: len, m, v: 0.8 };
  d.notes.push(n);
  d.notes.sort((a, b) => a.t - b.t || a.m - b.m);
  return n;
}
export const noteAt = (d, t, m) => d.notes.find((n) => n.m === m && t >= n.t && t < n.t + n.d) || null;
// Сдвинуть ноту в пределах куска (total — его длина в долях), новую длину — не меньше сетки
export function moveNote(total, n, dt, dm, grid) {
  n.t = Math.max(0, Math.min(total - n.d, Math.round((n.t + dt) / grid) * grid));
  n.m = Math.max(NOTE_LO, Math.min(NOTE_HI, Math.round(n.m + dm)));
}
export function resizeNote(total, n, len, grid) { n.d = Math.max(grid, Math.min(total - n.t, Math.round(len / grid) * grid)); }
// Квантовать: начала нот — к сетке (длина не короче сетки, в пределах куска); совпавшие — слить
export function quantizeNotes(d, grid, total) {
  d.notes.forEach((n) => { n.t = Math.max(0, Math.min(total - grid, Math.round(n.t / grid) * grid)); n.d = Math.max(grid, Math.min(total - n.t, Math.round(n.d / grid) * grid)); });
  const seen = new Set();
  d.notes = d.notes.filter((n) => { const k = n.t + ':' + n.m; if (seen.has(k)) return false; seen.add(k); return true; }).sort((a, b) => a.t - b.t || a.m - b.m);
  return d;
}
// Сыгранная нота (время в долях куска, без сетки) → в кусок: начало к сетке, длина не короче сетки; по кругу куска
export function addPlayedNote(d, total, t, dur, m, v = 0.8, grid = 0.25) {
  const T = ((Math.round(t / grid) * grid) % total + total) % total, D = Math.max(grid, Math.min(total - T, Math.round(dur / grid) * grid || grid));
  const i = d.notes.findIndex((n) => n.m === m && Math.abs(n.t - T) < 1e-6);
  const n = { t: T, d: D, m, v: Math.max(0.05, Math.min(1, v)) };
  if (i >= 0) d.notes[i] = n; else d.notes.push(n);
  d.notes.sort((a, b) => a.t - b.t || a.m - b.m);
  return n;
}

/* ---------- аккорды (содержимое d = { bars, chords }) ---------- */

// Аккорды тональности по ступеням — для быстрого выбора: [{ pc, type, label }]
export function diatonicChords(key, sev = false) {
  const k = keyInfo(key.pc, key.minor, sev), ivs = key.minor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
  return k.chords.map((c, i) => ({ pc: (key.pc + ivs[i]) % 12, type: typeOfName(c.name), label: c.name, rn: c.rn }));
}
function typeOfName(name) {
  const suf = name.replace(/^[A-G][♯♭]?/, '');
  const m = { '': 'maj', m: 'min', '°': 'dim', '+': 'aug', maj7: 'maj7', 7: '7', m7: 'm7', 'm7♭5': 'm7b5' };
  return m[suf] || 'maj';
}
export const chordNotes = (pc, type) => ((CHORDS.find((c) => c[0] === type) || CHORDS[0])[2]).map((iv) => pc + iv);
export const chordName = (pc, type, minorNames = false) => (minorNames ? MIN_NAMES : MAJ_NAMES)[pc] + (CHORDS.find((c) => c[0] === type) || CHORDS[0])[1];

// Поставить аккорд с доли t длиной len: что перекрывается — укорачивается или убирается
export function setChord(d, t, len, pc, type) {
  const keep = [];
  d.chords.forEach((c) => {
    if (c.t + c.d <= t || c.t >= t + len) keep.push(c); // не пересекается
    else if (c.t < t) keep.push({ ...c, d: t - c.t }); // начался раньше — укоротить
  });
  keep.push({ t, d: len, pc, type });
  d.chords = keep.sort((a, b) => a.t - b.t);
}
export const chordAt = (d, t) => d.chords.find((c) => t >= c.t && t < c.t + c.d) || null;
export function removeChord(d, c) { d.chords = d.chords.filter((x) => x !== c); }

// Развернуть аккорды куска в ноты по режиму дорожки. base — октава (MIDI тоники): 48 — малая
export function expandChords(d, tr, p, base = 48) {
  const out = [], step = (tr.arp && tr.arp.step) || 0.5, dir = (tr.arp && tr.arp.dir) || 'up', oct = 12 * (tr.oct || 0);
  d.chords.forEach((c) => {
    const ns = chordNotes(c.pc, c.type).map((m) => base + oct + m);
    if (tr.mode === 'hold') ns.forEach((m) => out.push({ t: c.t, d: c.d, m, v: 0.7 }));
    else if (tr.mode === 'rhythm') { for (let t = c.t; t < c.t + c.d - 1e-6; t += 1) ns.forEach((m) => out.push({ t, d: Math.min(0.5, c.t + c.d - t), m, v: t % p.num === 0 ? 0.8 : 0.6 })); }
    else {
      const seq = dir === 'up' ? ns : dir === 'down' ? ns.slice().reverse() : ns.concat(ns.slice(1, -1).reverse());
      let i = 0;
      for (let t = c.t; t < c.t + c.d - 1e-6; t += step, i++) out.push({ t, d: Math.min(step, c.t + c.d - t), m: seq[i % seq.length], v: 0.7 });
    }
  });
  return out;
}

/* ---------- ударные (содержимое d = { bars, steps: { lane: [i…] } }) ---------- */

export const stepOn = (d, lane, i) => !!(d.steps[lane] && d.steps[lane].includes(i));
export function setStep(d, lane, i, on) {
  const a = d.steps[lane] || (d.steps[lane] = []), k = a.indexOf(i);
  if (on && k < 0) { a.push(i); a.sort((x, y) => x - y); }
  if (!on && k >= 0) a.splice(k, 1);
  if (!a.length) delete d.steps[lane];
}
export function toggleStep(d, lane, i) { const on = !stepOn(d, lane, i); setStep(d, lane, i, on); return on; }
export const clearLane = (d, lane) => { delete d.steps[lane]; };
// Удары → ноты для проигрывания: сильные доли громче
export const drumNotes = (d) => DRUMS.flatMap((lane) => (d.steps[lane] || []).map((i) => ({ t: i * STEP, d: STEP, drum: lane, m: DRUM_MIDI[lane], v: i % 4 === 0 ? 0.9 : 0.7 })));

/* ---------- клип и песня ---------- */

// Ноты одного прохода куска (с октавой дорожки), в пределах куска
export function dataNotes(p, tr, d) {
  const total = dataBeats(p, d);
  if (!d || tr.kind === 'audio' || !total) return [];
  const ns = tr.kind === 'chords' ? expandChords(d, tr, p) : tr.kind === 'drums' ? drumNotes(d) : d.notes.map((n) => ({ ...n, m: n.m + 12 * (tr.oct || 0) }));
  return ns.filter((n) => n.t < total).map((n) => (n.t + n.d > total ? { ...n, d: total - n.t } : n));
}
// Ноты клипа в долях песни: кусок повторяется на всю длину клипа, за концом клипа — срезается
export function clipNotes(p, tr, c) {
  const one = dataNotes(p, tr, c.data), per = dataBeats(p, c.data), out = [];
  if (!one.length || !per) return out;
  for (let off = 0; off < c.len - 1e-6; off += per) one.forEach((n) => { if (n.t + off < c.len) out.push({ ...n, t: n.t + off + c.at, d: Math.min(n.d, c.len - off - n.t) }); });
  return out;
}
// Все ноты для звука: вся песня или один клип (onlyClip — от его начала, время с нуля); у каждой ноты — её дорожка (tr)
export function songNotes(p, onlyClip = null) {
  const out = [];
  (onlyClip ? [onlyClip] : p.clips).forEach((c) => { const tr = trackOf(p, c); if (tr && (!c.mute || onlyClip)) clipNotes(p, tr, c).forEach((n) => out.push({ ...n, t: onlyClip ? n.t - c.at : n.t, tr, gain: c.gain == null ? 1 : c.gain })); });
  return out.sort((a, b) => a.t - b.t || a.m - b.m);
}

// Проект → события MIDI (src/music/midi.js: { t сек, k, id, m, v }) для файла .mid; ударные — нотами General MIDI
export function projectEvents(p, onlyClip = null) {
  const spb = secPerBeat(p), ev = [];
  let id = 0;
  songNotes(p, onlyClip).forEach((n) => { if (n.tr.mute) return; const g = 'n' + id++; ev.push({ t: n.t * spb, k: 'on', id: g, m: n.m, v: Math.min(1, n.v * n.tr.vol * (n.gain || 1)) }); ev.push({ t: (n.t + n.d) * spb, k: 'off', id: g }); });
  return ev.sort((a, b) => a.t - b.t || (a.k === 'off' ? -1 : 1));
}

/* ---------- обмен со студиями (DAW): дорожки проекта и проект из чужой песни ---------- */

// Инструмент General MIDI для звука дорожки (в чужой студии зазвучит похоже)
export const GM_PROGRAM = { piano: 0, wfelt: 0, wkpad: 4, wair: 89, wlight: 88, wwarm: 89, wchoir: 52, wflute: 73, organ: 19, fmep: 5, abass: 33, bell: 14, sine: 80, sample: 0 };
// Звук дорожки по инструменту General MIDI (чужая песня → наш звук)
export function instOfProgram(pr) {
  if (pr == null) return 'piano';
  if (pr >= 32 && pr <= 39) return 'abass';
  if (pr >= 88 && pr <= 95) return 'wair';
  if (pr >= 16 && pr <= 23) return 'organ';
  if (pr >= 52 && pr <= 54) return 'wchoir';
  if (pr >= 72 && pr <= 79) return 'wflute';
  if (pr === 4 || pr === 5) return 'fmep';
  if ((pr >= 8 && pr <= 15) || pr === 112) return 'bell';
  if (pr >= 80 && pr <= 87) return 'sine';
  return 'piano';
}
// Ряд ударных по ноте General MIDI (канал 10) или по названию (сэмплы FL Studio: «Kick», «Clap»…)
export function laneOf(m, name = '') {
  const s = String(name).toLowerCase();
  if (/kick|бочк|bd\b|bass ?drum/.test(s)) return 'kick';
  if (/snare|малый|sd\b|rim/.test(s)) return 'snare';
  if (/open|откр|oh\b/.test(s) && /hat|hh|хэт/.test(s)) return 'ohat';
  if (/hat|hh|хэт|shaker|tamb/.test(s)) return 'hat';
  if (/clap|хлоп|snap/.test(s)) return 'clap';
  if (m == null) return null;
  if (m === 35 || m === 36 || (m >= 41 && m <= 45) || m === 47) return 'kick'; // бочка и томы
  if (m === 37 || m === 38 || m === 40) return 'snare';
  if (m === 39) return 'clap';
  if (m === 46 || m === 49 || m === 51 || m === 52 || m === 55 || m === 57 || m === 59) return 'ohat'; // открытый хэт, тарелки
  return 'hat';
}
// Дорожки песни для файла .mid: ноты по всей песне со свингом (как звучит в приложении), ударные — ноты GM
export function projectTracks(p, { swing = true } = {}) {
  const all = songNotes(p), sw = (t) => (swing && Math.abs(t % 1 - 0.5) < 1e-6 ? p.swing / 3 : 0);
  return p.tracks.filter((tr) => tr.kind !== 'audio').map((tr, i) => ({
    name: tr.name || tr.kind + ' ' + (i + 1), drums: tr.kind === 'drums', inst: tr.inst, program: tr.kind === 'drums' ? null : GM_PROGRAM[tr.inst] ?? 0,
    notes: all.filter((n) => n.tr === tr).map((n) => ({ t: n.t + sw(n.t), d: n.d, m: n.m, v: Math.min(1, n.v * tr.vol * (n.gain || 1)) })),
  }));
}
// Разделённая запись (модуль «Дорожки») → проект: четыре дорожки-записи, у каждой клип на всю длину (темп 90,
// длина — целыми тактами). stems — [{ part, fileId, dur, name? }]: name — подпись дорожки на языке интерфейса, иначе ключ части
export function projectFromStems(name, stems, { songId = null, bpm = 90 } = {}) {
  const p = newProject({ name: String(name || '').replace(/\.[a-z0-9]+$/i, '').slice(0, 40), bpm, songId });
  p.tracks = [];
  const colors = { vocals: '#A95E72', drums: '#B5533C', bass: '#567198', other: '#5F8568', guitar: '#9C7242', piano: '#646493', inst: '#5F8568' };
  stems.forEach((s, i) => {
    const tr = newTrack('audio', i, { name: String(s.name || s.part).slice(0, 30), color: colors[s.part] || COLORS[i % COLORS.length] });
    p.tracks.push(tr);
    const beats = Math.max(p.num, Math.ceil((s.dur || 1) / secPerBeat(p) / p.num - 1e-6) * p.num);
    p.clips.push(newClip(p, tr, 0, beats, { fileId: s.fileId, off: 0 }));
  });
  return normalizeProject(p);
}
// Чужая песня (из .mid или файла студии: { name, bpm, num, den, key?, tracks: [{ name, drums, program?, notes: [{ t, d, m, v }] }] },
// время — в долях проекта) → наш проект: дорожка — один клип на всю её длину (кусок = вся партия, до 64 тактов на клип,
// дальше — следующий клип)
export function projectFromSong(song) {
  const p = newProject({ name: String(song.name || '').slice(0, 40), bpm: song.bpm || 120, num: song.num || 4, den: song.den || 4 });
  if (song.key) p.key = { pc: ((song.key.pc % 12) + 12) % 12, minor: !!song.key.minor };
  p.tracks = [];
  const src = (song.tracks || []).filter((t) => t.notes && t.notes.length);
  src.forEach((t, i) => p.tracks.push(newTrack(t.drums ? 'drums' : 'notes', i, { name: String(t.name || '').slice(0, 30), inst: t.drums ? 'piano' : instOfProgram(t.program) })));
  const chunk = BARS_MAX * p.num;
  src.forEach((t, i) => {
    const tr = p.tracks[i], end = Math.max(1, ...t.notes.map((n) => n.t + n.d)), count = Math.ceil(end / chunk - 1e-6);
    const clips = Array.from({ length: count }, (_, k) => { const bars = Math.min(BARS_MAX, Math.ceil(end / p.num - 1e-6) - k * BARS_MAX); return newClip(p, tr, k * chunk, bars * p.num, newData(tr.kind, bars)); });
    t.notes.forEach((n) => {
      let t0 = n.t, left = n.d;
      while (left > 1e-6) { // нота через границу клипа делится
        const k = Math.floor(t0 / chunk), c = clips[k];
        if (!c) break;
        const off = t0 - c.at, d = Math.min(left, c.len - off);
        if (d <= 1e-6) break;
        if (tr.kind === 'drums') { const lane = laneOf(n.m, n.lane); if (lane) setStep(c.data, lane, Math.round(off / STEP), true); }
        else c.data.notes.push({ t: Math.round(off * 64) / 64, d: Math.round(d * 64) / 64, m: Math.round(n.m), v: n.v == null ? 0.8 : Math.max(0.05, Math.min(1, n.v)) });
        t0 += d; left -= d;
        if (tr.kind === 'drums') break;
      }
    });
    clips.forEach((c) => { if (countOf(tr, c.data)) p.clips.push(c); });
  });
  return normalizeProject(p);
}
