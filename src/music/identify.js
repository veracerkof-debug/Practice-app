// Определитель: аккорд и гамма по набору нот. Лады — не отдельные гаммы, а один набор нот с разными центрами
// (так думает о них Ингви Мальмстин: фригийский доминантовый — это гармонический минор от пятой ступени,
// дорийский — натуральный минор с большой шестой). Поэтому гаммы ищутся «семьями» — мажор, гармонический
// и мелодический минор — и каждая семья показывается всеми своими ладами; а лады от одной тоники выстраиваются
// лестницей по яркости, где соседние отличаются одной нотой. Только данные, без текстов интерфейса.
import { CHORDS } from './theory.js';
import { MAJI, MAJ_NAMES, MIN_NAMES } from './notes.js';

const mod12 = (x) => ((x % 12) + 12) % 12;
const uniq = (pcs) => [...new Set(pcs.map(mod12))];

/* ---------- аккорды ---------- */

// Шаблоны: аккорды «Теории» и ещё несколько частых; [id, обозначение, интервалы]
const TPL = CHORDS.map((c) => [c[0], c[1], c[2]]).concat([
  ['5', '5', [0, 7]], ['7sus4', '7sus4', [0, 5, 7, 10]], ['mmaj7', 'm(maj7)', [0, 3, 7, 11]], ['69', '6/9', [0, 4, 7, 9, 14]],
  ['m9', 'm9', [0, 3, 7, 10, 14]], ['maj9', 'maj9', [0, 4, 7, 11, 14]], ['7b9', '7♭9', [0, 4, 7, 10, 13]], ['7s9', '7♯9', [0, 4, 7, 10, 15]],
  ['add11', 'add11', [0, 4, 7, 17]], ['m11', 'm11', [0, 3, 7, 10, 14, 17]], ['13', '13', [0, 4, 7, 10, 14, 21]],
]);
const rootName = (pc, ivs) => (ivs.includes(3) && !ivs.includes(4) ? MIN_NAMES : MAJ_NAMES)[pc];

// Аккорды, которые дают эти ноты (порядок не важен). bass — нижняя нота (для обращений «C/E»), необязательна.
// Без лишних нот; можно без квинты (её часто опускают). Лучшие — первыми.
export function chordsOf(pcs, bass = null) {
  const set = uniq(pcs);
  if (set.length < 2) return [];
  const out = [];
  set.forEach((r) => {
    const rel = new Set(set.map((p) => mod12(p - r)));
    TPL.forEach(([id, suf, ivs], ti) => {
      const tpl = new Set(ivs.map(mod12));
      if ([...rel].some((x) => !tpl.has(x))) return; // лишняя нота — не этот аккорд
      const missing = [...tpl].filter((x) => !rel.has(x));
      if (missing.length > 1 || (missing.length === 1 && missing[0] !== 7)) return;
      if (tpl.size === 2 && set.length !== 2) return;
      let score = 100 - ti - missing.length * 30 - (tpl.size - rel.size) * 5;
      if (bass != null) score += mod12(bass) === r ? 25 : -10;
      const slash = bass != null && mod12(bass) !== r ? '/' + MAJ_NAMES[mod12(bass)] : '';
      out.push({ root: r, id, name: rootName(r, ivs) + suf + slash, noFifth: missing.length === 1, ivs, score });
    });
  });
  return out.sort((a, b) => b.score - a.score);
}

/* ---------- семьи гамм и лады ---------- */

// Семьи: родительская гамма и её лады по ступеням (id ладов — i18n scale.<id> в «Теории»)
export const FAMILIES = {
  major: { ivs: MAJI, modes: ['major', 'dorian', 'phrygian', 'lydian', 'mixo', 'minor', 'locrian'] },
  harm: { ivs: [0, 2, 3, 5, 7, 8, 11], modes: ['harm', 'locrian6', 'ionian5', 'dorian4', 'phrygdom', 'lydian2', 'ultraloc'] },
  mel: { ivs: [0, 2, 3, 5, 7, 9, 11], modes: ['mel', 'dorianb2', 'lydaug', 'lyddom', 'mixob6', 'locrian2', 'altered'] },
};
// Интервалы любого лада любой семьи (от его тоники)
export const MODE_IVS = {};
Object.values(FAMILIES).forEach((f) => f.modes.forEach((id, d) => { MODE_IVS[id] = f.ivs.map((x) => mod12(x - f.ivs[d])).sort((a, b) => a - b); }));

// Все семьи, в которых есть эти ноты. tonic — нота-центр (по умолчанию первая).
// Для каждой: семья, тоника родительской гаммы, 7 ладов (тоника лада, id) и какой лад — от tonic.
export function familiesOf(pcs, tonic = null) {
  const set = uniq(pcs);
  if (!set.length) return [];
  const tn = tonic == null ? set[0] : mod12(tonic), out = [];
  Object.entries(FAMILIES).forEach(([fam, f]) => {
    for (let t = 0; t < 12; t++) {
      const coll = f.ivs.map((x) => mod12(x + t));
      if (!set.every((p) => coll.includes(p))) continue;
      const modes = coll.map((pc, d) => ({ pc, id: f.modes[d], deg: d }));
      const at = modes.find((m) => m.pc === tn) || null;
      out.push({ fam, parent: t, pcs: coll, modes, at, extra: 7 - set.length });
    }
  });
  // сначала — где тоника есть в наборе; затем мажорная семья, гармонический, мелодический минор
  const rank = { major: 0, harm: 1, mel: 2 };
  return out.sort((a, b) => (!!b.at - !!a.at) || rank[a.fam] - rank[b.fam] || a.parent - b.parent);
}

// Лестница ладов от одной тоники — от самого светлого к самому тёмному; каждый следующий понижает одну ступень
export const LADDER = ['lydian', 'major', 'mixo', 'dorian', 'minor', 'phrygian', 'locrian'];
const LOWERED = [null, '4', '7', '3', '6', '2', '5'];
export function ladderOf(tonic, pcs = []) {
  const tn = mod12(tonic), set = uniq(pcs);
  return LADDER.map((id, i) => {
    const m = MODE_IVS[id].map((x) => mod12(x + tn));
    return { id, pcs: m, lowered: LOWERED[i], fits: set.length > 0 && set.every((p) => m.includes(p)) };
  });
}

// Ступени лада относительно мажора от той же тоники: «1 2 ♭3 4 5 6 ♭7» — чем лад отличается
export function degreesOf(id) {
  const ivs = MODE_IVS[id] || MAJI;
  return ivs.map((iv, k) => { const d = iv - MAJI[k]; return (d < 0 ? '♭'.repeat(-d) : d > 0 ? '♯'.repeat(d) : '') + (k + 1); });
}

// Нота, которая отличает лад от натурального мажора или минора (самая «характерная»); null — у самих мажора и минора
export function colorNote(id) {
  const deg = degreesOf(id), maj = degreesOf('major'), min = degreesOf('minor');
  const dMaj = deg.filter((x, i) => x !== maj[i]), dMin = deg.filter((x, i) => x !== min[i]);
  if (!dMaj.length || !dMin.length) return null;
  return dMaj.length <= dMin.length ? { base: 'major', notes: dMaj } : { base: 'minor', notes: dMin };
}
