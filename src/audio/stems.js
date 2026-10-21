// Разделение записи на дорожки (вокал, ударные, бас, остальное) — модель HTDemucs (Meta, MIT). Всё на устройстве:
// модель — файл models/demucs/… из сборки (build/models.json), сеть не нужна. Два движка с одной моделью:
// • Android — нативный ONNX Runtime на всех ядрах (плагин Stems: StemsPlugin.java, Demucs.java) — WebView не даёт
//   WebAssembly больше одного потока, нативно в разы быстрее; запись уходит в плагин файлом, дорожки читаются
//   из кэша по Capacitor.convertFileSrc;
// • Windows — нативный ONNX Runtime из Rust (src-tauri/src/demucs.rs; команды stems_*, адаптер stemsdesktop.js с тем же
//   контрактом, что у плагина Android);
// • браузер (и запасной путь) — ONNX Runtime Web (WebAssembly; с изоляцией — в несколько потоков, иначе в один) и свой
//   движок demucs.js (STFT, окна, склейка) в своём рабочем потоке (stems.worker.js), интерфейс не замирает.
// Ход — по сегментам (~8 с записи), отмена — между сегментами.
import { Capacitor, registerPlugin } from '@capacitor/core';
import { peaks } from './voicefx.js';
import { isDesktop } from '../core/desktop.js';

let Native = Capacitor.isNativePlatform() ? registerPlugin('Stems') : null;
if (!Native && isDesktop()) import('./stemsdesktop.js').then((m) => { Native = m.desktopStems; }).catch(() => {});
// Адаптер Windows или плагин Android: у прокси Capacitor «есть» любое свойство (и desktop, и pushRaw — функции),
// поэтому различать только по платформе
const onDesktop = () => !Capacitor.isNativePlatform() && isDesktop();
export const stemsNative = () => !!Native || isDesktop();
// В веб-сборке моделей нет (рабочий поток подменён пустышкой) — разделение недоступно, кнопки прячутся
export const stemsSupported = () => !(typeof __WEB_BUILD__ !== 'undefined' && __WEB_BUILD__);

const SR = 44100;
// Режимы: '2' — вокал и инструментал (из четырёх дорожек: остальное суммируется), '4' — вокал, ударные, бас,
// остальное (модель htdemucs, 180 МБ), '6' — ещё гитара и клавиши (htdemucs_6s, 55 МБ, fp16). Порядок — как показывать
export const MODES = ['2', '4', '6'];
export const PARTS_OF = { '2': ['vocals', 'inst'], '4': ['vocals', 'drums', 'bass', 'other'], '6': ['vocals', 'drums', 'bass', 'guitar', 'piano', 'other'] };
export const PARTS = PARTS_OF['4'];
export const ALL_PARTS = ['vocals', 'inst', 'drums', 'bass', 'guitar', 'piano', 'other'];
const modelOf = (mode) => (mode === '6' ? 'models/demucs/htdemucs_6s.onnx' : 'models/demucs/htdemucs_embedded.onnx');
// Дорожка «пуста» (в записи этого инструмента нет), если её энергия ниже микса на столько дБ
export const EMPTY_DB = -25;
export function stemLevelDb(part, mix) {
  let e = 0, m = 0;
  for (let i = 0; i < mix.left.length; i += 2) { e += part.left[i] * part.left[i] + part.right[i] * part.right[i]; m += mix.left[i] * mix.left[i] + mix.right[i] * mix.right[i]; }
  return m > 0 ? 10 * Math.log10(Math.max(1e-12, e / m)) : -99;
}
export const stemEmpty = (part, mix) => stemLevelDb(part, mix) < EMPTY_DB;
// Из дорожек модели (drums, bass, other, vocals[, guitar, piano]) — дорожки режима: '2' складывает всё, кроме вокала
export function partsForMode(raw, mode) {
  const out = {};
  if (mode === '2') {
    out.vocals = raw.vocals;
    const n = raw.vocals.left.length, left = new Float32Array(n), right = new Float32Array(n);
    for (const k of Object.keys(raw)) if (k !== 'vocals') for (let i = 0; i < n; i++) { left[i] += raw[k].left[i]; right[i] += raw[k].right[i]; }
    out.inst = { left, right };
    return out;
  }
  for (const k of PARTS_OF[mode]) if (raw[k]) out[k] = raw[k];
  return out;
}

// Потоков для счёта: нативно — все ядра (до 8); WebAssembly с изоляцией (Windows) — до 4, иначе один
export const stemsThreads = () => (Native || isDesktop() ? Math.max(1, Math.min(16, navigator.hardwareConcurrency || 4)) : globalThis.crossOriginIsolated ? Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1)) : 1);
// Оценка времени (с) для записи длиной dur с: нативно на 4 ядрах ×1,25 (телефон — с запасом), WebAssembly на 4 потоках
// ×1,9, на одном ×4,5
// hq — «ночное» качество (три прохода со сдвигом и шаг окна вдвое короче): ≈ ×4,5
export const HQ_MUL = 4.5;
export const estimateSec = (dur, mode = '4', hq = false) => (hq && isDesktop() ? Math.round(dur * 5 * (mode === '6' ? 1.2 : 1)) // RoFormer ≈ ×2,5 + HTDemucs в три прохода
  : Math.round(dur * (Native || isDesktop() ? (isDesktop() ? 0.5 : 2) : stemsThreads() > 1 ? 2.5 : 5.5) * (mode === '6' ? 1.5 : 1) * (hq ? HQ_MUL : 1)));
// Улучшенное разделение на компьютере — вокал моделью Mel-RoFormer (src-tauri/src/roformer.rs), остальное — HTDemucs по инструменталу
export const hqVocalsModel = () => isDesktop();

let worker = null, ready = null, readyModel = '';
// Рабочий поток с моделью (stems.worker.js): создаётся один раз на модель, модель грузится один раз; другая модель — заново
function engine(model, onLoad = () => {}) {
  if (ready && readyModel === model) return ready;
  if (worker) { try { worker.terminate(); } catch { /* */ } worker = null; ready = null; }
  readyModel = model;
  worker = new Worker(new URL('./stems.worker.js', import.meta.url), { type: 'module' });
  ready = new Promise((res, rej) => {
    const h = (e) => { const m = e.data; if (m.k === 'load') onLoad(m.f); else if (m.k === 'ready') { worker.removeEventListener('message', h); res(worker); } else if (m.k === 'error') { worker.removeEventListener('message', h); rej(new Error(m.msg)); } };
    worker.addEventListener('message', h);
    worker.addEventListener('error', (e) => rej(new Error(e.message || 'worker')), { once: true });
    worker.postMessage({ k: 'init', wasmPaths: new URL('ort/', document.baseURI).href, modelUrl: new URL(model, document.baseURI).href, threads: stemsThreads() });
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
    if (onDesktop()) await Native.pushRaw(ch, u8.subarray(i, i + CHUNK)); else await Native.push({ ch, b64: b64(u8.subarray(i, i + CHUNK)) });
    onFrac((i + CHUNK) / u8.length);
  }
}
async function readPart(path, total) {
  const ab = await (await fetch(Capacitor.convertFileSrc(path))).arrayBuffer();
  const il = new Float32Array(ab), n = Math.min(total, il.length >> 1), left = new Float32Array(n), right = new Float32Array(n);
  for (let i = 0; i < n; i++) { left[i] = il[2 * i]; right[i] = il[2 * i + 1]; }
  return { left, right };
}
function separateNative(blob, onStage, mode, hq) {
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
      const { files, total } = await Native.run({ model: mode === '6' ? '6' : '4', hq: !!hq });
      running = false;
      const raw = {};
      for (const k of Object.keys(files)) raw[k] = onDesktop() ? await Native.readPart(k, total) : await readPart(files[k], total);
      return { parts: partsForMode(raw, mode), mix: { left, right }, dur, sr: SR };
    } finally {
      running = false;
      if (sub) sub.remove();
      Native.clean().catch(() => {});
    }
  })();
  return { promise: run, cancel() { cancelled = true; if (running) Native.cancel().catch(() => {}); } };
}

// Разделить: blob → { parts: { vocals: { left, right }, … }, mix, dur, sr }; onStage('load' | 'decode' | 'separate', доля 0…1);
// mode — '2' | '4' | '6'; hq — «ночное» качество (дольше в HQ_MUL раз, чище края дорожек); cancel() — прервать
export function separate(blob, { onStage = () => {}, mode = '4', hq = false } = {}) {
  if (Native) return separateNative(blob, onStage, mode, hq);
  if (isDesktop()) { // адаптер ещё грузится — дождаться, в браузер не уходить
    let job = null, cancelled = false;
    const promise = import('./stemsdesktop.js').then((m) => { Native = m.desktopStems; if (cancelled) throw new Error('cancel'); job = separateNative(blob, onStage, mode, hq); return job.promise; });
    return { promise, cancel() { cancelled = true; if (job) job.cancel(); } };
  }
  let cancelled = false;
  const run = (async () => {
    onStage('load', 0);
    const w = await engine(modelOf(mode), (f) => onStage('load', f));
    if (cancelled) throw new Error('cancel');
    onStage('decode', 0);
    const { left, right, dur } = await decodeStereo(blob);
    if (cancelled) throw new Error('cancel');
    onStage('separate', 0);
    const raw = await new Promise((res, rej) => {
      const h = (e) => { const m = e.data; if (m.k === 'progress') onStage('separate', m.f); else if (m.k === 'done') { w.removeEventListener('message', h); res(m.parts); } else if (m.k === 'error') { w.removeEventListener('message', h); rej(new Error(m.msg)); } };
      w.addEventListener('message', h);
      const L = new Float32Array(left), R = new Float32Array(right); // копии — исходный буфер остаётся у вызывающего
      w.postMessage({ k: 'run', left: L, right: R, hq: !!hq }, [L.buffer, R.buffer]);
    });
    return { parts: partsForMode(raw, mode), mix: { left, right }, dur, sr: SR };
  })();
  return { promise: run, cancel() { cancelled = true; if (worker) worker.postMessage({ k: 'cancel' }); } };
}

// Волна для медиатеки (как у записей): 600 столбиков, нормировано
export const stemPeaks = (ch) => { const pk = peaks(ch, 600), mx = Math.max(1e-6, ...pk); return Array.from(pk, (v) => Math.round((v / mx) * 100) / 100); };
