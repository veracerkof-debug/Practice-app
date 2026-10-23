// Учебник: рисунки (клавиатура, нотный стан, гриф, квинтовый круг — SVG строкой) и звук примеров через звук
// приложения (ctx.audio, шина «theory»): аккорд, последовательность, оборот, удары по времени — через часы звука
// (clock.js: after), новое нажатие прерывает прежнее.
import { after, cancel } from '../../../audio/clock.js';
import { LET, NAT, ACC, N, pcOf, nm, midiOf, CIRCLE, REL_MIN, SIG } from './engine.js';

// Подписи для чтения с экрана — из языкового файла (index.js: setLabels)
export const LBL = { kb: 'Keyboard', staff: 'Notes', fret: 'Fretboard', circle: 'Circle of fifths', signs: 'signs', play: 'Play' };
export const setLabels = (o) => Object.assign(LBL, o);

// Звук: A — ctx.audio (unlock, playChord, playSeq)
export function createSound(getA) {
  let ids = [];
  const at = (sec, fn) => { ids.push(after(Math.max(0, sec) * 1000, fn)); };
  const A = () => { const a = getA(); return a && a.unlock() ? a : null; };
  const S = {
    stop() { ids.forEach(cancel); ids = []; },
    chord(ms, { at: t0 = 0, dur = 1.4, arp = 0, keep = false } = {}) {
      const a = A(); if (!a) return; if (!keep) S.stop();
      if (arp) ms.forEach((m, i) => at(t0 + i * arp, () => a.playChord([m], { dur })));
      else at(t0, () => a.playChord(ms, { dur }));
    },
    // list: по шагам — нота или массив нот
    seq(list, step = 0.3, dur = 0.5) { const a = A(); if (!a) return; S.stop(); list.forEach((ms, i) => at(i * step, () => a.playChord((Array.isArray(ms) ? ms : [ms]).filter((m) => m != null), { dur }))); },
    prog(chords, step = 1.2) { const a = A(); if (!a) return; S.stop(); chords.forEach((ms, i) => at(i * step, () => a.playChord(ms, { dur: step * 0.95 }))); },
    hits(list) { const a = A(); if (!a) return; S.stop(); list.forEach(([t, ms, d]) => at(t, () => a.playChord(ms, { dur: d || 0.25 }))); },
    // аккорд и мелодия вместе (гамма над аккордом)
    // действие на экране в такт звуку (подсветка такта); без остановки звучащего
    mark(sec, fn) { at(sec, fn); },
    over(ch, dur, line, step, ndur) { const a = A(); if (!a) return; S.stop(); at(0, () => a.playChord(ch, { dur })); line.forEach((m, i) => at(i * step, () => a.playChord([m], { dur: ndur }))); },
  };
  return S;
}

const BLK = new Set([1, 3, 6, 8, 10]);
// ===== Клавиатура: SVG, подсветка нот, касание — звук =====
export function keyboardSVG(marks = {}, { lo = 48, hi = 83, h = 92 } = {}) {
  // marks: midi → { c: 'root'|'on'|'alt'|'b'|'g', t: подпись }
  let whites = [];
  for (let m = lo; m <= hi; m++) if (!BLK.has(m % 12)) whites.push(m);
  const W = 100 / whites.length, xs = {};
  whites.forEach((m, i) => { xs[m] = i * W; });
  let s = '<svg class="bkkb" viewBox="0 0 100 ' + (h / 6) + '" preserveAspectRatio="none" role="img" aria-label="' + LBL.kb + '">';
  const H = h / 6, bh = H * 0.62;
  for (const m of whites) {
    const mk = marks[m];
    s += '<rect data-midi="' + m + '" class="wk' + (mk ? ' ' + (mk.c || 'on') : '') + '" x="' + xs[m] + '" y="0" width="' + W + '" height="' + H + '" rx="0.4"/>';
  }
  for (let m = lo; m <= hi; m++) if (BLK.has(m % 12)) {
    const x = xs[m - 1] + W * 0.68, mk = marks[m];
    s += '<rect data-midi="' + m + '" class="bk' + (mk ? ' ' + (mk.c || 'on') : '') + '" x="' + x + '" y="0" width="' + W * 0.64 + '" height="' + bh + '" rx="0.3"/>';
  }
  s += '</svg>';
  // подписи — отдельным слоем (не растягиваются)
  let lab = '<div class="bkkblab">';
  for (let m = lo; m <= hi; m++) {
    const mk = marks[m]; if (!mk || !mk.t) continue;
    const blk = BLK.has(m % 12), x = blk ? xs[m - 1] + W * 1.0 : xs[m] + W / 2;
    lab += '<span class="' + (blk ? 'lb' : 'lw') + ' ' + (mk.c || 'on') + '" style="left:' + x + '%">' + mk.t + '</span>';
  }
  return '<div class="bkkbwrap">' + s + lab + '</div></div>';
}
// Ноты (спеллинг) + midi → разметка клавиатуры
export function marksOf(list) { const o = {}; list.forEach((x) => { o[x.m] = { c: x.c || 'on', t: x.t }; }); return o; }

// ===== Нотный стан: скрипичный, басовый или большой =====
export const DI = (n, oct) => oct * 7 + n.l; // диатонический номер
export const octOf = (n, m) => Math.round((m - NAT[n.l] - n.a) / 12) - 1;
export function staffSVG(items, { mode = 'chord', w = 0, labels = null } = {}) {
  // items: [{ n, m }] — нота (буква+знак) и midi; mode: chord — один столбец; seq — по порядку; chords — массив аккордов
  const groups = mode === 'chord' ? [items] : mode === 'seq' ? items.map((x) => [x]) : items;
  const all = groups.flat();
  const lowD = Math.min(...all.map((x) => DI(x.n, octOf(x.n, x.m)))), hiD = Math.max(...all.map((x) => DI(x.n, octOf(x.n, x.m))));
  const grand = lowD < 26 && hiD > 32, bassOnly = !grand && hiD < 30;
  const st = 5; // полшага
  const topD = grand ? Math.max(hiD + 2, 38) : bassOnly ? Math.max(hiD + 2, 26) : Math.max(hiD + 2, 38);
  const y = (d) => 14 + (topD - d) * st;
  const trebleLines = [30, 32, 34, 36, 38], bassLines = [18, 20, 22, 24, 26];
  const lines = grand ? [...trebleLines, ...bassLines] : bassOnly ? bassLines : trebleLines;
  const botD = grand ? Math.min(lowD - 2, 18) : bassOnly ? Math.min(lowD - 2, 18) : Math.min(lowD - 2, 30);
  const H = y(botD) + 14, colW = 34, W = w || Math.max(150, 46 + groups.length * colW + 10);
  let s = '<svg class="bkstaff" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + LBL.staff + '">';
  for (const d of lines) s += '<line x1="4" x2="' + (W - 4) + '" y1="' + y(d) + '" y2="' + y(d) + '"/>';
  if (!bassOnly) s += '<text class="clef" x="6" y="' + (y(32) + 10) + '">𝄞</text>';
  if (grand || bassOnly) s += '<text class="clef f" x="7" y="' + (y(24) + 8) + '">𝄢</text>';
  groups.forEach((g, gi) => {
    const x0 = 52 + gi * colW;
    const sorted = g.slice().sort((a, b) => DI(a.n, octOf(a.n, a.m)) - DI(b.n, octOf(b.n, b.m)));
    let prevD = -99, shift = false, accCol = 0;
    sorted.forEach((it) => {
      const d = DI(it.n, octOf(it.n, it.m));
      shift = d - prevD === 1 ? !shift : false; prevD = d;
      const x = x0 + (shift ? 9 : 0), yy = y(d);
      // добавочные линейки
      const ref = grand ? (d >= 28 ? trebleLines : bassLines) : lines;
      const top = ref[ref.length - 1], bot = ref[0];
      for (let L = top + 2; L <= d; L += 2) s += '<line class="led" x1="' + (x - 7) + '" x2="' + (x + 7) + '" y1="' + y(L) + '" y2="' + y(L) + '"/>';
      for (let L = bot - 2; L >= d; L -= 2) if (!(grand && L === 28)) s += '<line class="led" x1="' + (x - 7) + '" x2="' + (x + 7) + '" y1="' + y(L) + '" y2="' + y(L) + '"/>';
      if (grand && d === 28) s += '<line class="led" x1="' + (x - 7) + '" x2="' + (x + 7) + '" y1="' + y(28) + '" y2="' + y(28) + '"/>';
      s += '<ellipse class="nh' + (it.c ? ' ' + it.c : '') + '" cx="' + x + '" cy="' + yy + '" rx="5.2" ry="3.9" transform="rotate(-20 ' + x + ' ' + yy + ')"/>';
      if (it.n.a) { s += '<text class="acc" x="' + (x0 - 13 - (accCol % 2) * 7) + '" y="' + (yy + 4) + '">' + ACC[it.n.a] + '</text>'; accCol++; }
    });
    if (labels && labels[gi]) s += '<text class="slab" x="' + x0 + '" y="' + (H - 3) + '">' + labels[gi] + '</text>';
  });
  return s + '</svg>';
}

// ===== Гриф гитары =====
export const TUNE = [64, 59, 55, 50, 45, 40]; // 1-я струна сверху
export function fretSVG(pcMap, { frets = 15, root = null } = {}) {
  // pcMap: pc → подпись ступени
  const W = 100, H = 30, fx = (f) => 6 + (f / frets) * (W - 8), sy = (i) => 3 + i * ((H - 6) / 5);
  let s = '<svg class="bkfret" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + LBL.fret + '">';
  s += '<line class="nut" x1="' + fx(0) + '" x2="' + fx(0) + '" y1="' + sy(0) + '" y2="' + sy(5) + '"/>';
  for (let f = 1; f <= frets; f++) s += '<line class="fw" x1="' + fx(f) + '" x2="' + fx(f) + '" y1="' + sy(0) + '" y2="' + sy(5) + '"/>';
  [3, 5, 7, 9, 15].forEach((f) => { if (f <= frets) s += '<circle class="inl" cx="' + (fx(f) + fx(f - 1)) / 2 + '" cy="' + H / 2 + '" r="0.9"/>'; });
  if (frets >= 12) { const c = (fx(12) + fx(11)) / 2; s += '<circle class="inl" cx="' + c + '" cy="' + sy(1.5) + '" r="0.9"/><circle class="inl" cx="' + c + '" cy="' + sy(3.5) + '" r="0.9"/>'; }
  TUNE.forEach((open, i) => { s += '<line class="str" x1="' + fx(0) + '" x2="' + fx(frets) + '" y1="' + sy(i) + '" y2="' + sy(i) + '" style="stroke-width:' + (0.18 + i * 0.07) + '"/>'; });
  TUNE.forEach((open, i) => {
    for (let f = 0; f <= frets; f++) {
      const m = open + f, lab = pcMap[m % 12];
      if (lab == null) continue;
      const x = f === 0 ? fx(0) - 2.6 : (fx(f) + fx(f - 1)) / 2, isR = root != null && m % 12 === root;
      s += '<g class="fd' + (isR ? ' r' : '') + '" data-midi="' + m + '"><circle cx="' + x + '" cy="' + sy(i) + '" r="2"/><text x="' + x + '" y="' + (sy(i) + 0.75) + '">' + lab + '</text></g>';
    }
  });
  return '<div class="bkfretwrap">' + s + '</svg></div>';
}

// ===== Квинтовый круг =====
export function circleSVG(sel = 0, { minorSel = false } = {}) {
  const R1 = 47, R2 = 33, R3 = 21, cx = 50, cy = 50;
  const arc = (r0, r1, a0, a1) => {
    const p = (r, a) => [cx + r * Math.sin(a), cy - r * Math.cos(a)];
    const [x0, y0] = p(r1, a0), [x1, y1] = p(r1, a1), [x2, y2] = p(r0, a1), [x3, y3] = p(r0, a0);
    return 'M' + x0 + ' ' + y0 + 'A' + r1 + ' ' + r1 + ' 0 0 1 ' + x1 + ' ' + y1 + 'L' + x2 + ' ' + y2 + 'A' + r0 + ' ' + r0 + ' 0 0 0 ' + x3 + ' ' + y3 + 'Z';
  };
  let s = '<svg class="bkcirc" viewBox="0 0 100 100" role="img" aria-label="' + LBL.circle + '">';
  for (let i = 0; i < 12; i++) {
    const a0 = ((i - 0.5) / 12) * 2 * Math.PI, a1 = ((i + 0.5) / 12) * 2 * Math.PI, am = (i / 12) * 2 * Math.PI;
    const on = i === sel, near = (i - sel + 12) % 12 === 1 || (sel - i + 12) % 12 === 1;
    s += '<path data-ci="' + i + '" class="cs' + (on && !minorSel ? ' on' : near ? ' near' : '') + '" d="' + arc(R2, R1, a0, a1) + '"/>';
    s += '<path data-ci="' + i + '" data-min="1" class="cs mi' + (on && minorSel ? ' on' : near ? ' near' : '') + '" d="' + arc(R3, R2, a0, a1) + '"/>';
    const t = (r, txt, cl) => '<text class="' + cl + '" x="' + (cx + r * Math.sin(am)) + '" y="' + (cy - r * Math.cos(am) + 1.4) + '">' + txt + '</text>';
    s += t((R1 + R2) / 2, CIRCLE[i], 'ct' + (on && !minorSel ? ' on' : '')) + t((R2 + R3) / 2, REL_MIN[i].toLowerCase(), 'ct m' + (on && minorSel ? ' on' : ''));
  }
  const k = SIG[sel];
  s += '<text class="cc" x="50" y="49">' + (k === 0 ? '0' : Math.abs(k) + (k > 0 ? '♯' : '♭')) + '</text><text class="cc2" x="50" y="56">' + LBL.signs + '</text>';
  return s + '</svg>';
}

// ===== Мелочи интерфейса =====
export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
export const seg = (name, opts, cur) => '<div class="seg" role="radiogroup" data-seg="' + name + '">' + opts.map(([v, t]) => '<button type="button" data-v="' + v + '" aria-pressed="' + (String(v) === String(cur)) + '">' + t + '</button>').join('') + '</div>';
export const sel = (id, opts, cur, label = '') => '<select data-sel="' + id + '"' + (label ? ' aria-label="' + label + '"' : '') + '>' + opts.map((o) => (o.group ? '<optgroup label="' + o.group + '">' + o.items.map(([v, t]) => '<option value="' + v + '"' + (String(v) === String(cur) ? ' selected' : '') + '>' + t + '</option>').join('') + '</optgroup>' : '<option value="' + o[0] + '"' + (String(o[0]) === String(cur) ? ' selected' : '') + '>' + o[1] + '</option>')).join('') + '</select>';
export const playBtn = (attr, t = LBL.play) => '<button type="button" class="bkplay" ' + attr + '><svg viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z"/></svg>' + t + '</button>';
// Лучший вид ноты: двойные знаки — на соседнюю букву
export function simp(n) {
  if (Math.abs(n.a) < 2) return n;
  const p = pcOf(n);
  for (const l of [0, 1, 2, 3, 4, 5, 6]) for (const a of [0, -1, 1]) if ((NAT[l] + a + 12) % 12 === p) return N(l, a);
  return n;
}
// Аккорд в midi (корень в 3-й октаве или около заданного)
export function chordMidis(root, degs, base = 48) { return degs.map((d) => midiOf(root, d, base)); }
