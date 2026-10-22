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

// Уточнение частоты по фазе (как в тюнерах с «фазовым вокодером»): YIN даёт период с шагом отсчёта — на низких струнах
// это 2–3 цента и дрожащая стрелка. Берём фазу основной гармоники f0 в двух окнах со сдвигом H отсчётов: разность фаз
// за H отсчётов и даёт точную частоту. Оценка принимается, только если отличается от грубой меньше чем на 3 %
// (иначе это не та гармоника). Чистая функция, без состояния; yin() не трогаем — её сверяет тест паритета.
// Окно — Блэкмана–Харриса на всю длину кадра минус сдвиг (4096 − 512): боковые лепестки ниже −90 дБ, вторая гармоника
// низкой струны не искажает фазу основной (с окном Ханна на 2048 ошибка доходила до полуцента).
export function refinePitch(buf, f0, sr, H = 512, N = buf ? buf.length - H : 0) {
  if (!f0 || !buf || N < 1024 || buf.length < N + H) return f0;
  const w = (2 * Math.PI * f0) / sr;
  let re0 = 0, im0 = 0, re1 = 0, im1 = 0;
  for (let i = 0; i < N; i++) {
    const t = (2 * Math.PI * i) / (N - 1), win = 0.35875 - 0.48829 * Math.cos(t) + 0.14128 * Math.cos(2 * t) - 0.01168 * Math.cos(3 * t);
    const c = Math.cos(w * i), sn = Math.sin(w * i), x0 = buf[i] * win, x1 = buf[i + H] * win;
    re0 += x0 * c; im0 -= x0 * sn; re1 += x1 * c; im1 -= x1 * sn;
  }
  if (Math.hypot(re0, im0) < 1e-6 || Math.hypot(re1, im1) < 1e-6) return f0;
  let d = Math.atan2(im1, re1) - Math.atan2(im0, re0) - w * H;
  d -= 2 * Math.PI * Math.round(d / (2 * Math.PI)); // в пределах ±π
  const f = f0 + (d * sr) / (2 * Math.PI * H);
  return Math.abs(f / f0 - 1) < 0.03 ? f : f0;
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
