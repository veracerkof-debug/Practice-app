// Текстовые табы (ASCII, как на сайтах с табами) → alphaTex для alphaTab: с нотной сеткой, табом и воспроизведением.
// Строки струн: «e|--3--5--|», «B|---0----|»… (подпись струны необязательна), системы из 4–8 строк, между
// ними — любой текст (слова, аккорды, подсказки), он пропускается. Лады — цифры (до двух знаков), x — глушёная,
// h/p — легато, / \ — слайд. Ритма в ASCII нет: длительность — по расстоянию до следующей ноты, масштаб — по
// ширине такта (ширина такта между «|» = такт), без тактовых черт — четверть на символ. Чистые функции, без DOM.

const STD = { 4: [43, 38, 33, 28], 5: [43, 38, 33, 28, 23], 6: [64, 59, 55, 50, 45, 40], 7: [64, 59, 55, 50, 45, 40, 35], 8: [64, 59, 55, 50, 45, 40, 35, 30] };
const PC = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11, h: 11 };
const NAMES = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b'];
// Строка струны: необязательная подпись (e, B, D#…), затем тело из дефисов, цифр, тактовых черт и приёмов
const LINE = /^\s*(?:([A-Ha-h])([#b♯♭])?)?\s*[|:]?\s*([-—0-9|:hpbrsxX/\\~^()<>.,\s*]{6,})\s*$/;
const isTabLine = (s) => { const m = LINE.exec(s); return !!m && (m[3].match(/-/g) || []).length >= 3 && (/\d|\|/.test(m[3]) || /^[-\s]+$/.test(m[3])); };

// Текст → системы: [{ labels: ['e','B',…], rows: ['--3--', …] }]
export function tabSystems(text) {
  const lines = String(text).replace(/\r/g, '').replace(/—/g, '-').split('\n'), out = [];
  let cur = null;
  for (const raw of lines) {
    if (isTabLine(raw)) {
      const m = LINE.exec(raw), label = m[1] ? m[1].toLowerCase() + (m[2] === '#' || m[2] === '♯' ? '#' : m[2] === 'b' || m[2] === '♭' ? 'b' : '') : '';
      if (!cur) cur = { labels: [], rows: [] };
      cur.labels.push(label);
      cur.rows.push(m[3].replace(/\s+$/, ''));
      continue;
    }
    if (cur) { if (cur.rows.length >= 4 && cur.rows.length <= 8) out.push(cur); cur = null; }
  }
  if (cur && cur.rows.length >= 4 && cur.rows.length <= 8) out.push(cur);
  return out;
}

// Строй по подписям: стандартный для числа струн, высота каждой струны подправляется под подпись (Drop D, DADGAD…)
export function tuningOf(labels, n) {
  const std = STD[n] || STD[6];
  return std.map((m, i) => {
    const l = labels[i];
    if (!l || PC[l[0]] == null) return m;
    const pc = (PC[l[0]] + (l[1] === '#' ? 1 : l[1] === 'b' ? -1 : 0) + 12) % 12;
    let best = m, dist = 99;
    for (let x = m - 6; x <= m + 6; x++) if (((x % 12) + 12) % 12 === pc && Math.abs(x - m) < dist) { best = x; dist = Math.abs(x - m); }
    return best;
  });
}
const noteName = (m) => NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);

// Длительность в долях → alphaTex (1, 2, 4, 8, 16, 32; с точкой — {d})
const DURS = [[4, '1'], [3, '2{d}'], [2, '2'], [1.5, '4{d}'], [1, '4'], [0.75, '8{d}'], [0.5, '8'], [0.375, '16{d}'], [0.25, '16'], [0.125, '32']];
const texDur = (beats) => DURS.reduce((a, b) => (Math.abs(b[0] - beats) < Math.abs(a[0] - beats) ? b : a))[1];
const nearDur = (beats) => DURS.reduce((a, b) => (Math.abs(b[0] - beats) < Math.abs(a[0] - beats) ? b : a))[0];
const floorDur = (beats) => (DURS.find((d) => d[0] <= beats + 1e-6) || DURS.at(-1))[0]; // последняя нота такта — не длиннее остатка

// Одна система → такты [{ events: [{ col, notes: [{ s, fret, dead, h, sl }] }], width }]
function systemBars(sys) {
  const n = sys.rows.length, W = Math.max(...sys.rows.map((r) => r.length)), rows = sys.rows.map((r) => r.padEnd(W, '-'));
  const bars = [], cur = { events: [], start: 0 };
  const isBar = (i) => rows.filter((r) => r[i] === '|').length >= Math.ceil(n / 2);
  let i = 0;
  while (i < W) {
    if (isBar(i)) { cur.width = i - cur.start; if (cur.events.length || cur.width > 2) bars.push({ ...cur, closed: true }); cur.events = []; cur.start = i + 1; i++; continue; }
    const notes = [];
    rows.forEach((r, s) => {
      const c = r[i];
      if (/\d/.test(c)) {
        if (i > 0 && /\d/.test(r[i - 1])) return; // вторая цифра двузначного лада
        let fret = +c;
        if (/\d/.test(r[i + 1] || '') && +(c + r[i + 1]) <= 24) fret = +(c + r[i + 1]);
        const after = r.slice(i + String(fret).length, i + String(fret).length + 1);
        notes.push({ s: s + 1, fret, h: /[hp]/i.test(after), sl: /[/\\]/.test(after) });
      } else if ((c === 'x' || c === 'X') && !/[xX]/.test(r[i - 1] || '')) notes.push({ s: s + 1, fret: 0, dead: true });
    });
    if (notes.length) cur.events.push({ col: i - cur.start, notes });
    i++;
  }
  cur.width = W - cur.start;
  if (cur.events.length) bars.push(cur);
  return bars;
}

// Весь текст → alphaTex. Пусто — нет ни одной строки струн
export function asciiToTex(text, { title = '', tempo = 0, beatsPerBar = 4 } = {}) {
  const systems = tabSystems(text);
  if (!systems.length) return '';
  const n = systems.reduce((a, s) => Math.max(a, s.rows.length), 0), labels = systems.find((s) => s.labels.some(Boolean))?.labels || [];
  const tuning = tuningOf(labels, n), out = [];
  if (title) out.push('\\title "' + title.replace(/"/g, "'") + '"');
  if (tempo) out.push('\\tempo ' + Math.round(tempo));
  out.push('\\tuning ' + tuning.map(noteName).join(' '));
  out.push('.');
  const body = [];
  for (const sys of systems) {
    if (sys.rows.length !== n) continue; // система с другим числом струн — пропуск
    for (const bar of systemBars(sys)) {
      // ширина такта → доли на символ; без тактовых черт — 1 символ = шестнадцатая
      const withBars = bar.closed && bar.width >= 6 && bar.width <= 96 && bar.events.length, perChar = withBars ? beatsPerBar / bar.width : 0.25;
      const items = [];
      let at = 0;
      bar.events.forEach((ev, k) => {
        const next = bar.events[k + 1], lead = ev.col * perChar - at;
        if (lead >= 0.2) { const r = nearDur(lead); items.push('r.' + texDur(r)); at += r; }
        const raw = Math.max(0.125, Math.min(4, ((next ? next.col : Math.max(bar.width, ev.col + 1)) - ev.col) * perChar)), d = next ? nearDur(raw) : floorDur(raw);
        // alphaTex: приёмы — у ноты до длительности (3.3{h}.4), точка — после ({d})
        const ns = ev.notes.map((x) => (x.dead ? 'x' : x.fret) + '.' + x.s + (x.h ? '{h}' : x.sl ? '{sl}' : ''));
        items.push((ns.length > 1 ? '(' + ns.join(' ') + ')' : ns[0]) + '.' + texDur(d));
        at = ev.col * perChar + d;
      });
      if (items.length) body.push(items.join(' '));
    }
  }
  if (!body.length) return '';
  out.push(body.join(' | '));
  return out.join('\n');
}
// Есть ли в тексте табы (хотя бы одна система)
export const hasAsciiTab = (text) => tabSystems(text).length > 0;
