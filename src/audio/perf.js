// Режим ресурсов звука: «полный» — всё как задумано, большой буфер (надёжность на сцене важнее задержки);
// «экономный» — для слабых телефонов: меньше голосов синтезатора, пэды без унисона, одна реверберация на всех,
// драйв без передискретизации. Названия в интерфейсе: задержка «Низкая / Средняя / Надёжная», качество «Студийное / Облегчённое»;
// по умолчанию всегда студийное (полное), автоподбора нет (autoPerf — только справочно).
// Читается звуковыми модулями напрямую (без контекста): synth.js, airsound.js, context.js, fx.js.
export const PERF = { level: 'full' };
export const LEVELS = ['full', 'eco'];

// Слабый телефон: меньше 4 ГБ памяти (браузер отдаёт округлённо, до 8) или не больше 4 ядер
export function autoPerf(nav = typeof navigator !== 'undefined' ? navigator : {}) {
  const mem = +nav.deviceMemory || 0, cores = +nav.hardwareConcurrency || 0;
  return (mem && mem < 4) || (cores && cores <= 4) ? 'eco' : 'full';
}
// Режим по настройке: только явный «облегчённый», всё остальное — полный (автоподбор не применяется: решение автора)
export const resolvePerf = (want) => (want === 'eco' ? 'eco' : 'full');
export const setPerf = (level) => { PERF.level = level === 'eco' ? 'eco' : 'full'; };
export const eco = () => PERF.level === 'eco';
export const maxVoices = () => (eco() ? 10 : 22);      // голосов синтезатора
export const uniCap = (n) => (eco() ? Math.min(n || 1, 1) : n); // унисон пэдов: в экономном — один голос
export const spaceOf = (type) => (eco() ? 'hall' : type);   // пространство реверберации: в экономном — только зал
// Буфер контекста: в экономном режиме — всегда большой (без треска)
export const latencyFor = (mode) => (eco() ? 'smooth' : mode);
