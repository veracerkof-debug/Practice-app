// Лёгкая реверберация в AudioWorklet — алгоритм, как в синтезаторах на телефоне, вместо свёртки (та стоит
// 3–6 % потока на каждое пространство даже на настольном процессоре, на телефоне — в разы больше).
// Схема: предзадержка → четыре всепропускающих фильтра-рассеивателя (плотность ранних отражений) → сеть из восьми
// линий задержки с обратной связью через матрицу Адамара (FDN), в каждой петле — однополюсный фильтр верхов
// (затухание высоких, как в зале) и усиление по времени реверберации (RT60), четыре линии чуть качаются по длине
// (без металлического звона; качание пересчитывается раз в квант — 128 отсчётов). Выход — две разные суммы линий
// (стерео без корреляции). Вход — моно-сумма каналов. Всё в плоских типизированных массивах — дешёвая петля.
// Параметры — processorOptions: { sec — RT60, damp 0…1 — затухание верхов, pre — предзадержка (с), size — масштаб
// линий, lvl — уровень выхода }
const LINES_MS = [23.1, 29.7, 37.3, 43.9, 53.3, 61.7, 71.3, 83.9];
const AP_MS = [4.77, 3.6, 12.73, 9.3];
const AP_G = 0.68, S8 = 0.35355339; // 1/√8

class ReverbProcessor extends AudioWorkletProcessor {
  constructor(opts) {
    super();
    const o = Object.assign({ sec: 2.8, damp: 0.6, pre: 0, size: 1, lvl: 1 }, (opts && opts.processorOptions) || {});
    const sr = sampleRate;
    this.lvl = o.lvl;
    this.preLen = Math.max(1, Math.round(o.pre * sr));
    this.pre = new Float32Array(this.preLen);
    this.preI = 0;
    this.apBuf = AP_MS.map((ms) => new Float32Array(Math.max(2, Math.round((ms / 1000) * sr * o.size))));
    this.apI = new Int32Array(4);
    this.len = new Int32Array(8); this.cap = new Int32Array(8); this.w = new Int32Array(8);
    this.g = new Float32Array(8); this.lp = new Float32Array(8); this.rd = new Int32Array(8); // rd — смещение чтения на квант
    this.bufs = LINES_MS.map((ms, k) => {
      const len = Math.max(8, Math.round((ms / 1000) * sr * o.size));
      this.len[k] = len; this.cap[k] = len + 64;
      this.g[k] = Math.pow(10, (-3 * len) / (Math.max(0.1, o.sec) * sr));
      return new Float32Array(len + 64);
    });
    const fc = 1300 + 12700 * Math.pow(1 - o.damp, 1.4); // damp 0 → 14 кГц, 1 → 1,3 кГц
    this.a = 1 - Math.exp((-2 * Math.PI * fc) / sr);
    this.phase = 0;
    this.sr = sr;
  }

  process(inputs, outputs) {
    const inp = inputs[0], out = outputs[0];
    if (!out || !out[0]) return true;
    const L = out[0], R = out[1] || out[0], N = L.length;
    const x0 = inp && inp[0], x1 = inp && inp[1];
    const { pre, preLen, apBuf, apI, bufs, len, cap, w, g, lp, rd, a, lvl } = this;
    // качание длины нечётных линий — раз в квант
    this.phase += N / this.sr;
    const ph = this.phase;
    for (let k = 1; k < 8; k += 2) rd[k] = Math.round((6 + k * 1.5) * (1 + Math.sin(k * 0.9 + ph * (0.23 + k * 0.17) * 6.2831853)) * 0.5);
    const b0 = bufs[0], b1 = bufs[1], b2 = bufs[2], b3 = bufs[3], b4 = bufs[4], b5 = bufs[5], b6 = bufs[6], b7 = bufs[7];
    const a0 = apBuf[0], a1 = apBuf[1], a2 = apBuf[2], a3 = apBuf[3];
    let preI = this.preI;
    let i0 = apI[0], i1 = apI[1], i2 = apI[2], i3 = apI[3];
    let w0 = w[0], w1 = w[1], w2 = w[2], w3 = w[3], w4 = w[4], w5 = w[5], w6 = w[6], w7 = w[7];
    let l0 = lp[0], l1 = lp[1], l2 = lp[2], l3 = lp[3], l4 = lp[4], l5 = lp[5], l6 = lp[6], l7 = lp[7];
    const g0 = g[0], g1 = g[1], g2 = g[2], g3 = g[3], g4 = g[4], g5 = g[5], g6 = g[6], g7 = g[7];
    // точки чтения: w − len (+ качание); кольцо ёмкостью cap
    let r0 = w0 - len[0], r1 = w1 - len[1] + rd[1], r2 = w2 - len[2], r3 = w3 - len[3] + rd[3], r4 = w4 - len[4], r5 = w5 - len[5] + rd[5], r6 = w6 - len[6], r7 = w7 - len[7] + rd[7];
    if (r0 < 0) r0 += cap[0]; if (r1 < 0) r1 += cap[1]; if (r2 < 0) r2 += cap[2]; if (r3 < 0) r3 += cap[3];
    if (r4 < 0) r4 += cap[4]; if (r5 < 0) r5 += cap[5]; if (r6 < 0) r6 += cap[6]; if (r7 < 0) r7 += cap[7];
    const c0 = cap[0], c1 = cap[1], c2 = cap[2], c3 = cap[3], c4 = cap[4], c5 = cap[5], c6 = cap[6], c7 = cap[7];
    const n0 = a0.length, n1 = a1.length, n2 = a2.length, n3 = a3.length;
    for (let i = 0; i < N; i++) {
      let x = (x0 ? (x1 ? 0.5 * (x0[i] + x1[i]) : x0[i]) : 0) + 1e-25; // крошечная подмешка: хвост не уходит в денормализованные числа (они считаются в разы медленнее)
      // предзадержка
      const d = pre[preI]; pre[preI] = x; x = d; if (++preI === preLen) preI = 0;
      // рассеиватели: y = z − g·x; z' = x + g·y
      let z = a0[i0], y = z - AP_G * x; a0[i0] = x + AP_G * y; if (++i0 === n0) i0 = 0; x = y;
      z = a1[i1]; y = z - AP_G * x; a1[i1] = x + AP_G * y; if (++i1 === n1) i1 = 0; x = y;
      z = a2[i2]; y = z - AP_G * x; a2[i2] = x + AP_G * y; if (++i2 === n2) i2 = 0; x = y;
      z = a3[i3]; y = z - AP_G * x; a3[i3] = x + AP_G * y; if (++i3 === n3) i3 = 0; x = y;
      // чтение линий
      const o0 = b0[r0], o1 = b1[r1], o2 = b2[r2], o3 = b3[r3], o4 = b4[r4], o5 = b5[r5], o6 = b6[r6], o7 = b7[r7];
      if (++r0 === c0) r0 = 0; if (++r1 === c1) r1 = 0; if (++r2 === c2) r2 = 0; if (++r3 === c3) r3 = 0;
      if (++r4 === c4) r4 = 0; if (++r5 === c5) r5 = 0; if (++r6 === c6) r6 = 0; if (++r7 === c7) r7 = 0;
      // выход: две некоррелированные суммы
      L[i] = (o0 + o3 - o5 + o6) * lvl;
      R[i] = (o1 - o2 + o4 + o7) * lvl;
      // матрица Адамара 8×8 (бабочки)
      const p0 = o0 + o1, p1 = o0 - o1, p2 = o2 + o3, p3 = o2 - o3, p4 = o4 + o5, p5 = o4 - o5, p6 = o6 + o7, p7 = o6 - o7;
      const q0 = p0 + p2, q1 = p1 + p3, q2 = p0 - p2, q3 = p1 - p3, q4 = p4 + p6, q5 = p5 + p7, q6 = p4 - p6, q7 = p5 - p7;
      // фильтр верхов в петле, усиление RT60, запись: вход + обратная связь
      l0 += a * ((q0 + q4) * S8 - l0); b0[w0] = x + l0 * g0; if (++w0 === c0) w0 = 0;
      l1 += a * ((q1 + q5) * S8 - l1); b1[w1] = x + l1 * g1; if (++w1 === c1) w1 = 0;
      l2 += a * ((q2 + q6) * S8 - l2); b2[w2] = x + l2 * g2; if (++w2 === c2) w2 = 0;
      l3 += a * ((q3 + q7) * S8 - l3); b3[w3] = x + l3 * g3; if (++w3 === c3) w3 = 0;
      l4 += a * ((q0 - q4) * S8 - l4); b4[w4] = x + l4 * g4; if (++w4 === c4) w4 = 0;
      l5 += a * ((q1 - q5) * S8 - l5); b5[w5] = x + l5 * g5; if (++w5 === c5) w5 = 0;
      l6 += a * ((q2 - q6) * S8 - l6); b6[w6] = x + l6 * g6; if (++w6 === c6) w6 = 0;
      l7 += a * ((q3 - q7) * S8 - l7); b7[w7] = x + l7 * g7; if (++w7 === c7) w7 = 0;
    }
    this.preI = preI;
    apI[0] = i0; apI[1] = i1; apI[2] = i2; apI[3] = i3;
    w[0] = w0; w[1] = w1; w[2] = w2; w[3] = w3; w[4] = w4; w[5] = w5; w[6] = w6; w[7] = w7;
    lp[0] = l0; lp[1] = l1; lp[2] = l2; lp[3] = l3; lp[4] = l4; lp[5] = l5; lp[6] = l6; lp[7] = l7;
    return true;
  }
}
registerProcessor('melete-reverb', ReverbProcessor);
