// Студия: проект песни по образцу FL Studio — дорожки (инструменты) и паттерны (короткие куски на несколько
// тактов), а песня — список паттернов по порядку (плейлист). Чистые функции, без звука и DOM.
// Дорожка: { id, kind: 'notes' | 'chords' | 'drums' | 'audio', name, color, inst, vol, mute, solo, oct, mode, arp, fileId }.
// Паттерн: { id, name, bars, data: { [trackId]: ячейка } } — ячейка по роду дорожки:
//   ноты    { notes: [{ t, d, m, v }] }   — t и d в долях от начала паттерна, m — высота MIDI;
//   аккорды { chords: [{ t, d, pc, type }] } — разворачиваются в ноты по режиму дорожки (hold | rhythm | arp);
//   ударные { steps: { kick: [i…], snare: [i…] … } } — номера шестнадцатых, где есть удар.
// Дорожка-петля (audio) — запись из медиатеки, звучит по кругу с начала; у неё нет ячеек.
// Время всегда в долях: смена темпа ничего не двигает. Свинг — отдельное число проекта (0…1).
import { uid } from '../core/time.js';
import { CHORDS, keyInfo } from './theory.js';
import { MAJ_NAMES, MIN_NAMES } from './notes.js';

export const INSTRUMENTS = ['piano', 'wfelt', 'wkpad', 'wair', 'wlight', 'wwarm', 'wchoir', 'wflute', 'organ', 'fmep', 'abass', 'bell', 'sine'];
export const COLORS = ['#567198', '#5F8568', '#B5533C', '#9C7242', '#646493', '#A95E72', '#3E8C8C', '#8E8E93'];
export const KINDS = ['notes', 'chords', 'drums', 'audio'];
export const MODES = ['hold', 'rhythm', 'arp'];
export const ARP_DIRS = ['up', 'down', 'updown'];
export const GRIDS = [1, 0.5, 0.25]; // сетка: доля, половина, четверть доли
export const DRUMS = ['kick', 'snare', 'hat', 'ohat', 'clap'];
export const DRUM_MIDI = { kick: 36, snare: 38, hat: 42, ohat: 46, clap: 39 }; // General MIDI, канал ударных
export const STEP = 0.25; // шаг ударных — шестнадцатая (четверть доли)
export const BARS_MAX = 32, PATTERNS_MAX = 16, SONG_MAX = 64, NOTE_LO = 24, NOTE_HI = 96;

export function newTrack(kind = 'notes', i = 0, patch = {}) {
  const base = { id: 'tr' + uid(), kind: KINDS.includes(kind) ? kind : 'notes', name: '', color: COLORS[i % COLORS.length],
    inst: kind === 'chords' ? 'wair' : kind === 'notes' && i === 1 ? 'abass' : 'piano', vol: 0.9, mute: false, solo: false, oct: 0 };
  if (kind === 'audio') return { ...base, fileId: null, ...patch };
  if (kind === 'chords') return { ...base, mode: 'hold', arp: { dir: 'up', step: 0.5 }, ...patch };
  return { ...base, ...patch };
}
export function newPattern(i = 0, bars = 4, patch = {}) {
  return { id: 'pt' + uid(), name: String.fromCharCode(65 + (i % 26)), bars, data: {}, ...patch };
}
export function newProject(patch = {}) {
  const pat = newPattern(0, patch.bars || 4);
  const p = { id: 'pj' + uid(), name: '', bpm: 90, num: 4, den: 4, key: { pc: 0, minor: false }, swing: 0, songId: null,
    tracks: [newTrack('drums', 2), newTrack('chords', 0), newTrack('notes', 1)], patterns: [pat], song: [pat.id], cur: pat.id,
    createdAt: Date.now(), updatedAt: Date.now(), ...patch };
  delete p.bars;
  return p;
}
export const secPerBeat = (p) => 60 / p.bpm;
export const patBeats = (p, pat) => (pat ? pat.bars : 4) * p.num;
export const patById = (p, id) => p.patterns.find((x) => x.id === id) || null;
export const curPattern = (p) => patById(p, p.cur) || p.patterns[0];
// Плейлист: [{ pat, off, beats }] — паттерн, его смещение в долях и длина; пустой плейлист = текущий паттерн
export function songList(p) {
  const out = [];
  let off = 0;
  (p.song.length ? p.song : [curPattern(p).id]).forEach((id) => { const pat = patById(p, id); if (!pat) return; const beats = patBeats(p, pat); out.push({ pat, off, beats }); off += beats; });
  return out;
}
export const songBeats = (p) => songList(p).reduce((s, x) => s + x.beats, 0);
export const songOffset = (p, i) => songList(p).slice(0, i).reduce((s, x) => s + x.beats, 0);

// Ячейка дорожки в паттерне (создаётся пустой); у дорожек-петель ячеек нет
export function cellOf(pat, tr) {
  if (tr.kind === 'audio') return null;
  let d = pat.data[tr.id];
  if (!d) d = pat.data[tr.id] = tr.kind === 'chords' ? { chords: [] } : tr.kind === 'drums' ? { steps: {} } : { notes: [] };
  return d;
}
export const countOf = (pat, tr) => {
  const d = pat.data[tr.id];
  if (!d) return 0;
  return tr.kind === 'chords' ? d.chords.length : tr.kind === 'drums' ? Object.values(d.steps).reduce((s, a) => s + a.length, 0) : d.notes.length;
};
export const isEmptyProject = (p) => p.patterns.every((pat) => p.tracks.every((tr) => !countOf(pat, tr))) && !p.tracks.some((t) => t.kind === 'audio' && t.fileId);

// Привести проект в порядок: границы, числа, порядок нот; старые проекты (ноты прямо в дорожках) → один паттерн
export function normalizeProject(p) {
  p.bpm = Math.max(20, Math.min(300, Math.round(+p.bpm || 90)));
  p.num = Math.max(1, Math.min(12, Math.round(+p.num || 4)));
  p.den = [2, 4, 8].includes(+p.den) ? +p.den : 4;
  p.swing = Math.max(0, Math.min(1, +p.swing || 0));
  p.key = p.key && Number.isFinite(+p.key.pc) ? { pc: ((+p.key.pc % 12) + 12) % 12, minor: !!p.key.minor } : { pc: 0, minor: false };
  p.tracks = (p.tracks || []).filter((t) => t && t.id).map((t) => {
    t.vol = Math.max(0, Math.min(1.5, +t.vol || 0)); t.oct = Math.max(-2, Math.min(2, Math.round(+t.oct || 0)));
    if (!INSTRUMENTS.includes(t.inst)) t.inst = 'piano';
    if (!KINDS.includes(t.kind)) t.kind = 'notes';
    if (t.kind === 'audio') t.fileId = t.fileId || null;
    if (t.kind === 'chords') { if (!MODES.includes(t.mode)) t.mode = 'hold'; t.arp = { dir: ARP_DIRS.includes(t.arp && t.arp.dir) ? t.arp.dir : 'up', step: [1, 0.5, 0.25].includes(t.arp && t.arp.step) ? t.arp.step : 0.5 }; }
    return t;
  });
  if (!Array.isArray(p.patterns) || !p.patterns.length) { // старый проект: ноты и аккорды лежали в дорожках
    const pat = newPattern(0, Math.max(1, Math.min(BARS_MAX, Math.round(+p.bars || 4))));
    p.tracks.forEach((t) => { if (t.notes) pat.data[t.id] = { notes: t.notes }; if (t.chords) pat.data[t.id] = { chords: t.chords }; delete t.notes; delete t.chords; });
    p.patterns = [pat]; p.song = [pat.id]; p.cur = pat.id;
  }
  delete p.bars; delete p.loop;
  p.patterns = p.patterns.filter((x) => x && x.id).slice(0, PATTERNS_MAX).map((pat, i) => {
    pat.bars = Math.max(1, Math.min(BARS_MAX, Math.round(+pat.bars || 4)));
    pat.name = String(pat.name || String.fromCharCode(65 + (i % 26))).slice(0, 12);
    pat.data = pat.data || {};
    const total = patBeats(p, pat), steps = total / STEP;
    for (const id of Object.keys(pat.data)) {
      const tr = p.tracks.find((t) => t.id === id), d = pat.data[id];
      if (!tr || tr.kind === 'audio' || !d) { delete pat.data[id]; continue; }
      if (tr.kind === 'chords') d.chords = ((d.chords || []).filter((c) => c && c.d > 0 && c.t < total).sort((a, b) => a.t - b.t));
      else if (tr.kind === 'drums') { const st = {}; DRUMS.forEach((l) => { const a = Array.from(new Set((d.steps && d.steps[l]) || [])).filter((i) => Number.isInteger(i) && i >= 0 && i < steps).sort((a, b) => a - b); if (a.length) st[l] = a; }); d.steps = st; }
      else d.notes = (d.notes || []).filter((n) => n && n.d > 0 && n.m >= 0 && n.m <= 127 && n.t < total).sort((a, b) => a.t - b.t || a.m - b.m);
    }
    return pat;
  });
  p.song = (p.song || []).filter((id) => patById(p, id)).slice(0, SONG_MAX);
  if (!patById(p, p.cur)) p.cur = p.patterns[0].id;
  return p;
}

/* ---------- ноты (ячейка d = { notes }) ---------- */

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
// Сдвинуть ноту в пределах паттерна (total — его длина в долях), новую длину — не меньше сетки
export function moveNote(total, n, dt, dm, grid) {
  n.t = Math.max(0, Math.min(total - n.d, Math.round((n.t + dt) / grid) * grid));
  n.m = Math.max(NOTE_LO, Math.min(NOTE_HI, Math.round(n.m + dm)));
}
export function resizeNote(total, n, len, grid) { n.d = Math.max(grid, Math.min(total - n.t, Math.round(len / grid) * grid)); }

/* ---------- аккорды (ячейка d = { chords }) ---------- */

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

// Развернуть аккорды ячейки в ноты по режиму дорожки. base — октава (MIDI тоники): 48 — малая
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

/* ---------- ударные (ячейка d = { steps: { lane: [i…] } }) ---------- */

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

/* ---------- паттерн и песня ---------- */

// Ноты дорожки в паттерне (с октавой дорожки), в пределах длины паттерна
export function patternNotes(p, pat, tr) {
  const d = pat.data[tr.id], total = patBeats(p, pat);
  if (!d || tr.kind === 'audio') return [];
  const ns = tr.kind === 'chords' ? expandChords(d, tr, p) : tr.kind === 'drums' ? drumNotes(d) : d.notes.map((n) => ({ ...n, m: n.m + 12 * (tr.oct || 0) }));
  return ns.filter((n) => n.t < total).map((n) => (n.t + n.d > total ? { ...n, d: total - n.t } : n));
}
// Все ноты для звука: одного паттерна (onlyPat) или всей песни по плейлисту; у каждой ноты — её дорожка (tr)
export function songNotes(p, onlyPat = null) {
  const out = [], list = onlyPat ? [{ pat: onlyPat, off: 0 }] : songList(p);
  list.forEach(({ pat, off }) => p.tracks.forEach((tr) => patternNotes(p, pat, tr).forEach((n) => out.push({ ...n, t: n.t + off, tr }))));
  return out.sort((a, b) => a.t - b.t || a.m - b.m);
}

export function addPattern(p, bars) {
  if (p.patterns.length >= PATTERNS_MAX) return null;
  const pat = newPattern(p.patterns.length, bars || curPattern(p).bars);
  p.patterns.push(pat); p.cur = pat.id;
  return pat;
}
export function clonePattern(p, pat) {
  if (p.patterns.length >= PATTERNS_MAX) return null;
  const c = newPattern(p.patterns.length, pat.bars, { name: (pat.name + "'").slice(0, 12), data: JSON.parse(JSON.stringify(pat.data)) });
  p.patterns.splice(p.patterns.indexOf(pat) + 1, 0, c); p.cur = c.id;
  return c;
}
export function removePattern(p, pat) {
  if (p.patterns.length <= 1) return false;
  p.patterns = p.patterns.filter((x) => x !== pat);
  p.song = p.song.filter((id) => id !== pat.id);
  if (p.cur === pat.id) p.cur = p.patterns[0].id;
  return true;
}
export function songAdd(p, pat, at = p.song.length) { if (p.song.length >= SONG_MAX) return false; p.song.splice(at, 0, pat.id); return true; }
export function songRemoveAt(p, i) { p.song.splice(i, 1); }
export function songMove(p, from, to) { const [id] = p.song.splice(from, 1); p.song.splice(to, 0, id); }

// Проект → события MIDI (src/music/midi.js: { t сек, k, id, m, v }) для файла .mid; ударные — нотами General MIDI
export function projectEvents(p, onlyPat = null) {
  const spb = secPerBeat(p), ev = [];
  let id = 0;
  songNotes(p, onlyPat).forEach((n) => { if (n.tr.mute) return; const g = 'n' + id++; ev.push({ t: n.t * spb, k: 'on', id: g, m: n.m, v: n.v * n.tr.vol }); ev.push({ t: (n.t + n.d) * spb, k: 'off', id: g }); });
  return ev.sort((a, b) => a.t - b.t || (a.k === 'off' ? -1 : 1));
}
