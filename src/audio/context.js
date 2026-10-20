// Единый AudioContext: общий выход через компрессор, реверберация (свёртка со сгенерированным импульсом).
// Создаётся лениво — браузер разрешает звук только после жеста пользователя.
import { makeIR } from './waves.js';

// Режим звука: 'fast' — быстрый отклик, 'bal' — баланс, 'smooth' — без треска
const LATENCY = { fast: 'interactive', bal: 'balanced', smooth: 'playback' };

let ctx = null, master = null, reverb = null, comp = null, trim = null;

export function getContext(mode = 'bal') {
  if (!ctx) {
    const C = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!C) return null;
    try { ctx = new C({ latencyHint: LATENCY[mode] || 'balanced' }); } catch { ctx = new C(); }
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
    try {
      const cv = ctx.createConvolver();
      cv.buffer = makeIR(ctx, 2.8);
      const rg = ctx.createGain();
      rg.gain.value = 0.55;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 180;
      reverb = ctx.createGain();
      reverb.connect(hp).connect(cv).connect(rg).connect(comp);
    } catch { reverb = null; }
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
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

// Мягко отправить узел в реверберацию с заданным уровнем; возвращает узел посыла
export function sendToReverb(node, level) {
  if (!reverb || !ctx) return null;
  const s = ctx.createGain();
  s.gain.value = level;
  node.connect(s).connect(reverb);
  return s;
}

// Пространства реверберации — общие на всё приложение, создаются при первом посыле (свёртка — дорогой узел,
// лишних не держим): комната (0,9 с, тёплая), зал (2,8 с — та же общая реверберация), пластина (1,7 с, яркая и
// плотная, без предзадержки), собор (7 с, мягкие верха и медленное нарастание — для пэдов и поклонения, звук
// «растворяется», не мешая остальным). Все идут в общий компрессор
export const SPACES = ['room', 'hall', 'plate', 'cathedral'];
const SPACE_DEF = {
  room: { sec: 0.9, damp: 0.7, pre: 0, hp: 160, lp: 7000, gain: 0.5 },
  plate: { sec: 1.7, damp: 0.25, pre: 0, hp: 200, lp: 12000, gain: 0.45 },
  cathedral: { sec: 7, damp: 0.86, pre: 0.035, hp: 140, lp: 5200, gain: 0.62 },
};
const spaces = {};
function spaceNode(type) {
  if (!ctx) return null;
  if (type === 'hall' || !SPACE_DEF[type]) return reverb;
  if (spaces[type] !== undefined) return spaces[type];
  try {
    const d = SPACE_DEF[type], cv = ctx.createConvolver(), lp = ctx.createBiquadFilter(), hp = ctx.createBiquadFilter(), g = ctx.createGain();
    cv.buffer = makeIR(ctx, d.sec, { damp: d.damp, pre: d.pre });
    hp.type = 'highpass'; hp.frequency.value = d.hp;
    lp.type = 'lowpass'; lp.frequency.value = d.lp;
    g.gain.value = d.gain;
    const inp = ctx.createGain();
    inp.connect(hp).connect(cv).connect(lp).connect(g).connect(comp);
    spaces[type] = inp;
  } catch { spaces[type] = null; }
  return spaces[type];
}
// Посыл узла в пространство (уровень 0…1); возвращает узел посыла или null
export function sendToSpace(node, type, level) {
  const sp = spaceNode(type);
  if (!sp) return null;
  const s = ctx.createGain();
  s.gain.value = level;
  node.connect(s).connect(sp);
  return s;
}
// Длинный зал для пэдов (поклонение) — то же пространство «собор»
// Посыл в длинный зал (уровень 0…1); возвращает узел посыла или null
export const sendToHall = (node, level) => sendToSpace(node, 'cathedral', level);

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
    if (c.state !== 'running') c.resume().catch(() => {});
    if (!primed) { // тишина в один отсчёт — после неё Safari считает звук разрешённым
      primed = true;
      try { const s = c.createBufferSource(); s.buffer = c.createBuffer(1, 1, c.sampleRate); s.connect(c.destination); s.start(0); } catch { /* */ }
    }
  };
  const onGesture = () => { if (!primed || !ctx || ctx.state !== 'running' || (silentEl && silentEl.paused && !document.hidden)) kick(); };
  ['pointerup', 'touchend', 'click', 'keydown'].forEach((ev) => document.addEventListener(ev, onGesture, { capture: true, passive: true }));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (silentEl) silentEl.pause(); return; }
    if (ctx && ctx.state !== 'running' && ctx.state !== 'closed') ctx.resume().catch(() => {});
  });
}
