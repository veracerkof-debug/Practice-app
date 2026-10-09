// Поиск грифа — в отдельном потоке: полный поиск занимает до секунды, слежение за найденным грифом — десятые доли;
// кадры камеры и руки в это время не ждут. Получает кадр (ImageData) и руки (точки в пикселях кадра: лады под
// ними — закрыты, а не отсутствуют), отвечает результатом detectFretboard.
// Кадр-другой без грифа (рука закрыла бридж) слежение не обрывает: прошлый гриф помнится три неудачи подряд.
import { detectFretboard } from '../../music/fretboard.js';

let prev = null, misses = 0;

self.onmessage = (e) => {
  const { img, reset, hands } = e.data || {};
  if (reset) { prev = null; misses = 0; }
  if (!img) return;
  let fb;
  try { fb = detectFretboard(img, { prev, hands }); } catch { fb = { ok: false, reason: 'none' }; }
  if (fb.ok) { prev = fb; misses = 0; } else if (++misses >= 3) prev = null;
  self.postMessage(fb);
};
