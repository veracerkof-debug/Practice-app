// Измеритель нагрузки звука: сколько времени звуковой поток тратит на расчёт одного кванта относительно его длины
// (0…1; выше 1 — поток не успевает, слышно захлёбывание). Источник — renderCapacity браузера, если есть, иначе
// свой зонд в AudioWorklet (loadprobe.js). Показания сглажены, раз в секунду; подписка — для микшера и настроек.
// Перегрузка (выше 0,95 две секунды подряд) — строка в технический журнал. Без DOM.
// Журнал — через переданный logger(msg) (ядро подставляет свой log.js), чтобы звук не зависел от ядра.

import { setSqueeze, PERF } from './perf.js';

export const LOAD_WARN = 0.7, LOAD_HIGH = 0.9; // пороги для цвета: жёлтый, красный

// Сглаживание и пик за последние секунды — чистая функция для тестов: state → новое state
export function foldLoad(state, { load, peak = load }) {
  const s = state || { avg: 0, peak: 0, hist: [], over: 0 };
  const avg = s.avg ? s.avg * 0.6 + load * 0.4 : load, hist = s.hist.concat(load).slice(-30);
  return { avg, peak: Math.max(peak, ...hist.slice(-5)), hist, over: load > 0.95 ? s.over + 1 : 0 };
}
export const loadLevel = (v) => (v >= LOAD_HIGH ? 'high' : v >= LOAD_WARN ? 'warn' : 'ok');

// detail() — строка с подробностями для журнала (буфер, голоса, экран) — подставляет ядро; onHeavy() — ужатие уже
// предельное, а нагрузка выше 90 %: звук облегчает то, что не голоса (реверберация), — один раз
export function createLoadMeter(c, logger = () => {}, detail = () => '', onHeavy = () => {}) {
  let state = null, subs = new Set(), node = null, cap = null, warned = false, lowSince = 0, lastStep = 0, heavy = false;
  const emit = () => subs.forEach((fn) => { try { fn(api); } catch { /* */ } });
  const take = (m) => {
    state = foldLoad(state, m);
    if (state.over >= 2 && !warned) { warned = true; logger('перегрузка звука: ' + Math.round(state.avg * 100) + ' % · ' + detail()); }
    if (state.over === 0) warned = false;
    // ужатие (perf.js): выше 90 % — шаг вверх не чаще раза в 4 с; ниже 55 % подряд 15 с — шаг вниз
    const now = Date.now();
    if (state.avg > 0.9 && PERF.squeeze < 2 && now - lastStep > 4000) { setSqueeze(PERF.squeeze + 1); lastStep = now; lowSince = 0; logger('нагрузка ' + Math.round(state.avg * 100) + ' % — голосов меньше (ужатие ' + PERF.squeeze + ')'); }
    else if (state.avg > 0.9 && PERF.squeeze >= 2 && !heavy && now - lastStep > 4000) { heavy = true; try { onHeavy(); } catch { /* */ } }
    else if (state.avg < 0.55 && PERF.squeeze > 0) { if (!lowSince) lowSince = now; else if (now - lowSince > 15000) { setSqueeze(PERF.squeeze - 1); lastStep = now; lowSince = 0; logger('нагрузка спала — голоса возвращены (ужатие ' + PERF.squeeze + ')'); } }
    else lowSince = 0;
    emit();
  };
  async function start() {
    if (node || cap) return;
    try {
      if (c.renderCapacity && c.renderCapacity.start) { // Chrome: загрузка рендера от самого браузера
        cap = c.renderCapacity;
        cap.onupdate = (e) => take({ load: e.averageLoad, peak: e.peakLoad });
        cap.start({ updateInterval: 1 });
        return;
      }
      if (!c.audioWorklet) return;
      await c.audioWorklet.addModule(new URL('./loadprobe.js', import.meta.url));
      node = new AudioWorkletNode(c, 'melete-load', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1] });
      const mute = c.createGain(); mute.gain.value = 0;
      node.connect(mute).connect(c.destination); // не звучит, но участвует в расчёте — иначе поток к нему не приходит
      node.port.onmessage = (e) => take(e.data);
    } catch (e) { logger('измеритель нагрузки недоступен: ' + (e && e.message)); }
  }
  const api = {
    start,
    get ready() { return !!(node || cap); },
    get value() { return state ? state.avg : 0; },   // 0…1+, сглажено
    get peak() { return state ? state.peak : 0; },
    get level() { return loadLevel(state ? state.avg : 0); },
    get squeeze() { return PERF.squeeze; },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
  return api;
}
