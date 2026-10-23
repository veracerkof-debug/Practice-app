// Режим ресурсов звука: «полный» — всё как задумано, большой буфер (надёжность на сцене важнее задержки);
// «экономный» — для слабых телефонов: меньше голосов синтезатора, пэды без унисона, одна реверберация на всех,
// драйв без передискретизации. Названия в интерфейсе: задержка «Низкая / Средняя / Надёжная», качество «Студийное / Облегчённое»;
// по умолчанию всегда студийное (полное), автоподбора нет (autoPerf — только справочно).
// Читается звуковыми модулями напрямую (без контекста): synth.js, airsound.js, context.js, fx.js.
export const PERF = { level: 'full', engine: 'wl', squeeze: 0, verb: 'conv' }; // verb: 'conv' — свёртка, 'light' — лёгкая (spaces.js) // engine: 'wl' — воздушные голоса в AudioWorklet (airsound.js), 'nodes' — узлами Web Audio
// squeeze 0…2 — ужатие под нагрузкой (load.js): поток звука не успевает (>90 %) — новым нотам меньше голосов и унисона,
// старые голоса отбираются раньше; нагрузка спала — возвращается. Треск слышнее, чем голос меньше (третий принцип)
export const setSqueeze = (n) => { PERF.squeeze = Math.max(0, Math.min(2, n | 0)); };
export const LEVELS = ['full', 'eco'];

// Слабый телефон: меньше 4 ГБ памяти (браузер отдаёт округлённо, до 8) или не больше 4 ядер
export function autoPerf(nav = typeof navigator !== 'undefined' ? navigator : {}) {
  const mem = +nav.deviceMemory || 0, cores = +nav.hardwareConcurrency || 0;
  return (mem && mem < 4) || (cores && cores <= 4) ? 'eco' : 'full';
}
// Режим по настройке: только явный «облегчённый», всё остальное — полный (автоподбор не применяется: решение автора)
export const resolvePerf = (want) => (want === 'eco' ? 'eco' : 'full');
export const setPerf = (level) => { PERF.level = level === 'eco' ? 'eco' : 'full'; };
export const ENGINES = ['wl', 'nodes'];
export const setEngine = (e) => { PERF.engine = e === 'nodes' ? 'nodes' : 'wl'; };
export const VERBS = ['conv', 'light'];
export const setVerb = (v) => { PERF.verb = v === 'light' ? 'light' : 'conv'; };
export const verbLight = () => PERF.verb === 'light';
// Умолчание: телефон — лёгкая (процессор слабее и режется при погашенном экране), компьютер — свёртка
// Приложение для компьютера (Tauri): тот же признак, что core/desktop.js, — звуку без зависимости от ядра
export const desktopApp = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
// Слабый компьютер — не больше 4 ядер (ноутбуки с энергосберегающим процессором): свёртка и малый буфер там дают
// 95 % нагрузки в тишине (отчёт 23.10.2026, 4 ядра, 8 ГБ)
export const weakPC = (nav = typeof navigator !== 'undefined' ? navigator : {}) => { const n = +nav.hardwareConcurrency || 0; return !!n && n <= 4; };
export const defaultVerb = (nav = typeof navigator !== 'undefined' ? navigator : {}) => (/Android|iPhone|iPad|Mobile/.test(nav.userAgent || '') || weakPC(nav) ? 'light' : 'conv');
export const eco = () => PERF.level === 'eco';
export const maxVoices = () => Math.max(8, (eco() ? 10 : 22) - PERF.squeeze * 6);      // голосов синтезатора
export const uniCap = (n) => (eco() || PERF.squeeze >= 2 ? Math.min(n || 1, 1) : PERF.squeeze ? Math.min(n || 1, 2) : n); // унисон пэдов: в экономном и под нагрузкой — меньше
export const spaceOf = (type) => (eco() ? 'hall' : type);   // пространство реверберации: в экономном — только зал
// Буфер контекста: в экономном режиме — всегда большой (без треска)
export const latencyFor = (mode) => (eco() ? 'smooth' : mode);
