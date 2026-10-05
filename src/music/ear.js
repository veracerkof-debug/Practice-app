// Тренажёр слуха — логика без DOM: упражнения, уровни, генерация вопросов, план звучания, проверка ответов.
// Перенесено из legacy/practice.html (EIV, ECH, EDG, ELV, ERNG, EC, earGen, earPlay, earCompare, nt*, earPitch).
// Случайность передаётся снаружи (rnd), порядок вызовов — как в прототипе: так генерацию можно сверить тестом.
import { MAJI, NAT_MIN } from './notes.js';
import { SCALES } from './theory.js';

// Упражнения: id и цвет; названия — i18n sec.<id>
export const DRILLS = [['iv', '#34C759'], ['ch', '#007AFF'], ['sc', '#5856D6'], ['dg', '#FF9500'], ['nt', '#AF52DE'], ['dc', '#FF2D55'], ['pt', '#30B0C7']];
export const DRILL_IDS = DRILLS.map((d) => d[0]);

// Интервалы: полутоны (названия — i18n ivs.<n>, iv.<n> модуля «Теория»-подобные, свои у тренажёра)
export const EIV = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
// Аккорды: [id, обозначение, интервалы]
export const ECH = [['maj', '', [0, 4, 7]], ['min', 'm', [0, 3, 7]], ['dim', 'dim', [0, 3, 6]], ['aug', 'aug', [0, 4, 8]], ['sus2', 'sus2', [0, 2, 7]],
  ['sus4', 'sus4', [0, 5, 7]], ['7', '7', [0, 4, 7, 10]], ['maj7', 'maj7', [0, 4, 7, 11]], ['m7', 'm7', [0, 3, 7, 10]], ['m7b5', 'm7♭5', [0, 3, 6, 10]], ['dim7', 'dim7', [0, 3, 6, 9]]];
// Ступени: [полутоны от тоники, обозначение, функция (i18n fn.<…>) или '', номер буквы]
export const EDG = [[0, '1', 'tonic', 0], [1, '♭2', '', 1], [2, '2', '', 1], [3, '♭3', '', 2], [4, '3', '', 2], [5, '4', 'subdom', 3], [6, '♯4', '', 3],
  [7, '5', 'dom', 4], [8, '♭6', '', 5], [9, '6', '', 5], [10, '♭7', '', 6], [11, '7', 'leading', 6]];
// Гаммы: ключи SCALES (src/music/theory.js)
export const LEVELS = {
  iv: { easy: [3, 4, 5, 7, 12], mid: [1, 2, 3, 4, 5, 7, 8, 9, 12], hard: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
  ch: { easy: ['maj', 'min'], mid: ['maj', 'min', 'dim', 'aug', '7'], hard: ECH.map((c) => c[0]) },
  dg: { easy: [0, 4, 7], mid: [0, 2, 4, 5, 7, 9, 11], hard: EDG.map((d) => d[0]) },
  sc: { easy: ['major', 'minor'], mid: ['major', 'minor', 'harm', 'pmaj', 'pmin', 'blues'],
    hard: ['major', 'minor', 'harm', 'mel', 'dorian', 'phrygian', 'lydian', 'mixo', 'locrian', 'pmaj', 'pmin', 'blues'] },
  nt: { easy: [0, 2, 4, 5, 7, 9, 11], mid: [0, 2, 4, 5, 7, 9, 11], hard: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
};
// Допуск при пении, центы
export const TOL = { easy: 25, mid: 15, hard: 8 };
// Диапазоны пения: [от, до] (MIDI); названия — i18n rng.<id>
export const RANGES = { low: [45, 60], high: [55, 72], guitar: [40, 76], piano: [48, 84] };
// Абсолютный слух: порядок добавления нот (C, F♯, A, затем дальние), цвета нот, тембры
export const NT_ORDER = [0, 6, 9, 3, 7, 1, 4, 10, 2, 8, 5, 11];
export const NT_COLORS = ['#E53935', '#F4511E', '#FB8C00', '#FDD835', '#C0CA33', '#43A047', '#00ACC1', '#1E88E5', '#3949AB', '#8E24AA', '#D81B60', '#6D4C41'];
export const NT_TIMBRES = ['piano', 'epiano', 'organ', 'sine', 'bell'];
export const NT_GOAL = 18; // верных из последних 20 — и добавляется нота

const SETS = ['iv', 'ch', 'dg', 'sc', 'nt'];

// Значения по умолчанию (прототип: EC())
export function normalizeEar(e) {
  e.sec = e.sec || 'home';
  e.level = e.level || 'easy';
  e.dir = e.dir || 'up';
  e.arp = e.arp !== false;
  e.auto = e.auto !== false;
  e.mode = e.mode || 'major';
  e.rng = e.rng || 'high';
  e.oct = e.oct !== false;
  e.ref = e.ref !== false;
  e.goal = e.goal || 30;
  if (!e.ntMode) e.ntMode = 'prog';
  if (e.ntLvl == null) e.ntLvl = 0;
  if (!e.ntRange) e.ntRange = '3';
  if (!e.ntTimbre) e.ntTimbre = 'mix';
  if (e.ntMask == null) e.ntMask = true;
  if (e.ntColors == null) e.ntColors = false;
  e.scDir = e.scDir || 'up';
  SETS.forEach((k) => { if (!e[k + 'Set'] || !e[k + 'Set'].length) e[k + 'Set'] = LEVELS[k][e.level === 'custom' ? 'easy' : e.level].slice(); });
  return e;
}

// Сменить сложность: наборы всех упражнений — по уровню
export function setLevel(e, level) {
  e.level = level;
  SETS.forEach((k) => (e[k + 'Set'] = LEVELS[k][level].slice()));
}

// Включить/выключить вариант в своём наборе. Возвращает false, если осталось бы меньше двух
export function toggleInSet(e, sec, raw) {
  const k = sec + 'Set', v = sec === 'ch' || sec === 'sc' ? raw : +raw, i = e[k].map(String).indexOf(String(v));
  if (i >= 0) {
    if (e[k].length <= 2) return false;
    e[k].splice(i, 1);
  } else e[k].push(v);
  e.level = 'custom';
  return true;
}

export const ntSet = (e) => (e.ntMode === 'custom' ? e.ntSet : NT_ORDER.slice(0, Math.min(12, (e.ntLvl || 0) + 3)));

const pickWith = (rnd) => (a) => a[Math.floor(rnd() * a.length)];
const rintWith = (rnd) => (a, b) => a + Math.floor(rnd() * (b - a + 1));

// Новый вопрос. prev — предыдущий вопрос этого упражнения (для абсолютного слуха)
export function generate(sec, e, rnd = Math.random, prev = null) {
  const pick = pickWith(rnd), rint = rintWith(rnd);
  if (sec === 'iv') {
    const iv = pick(e.ivSet), dir = e.dir === 'mix' ? pick(['up', 'down', 'harm']) : e.dir, r = rint(48, 72 - iv);
    return { ans: iv, dir, r };
  }
  if (sec === 'ch') return { ans: pick(e.chSet), r: rint(48, 59) };
  if (sec === 'sc') return { ans: pick(e.scSet), r: rint(52, 62) };
  if (sec === 'dg') {
    const minor = e.mode === 'minor' || (e.mode === 'mix' && rnd() < 0.5), pc = rint(0, 11), deg = pick(e.dgSet), ton = (pc < 5 ? 60 : 48) + pc, oct = rnd() < 0.35 ? 12 : 0;
    return { ans: deg, pc, minor, ton, m: ton + deg + oct };
  }
  if (sec === 'nt') {
    const set = ntSet(e);
    let pc = pick(set);
    if (prev && set.length > 1) { let k = 0; while (pc === prev.ans && k++ < 8) pc = pick(set); }
    const lo = e.ntRange === '1' ? 60 : 48, hi = e.ntRange === '1' ? 71 : 83, cands = [];
    for (let m = lo; m <= hi; m++) if (m % 12 === pc) cands.push(m);
    let m = pick(cands);
    if (prev && cands.length > 1) { const far = cands.filter((x) => Math.abs(x - prev.m) >= 7); if (far.length) m = pick(far); }
    return { ans: pc, m, tim: e.ntTimbre === 'mix' ? pick(NT_TIMBRES) : 'piano' };
  }
  if (sec === 'dc') {
    const len = e.level === 'easy' ? 3 : e.level === 'mid' ? 4 : 5;
    const pool = e.level === 'hard' ? [60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72] : [60, 62, 64, 65, 67, 69, 71, 72];
    const ns = [pick([60, 64, 67])];
    while (ns.length < len) {
      const last = ns[ns.length - 1], cand = pool.filter((m) => m !== last && Math.abs(m - last) <= (e.level === 'easy' ? 4 : 7));
      ns.push(pick(cand));
    }
    return { ans: ns.join(','), notes: ns, prog: [] };
  }
  const [a, b] = RANGES[e.rng], m = rint(a, b);
  return { ans: m, m };
}

// План звучания вопроса: [{ at: мс, seq|chord|note: [midi], step?, dur?, tim? }, …], end — когда закончится.
// Абсолютный слух: mask — «сброс слуха» шумом перед нотой
export function playPlan(sec, q, e, { masked = false } = {}) {
  const ev = [];
  let end = 1200;
  if (sec === 'iv') {
    if (q.dir === 'up') ev.push({ at: 0, seq: [q.r, q.r + q.ans], step: 0.6 });
    else if (q.dir === 'down') ev.push({ at: 0, seq: [q.r + q.ans, q.r], step: 0.6 });
    else ev.push({ at: 0, chord: [q.r, q.r + q.ans] });
  } else if (sec === 'ch') {
    const ms = ECH.find((c) => c[0] === q.ans)[2].map((v) => q.r + v);
    if (e.arp) {
      ev.push({ at: 0, seq: ms, step: 0.28 }, { at: ms.length * 280 + 250, chord: ms });
      end = ms.length * 280 + 1500;
    } else ev.push({ at: 0, chord: ms });
  } else if (sec === 'sc') {
    const up = SCALES[q.ans][0].map((v) => q.r + v).concat(q.r + 12), seq = e.scDir === 'both' ? up.concat(up.slice(0, -1).reverse()) : up;
    ev.push({ at: 0, seq, step: 0.26 });
    end = seq.length * 260 + 400;
  } else if (sec === 'dg') {
    // оборот I–IV–V–I, затем нота
    const sc = q.minor ? NAT_MIN : MAJI, tri = (d) => [0, 2, 4].map((k) => q.ton - 12 + sc[(d + k) % 7] + 12 * Math.floor((d + k) / 7));
    [0, 3, 4, 0].forEach((d, i) => ev.push({ at: i * 650, chord: tri(d) }));
    ev.push({ at: 4 * 650 + 500, seq: [q.m], step: 0.9 });
    end = 4 * 650 + 1500;
  } else if (sec === 'nt') {
    const d = e.ntMask !== false && masked ? 1300 : 0;
    if (d) ev.push({ at: 0, mask: true });
    ev.push({ at: d, note: q.m, dur: 1.1, tim: q.tim });
    end = d + 1300;
  } else if (sec === 'dc') {
    ev.push({ at: 0, seq: q.notes, step: 0.5 });
    end = q.notes.length * 500 + 300;
  } else {
    ev.push({ at: 0, seq: [q.m], step: 1.1 });
    end = 1300;
  }
  return { ev, end };
}

// Сравнение на слух после ответа: как звучал бы выбранный вариант
export function comparePlan(sec, q, v) {
  if (sec === 'iv') {
    const iv = +v;
    return q.dir === 'down' ? { seq: [q.r + iv, q.r], step: 0.55 } : q.dir === 'harm' ? { chord: [q.r, q.r + iv] } : { seq: [q.r, q.r + iv], step: 0.55 };
  }
  if (sec === 'ch') return { chord: ECH.find((c) => c[0] === v)[2].map((x) => q.r + x) };
  if (sec === 'sc') return { seq: SCALES[v][0].map((x) => q.r + x).concat(q.r + 12), step: 0.22 };
  if (sec === 'dg') return { seq: [q.ton + +v], step: 0.8 };
  return null;
}

/* ---------- учёт ответов ---------- */

// Данные статистики (state.settings.ear, как в прототипе): { stats: {sec: {key: {c, t}}}, days: {YYYY-MM-DD: {c, t}}, ntc }
export function normalizeEarData(E) {
  if (!E.stats) E.stats = {};
  if (!E.days) E.days = {};
  DRILL_IDS.forEach((k) => { if (!E.stats[k]) E.stats[k] = {}; });
  return E;
}

// Записать ответ: в статистику по варианту, по дню и в серию текущего занятия (sess)
export function record(E, sess, sec, key, ok, day) {
  const s = E.stats[sec] || (E.stats[sec] = {}), k = String(key);
  s[k] = s[k] || { c: 0, t: 0 };
  s[k].t++;
  if (ok) s[k].c++;
  E.days[day] = E.days[day] || { c: 0, t: 0 };
  E.days[day].t++;
  if (ok) E.days[day].c++;
  const ss = sess[sec] || (sess[sec] = { c: 0, t: 0, st: 0, best: 0 });
  ss.t++;
  if (ok) { ss.c++; ss.st++; ss.best = Math.max(ss.best, ss.st); } else ss.st = 0;
}

export function accuracy(E, sec) {
  let c = 0, t = 0;
  Object.values(E.stats[sec] || {}).forEach((v) => { c += v.c; t += v.t; });
  return { c, t, p: t ? c / t : 0 };
}

// Дни подряд с ответами (сегодня можно ещё не заниматься); dayKeyOf(i) — ключ дня i дней назад
export function earStreak(E, dayKeyOf) {
  let streak = 0;
  for (let i = 0; i < 400; i++) {
    const d = E.days[dayKeyOf(i)];
    if (d && d.t) streak++;
    else if (i > 0) break;
  }
  return streak;
}

// Абсолютный слух: после ответа в «постепенном» режиме. Возвращает новую ноту (pc), если набор пополнился
export function ntProgress(e, ok) {
  if (e.ntMode === 'custom') return null;
  e.ntHist = (e.ntHist || []).concat(ok ? 1 : 0).slice(-20);
  const h = e.ntHist;
  if (h.length >= 20 && h.reduce((a, b) => a + b, 0) >= NT_GOAL && (e.ntLvl || 0) < 9) {
    e.ntLvl = (e.ntLvl || 0) + 1;
    e.ntHist = [];
    return NT_ORDER[e.ntLvl + 2];
  }
  return null;
}

// Диктант: очередная нота (первая дана). Возвращает 'wrong' | 'done' | 'more'
export function dictationStep(q, m) {
  const exp = q.notes[q.prog.length + 1];
  q.prog.push(m);
  if (m % 12 !== exp % 12) return 'wrong';
  return q.prog.length === q.notes.length - 1 ? 'done' : 'more';
}

// Пение: отклонение от цели в центах; anyOct — засчитывать в любой октаве
export function pitchCents(f, target, a4 = 440, anyOct = true) {
  let d = 69 + 12 * Math.log2(f / a4) - target;
  if (anyOct) d = (((d % 12) + 18) % 12) - 6;
  return Math.round(d * 100);
}
export const pitchTol = (e) => TOL[e.level === 'custom' ? 'mid' : e.level];
