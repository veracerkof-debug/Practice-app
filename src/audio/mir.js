// Разбор записи моделями на устройстве (все — MIT, ONNX, из build/models.json в public/models/mir/, в APK и Windows):
// тональность — S-KEY (Deezer, 0,3 МБ), доли, сильные доли и темп — Beat This! (CPJKU, малая модель 10 МБ, мел-спектр —
// вспомогательный граф), аккорды — ChordMini ChordNet 2E1D (17 МБ, лог-CQT считается у нас: src/music/cqt.js).
// Счёт — в рабочем потоке (mir.worker.js), главный поток свободен; одна запись за раз. В веб-сборке моделей нет —
// songanalyze.js берёт свой разбор (хрома и огибающая).
import { decodeMono } from '../core/songanalyze.js';

export const mirSupported = () => !(typeof __WEB_BUILD__ !== 'undefined' && __WEB_BUILD__) && typeof Worker !== 'undefined';

let worker = null, ready = null;
function engine() {
  if (ready) return ready;
  worker = new Worker(new URL('./mir.worker.js', import.meta.url), { type: 'module' });
  ready = new Promise((res, rej) => {
    const h = (e) => { if (e.data.k === 'ready') { worker.removeEventListener('message', h); res(worker); } };
    worker.addEventListener('message', h);
    worker.addEventListener('error', (e) => rej(new Error(e.message || 'worker')), { once: true });
    worker.postMessage({ k: 'init', wasmPaths: new URL('ort/', document.baseURI).href, base: new URL('models/mir/', document.baseURI).href });
  }).catch((e) => { drop(); throw e; });
  return ready;
}
function drop() { if (worker) { try { worker.terminate(); } catch { /* */ } } worker = null; ready = null; }

// blob → { key: { pc, minor, conf, margin }, beats: { beats, downbeats, bpm, beatsPerBar }, chords: [{ t, d, c }] };
// onStage('decode' | 'key' | 'beats' | 'chords'); cancel() — прервать (поток закрывается, модели перегрузятся)
export function analyzeMir(blob, { onStage = () => {}, what = ['key', 'beats', 'chords'] } = {}) {
  let cancelled = false;
  const run = (async () => {
    onStage('decode');
    const x = await decodeMono(blob);
    if (cancelled) throw new Error('cancel');
    const w = await engine();
    if (cancelled) throw new Error('cancel');
    return new Promise((res, rej) => {
      const h = (e) => {
        const m = e.data;
        if (m.k === 'stage') onStage(m.stage);
        else if (m.k === 'done') { w.removeEventListener('message', h); res(m); }
        else if (m.k === 'error') { w.removeEventListener('message', h); rej(new Error(m.msg)); }
      };
      w.addEventListener('message', h);
      w.addEventListener('error', () => rej(new Error(cancelled ? 'cancel' : 'worker')), { once: true });
      w.postMessage({ k: 'run', x, what }, [x.buffer]);
    });
  })();
  return { promise: run, cancel() { cancelled = true; drop(); } };
}
