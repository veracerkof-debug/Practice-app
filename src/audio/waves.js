// Таблицы волн, шум, импульс реверберации. Кэшируются на контекст.

const cache = new WeakMap();
const of = (c) => { let e = cache.get(c); if (!e) cache.set(c, (e = { waves: {}, syn: {}, noise: null })); return e; };

// Готовые спектры для пэдов и тампуры
const TABLES = {
  piano: [0, 1, 0.62, 0.36, 0.26, 0.17, 0.1, 0.08, 0.05, 0.035, 0.025, 0.015, 0.01],
  warm: [0, 1, 0.38, 0.14, 0.07, 0.035, 0.015],
  bow: [0, 1, 0.7, 0.5, 0.42, 0.3, 0.22, 0.18, 0.12, 0.1, 0.07, 0.05, 0.04, 0.03],
  tan: [0, 1, 0.8, 0.55, 0.6, 0.42, 0.38, 0.3, 0.28, 0.22, 0.2, 0.16, 0.14, 0.12, 0.1, 0.09, 0.08, 0.07, 0.06, 0.05],
};

export function wave(c, name) {
  const e = of(c);
  if (e.waves[name]) return e.waves[name];
  const P = TABLES[name];
  return (e.waves[name] = c.createPeriodicWave(new Float32Array(P.length), new Float32Array(P)));
}

// Амплитуда i-й гармоники синтезатора по типу и «тембру» (0…1)
export function harmAmp(kind, tone, i) {
  const pw = 4 - tone * 3.2;
  if (i === 1) return 1;
  if (kind === 'organ') return [1, 2, 3, 4, 6, 8, 10, 12, 16].includes(i) ? (1 / Math.pow(i, 0.55)) * (i <= 4 || tone > 0.4 ? 1 : 0.2) : 0;
  if (kind === 'saw') return 1 / Math.pow(i, 1.05 - tone * 0.15);
  if (kind === 'piano') return Math.pow(1 / i, pw * 0.75) * (1 + 0.25 * Math.sin(i * 1.7));
  return Math.pow(1 / i, pw);
}

export function synWave(c, kind, tone) {
  const e = of(c), t10 = Math.round(tone * 10), k = kind + t10;
  if (e.syn[k]) return e.syn[k];
  const N = 24, re = new Float32Array(N + 1), im = new Float32Array(N + 1);
  for (let i = 1; i <= N; i++) im[i] = harmAmp(kind, t10 / 10, i);
  return (e.syn[k] = c.createPeriodicWave(re, im));
}

// 80 мс белого шума (удар молоточка, деревянный клик)
export function noiseBuf(c) {
  const e = of(c);
  if (e.noise) return e.noise;
  const len = c.sampleRate * 0.08, b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return (e.noise = b);
}

// Стерео-импульс зала длиной sec
// damp — насколько шум сглажен (выше — темнее хвост), pre — задержка до отражений, с (длинный зал — src/audio/context.js)
export function makeIR(c, sec, { damp = 0.6, pre = 0 } = {}) {
  const len = Math.floor(c.sampleRate * sec), ir = c.createBuffer(2, len, c.sampleRate), p0 = Math.floor(c.sampleRate * pre);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    let lp = 0;
    for (let i = p0; i < len; i++) {
      const t = (i - p0) / (len - p0);
      lp = lp * damp + (Math.random() * 2 - 1) * (1 - damp);
      // у длинного зала — мягкое нарастание (~80 мс), у обычной реверберации — 12 мс
      const att = pre ? 0.08 : 0.012, k = i - p0 < c.sampleRate * att ? (i - p0) / (c.sampleRate * att) : 1;
      d[i] = lp * Math.pow(1 - t, pre ? 1.8 : 2.4) * k * (pre ? 1.6 : 1);
    }
  }
  return ir;
}
