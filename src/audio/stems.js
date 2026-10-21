// Разделение записи на дорожки (вокал, ударные, бас, остальное) — модель HTDemucs (Meta, MIT). Всё на устройстве:
// модель — файл models/demucs/… из сборки (build/models.json), сеть не нужна. Два движка с одной моделью:
// • Android — нативный ONNX Runtime на всех ядрах (плагин Stems: StemsPlugin.java, Demucs.java) — WebView не даёт
//   WebAssembly больше одного потока, нативно в разы быстрее; запись уходит в плагин файлом, дорожки читаются
//   из кэша по Capacitor.convertFileSrc;
// • Windows и браузер — ONNX Runtime Web (WebAssembly; с изоляцией — в несколько потоков, иначе в один) и demucs-web
//   (STFT, окна, склейка) в своём рабочем потоке (stems.worker.js), интерфейс не замирает.
// Ход — по сегментам (~8 с записи), отмена — между сегментами.
import { Capacitor, registerPlugin } from '@capacitor/core';
import { peaks } from './voicefx.js';

const Native = Capacitor.isNativePlatform() ? registerPlugin('Stems') : null;
export const stemsNative = () => !!Native;

const SR = 44100;
export const PARTS = ['vocals', 'drums', 'bass', 'other'];

// Потоков для счёта: нативно — все ядра (до 8); WebAssembly с изоляцией (Windows) — до 4, иначе один
export const stemsThreads = () => (Native ? Math.max(1, Math.min(8, navigator.hardwareConcurrency || 4)) : globalThis.crossOriginIsolated ? Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1)) : 1);
// Оценка времени (с) для записи длиной dur с: нативно на 4 ядрах ×1,25 (телефон — с запасом), WebAssembly на 4 потоках
// ×1,9, на одном ×4,5
export const estimateSec = (dur) => Math.round(dur * (Native ? 2 : stemsThreads() > 1 ? 2.5 : 5.5));

let worker = null, ready = null;
// Рабочий поток с моделью (stems.worker.js): создаётся один раз, модель грузится один раз
function engine(onLoad = () => {}) {
  if (ready) return ready;
  worker = new Worker(new URL('./stems.worker.js', import.meta.url), { type: 'module' });
  ready = new Promise((res, rej) => {
    const h = (e) => { const m = e.data; if (m.k === 'load') onLoad(m.f); else if (m.k === 'ready') { worker.removeEventListener('message', h); res(worker); } else if (m.k === 'error') { worker.removeEventListener('message', h); rej(new Error(m.msg)); } };
    worker.addEventListener('message', h);
    worker.addEventListener('error', (e) => rej(new Error(e.message || 'worker')), { once: true });
    worker.postMessage({ k: 'init', wasmPaths: new URL('ort/', document.baseURI).href, modelUrl: new URL('models/demucs/htdemucs_embedded.onnx', document.baseURI).href, threads: stemsThreads() });
  }).catch((e) => { try { worker.terminate(); } catch { /* */ } worker = null; ready = null; throw e; });
  return ready;
}
export const stemsReady = () => !!worker && !!ready;

// Запись (Blob) → 44,1 кГц стерео
export async function decodeStereo(blob) {
  const ab = await blob.arrayBuffer(), oc = new OfflineAudioContext(2, SR, SR), buf = await oc.decodeAudioData(ab);
  const L = buf.getChannelData(0), R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
  return { left: L, right: R, dur: buf.duration };
}

// Нативный путь (Android): запись → файлы плагина кусками (base64, по 1 МБ) → счёт → четыре файла float32 L R
const CHUNK = 1 << 20;
function b64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
async function sendChannel(ch, data, onFrac, isCancelled) {
  const u8 = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  for (let i = 0; i < u8.length; i += CHUNK) {
    if (isCancelled()) throw new Error('cancel');
    await Native.push({ ch, b64: b64(u8.subarray(i, i + CHUNK)) });
    onFrac((i + CHUNK) / u8.length);
  }
}
async function readPart(path, total) {
  const ab = await (await fetch(Capacitor.convertFileSrc(path))).arrayBuffer();
  const il = new Float32Array(ab), n = Math.min(total, il.length >> 1), left = new Float32Array(n), right = new Float32Array(n);
  for (let i = 0; i < n; i++) { left[i] = il[2 * i]; right[i] = il[2 * i + 1]; }
  return { left, right };
}
function separateNative(blob, onStage) {
  let cancelled = false, running = false, sub = null;
  const isCancelled = () => cancelled;
  const run = (async () => {
    try {
      onStage('decode', 0);
      const { left, right, dur } = await decodeStereo(blob);
      if (cancelled) throw new Error('cancel');
      await Native.begin();
      await sendChannel(0, left, (f) => onStage('decode', f * 0.5), isCancelled);
      await sendChannel(1, right, (f) => onStage('decode', 0.5 + f * 0.5), isCancelled);
      if (cancelled) throw new Error('cancel');
      onStage('separate', 0);
      sub = await Native.addListener('progress', ({ f }) => onStage('separate', Math.min(1, f || 0)));
      running = true;
      const { files, total } = await Native.run();
      running = false;
      const parts = {};
      for (const k of PARTS) parts[k] = await readPart(files[k], total);
      return { ...parts, dur, sr: SR };
    } finally {
      running = false;
      if (sub) sub.remove();
      Native.clean().catch(() => {});
    }
  })();
  return { promise: run, cancel() { cancelled = true; if (running) Native.cancel().catch(() => {}); } };
}

// Разделить: blob → { vocals: { left, right }, … }; onStage('load' | 'decode' | 'separate', доля 0…1); cancel() — прервать
export function separate(blob, { onStage = () => {} } = {}) {
  if (Native) return separateNative(blob, onStage);
  let cancelled = false;
  const run = (async () => {
    onStage('load', 0);
    const w = await engine((f) => onStage('load', f));
    if (cancelled) throw new Error('cancel');
    onStage('decode', 0);
    const { left, right, dur } = await decodeStereo(blob);
    if (cancelled) throw new Error('cancel');
    onStage('separate', 0);
    const parts = await new Promise((res, rej) => {
      const h = (e) => { const m = e.data; if (m.k === 'progress') onStage('separate', m.f); else if (m.k === 'done') { w.removeEventListener('message', h); res(m.parts); } else if (m.k === 'error') { w.removeEventListener('message', h); rej(new Error(m.msg)); } };
      w.addEventListener('message', h);
      const L = new Float32Array(left), R = new Float32Array(right); // копии — исходный буфер остаётся у вызывающего
      w.postMessage({ k: 'run', left: L, right: R }, [L.buffer, R.buffer]);
    });
    return { ...parts, dur, sr: SR };
  })();
  return { promise: run, cancel() { cancelled = true; if (worker) worker.postMessage({ k: 'cancel' }); } };
}

// Волна для медиатеки (как у записей): 600 столбиков, нормировано
export const stemPeaks = (ch) => { const pk = peaks(ch, 600), mx = Math.max(1e-6, ...pk); return Array.from(pk, (v) => Math.round((v / mx) * 100) / 100); };
