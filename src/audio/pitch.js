// Определение высоты звука (YIN) для тюнера и пения нот. Чистая функция: буфер → Гц (0 — нет ноты).

// minRms — порог тишины (среднеквадратичный уровень): чем меньше, тем тише звук, который ещё слышен
export function yin(buf, sr, minRms = 0.008) {
  let rms = 0;
  for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
  if (Math.sqrt(rms / buf.length) < minRms) return 0; // тишина
  const W = 2048, maxLag = Math.min(Math.floor(sr / 27), buf.length - W), minLag = Math.floor(sr / 2100);
  const d = new Float32Array(maxLag + 1);
  for (let tau = 1; tau <= maxLag; tau++) {
    let s = 0;
    for (let j = 0; j < W; j++) { const df = buf[j] - buf[j + tau]; s += df * df; }
    d[tau] = s;
  }
  // нормированная разностная функция
  let run = 0, best = -1;
  const cm = new Float32Array(maxLag + 1);
  cm[0] = 1;
  for (let tau = 1; tau <= maxLag; tau++) { run += d[tau]; cm[tau] = run ? (d[tau] * tau) / run : 1; }
  for (let tau = Math.max(2, minLag); tau < maxLag; tau++) {
    if (cm[tau] < 0.12) {
      while (tau + 1 < maxLag && cm[tau + 1] < cm[tau]) tau++;
      best = tau;
      break;
    }
  }
  if (best < 0) {
    let mv = 1;
    for (let tau = Math.max(2, minLag); tau < maxLag; tau++) if (cm[tau] < mv) { mv = cm[tau]; best = tau; }
    if (mv > 0.25) return 0;
  }
  // параболическая интерполяция
  const x0 = cm[best - 1], x1 = cm[best], x2 = cm[best + 1] ?? x1, den = x0 + x2 - 2 * x1, sh = den ? (x0 - x2) / (2 * den) : 0;
  return sr / (best + sh);
}

// Сглаживание: медиана последних 5 значений; сброс при скачке больше 5 %
export function createPitchSmoother(size = 5) {
  const h = [];
  return (f) => {
    if (h.length) {
      const md = h.slice().sort((a, b) => a - b)[h.length >> 1];
      if (Math.abs(f / md - 1) > 0.05) h.length = 0;
    }
    h.push(f);
    if (h.length > size) h.shift();
    return h.slice().sort((a, b) => a - b)[h.length >> 1];
  };
}

// Гц → { midi, cents } относительно строя a4
export function freqToNote(f, a4 = 440) {
  const x = 69 + 12 * Math.log2(f / a4), midi = Math.round(x);
  return { midi, cents: (x - midi) * 100 };
}
