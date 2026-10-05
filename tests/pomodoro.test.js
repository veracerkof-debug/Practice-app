import { describe, it, expect } from 'vitest';
import { createPomodoro, pomoDefaults } from '../src/core/pomodoro.js';

function make(over = {}) {
  let t = 0;
  const log = [];
  const cfg = { ...pomoDefaults(), ...over };
  const po = createPomodoro(cfg, { now: () => t, onEnd: (p) => log.push('end:' + p), pauseSession: (on) => log.push('pause:' + on) });
  return { po, cfg, log, at: (s) => { t = s * 1000; po.tick(); } };
}

describe('помодоро', () => {
  it('работа → перерыв → работа; длинный перерыв после 4 рабочих', () => {
    const { po, log, at } = make();
    po.start();
    expect(log).toEqual(['pause:false']);
    at(25 * 60 - 1);
    expect(po.phase).toBe('work');
    at(25 * 60);
    expect([po.phase, po.running, po.done]).toEqual(['short', true, 1]); // сам начал перерыв
    expect(log.slice(1)).toEqual(['end:short', 'pause:true']);
    let s = 25 * 60;
    for (let i = 0; i < 3; i++) { s += 5 * 60; at(s); s += 25 * 60; at(s); }
    expect([po.phase, po.done]).toEqual(['long', 4]);
  });

  it('пауза хранит остаток; сброс возвращает к началу', () => {
    const { po, at } = make();
    po.start();
    at(60);
    po.pause();
    expect(po.rem()).toBe(24 * 60);
    at(500);
    expect(po.rem()).toBe(24 * 60);
    po.start();
    at(560);
    expect(po.rem()).toBe(23 * 60);
    po.reset();
    expect([po.phase, po.running, po.left, po.rem()]).toEqual(['work', false, null, 25 * 60]);
  });

  it('без автозапуска следующий этап ждёт; пропуск кнопкой не звучит', () => {
    const { po, log, at } = make({ auto: false });
    po.start();
    at(25 * 60);
    expect([po.phase, po.running]).toEqual(['short', false]);
    expect(log).toContain('end:short');
    log.length = 0;
    po.next(true);                         // пропуск остановленного перерыва
    expect([po.phase, po.running]).toEqual(['work', false]);
    expect(log).toEqual(['pause:false']);
    po.start();
    po.next(true);                         // пропуск идущей работы — сразу перерыв
    expect([po.phase, po.running]).toEqual(['short', true]);
    expect(log.filter((x) => x.startsWith('end'))).toEqual([]);
  });

  it('смена длительностей сбрасывает остаток на паузе', () => {
    const { po, cfg, at } = make();
    po.start(); at(60); po.pause();
    cfg.work = 50;
    po.settingsChanged();
    expect(po.rem()).toBe(50 * 60);
  });
});
