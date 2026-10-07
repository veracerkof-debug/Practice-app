import { describe, it, expect } from 'vitest';
import { createStore, LS, isBackup } from '../src/core/store.js';
import * as S from '../src/core/session.js';
import { heatmap, weeklyTotals, monthSplit, byTool, bySongField, byFreeTag } from '../src/core/stats.js';
import { ensureLib, saveLibItem, deleteLibItem, saveSong, deleteSong, listSongs, newLibItem } from '../src/core/library.js';
import { isOn, setFeature, changeGoal, toggleDay } from '../src/core/settings.js';
import { DAY, weekStart } from '../src/core/time.js';

function memStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
}
const NOW = new Date(2026, 9, 7, 15, 30).getTime();
const mk = (init) => { let t = NOW; const st = memStorage(init); return { st, store: createStore({ storage: st, now: () => t }), at: (v) => (t = v) }; };

describe('store', () => {
  it('загружает данные прототипа и дополняет настройки', () => {
    const { store } = mk({ [LS]: JSON.stringify({ version: 1, songs: [], sessions: [{ id: 'a', start: NOW - 864e5, dur: 5 }], settings: { goalMin: 60 } }) });
    expect(store.state.settings.goalMin).toBe(60);
    expect(store.state.settings.metro.bpm).toBe(90);
    expect(store.sessions()).toHaveLength(1);
  });
  it('игнорирует повреждённые данные и чужую версию', () => {
    expect(mk({ [LS]: '{oops' }).store.state.sessions).toEqual([]);
    expect(mk({ [LS]: JSON.stringify({ version: 2, sessions: [{ id: 'x' }] }) }).store.state.sessions).toEqual([]);
  });
  it('сохраняет и оповещает подписчиков', () => {
    const { st, store } = mk();
    let n = 0; store.subscribe(() => n++);
    store.save();
    expect(n).toBe(1);
    expect(JSON.parse(st.getItem(LS)).updatedAt).toBe(NOW);
  });
  it('импорт: считает новые сессии, отвергает чужие файлы', () => {
    const { store } = mk();
    store.state.sessions.push({ id: 'a', start: 1, dur: 60, updatedAt: 1 });
    expect(store.importBackup({ version: 1, songs: [], sessions: [{ id: 'a', start: 1, dur: 60, updatedAt: 0 }, { id: 'b', start: 2, dur: 60 }] })).toBe(1);
    expect(isBackup({ version: 1 })).toBe(false);
    expect(() => store.importBackup({ foo: 1 })).toThrow();
  });
  it('сброс сохраняет тему', () => {
    const { store } = mk();
    store.state.settings.theme = 'oled';
    store.state.sessions.push({ id: 'a' });
    store.reset();
    expect(store.state.sessions).toEqual([]);
    expect(store.state.settings.theme).toBe('oled');
  });
});

describe('сессия', () => {
  it('пауза не идёт в зачёт', () => {
    const a = S.createActive({ type: 'free' }, NOW);
    S.pause(a, NOW + 60000);
    expect(S.elapsed(a, NOW + 600000)).toBe(60);
    S.resume(a, NOW + 120000);
    expect(S.elapsed(a, NOW + 180000)).toBe(120);
  });
  it('короче минуты — короткая сессия', () => {
    const a = S.createActive({ type: 'free' }, NOW);
    expect(S.summarize(a, { now: NOW + 59000 }).short).toBe(true);
    expect(S.summarize(a, { now: NOW + 60000 }).short).toBe(false);
  });
  it('бездействие: 45 минут без касаний — вопрос, даже под метроном; без ответа 3 минуты — конец по последнему касанию', () => {
    const a = S.createActive({ type: 'free' }, NOW);
    S.noteHeard(a, NOW + S.IDLE_MS); // метроном звучит
    expect(S.idleAction(a, { sounding: true }, NOW + S.IDLE_MS)).toBe(null);
    const r = S.idleAction(a, { sounding: true }, NOW + S.IDLE_MS + 1);
    expect(r).toEqual({ ask: true, endAt: NOW });
    S.touch(a, NOW + 1000);
    expect(S.idleAction(a, { sounding: true }, NOW + S.IDLE_MS + 1)).toBe(null);
    // вопросы выключены — сразу завершение по последнему касанию
    expect(S.idleAction(a, { sounding: true, ask: false }, NOW + S.IDLE_MS + 1001)).toEqual({ end: true, endAt: NOW + 1000 });
    S.markAsked(a, a.last, NOW + S.IDLE_MS + 2000);
    expect(S.idleAction(a, { sounding: true }, NOW + S.IDLE_MS + 2000 + S.ASK_WAIT_MS)).toBe(null);
    expect(S.idleAction(a, { sounding: true }, NOW + S.IDLE_MS + 2001 + S.ASK_WAIT_MS)).toEqual({ end: true, endAt: NOW + 1000 });
    // завершение по бездействию считает время до последнего касания
    expect(S.summarize(a, { endAt: a.last, now: NOW + 9e6 }).dur).toBe(1);
    S.confirmPlaying(a, NOW + 5e6);
    expect([a.askedAt, a.last]).toEqual([null, NOW + 5e6]);
  });
  it('10 минут без звука и действий: с микрофоном — конец сразу, без него — вопрос; на паузе — ничего', () => {
    const a = S.createActive({ type: 'free' }, NOW);
    S.noteHeard(a, NOW + 60000);
    const t = NOW + 60000 + S.QUIET_MS + 1;
    expect(S.idleAction(a, {}, t - 2)).toBe(null);
    expect(S.idleAction(a, { mic: true }, t)).toEqual({ end: true, endAt: NOW + 60000 });
    expect(S.idleAction(a, {}, t)).toEqual({ ask: true, endAt: NOW + 60000 });
    expect(S.idleAction(a, { ask: false }, t)).toEqual({ end: true, endAt: NOW + 60000 });
    expect(S.idleAction(a, { sounding: true }, t)).toBe(null);
    S.pause(a, NOW + 70000);
    expect(S.idleAction(a, {}, t)).toBe(null);
  });
  it('завершение задним числом не вычитает паузы и «вдали», что были после него', () => {
    const a = S.createActive({ type: 'free' }, NOW);
    S.pause(a, NOW + 600000); S.resume(a, NOW + 900000);   // пауза 5 мин
    S.awayStart(a, NOW + 1200000); S.awayEnd(a, NOW + 1500000); // вдали 5 мин
    expect(S.elapsed(a, NOW + 1800000)).toBe(20 * 60);
    expect(S.summarize(a, { endAt: NOW + 600000, now: NOW + 1800000 }).dur).toBe(10 * 60);
    expect(S.summarize(a, { endAt: NOW + 1300000, now: NOW + 1800000 }).dur).toBe(15 * 60);
  });
  it('старая активная сессия (суммы вместо отрезков) считается как раньше', () => {
    const a = { startedAt: NOW, pausedTotal: 60000, awayTotal: 120000, pausedAt: null, awaySince: null };
    expect(S.elapsed(a, NOW + 600000)).toBe(7 * 60);
  });
  it('подтверждение звуком: тишина дольше 5 минут не идёт в значок', () => {
    const a = S.createActive({ type: 'free' }, NOW);
    a.micFrom = NOW;
    S.noteHeard(a, NOW + 4 * 60000, { mic: true });   // 4 мин — не в счёт
    S.noteHeard(a, NOW + 12 * 60000, { mic: true });  // 8 мин тишины
    const sum = S.summarize(a, { now: NOW + 20 * 60000, mic: true }); // и ещё 8 в конце
    expect(sum.quiet).toBe(16 * 60);
    expect(S.buildRecord(a, sum, NOW + 20 * 60000).quiet).toBe(16 * 60);
    expect(S.buildRecord(a, { dur: 60, best: null }, NOW).quiet).toBe(undefined);
  });
  it('лучший темп — самый быстрый, на котором играли от 15 секунд', () => {
    const a = S.createActive({ type: 'song', songId: 'x' }, NOW);
    S.addBpmTime(a, 100, 60); S.addBpmTime(a, 140, 10); S.addBpmTime(a, 120, 15);
    expect(S.bestBpm(a.bpmTime)).toBe(120);
    expect(S.bestBpm({})).toBe(null);
  });
  it('та же сессия или другая', () => {
    const a = S.createActive({ type: 'song', songId: 'x' }, NOW);
    expect(S.isSameActive(a, 'song', 'x')).toBe(true);
    expect(S.isSameActive(a, 'song', 'y')).toBe(false);
    expect(S.isSameActive(a, 'free')).toBe(false);
  });
  it('сохранение сессии по песне обновляет выученность, темп и метроном', () => {
    const { store } = mk();
    const id = saveSong(store, null, { title: 'Caprice', difficulty: 5, masteryPct: 20 });
    const a = S.createActive({ type: 'song', songId: id }, NOW);
    const cfg = S.metroForSession(store.songById(id), store.state.settings.metro);
    const sum = S.summarize(a, { now: NOW + 600000 });
    const rec = S.buildRecord(a, { ...sum, note: '  ок ' }, NOW + 600000);
    S.commitSession(store, rec, { masteryPct: 60, confidentBpm: 96, metro: cfg });
    const s = store.songById(id);
    expect([s.masteryPct, s.mastery, s.currentBpm, s.metro.bpm]).toEqual([60, 3, 96, 90]);
    expect(store.sessions()[0]).toMatchObject({ dur: 600, bpm: 96, note: 'ок', tag: null });
  });
  it('метроном песни: текущий темп или 70% от цели', () => {
    const def = { bpm: 90 };
    expect(S.metroForSession({ targetBpm: 200 }, def).bpm).toBe(140);
    expect(S.metroForSession({ currentBpm: 110, targetBpm: 200 }, { bpm: 90 }).bpm).toBe(110);
    expect(S.metroForSession(null, def)).toBe(def);
  });
  it('активная сессия переживает перезапуск', () => {
    const st = memStorage();
    const a = S.createActive({ type: 'free' }, NOW);
    S.saveActive(a, st);
    expect(S.loadActive(st)).toEqual(a);
    S.saveActive(null, st);
    expect(S.loadActive(st)).toBe(null);
  });
});

describe('инструмент вне сессии', () => {
  it('считает время, пока страница видна; от 10 секунд', () => {
    const { store } = mk();
    const tv = S.createToolView('tuner', { now: NOW });
    S.toolViewVisibility(tv, false, NOW + 5000);
    S.toolViewVisibility(tv, true, NOW + 100000);
    expect(S.toolViewMs(tv, NOW + 104000)).toBe(9000);
    expect(S.recordToolTime(store, 'tuner', tv.start, 9000)).toBe(false);
    expect(S.recordToolTime(store, 'tuner', tv.start, 12000)).toBe(true);
    store.state.settings.autoTrack = false;
    expect(S.recordToolTime(store, 'tuner', tv.start, 60000)).toBe(false);
  });
  it('дописывает время после перезапуска', () => {
    const { st, store } = mk();
    S.saveToolView(S.createToolView('metro', { now: NOW - 30000 }), st, NOW);
    expect(S.recoverToolView(store, st)).toBe(true);
    expect(store.allSessions()[0]).toMatchObject({ type: 'tool', tool: 'metro', dur: 30 });
    expect(st.getItem(S.LS_TV)).toBe(null);
  });
});

describe('статистика', () => {
  const ses = [
    { type: 'free', tag: 'Джем', start: NOW - 1000, dur: 600 },
    { type: 'tool', tool: 'metro', start: NOW - 2000, dur: 120 },
    { type: 'song', songId: 'a', start: NOW - DAY, dur: 300 },
    { type: 'song', songId: 'gone', start: NOW - DAY, dur: 300 },
    { type: 'free', start: NOW - 40 * DAY, dur: 900 },
  ];
  it('карта 12 недель', () => {
    const h = heatmap(ses, NOW);
    expect(h.cells).toHaveLength(84);
    expect(h.cells[0].t).toBe(weekStart(NOW) - 77 * DAY);
    expect(h.active).toBe(3);
    expect(h.cells.at(-1).future).toBe(true);
  });
  it('по неделям, месяц, разбивки', () => {
    expect(weeklyTotals(ses, NOW).weeks.at(-1).v).toBe(1320);
    expect(monthSplit(ses, NOW)).toEqual({ total: 1320, free: 600, tool: 120, songs: 600 });
    expect(byTool(ses)).toEqual([{ n: 'metro', v: 120 }]);
    expect(bySongField(ses, [{ id: 'a', genre: 'Рок' }], 'genre')).toEqual([{ n: 'Рок', v: 300 }]);
    expect(byFreeTag(ses)).toEqual([{ n: '', v: 900 }, { n: 'Джем', v: 600 }]);
  });
});

describe('библиотека', () => {
  it('метки по умолчанию на языке пользователя; жанры песен добавляются', () => {
    const { store } = mk();
    store.state.songs.push({ id: 'x', title: 'X', genre: 'Своё' });
    const L = ensureLib(store.state, (k) => k.toUpperCase());
    expect(L.cats[0].name).toBe('LIB.CATS.WORK');
    expect(L.genres.at(-1).name).toBe('Своё');
    expect(ensureLib(store.state)).toBe(L);
  });
  it('переименование жанра переносит песни; удаление тега снимает его с песен', () => {
    const { store } = mk();
    const L = ensureLib(store.state, () => 'Рок');
    const g = L.genres[0], tag = L.tags[0];
    const id = saveSong(store, null, { title: 'A', genre: 'рок', tags: [tag.id], difficulty: 2, masteryPct: 40 });
    saveLibItem(store, 'genres', { ...g, name: 'Hard rock' });
    expect(store.songById(id).genre).toBe('Hard rock');
    deleteLibItem(store, 'tags', tag.id);
    expect(store.songById(id).tags).toEqual([]);
    const n = newLibItem(store.state.settings.lib, 'cats');
    saveLibItem(store, 'cats', { ...n, name: 'Новая' });
    expect(store.state.settings.lib.cats.at(-1).name).toBe('Новая');
  });
  it('песни: пустое название не сохраняется, удаление мягкое', () => {
    const { store } = mk();
    expect(saveSong(store, null, { title: '  ', masteryPct: 0 })).toBe(null);
    const id = saveSong(store, null, { title: 'A', targetBpm: '120', currentBpm: 'x', masteryPct: 0 });
    expect(store.songById(id)).toMatchObject({ targetBpm: 120, currentBpm: null, mastery: 1 });
    deleteSong(store, id);
    expect(store.songs()).toEqual([]);
    expect(store.state.songs).toHaveLength(1);
  });
  it('фильтры и сортировка', () => {
    const L = { genres: [{ id: 'g', name: 'Рок' }], tags: [{ id: 't' }], cats: [] };
    const songs = [
      { id: 'a', title: 'Бета', artist: 'X', cat: 'c1', genre: 'рок', tags: ['t'], createdAt: 1, difficulty: 1 },
      { id: 'b', title: 'Альфа', artist: 'Y', cat: null, genre: '', tags: [], createdAt: 2, difficulty: 5 },
    ];
    const ses = [{ songId: 'a', start: 10, dur: 60 }];
    const ids = (f) => listSongs(songs, ses, L, f).list.map((x) => x.s.id);
    expect(ids({})).toEqual(['a', 'b']);
    expect(ids({ sort: 'title' })).toEqual(['b', 'a']);
    expect(ids({ sort: 'difficulty' })).toEqual(['b', 'a']);
    expect(ids({ cat: '_none' })).toEqual(['b']);
    expect(ids({ q: 'y' })).toEqual(['b']);
    expect(ids({ genre: 'РОК' })).toEqual(['a']);
    expect(ids({ tag: 't' })).toEqual(['a']);
    expect(listSongs(songs, ses, L, {}).usedTags).toEqual([{ id: 't' }]);
  });
});

describe('настройки устройства', () => {
  it('разделы новых модулей сохраняются между запусками', async () => {
    const { loadDevice, saveDevice } = await import('../src/core/device.js');
    const st = memStorage();
    const d = loadDevice(st);
    d.timer = { work: 30, style: 'flip' };
    d.metro = { adj: 'arrows' };
    saveDevice(d, st);
    const again = loadDevice(st);
    expect([again.timer, again.metro]).toEqual([{ work: 30, style: 'flip' }, { adj: 'arrows' }]);
  });
});

describe('настройки', () => {
  it('функции, цель, дни', () => {
    const { store } = mk();
    setFeature(store, 'streak', false);
    expect(isOn(store.state.settings, 'streak')).toBe(false);
    setFeature(store, 'streak', true);
    expect(isOn(store.state.settings, 'streak')).toBe(true);
    changeGoal(store, -1000);
    expect(store.state.settings.goalMin).toBe(30);
    toggleDay(store, 6);
    expect(store.state.settings.days[6]).toBe(1);
    expect(store.state.settings.configured).toBe(true);
  });
});
