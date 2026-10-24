// Пространства реверберации — одно описание и два движка (perf.js: verb):
// • «свёртка» — ConvolverNode с синтезированным импульсом (waves.js: makeIR): точнее, но дорого — 3–6 % потока на
//   пространство даже на настольном процессоре, на телефоне в разы больше (DECISIONS «Нагрузка звука»);
// • «лёгкая» — алгоритм в AudioWorklet (wl/reverb.worklet.js), как в синтезаторах на телефоне: в десятки раз дешевле.
// makeSpace(c, type, dest) → { input, rebuild() }: вход (сюда шлют посылы), выход — в dest через срез низа и верха
// и уровень пространства; rebuild() пересобирает внутренности под текущий движок, вход и выход остаются теми же —
// переключение настройки действует сразу, посылы не переподключаются. Модуль worklet грузится один раз на контекст
// (loadReverbWorklet); пока не готов или не загрузился — свёртка.
import { makeIR } from './waves.js';
import { verbLight, verbAlgo } from './perf.js';

export const SPACES = ['room', 'hall', 'plate', 'cathedral'];
// sec — длина импульса / RT60; damp — затухание верхов; pre — предзадержка; hp/lp — срезы; gain — уровень;
// size — масштаб линий лёгкого движка; decay — множитель RT60 для него (экспоненциальный спад против полиномиального
// импульса свёртки и потерь фильтра верхов); lvl — уровень, подобран по энергии импульса свёртки (замер в браузере)
export const SPACE_DEF = {
  room: { sec: 0.9, damp: 0.7, pre: 0, hp: 160, lp: 7000, gain: 0.5, size: 0.6, decay: 1.36, lvl: 0.137 },
  hall: { sec: 2.8, damp: 0.6, pre: 0, hp: 180, lp: 20000, gain: 0.55, size: 1, decay: 1.5, lvl: 0.173 }, // общая реверберация (строится в getContext)
  plate: { sec: 1.7, damp: 0.25, pre: 0, hp: 200, lp: 12000, gain: 0.45, size: 0.75, decay: 1.28, lvl: 0.118 },
  cathedral: { sec: 5.5, damp: 0.86, pre: 0.035, hp: 140, lp: 5200, gain: 0.62, size: 1.45, decay: 1.6, lvl: 0.357 },
};

const WL = new WeakMap(); // контекст → Promise<boolean>
export function loadReverbWorklet(c) {
  if (!c || !c.audioWorklet) return Promise.resolve(false);
  if (WL.has(c)) return WL.get(c);
  const p = c.audioWorklet.addModule(new URL('./wl/reverb.worklet.js', import.meta.url)).then(() => true).catch(() => false);
  WL.set(c, p);
  return p;
}
// Ревербы Airwindows (вариант dev): ручки оригинала на пространство и уровень — подобраны по энергии отклика к
// лёгкому движку (замер в Node: шум 50 мс, 8 с), чтобы при переключении громкость не прыгала
export const AIRWIN = {
  galactic: { room: { a: 0.8, b: 0.45, c: 0.25, d: 0.2, lvl: 1.93 }, hall: { a: 0.55, b: 0.5, c: 0.4, d: 0.55, lvl: 3.0 }, plate: { a: 0.65, b: 0.7, c: 0.2, d: 0.35, lvl: 1.38 }, cathedral: { a: 0.4, b: 0.4, c: 0.55, d: 1, lvl: 8.47 } },
  verbity: { room: { a: 0.3, b: 0.3, c: 0.5, lvl: 0.198 }, hall: { a: 0.65, b: 0.45, c: 0.45, lvl: 0.249 }, plate: { a: 0.45, b: 0.42, c: 0.2, lvl: 0.165 }, cathedral: { a: 0.95, b: 0.55, c: 0.55, lvl: 0.444 } },
};
const AWL = new WeakMap();
export function loadAirwinWorklet(c) {
  if (!c || !c.audioWorklet) return Promise.resolve(false);
  if (AWL.has(c)) return AWL.get(c);
  const p = c.audioWorklet.addModule(new URL('./wl/airwin.worklet.js', import.meta.url)).then(() => true).catch(() => false);
  AWL.set(c, p);
  return p;
}
export const reverbWorkletReady = (c) => WL.has(c) && WL.get(c).ready === true;

export function makeSpace(c, type, dest) {
  const d = SPACE_DEF[type] || SPACE_DEF.hall;
  const input = c.createGain(), hp = c.createBiquadFilter(), lp = c.createBiquadFilter(), g = c.createGain();
  hp.type = 'highpass'; hp.frequency.value = d.hp;
  lp.type = 'lowpass'; lp.frequency.value = Math.min(d.lp, c.sampleRate / 2 - 100);
  g.gain.value = d.gain;
  input.connect(hp);
  lp.connect(g).connect(dest);
  let core = null, gen = 0, lastErr = null;
  const conv = () => { const cv = c.createConvolver(); cv.buffer = makeIR(c, d.sec, { damp: d.damp, pre: d.pre }); return cv; };
  const light = () => new AudioWorkletNode(c, 'melete-reverb', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], processorOptions: { sec: d.sec * (d.decay || 1), damp: d.damp, pre: d.pre, size: d.size, lvl: d.lvl } });
  const airwin = (algo) => new AudioWorkletNode(c, 'melete-airwin', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], processorOptions: { algo, ...AIRWIN[algo][type in AIRWIN[algo] ? type : 'hall'] } });
  const attach = (node) => {
    if (core) { try { hp.disconnect(core); core.disconnect(); } catch { /* */ } }
    core = node;
    hp.connect(core).connect(lp);
  };
  const build = () => {
    const my = ++gen, algo = verbAlgo();
    if (algo !== 'melete' && AIRWIN[algo] && c.audioWorklet) { // Airwindows; не загрузился — свой движок
      loadAirwinWorklet(c).then((ok) => { if (my !== gen) return; try { attach(ok ? airwin(algo) : conv()); } catch (e) { lastErr = e; attach(conv()); } });
      return;
    }
    if (verbLight() && c.audioWorklet) {
      const p = loadReverbWorklet(c);
      p.then((ok) => { if (my !== gen) return; try { attach(ok ? light() : conv()); } catch (e) { lastErr = e; attach(conv()); } });
    } else attach(conv());
  };
  build();
  return { input, rebuild: build, get engine() { return core && core.buffer !== undefined ? 'conv' : core ? (verbAlgo() !== 'melete' ? verbAlgo() : 'light') : null; }, get error() { return lastErr; } };
}
