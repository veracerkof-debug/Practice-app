// Единый AudioContext: общий выход через компрессор, реверберация (свёртка со сгенерированным импульсом).
// Создаётся лениво — браузер разрешает звук только после жеста пользователя.
import { spaceOf, latencyFor } from './perf.js';
import { makeSpace, loadReverbWorklet, SPACES, SPACE_DEF } from './spaces.js';
export { SPACES, SPACE_DEF };
import { loadAirWorklet } from './airsound.js';
import { installClock } from './clock.js';

// Режим звука: 'fast' — быстрый отклик, 'bal' — баланс, 'smooth' — без треска
const LATENCY = { fast: 'interactive', bal: 'balanced', smooth: 'playback' };

let ctx = null, master = null, reverb = null, comp = null, trim = null;

export function getContext(mode = 'bal') {
  if (!ctx) {
    const C = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!C) return null;
    try { ctx = new C({ latencyHint: LATENCY[latencyFor(mode)] || 'balanced' }); } catch { ctx = new C(); }
    loadAirWorklet(ctx); // движок воздушных голосов (airsound.js) — грузится сразу, ноты до готовности идут узлами
    installClock(ctx); // часы звука для планировщиков — не засыпают при погашенном экране (clock.js)
    // Компрессор — только ловить пики, без пережатия: мягкое колено, низкая степень. У компрессора Web Audio есть
    // скрытое усиление (makeup): чем ниже порог, тем сильнее он поднимает всё и упирается в 0 dBFS — отсюда искажения
    // на большой громкости. Порог выше, а после него — запас (trim), чтобы выход не клиппило
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10; comp.knee.value = 10; comp.ratio.value = 3;
    comp.attack.value = 0.004; comp.release.value = 0.25;
    trim = ctx.createGain();
    trim.gain.value = 0.8;
    comp.connect(trim).connect(ctx.destination);
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(comp);
    loadReverbWorklet(ctx); // лёгкая реверберация (spaces.js) — модуль грузится сразу
    try { spaces.hall = makeSpace(ctx, 'hall', comp); reverb = spaces.hall.input; } catch { reverb = null; }
  }
  if (ctx.state === 'suspended' && !held) ctx.resume();
  return ctx;
}

// Пауза из шторки уведомлений (player.js): контекст заморожен и не оживает сам — ни по касанию экрана, ни по его
// включению (иначе звук возвращался, а кнопка в шторке показывала «Продолжить»); снимает её кнопка в шторке или
// «играть» в приложении (release)
let held = false;
export const isHeld = () => held;
export function hold(on) {
  held = !!on;
  const c = peekContext();
  if (!c || c.state === 'closed') return;
  (held ? c.suspend() : c.resume()).catch(() => {});
}

// Уже созданный контекст (или null) — без создания и без resume
export const peekContext = () => ctx;
export const masterNode = () => master;   // общая шина → компрессор → выход
export const reverbNode = () => reverb;   // вход реверберации (может быть null)
// Запись (recorder.js): отводы от всего, что звучит, — общего выхода после компрессора и прямых выходов мимо него
// (метроном идёт напрямую, чтобы щелчок не сжимался)
const direct = new Set(), taps = new Set();
export function directOut(node) {
  node.connect(ctx.destination);
  direct.add(node);
  taps.forEach((d) => node.connect(d));
}
export function addTap(dest) {
  trim.connect(dest);
  direct.forEach((n) => n.connect(dest));
  taps.add(dest);
  return () => {
    taps.delete(dest);
    [trim, ...direct].forEach((n) => { try { n.disconnect(dest); } catch { /* уже отключено */ } });
  };
}
export const now = () => (ctx ? ctx.currentTime : 0);

// Мягко отправить узел в реверберацию с заданным уровнем; возвращает узел посыла.
// via — узел микшера (mixer.wet), повторяющий громкость шины: посыл становится пост-фейдерным — ползунок и
// выключение шины глушат и хвост реверберации (без via хвост шёл мимо микшера)
export function sendToReverb(node, level, via = null) {
  if (!reverb || !ctx) return null;
  const s = ctx.createGain();
  s.gain.value = level;
  node.connect(s).connect(via || reverb);
  return s;
}

// Пространства реверберации — общие на всё приложение (описания и движки — spaces.js), создаются при первом посыле
// (лишних не держим): комната, зал (та же общая реверберация), пластина, собор (для пэдов и поклонения). Все идут
// в общий компрессор
const spaces = {};
function spaceNode(type) {
  if (!ctx) return null;
  type = spaceOf(type); // экономный режим: одно пространство на всех
  if (type === 'hall' || !SPACE_DEF[type]) return reverb;
  if (spaces[type] !== undefined) return spaces[type] && spaces[type].input;
  try { spaces[type] = makeSpace(ctx, type, comp); } catch { spaces[type] = null; }
  return spaces[type] && spaces[type].input;
}
// Смена движка реверберации (perf.js: setVerb) — пересобрать все общие пространства; посылы остаются
export function rebuildSpaces() { Object.values(spaces).forEach((s) => s && s.rebuild()); }
// Вход пространства (для пост-фейдерных посылов микшера); null — нет контекста
export const spaceInput = (type) => spaceNode(type);
// Посыл узла в пространство (уровень 0…1); возвращает узел посыла или null; via — см. sendToReverb
export function sendToSpace(node, type, level, via = null) {
  const sp = via || spaceNode(type);
  if (!sp) return null;
  const s = ctx.createGain();
  s.gain.value = level;
  node.connect(s).connect(sp);
  return s;
}
// Длинный зал для пэдов (поклонение) — то же пространство «собор»
// Посыл в длинный зал (уровень 0…1); возвращает узел посыла или null
export const sendToHall = (node, level, via = null) => sendToSpace(node, 'cathedral', level, via);

// MIDI → Гц при заданном строе A4
export const midiFreq = (m, a4 = 440) => a4 * Math.pow(2, (m - 69) / 12);

// Звук в браузере телефона. iPhone (Safari) включает звук только по «завершённому» касанию (отпускание, щелчок, клавиша),
// а не по первому прикосновению, и глушит Web Audio переключателем «Без звука». Поэтому: при любом таком жесте контекст
// создаётся или возобновляется и проигрывает тишину (так Safari его «открывает»); сеанс звука — «воспроизведение»,
// как у плеера, чтобы переключатель не глушил музыку (navigator.audioSession; на старых iPhone — беззвучный
// <audio> по кругу, тот же приём). Звонок, другое приложение — контекст «прерван»: следующий жест возобновит.
const IOS = typeof navigator !== 'undefined' && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
let silentEl = null;
function silentWav() {
  const n = 800, b = new Uint8Array(44 + n), v = new DataView(b.buffer), w = (o, s) => [...s].forEach((c, i) => { b[o + i] = c.charCodeAt(0); });
  w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true); w(36, 'data'); v.setUint32(40, n, true);
  b.fill(128, 44);
  let s = '';
  b.forEach((x) => { s += String.fromCharCode(x); });
  return 'data:audio/wav;base64,' + btoa(s);
}
function playbackSession() {
  try { if (navigator.audioSession) { navigator.audioSession.type = 'playback'; return; } } catch { /* нет такого */ }
  if (!IOS || document.hidden) return;
  if (!silentEl) {
    silentEl = document.createElement('audio');
    silentEl.setAttribute('x-webkit-airplay', 'deny');
    silentEl.preload = 'auto';
    silentEl.loop = true;
    silentEl.src = silentWav();
  }
  if (silentEl.paused) silentEl.play().catch(() => {});
}
export function installUnlock(getMode = () => 'bal') {
  if (typeof document === 'undefined') return;
  let primed = false;
  const kick = () => {
    playbackSession();
    const c = getContext(getMode());
    if (!c) return;
    if (c.state !== 'running' && !held) c.resume().catch(() => {});
    if (!primed) { // тишина в один отсчёт — после неё Safari считает звук разрешённым
      primed = true;
      try { const s = c.createBufferSource(); s.buffer = c.createBuffer(1, 1, c.sampleRate); s.connect(c.destination); s.start(0); } catch { /* */ }
    }
  };
  // касание окна инструмента или сессии снимает паузу из шторки: человек взялся играть
  const onGesture = (e) => {
    if (held && e && e.target && e.target.closest && e.target.closest('.tview, .session')) hold(false);
    if (!primed || !ctx || ctx.state !== 'running' || (silentEl && silentEl.paused && !document.hidden)) kick();
  };
  ['pointerup', 'touchend', 'click', 'keydown'].forEach((ev) => document.addEventListener(ev, onGesture, { capture: true, passive: true }));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (silentEl) silentEl.pause(); return; }
    if (ctx && ctx.state !== 'running' && ctx.state !== 'closed' && !held) ctx.resume().catch(() => {});
  });
}
