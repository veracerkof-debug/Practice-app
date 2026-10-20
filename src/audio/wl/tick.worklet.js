// Часы звука (AudioWorkletProcessor): ничего не считает и не звучит — раз в несколько квантов шлёт главному потоку
// сообщение «тик». Сообщения из звукового потока приходят и когда экран погашен или приложение свёрнуто, в отличие
// от setTimeout/setInterval, которые браузер в фоне будит раз в секунду, а через пять минут — раз в минуту.
// На этих тиках работают планировщики (src/audio/clock.js).
class Tick extends AudioWorkletProcessor {
  constructor() { super(); this.q = 0; this.per = Math.max(1, Math.round((sampleRate * 0.025) / 128)); } // ≈ 25 мс
  process() {
    if (++this.q >= this.per) { this.q = 0; this.port.postMessage(0); }
    return true;
  }
}
registerProcessor('melete-tick', Tick);
