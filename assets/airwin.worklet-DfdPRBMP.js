// Ревербы Airwindows в AudioWorklet (эксперимент, вариант «Реверберация: Airwindows» — только в dev, variants.js):
// Galactic — огромное «космическое» пространство с медленным плаванием высоты (для пэдов и поклонения),
// Verbity2 — плотный естественный зал. Порт алгоритмов Криса Джонсона (Airwindows, © 2016–2023, лицензия MIT —
// LICENSES.md); код переписан на JS, строение сетей, задержки и коэффициенты — как в оригинале
// (github.com/airwindows/airwindows, plugins/LinuxVST/src/Galactic, Verbity2). Отличия: без дизеринга (поток и так
// 32-битный), только мокрый сигнал (посыл в пространство — spaces.js), выход — уровнем lvl.
// processorOptions: { algo: 'galactic' | 'verbity', a, b, c, d — ручки оригинала 0…1, lvl — уровень выхода }

// Линия задержки как в оригинале: массив delay+1, запись, шаг, чтение самого старого
class Line {
  constructor(n) { this.b = new Float64Array(n + 1); this.n = n + 1; this.i = 0; }
  push(x) { this.b[this.i] = x; this.i++; if (this.i >= this.n) this.i = 0; return this.b[this.i]; }
}
const cycleEndOf = (sr) => Math.max(1, Math.min(4, Math.floor(sr / 44100)));

// Galactic: предзадержка с вибрато → фильтр → три блока по 4 линии (матрица «одна минус остальные»), перекрёстная
// обратная связь между каналами → фильтр. Без выделения памяти в цикле: всё — заранее (звуковой поток не ждёт сборщика)
const mix4 = (x, y) => { const a = x[0], b = x[1], c = x[2], d = x[3]; y[0] = a - (b + c + d); y[1] = b - (a + c + d); y[2] = c - (a + b + d); y[3] = d - (a + b + c); };
class Galactic {
  constructor(sr, { a = 0.5, b = 0.5, c = 0.5, d = 1 }) {
    const over = sr / 44100;
    this.cycleEnd = cycleEndOf(sr); this.cycle = 0;
    this.regen = 0.0625 + (1 - a) * 0.0625;
    this.att = (1 - this.regen / 0.125) * 1.333;
    this.lp = Math.pow(1.00001 - (1 - b), 2) / Math.sqrt(over);
    this.drift = Math.pow(c, 3) * 0.001;
    const size = d * 1.77 + 0.1, mk = (arr) => arr.map((n) => new Line(Math.max(1, Math.floor(n * size))));
    // линии по каналам: [L, R] × блок из четырёх
    this.blk = [[3407, 1823, 859, 331], [4801, 2909, 1153, 461], [7607, 4217, 2269, 1597]].map((ns) => [mk(ns), mk(ns)]);
    this.dM = 256; this.mL = new Float64Array(this.dM + 1); this.mR = new Float64Array(this.dM + 1); this.cM = 0;
    this.vib = 0; this.oldfpd = 0.4294967295; this.fpd = 17;
    this.fb = [new Float64Array(4), new Float64Array(4)];
    this.x = [new Float64Array(4), new Float64Array(4)]; this.y = [new Float64Array(4), new Float64Array(4)];
    this.iA = [0, 0]; this.iB = [0, 0];
    this.ref = [new Float64Array(5), new Float64Array(5)];
  }
  run(inL, inR, outL, outR, n, lvl) {
    const lp = this.lp, D = this.dM + 1, X = this.x, Y = this.y, F = this.fb, B = this.blk;
    for (let s = 0; s < n; s++) {
      this.vib += this.oldfpd * this.drift;
      if (this.vib > Math.PI * 2) { this.vib = 0; let q = this.fpd; q = (q ^ (q << 13)) >>> 0; q ^= q >>> 17; q = (q ^ (q << 5)) >>> 0; this.fpd = q; this.oldfpd = 0.4294967295 + q * 0.0000000000618; }
      this.mL[this.cM] = inL[s] * this.att; this.mR[this.cM] = inR[s] * this.att;
      this.cM++; if (this.cM > this.dM) this.cM = 0;
      const wL = this.cM + (Math.sin(this.vib) + 1) * 127, wR = this.cM + (Math.sin(this.vib + Math.PI / 2) + 1) * 127;
      const iL = Math.floor(wL), fL = wL - iL, iR = Math.floor(wR), fR = wR - iR;
      let xL = this.mL[iL % D] * (1 - fL) + this.mL[(iL + 1) % D] * fL, xR = this.mR[iR % D] * (1 - fR) + this.mR[(iR + 1) % D] * fR;
      this.iA[0] = this.iA[0] * (1 - lp) + xL * lp; xL = this.iA[0];
      this.iA[1] = this.iA[1] * (1 - lp) + xR * lp; xR = this.iA[1];
      this.cycle++;
      if (this.cycle >= this.cycleEnd) {
        const g = this.regen;
        for (let k = 0; k < 4; k++) { X[0][k] = xL + F[1][k] * g; X[1][k] = xR + F[0][k] * g; } // каждый канал — с обратной связью другого
        for (let st = 0; st < 3; st++) {
          for (let ch = 0; ch < 2; ch++) { const L = B[st][ch]; for (let k = 0; k < 4; k++) Y[ch][k] = L[k].push(X[ch][k]); }
          if (st < 2) { mix4(Y[0], X[0]); mix4(Y[1], X[1]); }
        }
        mix4(Y[0], F[0]); mix4(Y[1], F[1]);
        this.refs((Y[0][0] + Y[0][1] + Y[0][2] + Y[0][3]) / 8, (Y[1][0] + Y[1][1] + Y[1][2] + Y[1][3]) / 8);
        this.cycle = 0;
      }
      xL = this.ref[0][this.cycle]; xR = this.ref[1][this.cycle];
      this.iB[0] = this.iB[0] * (1 - lp) + xL * lp; this.iB[1] = this.iB[1] * (1 - lp) + xR * lp;
      outL[s] = this.iB[0] * lvl; outR[s] = this.iB[1] * lvl;
    }
  }
  // промежуточные отсчёты при частоте от 88,2 кГц: от прошлого к новому по прямой (как в оригинале)
  refs(l, r) { refsTo(this.ref[0], l, this.cycleEnd); refsTo(this.ref[1], r, this.cycleEnd); }
}
const refsTo = (R, v, n) => { if (n === 1) { R[0] = v; return; } const p = R[n]; for (let k = 0; k <= n; k++) R[k] = p + (v - p) * (k / n); };

// Verbity2: срез низа → пять блоков по 5 линий (матрица Хаусхолдера 3x − 2·остальные), мягкая обратная связь с
// «размытием» (mulch), перекрёстная между каналами → срез верха
const hh5 = (x, y) => { const s = x[0] + x[1] + x[2] + x[3] + x[4]; for (let k = 0; k < 5; k++) y[k] = x[k] * 3 - (s - x[k]) * 2; };
class Verbity {
  constructor(sr, { a = 0.5, b = 0.5, c = 0.5 }) {
    const over = sr / 44100;
    this.cycleEnd = cycleEndOf(sr); this.cycle = 0;
    const size = Math.pow(a, 2) * 0.9 + 0.1;
    this.regen = (1 - Math.pow(1 - b, 3)) * 0.00032;
    this.lp = (1 - c * 0.75) / Math.sqrt(over);
    this.hp = (0.007 + c * 0.022) / Math.sqrt(over);
    this.ipMax = 0.07 + c * 0.4;
    const mk = (arr) => arr.map((n) => new Line(Math.max(1, Math.floor(n * size))));
    this.blk = [[5003, 4349, 3323, 2141, 677], [4951, 4157, 2791, 1811, 643], [4919, 3929, 2767, 1733, 439], [4799, 3529, 2389, 1171, 349], [4751, 3329, 2347, 787, 281]].map((ns) => [mk(ns), mk(ns)]);
    this.fb = [new Float64Array(5), new Float64Array(5)]; this.prev = [new Float64Array(5), new Float64Array(5)];
    this.x = [new Float64Array(5), new Float64Array(5)]; this.y = [new Float64Array(5), new Float64Array(5)];
    this.iA = [0, 0]; this.iB = [0, 0]; this.fpd = [17, 31];
    this.ref = [new Float64Array(5), new Float64Array(5)];
  }
  rnd(ch) { let q = this.fpd[ch]; q = (q ^ (q << 13)) >>> 0; q ^= q >>> 17; q = (q ^ (q << 5)) >>> 0; this.fpd[ch] = q; return q / 4294967295; }
  run(inL, inR, outL, outR, n, lvl) {
    const hp = this.hp, lp = this.lp, g = this.regen, X = this.x, Y = this.y, F = this.fb, P = this.prev, B = this.blk;
    for (let s = 0; s < n; s++) {
      let xL = inL[s], xR = inR[s];
      this.iA[0] = this.iA[0] * (1 - hp) + xL * hp; xL -= this.iA[0];
      this.iA[1] = this.iA[1] * (1 - hp) + xR * hp; xR -= this.iA[1];
      const ipL = this.ipMax + this.ipMax * this.rnd(0), ipR = this.ipMax + this.ipMax * this.rnd(1);
      this.cycle++;
      if (this.cycle >= this.cycleEnd) {
        for (let k = 0; k < 5; k++) {
          F[0][k] = F[0][k] * (1 - ipL) + P[0][k] * ipL; P[0][k] = F[0][k];
          F[1][k] = F[1][k] * (1 - ipR) + P[1][k] * ipR; P[1][k] = F[1][k];
          X[0][k] = xL + F[0][k] * (g * (1 - Math.abs(F[0][k] * g)));
          X[1][k] = xR + F[1][k] * (g * (1 - Math.abs(F[1][k] * g)));
        }
        for (let st = 0; st < 5; st++) {
          for (let ch = 0; ch < 2; ch++) { const L = B[st][ch]; for (let k = 0; k < 5; k++) Y[ch][k] = L[k].push(X[ch][k]); }
          if (st < 4) { hh5(Y[0], X[0]); hh5(Y[1], X[1]); }
        }
        hh5(Y[0], X[0]); hh5(Y[1], X[1]);
        // обратная связь крест-накрест по каналам — как в оригинале (A, C, E — в другой канал; B, D — в свой)
        F[1][0] = X[0][0]; F[0][1] = X[0][1]; F[1][2] = X[0][2]; F[0][3] = X[0][3]; F[1][4] = X[0][4];
        F[0][0] = X[1][0]; F[1][1] = X[1][1]; F[0][2] = X[1][2]; F[1][3] = X[1][3]; F[0][4] = X[1][4];
        this.refs((Y[0][0] + Y[0][1] + Y[0][2] + Y[0][3] + Y[0][4]) * 0.0016, (Y[1][0] + Y[1][1] + Y[1][2] + Y[1][3] + Y[1][4]) * 0.0016);
        this.cycle = 0;
      }
      const yL = this.ref[0][this.cycle], yR = this.ref[1][this.cycle];
      this.iB[0] = this.iB[0] * (1 - lp) + yL * lp; this.iB[1] = this.iB[1] * (1 - lp) + yR * lp;
      outL[s] = this.iB[0] * lvl; outR[s] = this.iB[1] * lvl;
    }
  }
  refs(l, r) { refsTo(this.ref[0], l, this.cycleEnd); refsTo(this.ref[1], r, this.cycleEnd); }
}

export const ALGOS = { galactic: Galactic, verbity: Verbity }; // для проверки в Node (tests/airwin.test.js)

if (typeof AudioWorkletProcessor !== 'undefined') {
  class AirwinProcessor extends AudioWorkletProcessor {
    constructor(opts) {
      super();
      const o = (opts && opts.processorOptions) || {};
      const A = ALGOS[o.algo] || Galactic;
      this.v = new A(sampleRate, o);
      this.lvl = o.lvl == null ? 1 : o.lvl;
      this.z = new Float32Array(128);
    }
    process(inputs, outputs) {
      const inp = inputs[0], out = outputs[0];
      const n = out[0].length;
      if (this.z.length < n) this.z = new Float32Array(n);
      const l = (inp && inp[0]) || this.z, r = (inp && (inp[1] || inp[0])) || this.z;
      this.v.run(l, r, out[0], out[1] || out[0], n, this.lvl);
      return true;
    }
  }
  registerProcessor('melete-airwin', AirwinProcessor);
}
