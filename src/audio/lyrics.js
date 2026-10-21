// Текст песни из записи — whisper.cpp (OpenAI Whisper large-v3-turbo, MIT) нативно на компьютере (Windows, Tauri:
// src-tauri/src/lyrics.rs, команды lyrics_*). Только там: модель 574 МБ лежит в ресурсах установщика; на телефоне
// и в вебе кнопок нет. Запись (лучше отделённый вокал — src/core/jobs.js) переводится в 16 кГц моно, уходит в Rust
// кусками, обратно приходят отрезки с токенами и временем; здесь они режутся на строки (linesOf — чистая функция,
// tests/lyrics.test.js). Результат — rec.lyr: { v: 1, lang, lines: [{ t, d, text }], src: 'vocals' | 'mix', at }.
import { isDesktop } from '../core/desktop.js';

const core = () => import('@tauri-apps/api/core');
export const lyricsSupported = () => isDesktop() && !(typeof __WEB_BUILD__ !== 'undefined' && __WEB_BUILD__);
let avail = null; // модель на месте (проверяется один раз)
export async function lyricsAvailable() {
  if (!lyricsSupported()) return false;
  if (avail == null) { try { const { invoke } = await core(); avail = !!(await invoke('lyrics_supported')); } catch { avail = false; } }
  return avail;
}
// Оценка времени: large-v3-turbo q5_0 на 8 ядрах ≈ ×0,35 длительности + загрузка модели
export const estimateLyricsSec = (dur) => Math.round(dur * 0.35 + 10);

const SR = 16000, CHUNK = 4 << 20;
// Запись → 16 кГц моно float32
export async function decode16k(blob) {
  const C = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  if (!C) throw Object.assign(new Error('decode'), { reason: 'unsupported' });
  const buf = await blob.arrayBuffer();
  let ab;
  try { ab = await new C(1, 1, SR).decodeAudioData(buf); }
  catch { throw Object.assign(new Error('decode'), { reason: 'format' }); }
  const n = ab.length, x = new Float32Array(n), ch = ab.numberOfChannels;
  for (let c = 0; c < ch; c++) { const d = ab.getChannelData(c); for (let i = 0; i < n; i++) x[i] += d[i] / ch; }
  return x;
}

const PUNCT = /[.!?…;:,]["»”)]?$/, END = /[.!?…]["»”)]?$/;
// Известные выдумки Whisper на тишине и музыке — такие строки выбрасываются
const JUNK = /субтитры|subtitles|dimatorzok|продолжение следует|редактор субтитров|thanks? (you )?for watching|подписывайтесь|amara\.org|^[\s♪♫♬*.\-–—_]*$/i;
const clean = (s) => s.replace(/\s+/g, ' ').replace(/^\s*[-–—]\s*/, '').trim();

// Отрезки whisper [{ t0, t1, text, tokens: [{ t0, t1, text, p }] }] → строки [{ t, d, text }]: отрезок короче max знаков —
// строка целиком; длиннее — режется по токенам: по знаку препинания в хвосте куска, иначе по пробелу
export function linesOf(segments, { max = 44 } = {}) {
  const out = [];
  const push = (t0, t1, text) => { const s = clean(text); if (!s || JUNK.test(s)) return; out.push({ t: r2(t0), d: r2(Math.max(0.3, t1 - t0)), text: s }); };
  for (const sg of segments || []) {
    const toks = (sg.tokens || []).filter((k) => k.text);
    if (!toks.length || clean(sg.text).length <= max) { push(sg.t0, sg.t1, sg.text || toks.map((k) => k.text).join('')); continue; }
    let i = 0;
    while (i < toks.length) {
      let j = i, len = 0, cut = -1, sp = -1;
      while (j < toks.length) {
        len += toks[j].text.length;
        if (len > max && j > i) break;
        if (PUNCT.test(toks[j].text.trimEnd())) cut = j;
        if (j > i && /^\s/.test(toks[j].text)) sp = j - 1;
        j++;
      }
      let end = j >= toks.length ? toks.length - 1 : cut >= i ? cut : sp >= i ? sp : j - 1;
      // предложение закончилось раньше — не тянуть следующее в ту же строку
      for (let k = i; k < end; k++) if (END.test(toks[k].text.trimEnd()) && k - i >= 2) { end = k; break; }
      const part = toks.slice(i, end + 1);
      push(part[0].t0, part[part.length - 1].t1, part.map((k) => k.text).join(''));
      i = end + 1;
    }
  }
  // строки не перекрываются: конец — не позже начала следующей
  for (let k = 0; k + 1 < out.length; k++) if (out[k].t + out[k].d > out[k + 1].t) out[k].d = r2(Math.max(0.3, out[k + 1].t - out[k].t));
  return out;
}
const r2 = (x) => Math.round(x * 100) / 100;

// Строка в момент времени t (с): индекс или -1
export function lineAt(lines, t) {
  let lo = 0, hi = (lines || []).length - 1, best = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (lines[m].t <= t) { best = m; lo = m + 1; } else hi = m - 1; }
  return best >= 0 && t < lines[best].t + lines[best].d + 1.5 ? best : -1; // ещё полторы секунды после конца строки
}
export const lyricsText = (lines) => (lines || []).map((l) => l.text).join('\n');
// Файл .lrc (строки с временем — любой караоке-плеер)
export function toLrc(lines, { title = '', artist = '' } = {}) {
  const ts = (t) => { const m = Math.floor(t / 60), s = t - m * 60; return '[' + String(m).padStart(2, '0') + ':' + s.toFixed(2).padStart(5, '0') + ']'; };
  return (title ? '[ti:' + title + ']\n' : '') + (artist ? '[ar:' + artist + ']\n' : '') + '[re:Melete]\n' + (lines || []).map((l) => ts(l.t) + l.text).join('\n') + '\n';
}

// blob → { promise: Promise<{ lang, lines, segments }>, cancel() }; onStage('decode' | 'load' | 'run', frac)
export function transcribeLyrics(blob, { onStage = () => {}, lang = null } = {}) {
  let cancelled = false, un = null;
  const run = (async () => {
    const { invoke } = await core(), { listen } = await import('@tauri-apps/api/event');
    onStage('decode', 0);
    const x = await decode16k(blob);
    if (cancelled) throw new Error('cancel');
    await invoke('lyrics_begin');
    const u8 = new Uint8Array(x.buffer, x.byteOffset, x.byteLength);
    for (let off = 0; off < u8.length; off += CHUNK) { if (cancelled) throw new Error('cancel'); await invoke('lyrics_push', u8.subarray(off, Math.min(u8.length, off + CHUNK))); }
    onStage('load', 0);
    let started = false;
    un = await listen('lyrics-progress', (e) => { const f = (e.payload && e.payload.f) || 0; if (!started) { started = true; } onStage('run', Math.min(1, f)); });
    let res;
    try { res = await invoke('lyrics_run', { lang }); }
    finally { if (un) { un(); un = null; } invoke('lyrics_clean').catch(() => {}); }
    if (cancelled) throw new Error('cancel');
    return { lang: res.lang || '', segments: res.segments || [], lines: linesOf(res.segments || []), threads: res.threads };
  })();
  return { promise: run, cancel() { cancelled = true; core().then(({ invoke }) => invoke('lyrics_cancel')).catch(() => {}); } };
}
