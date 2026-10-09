// Запись в инструментах: всё, что звучит в приложении (после компрессора), по желанию — вместе с микрофоном
// (живой инструмент под метроном или пэды) и с видео, если модуль его даёт (терменвокс: камера и рисунок поверх).
// Готовая запись сохраняется в медиатеку (files.js) — на устройстве, никуда не отправляется.

const AUDIO_TYPES = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'];
const VIDEO_TYPES = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/mp4', 'video/webm'];

export function pickType(list, can = (t) => globalThis.MediaRecorder && MediaRecorder.isTypeSupported(t)) {
  return list.find((t) => { try { return can(t); } catch { return false; } }) || '';
}
export const extOf = (type) => (type.includes('mp4') ? (type.startsWith('video') ? 'mp4' : 'm4a') : type.includes('ogg') ? 'ogg' : 'webm');
export const canRecord = () => !!(globalThis.MediaRecorder && globalThis.MediaStream);

// Имя файла: «Инструмент — 9 окт., 18:42»
export function recName(tool, at, locale = 'ru') {
  let d;
  try { d = new Date(at).toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { d = new Date(at).toISOString().slice(0, 16).replace('T', ' '); }
  return tool + ' — ' + d;
}

// app.audio.tap() — отвод звука, app.files — медиатека. Одна запись за раз.
export function createRecorder(app) {
  let cur = null;
  const subs = new Set();
  const emit = () => subs.forEach((fn) => fn(cur));

  return {
    get active() { return !!cur; },
    get state() { return cur && { tool: cur.tool, t0: cur.t0, video: !!cur.video, mic: !!cur.micStream }; },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },

    // opts: { tool (название), songs ([id]), mic (true — и микрофон), video ({ stream, stop } от модуля или null) }
    // → 'ok' | 'nosound' | 'unsupported' | 'mic' (микрофон не дали — запись без него)
    async start({ tool, songs = [], mic = false, video = null } = {}) {
      if (cur) return 'ok';
      if (!canRecord()) return 'unsupported';
      const tap = app.audio.tap();
      if (!tap) return 'nosound';
      let micStream = null, micSrc = null, res = 'ok';
      if (mic) {
        try {
          micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
          micSrc = tap.ctx.createMediaStreamSource(micStream);
          micSrc.connect(tap.dest); // только в запись, не в динамики
        } catch { res = 'mic'; micStream = null; }
      }
      const tracks = [...tap.stream.getAudioTracks(), ...(video ? video.stream.getVideoTracks() : [])];
      const stream = new MediaStream(tracks), type = pickType(video ? VIDEO_TYPES : AUDIO_TYPES);
      let mr;
      try { mr = type ? new MediaRecorder(stream, { mimeType: type, audioBitsPerSecond: 160000 }) : new MediaRecorder(stream); } catch {
        tap.off(); if (micStream) micStream.getTracks().forEach((t) => t.stop()); if (video) video.stop();
        return 'unsupported';
      }
      const chunks = [];
      mr.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      cur = { mr, chunks, tap, micStream, micSrc, video, tool, songs, t0: Date.now(), type: mr.mimeType || type || (video ? 'video/webm' : 'audio/webm') };
      mr.start(1000);
      emit();
      return res;
    },

    // Остановить и сохранить в медиатеку. → запись файла или null (слишком коротко или не вышло)
    stop() {
      const r = cur;
      if (!r) return Promise.resolve(null);
      cur = null;
      emit();
      return new Promise((done) => {
        r.mr.onstop = async () => {
          r.tap.off();
          try { if (r.micSrc) r.micSrc.disconnect(); } catch { /* ignore */ }
          if (r.micStream) r.micStream.getTracks().forEach((t) => t.stop());
          if (r.video) r.video.stop();
          const dur = (Date.now() - r.t0) / 1000;
          if (dur < 1 || !r.chunks.length) { done(null); return; }
          const blob = new Blob(r.chunks, { type: r.type.split(';')[0] });
          const rec = { id: 'r' + Date.now().toString(36), name: recName(r.tool, r.t0) + '.' + extOf(r.type), size: blob.size, type: blob.type, songs: r.songs,
            created: Date.now(), blob, kind: 'audio', dur, ...(r.video ? { video: true } : {}) };
          try { await app.files.add(rec); done(rec); } catch { done(null); }
        };
        try { r.mr.stop(); } catch { done(null); }
      });
    },
  };
}
