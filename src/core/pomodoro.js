// Помодоро: работа и перерывы. Таймер живёт в ядре — идёт, даже когда окно закрыто,
// и ставит сессию на паузу во время перерыва (если включено «Перерыв не в счёт практики»).
// Перенесено из legacy/practice.html (PO, sessPause).

export const PHASES = ['work', 'short', 'long'];

export const pomoDefaults = () => ({ work: 25, short: 5, long: 15, every: 4, auto: true, pauseSession: true });

// Пределы настроек: [мин, макс, шаг]
export const POMO_LIMITS = { work: [5, 90, 5], short: [1, 30, 1], long: [5, 45, 5], every: [2, 8, 1] };

// cfg — настройки (device.timer); hooks: onEnd(phase) — этап закончился сам (звук, сообщение),
// pauseSession(on) — перерыв начался/закончился; onChange() — состояние изменилось
export function createPomodoro(cfg, { now = Date.now, onEnd = () => {}, pauseSession = () => {}, onChange = () => {} } = {}) {
  const po = {
    phase: 'work',
    running: false,
    endAt: 0,
    left: null,   // оставшиеся секунды на паузе
    done: 0,      // завершённых рабочих этапов

    mins: (p) => (p === 'work' ? cfg.work : p === 'short' ? cfg.short : cfg.long),
    total: () => po.mins(po.phase) * 60,
    rem: () => (po.running ? Math.max(0, (po.endAt - now()) / 1000) : po.left != null ? po.left : po.total()),
    // Таймер запущен или поставлен на паузу посреди этапа
    active: () => po.running || po.left != null,

    start() {
      po.endAt = now() + po.rem() * 1000;
      po.running = true;
      pauseSession(po.phase !== 'work');
      onChange();
    },
    pause() {
      po.left = po.rem();
      po.running = false;
      onChange();
    },
    toggle() { po.running ? po.pause() : po.start(); },
    reset() {
      po.running = false;
      po.phase = 'work';
      po.left = null;
      po.done = 0;
      pauseSession(false);
      onChange();
    },
    // Следующий этап: manual — пропуск кнопкой; иначе время вышло
    next(manual) {
      const was = po.running;
      if (po.phase === 'work') { po.done++; po.phase = po.done % cfg.every === 0 ? 'long' : 'short'; }
      else po.phase = 'work';
      po.left = null;
      po.running = false;
      if (!manual) onEnd(po.phase);
      if ((!manual && cfg.auto) || (manual && was)) po.start();
      else {
        if (po.phase === 'work') pauseSession(false);
        onChange();
      }
    },
    // Снять паузу сессии (выключили «Перерыв не в счёт практики» посреди перерыва)
    release() { pauseSession(false); },
    // Сменились длительности — сбросить остаток на паузе
    settingsChanged() { if (!po.running) po.left = null; onChange(); },
    tick() { if (po.running && now() >= po.endAt) po.next(false); },
  };
  return po;
}
