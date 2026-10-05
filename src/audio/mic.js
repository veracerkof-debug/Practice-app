// Микрофон — только по явному разрешению пользователя; поток используется лишь для анализа на устройстве.
import { getContext } from './context.js';

export const FFT = 4096;

// Возвращает { analyser, read(), sampleRate, stop() } или бросает ошибку с .reason: 'denied' | 'unavailable'
export async function openMic(mode) {
  const c = getContext(mode);
  if (!c || !navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('mic'), { reason: 'unavailable' });
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
  } catch (e) {
    throw Object.assign(new Error('mic'), { reason: e && e.name === 'NotAllowedError' ? 'denied' : 'unavailable' });
  }
  const src = c.createMediaStreamSource(stream), analyser = c.createAnalyser();
  analyser.fftSize = FFT;
  src.connect(analyser); // не на выход — только анализ
  const buf = new Float32Array(FFT);
  return {
    analyser,
    sampleRate: c.sampleRate,
    read() { analyser.getFloatTimeDomainData(buf); return buf; },
    stop() { stream.getTracks().forEach((t) => t.stop()); try { src.disconnect(); } catch { /* ignore */ } },
  };
}
