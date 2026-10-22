// Ноты со слуха на компьютере — YourMT3+ нативно (Windows, Tauri: src-tauri/src/notes.rs, команды notes_*): все
// инструменты записи сразу — рояль, гитары, бас, струнные, духовые, голос, ударные — по партиям. Только там: модели
// (≈ 210 МБ) лежат в ресурсах установщика; на телефоне снятия нот нет, в вебе — Basic Pitch (src/audio/transcribe.js).
// Запись → 16 кГц моно → Rust кусками → токены [кусок][канал] → ноты (src/music/mt3.js) → партии.
// Выход — как у transcribe.js для ритма в jobs.js: { parts: [{ key, program, drum, raw: [{ t, d, m, v }] }], notes, dur, tempo }.
import { isDesktop } from '../core/desktop.js';
import { decode16k } from './lyrics.js';
import { decodeTokens, toParts } from '../music/mt3.js';
import { detectTempo } from '../music/analyze.js';

const core = () => import('@tauri-apps/api/core');
const CHUNK = 4 << 20;
export const ymtSupported = () => isDesktop() && !(typeof __WEB_BUILD__ !== 'undefined' && __WEB_BUILD__);
let avail = null; // модели на месте (проверяется один раз)
export async function ymtAvailable() {
  if (!ymtSupported()) return false;
  if (avail == null) { try { const { invoke } = await core(); avail = !!(await invoke('notes_supported')); } catch { avail = false; } }
  return avail;
}
// Оценка времени: ≈ длительность записи на 4 ядрах (плотная музыка — дольше) + загрузка моделей
export const estimateYmtSec = (dur) => Math.round(dur * 1.0 + 8);

// blob → { promise: Promise<{ parts, notes, dur, tempo }>, cancel() }; onStage('decode' | 'load' | 'run', frac)
export function transcribeYmt(blob, { onStage = () => {} } = {}) {
  let cancelled = false, un = null;
  const run = (async () => {
    const { invoke } = await core(), { listen } = await import('@tauri-apps/api/event');
    onStage('decode', 0);
    const x = await decode16k(blob);
    if (cancelled) throw new Error('cancel');
    await invoke('notes_begin');
    const u8 = new Uint8Array(x.buffer, x.byteOffset, x.byteLength);
    for (let off = 0; off < u8.length; off += CHUNK) { if (cancelled) throw new Error('cancel'); await invoke('notes_push', u8.subarray(off, Math.min(u8.length, off + CHUNK))); }
    onStage('load', 0);
    un = await listen('notes-progress', (e) => onStage('run', Math.min(1, (e.payload && e.payload.f) || 0)));
    let res;
    try { res = await invoke('notes_run'); }
    finally { if (un) { un(); un = null; } invoke('notes_clean').catch(() => {}); }
    if (cancelled) throw new Error('cancel');
    const parts = toParts(decodeTokens(res.tokens || [])).map((p) => ({ key: p.key, program: p.program, drum: p.drum, raw: p.notes }));
    let tempo = null;
    try { tempo = detectTempo(x, 16000); } catch { /* без темпа — 120 */ }
    return { parts, notes: parts.reduce((a, p) => a + p.raw.length, 0), dur: x.length / 16000, tempo, secs: res.secs, threads: res.threads };
  })();
  return { promise: run, cancel() { cancelled = true; core().then(({ invoke }) => invoke('notes_cancel')).catch(() => {}); } };
}
