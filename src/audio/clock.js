// Таймеры звука, которые не засыпают в фоне. Браузер в свёрнутом приложении и при погашенном экране будит
// setTimeout/setInterval раз в секунду, а через пять минут — раз в минуту; планировщики (метроном, проигрыватель
// студии, лупер, плавание пэдов) с упреждением 0,3 с на этом захлёбываются, а отложенные отключения голосов
// срабатывают пачкой и дёргают звуковой поток. Здесь тики идут из самого звукового потока (wl/tick.worklet.js,
// ≈ 25 мс) — он работает всегда, пока контекст не приостановлен. Запасной ход на обычном setInterval остаётся:
// пока контекста нет, он не готов или приостановлен (тогда точность — как у браузера).
// API как у setTimeout/setInterval: after(ms, fn) → id, every(ms, fn) → id, cancel(id). Без DOM.

const timers = new Map(); // id → { at, fn, every }
let seq = 0, node = null, iv = 0, ready = false;
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function fire() {
  const t = now();
  for (const [id, x] of timers) {
    if (t < x.at) continue;
    if (x.every) { x.at += x.every; if (x.at < t) x.at = t + x.every; } else timers.delete(id); // проспали несколько периодов — не навёрстываем
    try { x.fn(); } catch { /* ошибка одного таймера не ломает остальные */ }
  }
  if (!timers.size && iv) { clearInterval(iv); iv = 0; }
}
// Запасной ход: с часами звука — редко (контекст может быть приостановлен), без них — как планировщики
function ensure() { if (!iv && timers.size) iv = setInterval(fire, ready ? 250 : 25); }

export function after(ms, fn) { const id = ++seq; timers.set(id, { at: now() + Math.max(0, ms), fn }); ensure(); return id; }
export function every(ms, fn) { const id = ++seq; const p = Math.max(5, ms); timers.set(id, { at: now() + p, fn, every: p }); ensure(); return id; }
export function cancel(id) { timers.delete(id); }

// Часы в звуковом потоке контекста c; вызывается один раз при создании контекста (context.js)
export async function installClock(c) {
  if (node || !c || !c.audioWorklet) return;
  try {
    await c.audioWorklet.addModule(new URL('./wl/tick.worklet.js', import.meta.url));
    node = new AudioWorkletNode(c, 'melete-tick', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1] });
    const mute = c.createGain(); mute.gain.value = 0;
    node.connect(mute).connect(c.destination); // не звучит, но участвует в расчёте — иначе поток к нему не приходит
    node.port.onmessage = fire;
    ready = true;
    if (iv) { clearInterval(iv); iv = 0; ensure(); }
  } catch { node = null; }
}
export const clockReady = () => ready;
