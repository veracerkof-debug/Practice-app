// Демо-записи для медиатеки: «Greensleeves» (в церковном режиме — «Amazing Grace»; обе — общественное достояние) —
// с мелодией и минусовка без неё. Обе — вальс 3/4 с затактом в одну долю.
// Синтезируются на устройстве (OfflineAudioContext) и сохраняются как WAV — в сборке нет лишних файлов.
import { melodyById } from '../music/melodies.js';

const SR = 22050;
const hz = (m) => 440 * 2 ** ((m - 69) / 12);
// Аккорды по тактам ([бас, …аккорд], первый звук мелодии — затакт).
// Amazing Grace: G G7 C G | G Em D D7 | G G7 C G | G D7 G G
const GRACE = [[43, 59, 62, 67], [43, 59, 62, 65], [48, 60, 64, 67], [43, 59, 62, 67], [43, 59, 62, 67], [40, 59, 64, 67], [38, 57, 62, 66], [38, 57, 60, 66],
  [43, 59, 62, 67], [43, 59, 62, 65], [48, 60, 64, 67], [43, 59, 62, 67], [38, 59, 62, 67], [38, 57, 60, 66], [43, 59, 62, 67], [43, 59, 62, 67]];
// Greensleeves: Am C G Em | Am E E E | Am C G Em | Am E Am Am
const AM = [45, 57, 60, 64], C = [48, 60, 64, 67], G = [43, 59, 62, 67], EM = [40, 59, 64, 67], E = [40, 56, 59, 64];
const GREEN = [AM, C, G, EM, AM, E, E, E, AM, C, G, EM, AM, E, AM, AM];
const BARS_OF = { grace: GRACE, green: GREEN };

function tone(ac, out, f, t, dur, { type = 'sine', gain = 0.2, a = 0.01, partials = null } = {}) {
  const g = ac.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + a);
  g.gain.setTargetAtTime(0, t + a, dur / 3);
  g.connect(out);
  (partials || [[1, 1]]).forEach(([k, v]) => {
    const o = ac.createOscillator(), pg = ac.createGain();
    o.type = type; o.frequency.value = f * k; pg.gain.value = v;
    o.connect(pg); pg.connect(g);
    o.start(t); o.stop(t + dur + 0.5);
  });
}

// Отрисовать запись: withMelody — с мелодией (фортепиано), без неё — только аккомпанемент. → Float32Array
async function render(withMelody, id = 'green') {
  const OAC = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  if (!OAC) return null;
  const mel = melodyById(id), BARS = BARS_OF[id] || GREEN, beat = 60 / mel.bpm, lead = 1.2; // перед музыкой — пауза и отсчёт
  const beats = mel.notes.reduce((a, n) => a + n[1], 0), len = lead + 4 * beat + (beats + 3) * beat + 2;
  const ac = new OAC(1, Math.ceil(len * SR), SR), out = ac.createGain();
  out.gain.value = 0.9; out.connect(ac.destination);
  const t0 = lead + 3 * beat; // отсчёт — три удара (3/4), затакт мелодии — на четвёртом
  for (let k = 0; k < 3; k++) tone(ac, out, k ? 1500 : 2000, lead + k * beat, 0.05, { gain: 0.12, a: 0.002 });
  // аккомпанемент: бас на первую долю, аккорд на вторую и третью (вальс)
  const start = t0 + beat; // первый полный такт — после затакта
  const bars = Math.ceil((beats - 1) / 3);
  for (let b = 0; b < bars; b++) {
    const [bass, ...ch] = BARS[b % BARS.length], tb = start + b * 3 * beat;
    tone(ac, out, hz(bass), tb, beat * 1.6, { type: 'triangle', gain: 0.32 });
    [1, 2].forEach((k) => ch.forEach((m) => tone(ac, out, hz(m), tb + k * beat, beat * 0.8, { type: 'triangle', gain: 0.06, a: 0.02 })));
  }
  if (withMelody) {
    let t = t0;
    mel.notes.forEach(([m, d]) => {
      tone(ac, out, hz(m), t, d * beat * 0.95, { gain: 0.16, a: 0.005, partials: [[1, 1], [2, 0.35], [3, 0.12], [4, 0.05]] });
      t += d * beat;
    });
  }
  const buf = await ac.startRendering();
  return buf.getChannelData(0);
}

// WAV, 16 бит, моно
function wav(data) {
  const n = data.length, b = new ArrayBuffer(44 + n * 2), v = new DataView(b);
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, SR, true); v.setUint32(28, SR * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 2, true);
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(data[i]));
  const k = peak > 0 ? 0.89 / peak : 1;
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, data[i] * k)) * 32767, true);
  return new Blob([b], { type: 'audio/wav' });
}

// Две записи: [{ key: 'full' | 'minus', blob, dur }] (без OfflineAudioContext — пусто)
export async function demoTracks(id = 'green') {
  const out = [];
  for (const [key, mel] of [['full', true], ['minus', false]]) {
    try {
      const d = await render(mel, id);
      if (d) out.push({ key, blob: wav(d), dur: d.length / SR });
    } catch { /* без звука на устройстве — без записей */ }
  }
  return out;
}
