// Достаёт исходные функции из legacy/practice.html, чтобы сверять с ними новый код.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../legacy/practice.html', import.meta.url), 'utf8');
const lines = html.slice(html.indexOf('<script>'), html.lastIndexOf('</script>')).split('\n');
// В прототипе продолжения операторов начинаются с отступа; новая строка без отступа — новый оператор
const STMT = /^[^\s}]/;

// Оператор верхнего уровня, начинающийся со строки, подходящей под re (до следующего оператора)
function grab(re) {
  const i = lines.findIndex((l) => re.test(l));
  if (i < 0) throw new Error('not found in prototype: ' + re);
  let j = i + 1;
  while (j < lines.length && !STMT.test(lines[j])) j++;
  return lines.slice(i, j).join('\n');
}

// Запустить выбранные куски прототипа; exportsCode — выражение-объект с нужными функциями
export function runLegacy(res, exportsCode, globals = {}) {
  const code = 'let S=globalThis.__S0;\n' + res.map(grab).join('\n') + '\nglobalThis.__L=' + exportsCode + ';';
  const ctx = vm.createContext({ Date, Math, JSON, Object, Array, Map, Set, String, Number, Float32Array, ...globals });
  vm.runInContext(code, ctx);
  return ctx.__L;
}

export function loadLegacy() {
  const parts = [
    /^const uid=/, /^const dayKey=/, /^function weekStart\(/, /^const dayStart=/, /^const DAY=/,
    /^const getPct=/, /^const SCN=/, /^const toScale=/, /^const fromScale=/,
    /^const LS=/, /^const METRO_DEF=/, /^function blank\(/, /^function merge\(/,
    /^const songs=/, /^const sessions=/, /^const songById=/, /^function songStats\(/,
    /^function weekData\(/, /^function streakInfo\(/,
    /^const PALETTE=/, /^const LIBDEF=/, /^function LIB\(/, /^const autoText=/,
  ].map(grab);
  const code = 'let S;\n' + parts.join('\n') + '\nglobalThis.__L={setS:v=>{S=v},getS:()=>S,blank,merge,songStats,weekData,streakInfo,LIB,autoText,getPct,toScale,fromScale,LIBDEF};';
  const ctx = vm.createContext({ Date, Math, JSON, Object, Array, Map, String, Number });
  vm.runInContext(code, ctx);
  return ctx.__L;
}
