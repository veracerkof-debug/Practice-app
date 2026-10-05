// Расчёты шумомера и спектра — без DOM.
// Весовые кривые A и C — по МЭК 61672-1 (аналитические формулы), Z — без взвешивания.

// Поправка «дБ полной шкалы → дБ звукового давления» по умолчанию: для микрофонов телефонов примерно так;
// точнее — калибровкой (поправка в настройках модуля)
export const BASE_CAL = 100;

const F1 = 20.598997, F2 = 107.65265, F3 = 737.86223, F4 = 12194.217;

// Поправка весовой кривой на частоте f, дБ (на 1 кГц — 0)
export function weightDb(kind, f) {
  if (kind === 'Z') return 0;
  if (!(f > 0)) return -Infinity;
  const f2 = f * f;
  if (kind === 'A') {
    const ra = (F4 * F4 * f2 * f2) / ((f2 + F1 * F1) * Math.sqrt((f2 + F2 * F2) * (f2 + F3 * F3)) * (f2 + F4 * F4));
    return 20 * Math.log10(ra) + 2.0;
  }
  const rc = (F4 * F4 * f2) / ((f2 + F1 * F1) * (f2 + F4 * F4));
  return 20 * Math.log10(rc) + 0.062;
}

// Уровень кадра, дБ полной шкалы: среднеквадратичное по сигналу (Z), а взвешивание — разницей энергий спектра
// с весами и без (так уровень Z точно равен среднеквадратичному, а A и C — с поправкой по частотам).
// time — отсчёты сигнала, freqDb — спектр в дБ (getFloatFrequencyData), wts — веса по полосам (дБ)
export function levelDb(time, freqDb, wts) {
  let sq = 0;
  for (let i = 0; i < time.length; i++) sq += time[i] * time[i];
  const z = 10 * Math.log10(sq / time.length + 1e-20);
  if (!wts) return z;
  let pz = 0, pw = 0;
  for (let i = 1; i < freqDb.length; i++) {
    const p = 10 ** (freqDb[i] / 10);
    if (!Number.isFinite(p) || !p) continue;
    pz += p;
    pw += p * 10 ** (wts[i] / 10);
  }
  if (!(pz > 0)) return z;
  return z + 10 * Math.log10((pw + 1e-30) / pz);
}

// Основная частота по спектру: самая громкая полоса выше порога, уточнённая параболой по соседям
export function dominant(freqDb, sampleRate, fftSize, floor = -75) {
  let k = -1, best = floor;
  const lo = Math.max(1, Math.ceil((20 * fftSize) / sampleRate));
  for (let i = lo; i < freqDb.length - 1; i++) if (freqDb[i] > best) { best = freqDb[i]; k = i; }
  if (k < 0) return null;
  const a = freqDb[k - 1], b = freqDb[k], c = freqDb[k + 1], den = a - 2 * b + c;
  const d = den ? (0.5 * (a - c)) / den : 0;
  return { f: ((k + Math.max(-0.5, Math.min(0.5, d))) * sampleRate) / fftSize, db: b };
}
