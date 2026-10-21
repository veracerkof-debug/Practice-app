// Шумоподавление записи — DeepFilterNet3 нативно на компьютере (Windows, Tauri: src-tauri/src/denoise.rs, команды
// denoise_*). Только там: модель и выполнение (tract) в самой программе; телефон — своя обработка диктофона (voicefx.js).
// Запись переводится в 48 кГц моно, уходит в Rust кусками, обратно приходит очищенный моно-сигнал; результат —
// новый файл в медиатеке рядом с исходником (src/core/jobs.js), исходник не трогается.
import { isDesktop } from '../core/desktop.js';

const core = () => import('@tauri-apps/api/core');
export const denoiseSupported = () => isDesktop() && !(typeof __WEB_BUILD__ !== 'undefined' && __WEB_BUILD__);
export const SR = 48000;
const CHUNK = 4 << 20;
// ≈ ×0,15 длительности на 4 ядрах + запас
export const estimateDenoiseSec = (dur) => Math.round(dur * 0.15 + 3);

export async function decode48k(blob) {
  const C = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  if (!C) throw Object.assign(new Error('decode'), { reason: 'unsupported' });
  const buf = await blob.arrayBuffer();
  let ab;
  try { ab = await new C(1, 1, SR).decodeAudioData(buf); }
  catch { throw Object.assign(new Error('decode'), { reason: 'format' }); }
  const n = ab.length, x = new Float32Array(n), ch = ab.numberOfChannels;
  for (let c = 0; c < ch; c++) { const d = ab.getChannelData(c); for (let i = 0; i < n; i++) x[i] += d[i] / ch; }
  return { x, dur: ab.duration };
}

// blob → { promise: Promise<{ x: Float32Array (48 кГц моно), sr, dur }>, cancel() }; onStage('decode' | 'run', frac);
// atten — предел ослабления шума в дБ (null — без предела)
export function denoise(blob, { onStage = () => {}, atten = null } = {}) {
  let cancelled = false, un = null;
  const run = (async () => {
    const { invoke } = await core(), { listen } = await import('@tauri-apps/api/event');
    onStage('decode', 0);
    const { x, dur } = await decode48k(blob);
    if (cancelled) throw new Error('cancel');
    await invoke('denoise_begin');
    const u8 = new Uint8Array(x.buffer, x.byteOffset, x.byteLength);
    for (let off = 0; off < u8.length; off += CHUNK) { if (cancelled) throw new Error('cancel'); await invoke('denoise_push', u8.subarray(off, Math.min(u8.length, off + CHUNK))); }
    onStage('run', 0);
    un = await listen('denoise-progress', (e) => onStage('run', Math.min(1, (e.payload && e.payload.f) || 0)));
    let res;
    try {
      res = await invoke('denoise_run', { atten });
      if (cancelled) throw new Error('cancel');
      const bytes = res.total * 4, out = new Float32Array(res.total);
      let off = 0;
      while (off < bytes) {
        const r = await invoke('denoise_read', { off, len: Math.min(CHUNK, bytes - off) });
        const b = r instanceof ArrayBuffer ? new Uint8Array(r) : new Uint8Array(r.buffer || r);
        if (!b.byteLength) break;
        out.set(new Float32Array(b.buffer, b.byteOffset, b.byteLength >> 2), off >> 2);
        off += b.byteLength;
      }
      return { x: out, sr: res.sr || SR, dur };
    } finally { if (un) { un(); un = null; } invoke('denoise_clean').catch(() => {}); }
  })();
  return { promise: run, cancel() { cancelled = true; core().then(({ invoke }) => invoke('denoise_cancel')).catch(() => {}); } };
}
