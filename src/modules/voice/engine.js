// Движок диктофона: входы и выходы звука, запись с выбранного входа, воспроизведение на выбранный выход.
// Android — плагин Voice (AudioRecord/AudioTrack с выбором устройства: телефон, гарнитура, Bluetooth, USB-приёмники
// петличек); веб — getUserMedia с deviceId и setSinkId, где браузер умеет. Записи — WAV, только на устройстве.
import { Capacitor, registerPlugin } from '@capacitor/core';
import { encodeWav } from '../../audio/voicefx.js';

const V = Capacitor.isNativePlatform() ? registerPlugin('Voice') : null;
const CHUNK = 768 * 1024;
const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s) => { const b = atob(s), u8 = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u8[i] = b.charCodeAt(i); return u8; };

// Петлички и радиосистемы — по имени устройства (настройки самих петличек — в их приложениях: протоколы закрыты)
const LAV = /lark|hollyland|dji|wireless\s*mic|mic\s*(mini|2|se)|rode|wireless\s*go|boya|saramonic|synco|comica|lav|петлич/i;
export const isLav = (d) => LAV.test(d.name || '');

/* ---------- Android ---------- */

function nativeEngine() {
  const subs = { level: new Set(), pos: new Set(), end: new Set(), devices: new Set() };
  ['level', 'pos', 'end', 'devices'].forEach((k) => V.addListener(k, (e) => subs[k].forEach((fn) => fn(e))));
  return {
    native: true,
    on: (k, fn) => { subs[k].add(fn); return () => subs[k].delete(fn); },
    devices: async () => { const r = await V.devices(); return { inputs: r.inputs || [], outputs: r.outputs || [] }; },
    start: (o) => V.start(o),
    pause: (on) => V.pause({ on }),
    stop: () => V.stop(),
    async read(path) {
      const parts = []; let off = 0, size = Infinity;
      while (off < size) { const r = await V.read({ path, offset: off, length: CHUNK }); size = r.size; const u = unb64(r.data || ''); if (!u.length) break; parts.push(u); off += u.length; }
      const out = new Uint8Array(off); let p = 0; parts.forEach((u) => { out.set(u, p); p += u.length; });
      return out;
    },
    async write(path, u8) { for (let off = 0; off < u8.length || off === 0; off += CHUNK) { await V.write({ path, data: b64(u8.subarray(off, off + CHUNK)), append: off > 0 }); if (!u8.length) break; } },
    remove: (path) => V.remove({ path }).catch(() => {}),
    play: (path, deviceId, from = 0) => V.play({ path, deviceId: deviceId ?? -1, from }),
    stopPlay: () => V.stopPlay(),
  };
}

/* ---------- браузер ---------- */

function webEngine() {
  const subs = { level: new Set(), pos: new Set(), end: new Set(), devices: new Set() };
  const emit = (k, e) => subs[k].forEach((fn) => fn(e));
  const mem = new Map(); // путь → WAV
  let rec = null, audio = null;
  if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) navigator.mediaDevices.addEventListener('devicechange', () => emit('devices', {}));
  const typeOf = (d) => (/bluetooth|bt|airpods|buds/i.test(d.label) ? 'bt' : /usb/i.test(d.label) ? 'usb_device' : /head|гарнитур|наушник/i.test(d.label) ? 'wired_headset' : d.kind === 'audiooutput' ? 'speaker' : 'builtin_mic');
  return {
    native: false,
    on: (k, fn) => { subs[k].add(fn); return () => subs[k].delete(fn); },
    async devices() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return { inputs: [], outputs: [] };
      const list = await navigator.mediaDevices.enumerateDevices();
      const map = (k) => list.filter((d) => d.kind === k && d.deviceId !== 'communications').map((d, i) => ({ id: d.deviceId, type: d.deviceId === 'default' ? (k === 'audioinput' ? 'builtin_mic' : 'speaker') : typeOf(d), name: d.label || (k === 'audioinput' ? 'Mic ' : 'Out ') + (i + 1), channels: 1 }));
      return { inputs: map('audioinput'), outputs: 'setSinkId' in HTMLMediaElement.prototype ? map('audiooutput') : [] };
    },
    async start({ deviceId, stereo, raw }) {
      const c = new (window.AudioContext || window.webkitAudioContext)();
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { ...(deviceId && deviceId !== -1 ? { deviceId: { exact: deviceId } } : {}), channelCount: stereo ? 2 : 1, echoCancellation: !raw, noiseSuppression: !raw, autoGainControl: !raw } });
      } catch (e) { c.close(); throw Object.assign(new Error('mic'), { message: e && e.name === 'NotAllowedError' ? 'denied' : 'unavailable' }); }
      const nc = stereo ? 2 : 1, src = c.createMediaStreamSource(stream), sp = c.createScriptProcessor(4096, nc, nc), bufs = Array.from({ length: nc }, () => []);
      let frames = 0, paused = false;
      sp.onaudioprocess = (e) => {
        let peak = 0, sum = 0;
        for (let k = 0; k < nc; k++) {
          const x = e.inputBuffer.getChannelData(Math.min(k, e.inputBuffer.numberOfChannels - 1));
          if (!paused) bufs[k].push(Float32Array.from(x));
          for (let i = 0; i < x.length; i++) { const v = Math.abs(x[i]); if (v > peak) peak = v; sum += x[i] * x[i]; }
        }
        if (!paused) frames += e.inputBuffer.length;
        emit('level', { peak, rms: Math.sqrt(sum / (e.inputBuffer.length * nc)), sec: frames / c.sampleRate, paused });
      };
      src.connect(sp); sp.connect(c.destination);
      rec = { c, stream, src, sp, bufs, get frames() { return frames; }, setPaused: (v) => { paused = v; } };
      return { rate: c.sampleRate, channels: nc };
    },
    async pause(on) { if (rec) rec.setPaused(on); },
    async stop() {
      const r = rec; rec = null;
      if (!r) throw new Error('idle');
      r.sp.disconnect(); r.src.disconnect(); r.stream.getTracks().forEach((t) => t.stop());
      const ch = r.bufs.map((parts) => { const out = new Float32Array(parts.reduce((s, p) => s + p.length, 0)); let o = 0; parts.forEach((p) => { out.set(p, o); o += p.length; }); return out; });
      const sr = r.c.sampleRate; r.c.close();
      const path = 'rec-' + Date.now() + '.wav', wav = encodeWav(ch, sr);
      mem.set(path, wav);
      return { path, size: wav.length, sec: ch[0].length / sr, rate: sr, channels: ch.length };
    },
    read: async (path) => mem.get(path),
    write: async (path, u8) => { mem.set(path, u8); },
    remove: async (path) => { mem.delete(path); },
    async play(path, deviceId, from = 0) {
      this.stopPlay();
      const url = URL.createObjectURL(new Blob([mem.get(path)], { type: 'audio/wav' }));
      audio = new Audio(url);
      if (deviceId && audio.setSinkId) { try { await audio.setSinkId(deviceId); } catch { /* выход по умолчанию */ } }
      audio.currentTime = from;
      audio.ontimeupdate = () => emit('pos', { sec: audio.currentTime });
      audio.onended = () => { emit('end', { done: true }); URL.revokeObjectURL(url); };
      await audio.play();
      return {};
    },
    async stopPlay() { if (audio) { audio.pause(); audio.onended = null; emit('end', { done: false }); audio = null; } },
  };
}

let ENGINE = null;
export const engine = () => ENGINE || (ENGINE = V ? nativeEngine() : webEngine());
