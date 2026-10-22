// Токены YourMT3+ (модель снятия нот компьютера, src-tauri/src/notes.rs) → ноты по инструментам. Чистые функции.
// Перенос декодера оригинала (YourMT3, GPL-3.0: utils/event2note.py, utils/note2event.py) строка в строку — сверено
// с ним на записи с роялем, басом и ударными (tests/mt3.test.js, tests/fixtures/ymt-dense.json).
// Запись режется на куски по 32767 отсчётов 16 кГц (≈ 2,05 с); у каждого куска 13 каналов (группы инструментов),
// в канале — своя последовательность: сначала «связки» (ноты, звучащие с прошлого куска), токен tie, затем события:
// сдвиг (время от начала куска, сотые секунды), программа, сила (0 — снять, 1 — нажать), высота; ударные — отдельно.

export const SEG = 32767, SR = 16000, TPS = 100, CHANNELS = 13;
const SHIFT = 3, PITCH = 209, VEL = 337, TIE = 339, PROG = 340, DRUM = 468, END = 596, EOS = 1;
const MIN_OFF = 0.01;

// Токен → событие
export function tokenEvent(tok) {
  if (tok === 0) return { type: 'PAD', value: 0 };
  if (tok === EOS) return { type: 'EOS', value: 0 };
  if (tok === 2) return { type: 'UNK', value: 0 };
  if (tok < PITCH) return { type: 'shift', value: tok - SHIFT };
  if (tok < VEL) return { type: 'pitch', value: tok - PITCH };
  if (tok < TIE) return { type: 'velocity', value: tok - VEL };
  if (tok === TIE) return { type: 'tie', value: 0 };
  if (tok < DRUM) return { type: 'program', value: tok - PROG };
  if (tok < END) return { type: 'drum', value: tok - DRUM };
  return { type: 'UNK', value: 0 };
}

// round() Питона — к чётному на половине (начало куска в тиках)
const roundEven = (x) => { const f = Math.floor(x), d = x - f; return d > 0.5 ? f + 1 : d < 0.5 ? f : (f % 2 === 0 ? f : f + 1); };
const cmp = (...keys) => (a, b) => { for (const k of keys) { const x = k(a), y = k(b); if (x < y) return -1; if (x > y) return 1; } return 0; };
const num = (b) => (b ? 1 : 0);
const sameAct = (a, p, m) => a[0] === p && a[1] === m;

// Кусок одного канала → { ne: события нот, tie: связки, last: что звучит в конце [[программа, высота]] }
export function decodeSegment(tokens, start) {
  const ev = tokens.map(tokenEvent);
  let tieAt = -1, prog = null;
  const tie = [], last = [];
  for (let i = 0; i < ev.length; i++) {
    const e = ev[i];
    if (e.type === 'tie') { tieAt = i; break; }
    if (e.type === 'shift') break;
    if (e.type === 'program') prog = e.value;
    else if (e.type === 'pitch') { if (prog == null) continue; tie.push({ drum: false, prog, time: null, vel: 1, m: e.value }); last.push([prog, e.value]); }
  }
  if (tieAt < 0) return { ne: [], tie: [], last: [] };
  const ne = [], t0 = roundEven(start * TPS);
  let tick = t0, vel = null;
  for (const e of ev.slice(tieAt + 1)) {
    if (e.type === 'shift') { if (e.value > 0 && e.value <= 1000) tick = t0 + e.value; }
    else if (e.type === 'drum') ne.push({ drum: true, prog: 128, time: tick / TPS, vel: 1, m: e.value });
    else if (e.type === 'program') prog = e.value;
    else if (e.type === 'velocity') vel = e.value;
    else if (e.type === 'pitch') {
      if (prog == null || vel == null) continue;
      if (vel > 0) last.push([prog, e.value]);
      else { const j = last.findIndex((a) => sameAct(a, prog, e.value)); if (j < 0) continue; last.splice(j, 1); }
      ne.push({ drum: false, prog, time: tick / TPS, vel, m: e.value });
    } else if (e.type === 'EOS') break;
  }
  ne.sort(cmp((n) => n.time, (n) => num(n.drum), (n) => n.prog, (n) => n.vel, (n) => n.m));
  return { ne, tie, last };
}

// Убрать наложения одной высоты одного инструмента и нулевые ноты
export function trimOverlap(notes) {
  if (notes.length <= 1) return notes;
  const groups = new Map();
  notes.forEach((n) => { const k = n.m + '|' + n.prog + '|' + n.drum; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(n); });
  const out = [];
  for (const g of groups.values()) {
    g.sort(cmp((n) => n.on));
    for (let i = 1; i < g.length; i++) if (g[i - 1].off > g[i].on) g[i - 1].off = g[i].on;
    out.push(...g.filter((n) => n.on < n.off));
  }
  return out.sort(cmp((n) => n.on, (n) => num(n.drum), (n) => n.prog, (n) => n.vel, (n) => n.m));
}
function validate(notes) {
  notes.forEach((n) => {
    if (n.on > n.off) n.off = Math.max(n.off, n.on + MIN_OFF);
    else if (!n.drum && n.off - n.on < 0.01) n.off = n.on + MIN_OFF;
  });
  return notes;
}

// События нот → ноты { on, off, m, prog, drum, vel }
export function eventsToNotes(events) {
  const notes = [], act = new Map();
  events.sort(cmp((n) => n.time, (n) => num(n.drum), (n) => n.m, (n) => n.vel, (n) => n.prog));
  for (const e of events) {
    if (e.time == null) continue;
    if (e.drum) { if (e.vel === 1) notes.push({ drum: true, prog: 128, on: e.time, off: e.time + MIN_OFF, m: e.m, vel: 1 }); continue; }
    const k = e.m + '|' + e.prog, a = act.get(k);
    if (e.vel === 1) { if (a) { act.delete(k); notes.push({ drum: false, prog: a.prog, on: a.time, off: e.time, m: a.m, vel: a.vel }); } act.set(k, e); }
    else if (e.vel === 0 && a) { act.delete(k); notes.push({ drum: false, prog: a.prog, on: a.time, off: e.time, m: a.m, vel: a.vel }); }
  }
  for (const e of act.values()) if (e.vel === 1 && e.time != null) notes.push({ drum: false, prog: e.prog, on: e.time, off: e.time + MIN_OFF, m: e.m, vel: 1 });
  notes.forEach((n) => { if (n.off - n.on > 10) n.off = n.on + MIN_OFF; });
  notes.sort(cmp((n) => n.on, (n) => num(n.drum), (n) => n.prog, (n) => n.vel, (n) => n.m));
  return trimOverlap(validate(notes));
}

// Куски одного канала подряд → ноты: связка, которой нет в следующем куске, снимается в его начале
export function channelNotes(segs, { seg = SEG, sr = SR } = {}) {
  const all = [];
  let prev = null;
  segs.forEach((tokens, i) => {
    const start = (seg * i) / sr, d = decodeSegment(tokens, start);
    if (prev) for (const [p, m] of prev) if (!d.tie.some((x) => x.prog === p && x.m === m)) all.push({ drum: false, prog: p, time: start, vel: 0, m });
    all.push(...d.ne);
    prev = d.last;
  });
  return eventsToNotes(all);
}

// Все каналы: tokens[кусок][канал] → ноты всех инструментов вместе
export function decodeTokens(tokens, opts) {
  const per = [];
  for (let c = 0; c < CHANNELS; c++) per.push(channelNotes(tokens.map((s) => s[c] || []), opts));
  const mixed = per.flat().sort(cmp((n) => n.on, (n) => num(n.drum), (n) => n.prog, (n) => n.vel, (n) => n.m, (n) => n.off));
  return validate(trimOverlap(mixed));
}

// Группы инструментов модели (программы General MIDI) → партия: ключ, программа файла (первая в группе)
export const GROUPS = [
  ['piano', [0, 1, 3, 6, 7]], ['epiano', [2, 4, 5]], ['chrom', [8, 9, 10, 11, 12, 13, 14, 15]], ['organ', [16, 17, 18, 19, 20, 21, 22, 23]],
  ['guitar', [24, 25, 26, 27]], ['guitarDist', [30, 28, 29, 31]], ['bass', [33, 32, 34, 35, 36, 37, 38, 39]],
  ['strings', [48, 40, 41, 42, 43, 44, 45, 46, 47, 49, 50, 51, 52, 53, 54, 55]], ['brass', [56, 57, 58, 59, 60, 61, 62, 63]],
  ['reed', [64, 65, 66, 67, 68, 69, 70, 71]], ['pipe', [72, 73, 74, 75, 76, 77, 78, 79]], ['lead', [80, 81, 82, 83, 84, 85, 86, 87]],
  ['pad', [88, 89, 90, 91, 92, 93, 94, 95]], ['voice', [100]], ['choir', [101]],
];
// Голос в файле .mid — «голос»/«хор» General MIDI (у модели 100 и 101 — служебные номера)
const FILE_PROG = { voice: 53, choir: 52 };
// Струнные с грифом: партия получит табулатуру (строй — src/music/tabfinger.js)
export const FRETTED = { guitar: 'guitar', guitarDist: 'guitar', bass: 'bass' };

// Ноты → партии: [{ key, program, drum, notes: [{ t, d, m, v }] }] — по порядку групп, ударные последними
export function toParts(notes) {
  const by = new Map();
  for (const n of notes) {
    const key = n.drum ? 'drums' : (GROUPS.find(([, ps]) => ps.includes(n.prog)) || ['other'])[0];
    if (!by.has(key)) by.set(key, []);
    by.get(key).push({ t: n.on, d: Math.max(0.03, n.off - n.on), m: n.m, v: 0.8 });
  }
  const order = [...GROUPS.map(([k]) => k), 'other', 'drums'];
  return [...by.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0])).map(([key, ns]) => {
    const g = GROUPS.find(([k]) => k === key);
    return { key, drum: key === 'drums', program: key === 'drums' ? 0 : FILE_PROG[key] ?? (g ? g[1][0] : 0), notes: ns };
  });
}
