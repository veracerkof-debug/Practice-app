// Студия-черновик: проект песни — темп, размер, тональность, такты, дорожки. Чистые функции, без звука и DOM.
// Дорожка нот: { kind: 'notes', notes: [{ t, d, m, v }] } — t и d в долях от начала (не в тактах), m — высота MIDI.
// Дорожка аккордов: { kind: 'chords', chords: [{ t, d, pc, type }], mode: 'hold' | 'rhythm' | 'arp', arp: { dir, step } }
// Дорожка-петля: { kind: 'audio', fileId } — запись из медиатеки (сведение лупера), звучит по кругу с первого такта.
// — аккорды разворачиваются в ноты (expandChords), остальное у дорожек общее: инструмент (звук пианино), название,
// цвет, громкость, тишина, соло. Время всегда в долях: смена темпа ничего не двигает.
import { uid } from '../core/time.js';
import { CHORDS, keyInfo } from './theory.js';
import { MAJ_NAMES, MIN_NAMES } from './notes.js';

export const INSTRUMENTS = ['piano', 'wfelt', 'wkpad', 'wair', 'wlight', 'wwarm', 'wchoir', 'wflute', 'organ', 'fmep', 'abass', 'bell', 'sine'];
export const COLORS = ['#567198', '#5F8568', '#B5533C', '#9C7242', '#646493', '#A95E72', '#3E8C8C', '#8E8E93'];
export const MODES = ['hold', 'rhythm', 'arp'];
export const ARP_DIRS = ['up', 'down', 'updown'];
export const GRIDS = [1, 0.5, 0.25]; // сетка: доля, половина, четверть доли
export const BARS_MAX = 64, NOTE_LO = 24, NOTE_HI = 96;

export function newProject(patch = {}) {
  return { id: 'pj' + uid(), name: '', bpm: 90, num: 4, den: 4, key: { pc: 0, minor: false }, bars: 4, songId: null, loop: true,
    tracks: [newTrack('chords', 0), newTrack('notes', 1)], createdAt: Date.now(), updatedAt: Date.now(), ...patch };
}
export function newTrack(kind = 'notes', i = 0, patch = {}) {
  const base = { id: 'tr' + uid(), kind, name: '', color: COLORS[i % COLORS.length], inst: kind === 'chords' ? 'wair' : i === 1 ? 'abass' : 'piano', vol: 0.9, mute: false, solo: false, oct: 0 };
  if (kind === 'audio') return { ...base, inst: 'piano', fileId: null, ...patch }; // дорожка-петля: запись из медиатеки (лупер), по кругу с первого такта
  return kind === 'chords' ? { ...base, chords: [], mode: 'hold', arp: { dir: 'up', step: 0.5 }, ...patch } : { ...base, notes: [], ...patch };
}
export const beatsOf = (p) => p.bars * p.num;
export const secPerBeat = (p) => 60 / p.bpm;

// Привести проект в порядок: границы, числа, порядок нот (после загрузки копии или правки)
export function normalizeProject(p) {
  p.bpm = Math.max(20, Math.min(300, Math.round(+p.bpm || 90)));
  p.num = Math.max(1, Math.min(12, Math.round(+p.num || 4)));
  p.den = [2, 4, 8].includes(+p.den) ? +p.den : 4;
  p.bars = Math.max(1, Math.min(BARS_MAX, Math.round(+p.bars || 4)));
  p.key = p.key && Number.isFinite(+p.key.pc) ? { pc: ((+p.key.pc % 12) + 12) % 12, minor: !!p.key.minor } : { pc: 0, minor: false };
  p.tracks = (p.tracks || []).filter((t) => t && t.id).map((t) => {
    t.vol = Math.max(0, Math.min(1.5, +t.vol || 0)); t.oct = Math.max(-2, Math.min(2, Math.round(+t.oct || 0)));
    if (!INSTRUMENTS.includes(t.inst)) t.inst = 'piano';
    if (t.kind === 'audio') { t.fileId = t.fileId || null; return t; }
    if (t.kind === 'chords') { t.chords = (t.chords || []).filter((c) => c && c.d > 0).sort((a, b) => a.t - b.t); if (!MODES.includes(t.mode)) t.mode = 'hold'; t.arp = { dir: ARP_DIRS.includes(t.arp && t.arp.dir) ? t.arp.dir : 'up', step: [1, 0.5, 0.25].includes(t.arp && t.arp.step) ? t.arp.step : 0.5 }; }
    else { t.kind = 'notes'; t.notes = (t.notes || []).filter((n) => n && n.d > 0 && n.m >= 0 && n.m <= 127).sort((a, b) => a.t - b.t || a.m - b.m); }
    return t;
  });
  return p;
}

/* ---------- ноты ---------- */

// Добавить или снять ноту в клетке (t — доля с сеткой, m — высота): есть такая — убирается, иначе — ставится длиной d
export function toggleNote(track, t, m, d) {
  const i = track.notes.findIndex((n) => n.m === m && t >= n.t && t < n.t + n.d);
  if (i >= 0) { track.notes.splice(i, 1); return null; }
  const n = { t, d, m, v: 0.8 };
  track.notes.push(n);
  track.notes.sort((a, b) => a.t - b.t || a.m - b.m);
  return n;
}
export const noteAt = (track, t, m) => track.notes.find((n) => n.m === m && t >= n.t && t < n.t + n.d) || null;
// Сдвинуть ноту (в пределах проекта), новую длину — не меньше сетки
export function moveNote(p, n, dt, dm, grid) {
  n.t = Math.max(0, Math.min(beatsOf(p) - n.d, Math.round((n.t + dt) / grid) * grid));
  n.m = Math.max(NOTE_LO, Math.min(NOTE_HI, Math.round(n.m + dm)));
}
export function resizeNote(p, n, d, grid) { n.d = Math.max(grid, Math.min(beatsOf(p) - n.t, Math.round(d / grid) * grid)); }

/* ---------- аккорды ---------- */

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

// Поставить аккорд с доли t длиной d: что перекрывается — укорачивается или убирается
export function setChord(track, t, d, pc, type) {
  const keep = [];
  track.chords.forEach((c) => {
    if (c.t + c.d <= t || c.t >= t + d) keep.push(c); // не пересекается
    else if (c.t < t) keep.push({ ...c, d: t - c.t }); // начался раньше — укоротить
  });
  keep.push({ t, d, pc, type });
  track.chords = keep.sort((a, b) => a.t - b.t);
}
export const chordAt = (track, t) => track.chords.find((c) => t >= c.t && t < c.t + c.d) || null;
export function removeChord(track, c) { track.chords = track.chords.filter((x) => x !== c); }

// Развернуть дорожку аккордов в ноты по режиму. base — октава (MIDI тоники): 48 — малая
export function expandChords(track, p, base = 48) {
  const out = [], step = (track.arp && track.arp.step) || 0.5, dir = (track.arp && track.arp.dir) || 'up';
  const oct = 12 * (track.oct || 0);
  track.chords.forEach((c) => {
    const ns = chordNotes(c.pc, c.type).map((m) => base + oct + m);
    if (track.mode === 'hold') ns.forEach((m) => out.push({ t: c.t, d: c.d, m, v: 0.7 }));
    else if (track.mode === 'rhythm') { for (let t = c.t; t < c.t + c.d - 1e-6; t += 1) ns.forEach((m) => out.push({ t, d: Math.min(0.5, c.t + c.d - t), m, v: t % p.num === 0 ? 0.8 : 0.6 })); }
    else {
      const seq = dir === 'up' ? ns : dir === 'down' ? ns.slice().reverse() : ns.concat(ns.slice(1, -1).reverse());
      let i = 0;
      for (let t = c.t; t < c.t + c.d - 1e-6; t += step, i++) out.push({ t, d: Math.min(step, c.t + c.d - t), m: seq[i % seq.length], v: 0.7 });
    }
  });
  return out;
}

// Все ноты дорожки для звука (с октавой дорожки)
export const trackNotes = (track, p) => (track.kind === 'audio' ? [] : track.kind === 'chords' ? expandChords(track, p) : track.notes.map((n) => ({ ...n, m: n.m + 12 * (track.oct || 0) })));

// Проект → события MIDI (src/music/midi.js: { t сек, k, id, m, v }) для файла .mid
export function projectEvents(p) {
  const spb = secPerBeat(p), ev = [];
  let id = 0;
  p.tracks.forEach((tr) => { if (tr.mute) return; trackNotes(tr, p).forEach((n) => { const g = 'n' + id++; ev.push({ t: n.t * spb, k: 'on', id: g, m: n.m, v: n.v * tr.vol }); ev.push({ t: (n.t + n.d) * spb, k: 'off', id: g }); }); });
  return ev.sort((a, b) => a.t - b.t || (a.k === 'off' ? -1 : 1));
}
