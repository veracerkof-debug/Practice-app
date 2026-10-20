// Захват звука в буфер по часам контекста: запись в дорожку студии (микрофон или вход) и сведение песни (отвод
// всего, что звучит). Процессор — тот же приём, что в лупере: кусками, у каждого — время первого отсчёта
// (playbackTime), так что записанное ложится в песню с точностью до отсчёта; поправка на задержку входа — в долях
// секунды снаружи (off клипа). Без DOM.
import { engine } from './voiceengine.js';

const CHUNK = 8192, MAX_SEC = 20 * 60;

// Поток микрофона (или выбранного входа — маршрут Android через движок диктофона), без обработки браузера
export async function openInput(prefs = {}) {
  const E = engine(), want = prefs.in || null;
  if (E.native) await E.route(want);
  const raw = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { ...raw, ...(!E.native && want ? { deviceId: { exact: want } } : {}) } }); }
  catch { try { stream = await navigator.mediaDevices.getUserMedia({ audio: raw }); } catch (e) { if (E.native) E.unroute(); throw Object.assign(new Error('mic'), { reason: e && e.name === 'NotAllowedError' ? 'denied' : 'unavailable' }); } }
  const tr = stream.getAudioTracks()[0], st = tr && tr.getSettings ? tr.getSettings() : {};
  return { stream, channels: Math.max(1, Math.min(2, +st.channelCount || 1)), close() { try { stream.getTracks().forEach((t) => t.stop()); } catch { /* */ } if (E.native) E.unroute(); } };
}

// c — контекст, source — узел-источник (микрофон, отвод), channels — сколько каналов писать.
// start(from) — писать с момента from (часы контекста; раньше — отбрасывается); stop() → { ch, sr, t0 } (t0 — время
// первого записанного отсчёта) или null; level() — уровень 0…1 последнего куска; dispose() — отключить
export function createCapture(c, source, { channels = 2, onFull = null } = {}) {
  const nc = Math.max(1, Math.min(2, channels)), proc = c.createScriptProcessor(CHUNK, nc, nc), sink = c.createGain();
  sink.gain.value = 0;
  let rec = null, lvl = 0;
  proc.onaudioprocess = (e) => {
    const ib = e.inputBuffer, d0 = ib.getChannelData(0);
    let m = 0;
    for (let i = 0; i < d0.length; i += 4) { const v = Math.abs(d0[i]); if (v > m) m = v; }
    lvl = m;
    if (!rec) return;
    const t = e.playbackTime, dur = ib.length / c.sampleRate;
    if (t + dur <= rec.from) return;
    const skip = Math.max(0, Math.round((rec.from - t) * c.sampleRate));
    if (rec.t0 == null) rec.t0 = t + skip / c.sampleRate;
    rec.chunks.push(Array.from({ length: nc }, (_, k) => new Float32Array(ib.getChannelData(k).subarray(skip))));
    rec.n += ib.length - skip;
    if (rec.n > MAX_SEC * c.sampleRate && onFull) onFull();
  };
  source.connect(proc).connect(sink).connect(c.destination); // процессор молчит без выхода
  return {
    get recording() { return !!rec; },
    level: () => lvl,
    start(from = c.currentTime) { rec = { from, chunks: [], n: 0, t0: null }; },
    stop() {
      const r = rec; rec = null;
      if (!r || !r.n) return null;
      const ch = Array.from({ length: nc }, () => new Float32Array(r.n));
      let p = 0;
      r.chunks.forEach((parts) => { parts.forEach((d, k) => ch[k].set(d, p)); p += parts[0].length; });
      return { ch, sr: c.sampleRate, t0: r.t0 };
    },
    dispose() { rec = null; proc.onaudioprocess = null; [proc, sink].forEach((n) => { try { n.disconnect(); } catch { /* */ } }); try { source.disconnect(proc); } catch { /* */ } },
  };
}
