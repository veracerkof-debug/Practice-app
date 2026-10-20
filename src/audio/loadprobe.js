// Зонд нагрузки звукового потока (AudioWorkletProcessor). Ничего не считает и не звучит: замечает, когда поток
// приходит к нему за очередным квантом (128 отсчётов). Внутри одного вызова драйвера кванты считаются подряд, и
// промежуток между соседними вызовами process() — это время расчёта одного кванта всем графом. Раз в секунду
// отдаёт среднее по таким промежуткам в долях длины кванта (1 = поток едва успевает) и число промежутков.
// Между вызовами драйвера поток ждёт — такие промежутки (длиннее кванта в несколько раз) не считаются.
class LoadProbe extends AudioWorkletProcessor {
  constructor() {
    super();
    this.last = 0; this.acc = 0; this.n = 0; this.q = 0; this.max = 0;
    this.qms = (128 / sampleRate) * 1000;
    this.per = Math.round(sampleRate / 128); // квантов в секунде
  }
  process() {
    const t = Date.now();
    if (this.last) {
      const d = t - this.last;
      if (d <= this.qms * 4) { this.acc += d; this.n++; if (d > this.max) this.max = d; }
    }
    this.last = t;
    if (++this.q >= this.per) {
      this.port.postMessage({ load: this.n ? this.acc / (this.n * this.qms) : 0, peak: this.max / this.qms, n: this.n });
      this.acc = 0; this.n = 0; this.q = 0; this.max = 0;
    }
    return true;
  }
}
registerProcessor('melete-load', LoadProbe);
