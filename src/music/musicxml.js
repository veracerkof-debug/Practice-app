// Проект студии → MusicXML (открывается в «Табах и нотах» через alphaTab и в любой нотной программе).
// Песня целиком (плейлист; пустой — текущий паттерн). Каждая дорожка нот и аккордов — партия; аккорды
// разворачиваются как при проигрывании; ударные — партия с перкуссионным ключом (бочка, малый, хэт…), петли не идут. Длительности — по
// сетке 1/16 доли (divisions = 4 на четверть); одновременные ноты — аккорд (<chord/>), пустоты — паузы.
// У каждой ноты <voice> — без него alphaTab не отрисовывает партию.
// Чистые функции, без DOM.
import { songNotes, songBeats, chordName, clipsOf, DRUM_MIDI } from './project.js';
import { keyLabel } from './transpose.js';
import { fretNotes, tuningFor } from './tabfinger.js';

const DIV = 4; // делений на четверть
const STEPS = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'];
const ALTER = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0];
const FLAT_STEPS = ['C', 'D', 'D', 'E', 'E', 'F', 'G', 'G', 'A', 'A', 'B', 'B'];
const FLAT_ALTER = [0, -1, 0, -1, 0, 0, -1, 0, -1, 0, -1, 0];
const TYPES = [[16, 'whole'], [8, 'half'], [4, 'quarter'], [2, 'eighth'], [1, '16th']];
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Квинты тональности для <key>: число диезов (+) или бемолей (−)
const FIFTHS_MAJ = [0, -5, 2, -3, 4, -1, 6, 1, -4, 3, -2, 5];
export const fifthsOf = (key) => FIFTHS_MAJ[key.minor ? (key.pc + 3) % 12 : key.pc];

// Длительность в делениях → набор нотных типов (половинная + восьмая и т. п.), без залигованных точек
export function splitDur(div) {
  const out = [];
  let rest = Math.max(1, Math.round(div));
  for (const [n, type] of TYPES) while (rest >= n) { out.push([n, type]); rest -= n; }
  return out;
}

// Ударные: нота без высоты на стандартной строке барабанной нотации (General MIDI → ступень и октава), хэты — крестиком
const DRUM_LINE = { 35: ['F', 4], 36: ['F', 4], 37: ['C', 5], 38: ['C', 5], 39: ['C', 5], 40: ['C', 5], 41: ['A', 4], 42: ['G', 5], 43: ['A', 4], 44: ['G', 5], 45: ['D', 5], 46: ['G', 5], 47: ['D', 5], 48: ['E', 5], 49: ['A', 5], 50: ['E', 5], 51: ['F', 5], 52: ['A', 5], 53: ['F', 5], 55: ['A', 5], 57: ['A', 5], 59: ['F', 5] };
const DRUM_X = new Set([39, 42, 44, 46, 49, 51, 52, 53, 55, 57, 59]);
const DRUM_NAME = { 35: 'Kick', 36: 'Kick', 38: 'Snare', 39: 'Clap', 42: 'Hi-Hat', 46: 'Open Hi-Hat' };
function drumXML(m, pid) {
  const [st, oc] = DRUM_LINE[m] || ['C', 5];
  return '<unpitched><display-step>' + st + '</display-step><display-octave>' + oc + '</display-octave></unpitched>';
}
export const drumInstruments = (notes, pid) => [...new Set(notes.map((n) => n.m))].sort((a, b) => a - b).map((m) => ({ id: pid + '-I' + m, m, name: DRUM_NAME[m] || 'Drum ' + m }));

function pitchXML(m, flats) {
  const pc = ((m % 12) + 12) % 12, oct = Math.floor(m / 12) - 1, alt = flats ? FLAT_ALTER[pc] : ALTER[pc];
  return '<pitch><step>' + (flats ? FLAT_STEPS : STEPS)[pc] + '</step>' + (alt ? '<alter>' + alt + '</alter>' : '') + '<octave>' + oct + '</octave></pitch>';
}

// Партия: ноты дорожки по тактам. Нота через тактовую черту делится на части с лигой; одновременно начинающиеся
// ноты — аккорд (<chord/>), длина аккорда — по самой длинной
// Струнные с грифом (дорожка из .mid с программой гитары 24–31 или баса 32–39): строй для табулатуры, иначе null
export const fretKind = (tr) => (tr.kind !== 'notes' || tr.gm == null ? null : tr.gm >= 24 && tr.gm <= 31 ? 'guitar' : tr.gm >= 32 && tr.gm <= 39 ? 'bass' : null);
const TSTEP = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'], TALT = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0];
const staffTuning = (tuning) => '<staff-details><staff-lines>' + tuning.length + '</staff-lines>' + tuning.map((m, i) => '<staff-tuning line="' + (i + 1) + '"><tuning-step>' + TSTEP[m % 12] + '</tuning-step>' + (TALT[m % 12] ? '<tuning-alter>1</tuning-alter>' : '') + '<tuning-octave>' + (Math.floor(m / 12) - 1) + '</tuning-octave></staff-tuning>').join('') + '</staff-details>';

export function partXML(tr, p, { flats = false, notes = songNotes(p).filter((n) => n.tr === tr), bars = Math.ceil(songBeats(p) / p.num), pid = 'P1' } = {}) {
  const drums = tr.kind === 'drums', fk = fretKind(tr), tuning = fk ? tuningFor(fk, notes) : null;
  const tab = tuning ? fretNotes(notes, tuning) : null; // струна и лад каждой ноты (src/music/tabfinger.js)
  const beatDiv = DIV * (4 / p.den), barDiv = beatDiv * p.num, end = barDiv * bars, segs = [];
  notes.forEach((n, i) => {
    let s = Math.round(n.t * beatDiv), e = Math.min(end, Math.round((n.t + n.d) * beatDiv));
    while (s < e) { const b1 = (Math.floor(s / barDiv) + 1) * barDiv, x = Math.min(e, b1); segs.push({ s, e: x, m: n.m, from: s > Math.round(n.t * beatDiv), cont: x < e, tf: tab ? tab[i] : null }); s = x; }
  });
  segs.sort((a, b) => a.s - b.s || a.m - b.m);
  const low = !drums && segs.length && segs.reduce((a, n) => a + n.m, 0) / segs.length < 55; // низкая партия (бас) — басовый ключ
  const clef = drums ? '<sign>percussion</sign><line>2</line>' : low ? '<sign>F</sign><line>4</line>' : '<sign>G</sign><line>2</line>';
  const rests = (d) => splitDur(d).map(([v, type]) => '<note><rest/><duration>' + v + '</duration><voice>1</voice><type>' + type + '</type></note>').join('');
  const out = [];
  for (let b = 0; b < bars; b++) {
    const b0 = b * barDiv, b1 = b0 + barDiv;
    let x = '<measure number="' + (b + 1) + '">';
    if (b === 0) x += '<attributes><divisions>' + DIV + '</divisions><key><fifths>' + fifthsOf(p.key) + '</fifths><mode>' + (p.key.minor ? 'minor' : 'major') + '</mode></key><time><beats>' + p.num + '</beats><beat-type>' + p.den + '</beat-type></time><clef>' + clef + '</clef>' + (tuning ? staffTuning(tuning) : '') + '</attributes>' +
      '<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>' + p.bpm + '</per-minute></metronome></direction-type><sound tempo="' + p.bpm + '"/></direction>';
    let at = b0;
    const inBar = segs.filter((n) => n.s >= b0 && n.s < b1);
    for (let i = 0; i < inBar.length;) {
      const s = inBar[i].s, group = [];
      while (i < inBar.length && inBar[i].s === s) group.push(inBar[i++]);
      if (s > at) { x += rests(s - at); at = s; }
      const e = Math.min(b1, Math.max(...group.map((n) => n.e))), parts = splitDur(e - s);
      parts.forEach(([d, type], k) => {
        group.forEach((n, j) => {
          const stop = k > 0 || n.from, start = k < parts.length - 1 || n.cont;
          x += '<note>' + (j ? '<chord/>' : '') + (drums ? drumXML(n.m) + '<duration>' + d + '</duration><instrument id="' + pid + '-I' + n.m + '"/><voice>1</voice><type>' + type + '</type>' + (DRUM_X.has(n.m) ? '<notehead>x</notehead>' : '')
            : pitchXML(n.m, flats) + '<duration>' + d + '</duration><voice>1</voice><type>' + type + '</type>' + (stop ? '<tie type="stop"/>' : '') + (start ? '<tie type="start"/>' : '') + (n.tf ? '<notations><technical><string>' + n.tf.s + '</string><fret>' + n.tf.f + '</fret></technical></notations>' : '')) + '</note>';
        });
      });
      at = e;
    }
    if (at < b1) x += rests(b1 - at);
    out.push(x + '</measure>');
  }
  return out.join('');
}

// Весь проект → текст MusicXML (partwise): песня по плейлисту. Дорожки звука (петли) не идут
export function projectXML(p, { title = '', trackName = (tr, i) => tr.name || 'Track ' + (i + 1) } = {}) {
  const flats = fifthsOf(p.key) < 0, parts = p.tracks.filter((tr) => tr.kind !== 'audio'), all = songNotes(p), bars = Math.ceil(songBeats(p) / p.num);
  const notesOf = (tr) => all.filter((n) => n.tr === tr);
  const list = parts.map((tr, i) => {
    const pid = 'P' + (i + 1), di = tr.kind === 'drums' ? drumInstruments(notesOf(tr), pid) : [];
    return '<score-part id="' + pid + '"><part-name>' + esc(trackName(tr, i)) + '</part-name>' + di.map((x) => '<score-instrument id="' + x.id + '"><instrument-name>' + x.name + '</instrument-name></score-instrument>').join('') +
      di.map((x) => '<midi-instrument id="' + x.id + '"><midi-channel>10</midi-channel><midi-unpitched>' + (x.m + 1) + '</midi-unpitched></midi-instrument>').join('') + '</score-part>';
  }).join('');
  const body = parts.map((tr, i) => '<part id="P' + (i + 1) + '">' + partXML(tr, p, { flats, notes: notesOf(tr), bars, pid: 'P' + (i + 1) }) + '</part>').join('');
  return '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">\n' +
    '<score-partwise version="4.0"><work><work-title>' + esc(title || p.name || '') + '</work-title></work><identification><encoding><software>Melete</software></encoding></identification>' +
    '<part-list>' + list + '</part-list>' + body + '</score-partwise>';
}

// Подпись аккордов дорожки в текущем паттерне строкой (для названия файла и текста): «C F G Am»
export const chordLine = (tr, p) => clipsOf(p, tr).flatMap((cl) => (cl.data.chords || []).map((c) => chordName(c.pc, c.type, p.key.minor))).join(' ');
export { keyLabel };
