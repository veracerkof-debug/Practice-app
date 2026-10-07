import { describe, it, expect } from 'vitest';
import { createStopwatch, overlapMs, mergeSegs, busySegs } from '../src/core/stopwatch.js';
import { createActive, elapsed, pause, resume, awayStart, awayEnd, summarize, buildRecord, countsWhileHidden, recordToolTime, trackMode } from '../src/core/session.js';

const M = 60e3;
const mkStore = (sessions = []) => ({ state: { sessions, settings: {} }, sessions: () => sessions, save() {} });

describe('секундомер', () => {
  it('идёт, ставится на паузу, сбрасывается; переживает перезагрузку через состояние', () => {
    let t = 0;
    const state = {}, sw = createStopwatch(state, { now: () => t });
    sw.start(); t = 5 * M; sw.pause(); t = 7 * M; sw.start(); t = 10 * M;
    expect(sw.elapsed()).toBe(8 * 60);
    const again = createStopwatch(JSON.parse(JSON.stringify(state)), { now: () => t });
    expect(again.running).toBe(true);
    expect(again.elapsed()).toBe(8 * 60);
    again.reset();
    expect([again.elapsed(), again.active()]).toEqual([0, false]);
  });
  it('пересечения отрезков', () => {
    expect(mergeSegs([[5, 10], [0, 3], [2, 6], [20, 20]])).toEqual([[0, 10]]);
    expect(overlapMs([[0, 10], [20, 30]], [[5, 25]])).toBe(10);
    expect(busySegs([{ start: 0, end: 10, dur: 10 }], { startedAt: 50 }, 60)).toEqual([[0, 10], [50, 60]]);
  });
  it('в статистику — без времени, уже учтённого сессией или инструментами; меньше минуты — нет', () => {
    let t = 0;
    const store = mkStore([{ type: 'tool', tool: 'metro', start: 10 * M, end: 20 * M, dur: 600 }]);
    const sw = createStopwatch({}, { now: () => t });
    sw.start(); t = 30 * M;
    expect(sw.credit(store.sessions())).toBe(20 * 60);
    const rec = sw.commit(store, null, { tag: 'Джем' });
    expect([rec.type, rec.src, rec.mode, rec.dur, rec.tag, rec.start]).toEqual(['free', 'stopwatch', 'normal', 1200, 'Джем', 0]);
    expect(sw.active()).toBe(false);
    // всё время — внутри идущей сессии
    sw.start(); t = 40 * M;
    expect(sw.credit(store.sessions(), { startedAt: 25 * M })).toBe(0);
    expect(sw.commit(store, { startedAt: 25 * M })).toBe(null);
    expect(store.sessions().length).toBe(2);
  });
  it('инструмент, открытый во время записанного секундомера, не засчитывается дважды', () => {
    const store = mkStore();
    expect(recordToolTime(store, 'metro', 0, 5 * M, 5 * M, { overlapMs: 5 * M - 5000 })).toBe(false);
    expect(recordToolTime(store, 'metro', 0, 5 * M, 5 * M, { mode: 'strict', overlapMs: 60e3 })).toBe(true);
    expect([store.sessions()[0].dur, store.sessions()[0].mode]).toEqual([240, 'strict']);
  });
});

describe('режимы учёта', () => {
  it('режим по настройкам; при погасшем экране строгий не считает, обычный — пока звучит', () => {
    expect([trackMode({}), trackMode({ trackMode: 'strict' }), trackMode({ trackMode: 'x' })]).toEqual(['normal', 'strict', 'normal']);
    expect([countsWhileHidden('strict', true), countsWhileHidden('normal', true), countsWhileHidden('normal', false)]).toEqual([false, true, false]);
  });
  it('время «вдали» не идёт в сессию, пауза его закрывает; режим — в записи', () => {
    const a = createActive({ type: 'free', mode: 'strict' }, 0);
    awayStart(a, 10 * M);
    expect(elapsed(a, 15 * M)).toBe(10 * 60);
    awayEnd(a, 20 * M);
    expect(elapsed(a, 30 * M)).toBe(20 * 60);
    awayStart(a, 30 * M); pause(a, 35 * M);         // пауза во время «вдали»: вдали — до паузы
    expect([a.awaySince, elapsed(a, 50 * M)]).toEqual([null, 20 * 60]);
    resume(a, 40 * M);
    awayStart(a, 45 * M);                              // на паузе «вдали» не начинается, после — да
    expect(elapsed(a, 50 * M)).toBe(25 * 60);
    const s = summarize(a, { endAt: 47 * M });
    expect(Math.round(s.dur)).toBe(25 * 60);
    expect(buildRecord(a, { dur: s.dur, best: null }, 50 * M).mode).toBe('strict');
    expect(buildRecord(createActive({ type: 'free' }, 0), { dur: 90, best: null }).mode).toBe('normal');
  });
});

describe('секундомер: остановка задним числом', () => {
  it('время после остановки не засчитывается, а остановка раньше старта — без отрезка', () => {
    let t = 1000;
    const sw = createStopwatch({}, { now: () => t });
    sw.start(); t = 61000; sw.pause(31000);
    expect(sw.elapsed()).toBe(30);
    sw.start(); t = 90000; sw.pause(10);
    expect(sw.state.segs.length).toBe(1);
  });
});
