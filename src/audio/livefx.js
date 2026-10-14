// Обработка в реальном времени (диктофон до записи и мониторинг): те же настройки, что у обработки записи
// (voicefx.process): срез низа, эквалайзер на 5 полос, компрессия, усиление, реверберация — но узлами Web Audio,
// чтобы звук было слышно сразу, ещё до записи. Шумоподавление, гейт и нормализация — только при обработке записи.
// Вход и выход — свои: открыть вход (deviceId, где браузер умеет выбирать), выход — setSinkId, где он есть.
import { EQ_BANDS, COMP } from './voicefx.js';
import { makeIR } from './waves.js';

// Цепочка: in → highpass → 5 фильтров → компрессор → усиление → (сухой + реверберация) → out
export function createLiveFx(c, fx = {}) {
  const input = c.createGain(), hp = c.createBiquadFilter(), bands = EQ_BANDS.map((b) => {
    const f = c.createBiquadFilter();
    f.type = b.type === 'peak' ? 'peaking' : b.type;
    f.frequency.value = b.f;
    if (b.q) f.Q.value = b.q;
    return f;
  });
  const comp = c.createDynamicsCompressor(), gain = c.createGain(), dry = c.createGain(), wet = c.createGain(), output = c.createGain();
  hp.type = 'highpass'; hp.Q.value = 0.707;
  let cv = null;
  try { cv = c.createConvolver(); cv.buffer = makeIR(c, 1.6); } catch { cv = null; }
  let node = input.connect(hp);
  bands.forEach((f) => { node = node.connect(f); });
  node.connect(comp).connect(gain);
  gain.connect(dry).connect(output);
  if (cv) gain.connect(cv).connect(wet).connect(output);
  const set = (p, v) => p.setTargetAtTime(v, c.currentTime, 0.02);
  function update(o = {}) {
    set(hp.frequency, o.lowcut ? 80 : 10);
    const eq = o.eq || [];
    bands.forEach((f, i) => set(f.gain, +eq[i] || 0));
    const cp = COMP[o.comp];
    set(comp.threshold, cp ? cp.threshold : 0); set(comp.ratio, cp ? cp.ratio : 1);
    comp.knee.value = 6; comp.attack.value = 0.01; comp.release.value = 0.15;
    // усиление (как gain в обработке) плюс небольшая компенсация сжатия
    const makeup = cp ? Math.min(9, (-cp.threshold * (1 - 1 / cp.ratio)) * 0.5) : 0;
    set(gain.gain, Math.pow(10, ((+o.gain || 0) + makeup) / 20));
    const r = Math.max(0, Math.min(1, +o.reverb || 0));
    set(dry.gain, 1 - r * 0.4); set(wet.gain, cv ? r * 1.6 : 0);
  }
  update(fx);
  return {
    input, output, update,
    disconnect() { [input, hp, ...bands, comp, gain, dry, wet, output, cv].forEach((n) => { try { n && n.disconnect(); } catch { /* уже */ } }); },
  };
}

// Открыть вход: deviceId — для браузера (на Android вход выбирает система — см. engine.route)
export async function openInput(c, deviceId) {
  const audio = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
  if (deviceId && deviceId !== -1 && typeof deviceId === 'string') audio.deviceId = { exact: deviceId };
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio }); } catch (e) {
    throw Object.assign(new Error(e && e.name === 'NotAllowedError' ? 'denied' : 'unavailable'), { reason: e && e.name === 'NotAllowedError' ? 'denied' : 'unavailable' });
  }
  const src = c.createMediaStreamSource(stream);
  return { stream, src, stop() { stream.getTracks().forEach((t) => t.stop()); try { src.disconnect(); } catch { /* уже */ } } };
}

// Выход контекста на выбранное устройство (где браузер умеет: AudioContext.setSinkId)
export const canPickOutput = () => typeof AudioContext !== 'undefined' && 'setSinkId' in AudioContext.prototype;
export async function setOutput(c, id) {
  if (!c || !('setSinkId' in c)) return false;
  try { await c.setSinkId(id || ''); return true; } catch { return false; }
}

// Уровень и кусочек сигнала с анализатора: { peak, rms, samples, rate } — для окна уровня и спектра
export function levelOf(an, buf) {
  an.getFloatTimeDomainData(buf);
  let peak = 0, s = 0;
  for (let i = 0; i < buf.length; i++) { const v = Math.abs(buf[i]); if (v > peak) peak = v; s += buf[i] * buf[i]; }
  return { peak, rms: Math.sqrt(s / buf.length), samples: buf, rate: an.context.sampleRate };
}
