// Метроном: планирование с упреждением (Web Audio), акценты, дробления, свинг,
// тренер ускорения, тихие такты. Настройки — объект формата METRO_DEF (src/core/store.js).
import { getContext } from './context.js';

export const BPM_MIN = 20, BPM_MAX = 300;
const LOOKAHEAD = 0.12;  // с — насколько вперёд планируем удары
// Приложение свёрнуто: таймеры будят реже (раз в секунду и реже) — удары планируются на 1,6 с вперёд, без пропусков
const LOOK_HIDDEN = 1.6;
const lookahead = () => (typeof document !== 'undefined' && document.visibilityState === 'hidden' ? LOOK_HIDDEN : LOOKAHEAD);
const TICK_MS = 25;      // как часто планировщик просыпается

export const clampBpm = (v) => Math.max(BPM_MIN, Math.min(BPM_MAX, Math.round(v)));

// Акценты по умолчанию: 3 — сильная доля, 2 — средняя, 1 — слабая, 0 — без звука
export function defaultAccents(num, den) {
  const a = Array(num).fill(1);
  a[0] = 3;
  if (den >= 8) {
    if (num % 3 === 0 && num > 3) { for (let i = 3; i < num; i += 3) a[i] = 2; }
    else if (num === 5) a[3] = 2;
    else if (num === 7) { a[2] = 2; a[4] = 2; }
    else if (num >= 8 && num % 2 === 0) { for (let i = 2; i < num; i += 2) a[i] = 2; }
  } else if (num === 4) a[2] = 2;
  else if (num === 6) a[3] = 2;
  return a;
}

const TEMPO_NAMES = [[40, 'Grave'], [60, 'Largo'], [66, 'Larghetto'], [76, 'Adagio'], [108, 'Andante'],
  [120, 'Moderato'], [156, 'Allegro'], [176, 'Vivace'], [200, 'Presto'], [999, 'Prestissimo']];
export const tempoName = (b) => TEMPO_NAMES.find(([m]) => b < m)[1];

/* ---------- планировщик (без звука) ---------- */

export const newPosition = () => ({ beat: 0, subI: 0, bar: 0 });

// Длительность текущего дробления, с. Свинг — для восьмых: 2/3 + 1/3
export function subDur(cfg, subI) {
  const spb = 60 / cfg.bpm, s = cfg.sub;
  if (s === 2 && cfg.swing) return subI === 0 ? (spb * 2) / 3 : spb / 3;
  return spb / s;
}

// Тихий такт: играем gap.play тактов, молчим gap.mute
export const isMutedBar = (cfg, bar) => cfg.gap.on && bar % (cfg.gap.play + cfg.gap.mute) >= cfg.gap.play;

// Один шаг: событие текущей позиции и переход к следующей. Тренер может поднять cfg.bpm
// в начале такта — тогда в событии tempoUp: true (до смены темпа нужно учесть время на старом).
export function step(pos, cfg) {
  const acc = cfg.accents[pos.beat] ?? 1, silent = isMutedBar(cfg, pos.bar);
  const level = silent || acc <= 0 ? 0 : pos.subI === 0 ? acc : 0.5;
  const ev = { b: pos.beat, s: pos.subI, bar: pos.bar, silent, level, dur: subDur(cfg, pos.subI), tempoUp: false };
  pos.subI++;
  if (pos.subI >= cfg.sub) {
    pos.subI = 0;
    pos.beat++;
    if (pos.beat >= cfg.num) {
      pos.beat = 0;
      pos.bar++;
      const tr = cfg.trainer;
      if (tr.on && pos.bar % tr.every === 0 && cfg.bpm < tr.max) {
        ev.tempoUp = true;
        ev.prevBpm = cfg.bpm;
        cfg.bpm = Math.min(tr.max, cfg.bpm + tr.step);
      }
    }
  }
  return ev;
}

/* ---------- звук ---------- */

const VOL = { 3: 1, 2: 0.72, 1: 0.5, 0.5: 0.26 };

// Голос клика — и для студии (sequencer.js)
export function voice(c, out, t, l, sound, noise) {
  const g = c.createGain();
  g.connect(out);
  const vol = VOL[l];
  if (sound === 'wood') {
    const n = c.createBufferSource(), bp = c.createBiquadFilter();
    n.buffer = noise;
    bp.type = 'bandpass';
    bp.Q.value = 9;
    bp.frequency.value = { 3: 2400, 2: 1900, 1: 1600, 0.5: 1300 }[l];
    g.gain.setValueAtTime(vol * 2.4, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    n.connect(bp).connect(g);
    n.start(t); n.stop(t + 0.06);
    const o = c.createOscillator(), og = c.createGain();
    o.frequency.value = { 3: 1100, 2: 950, 1: 820, 0.5: 700 }[l];
    og.gain.setValueAtTime(vol * 0.5, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    o.connect(og).connect(out);
    o.start(t); o.stop(t + 0.04);
  } else {
    const o = c.createOscillator(), beep = sound === 'beep';
    o.type = beep ? 'sine' : 'triangle';
    o.frequency.value = beep ? { 3: 1320, 2: 1100, 1: 880, 0.5: 660 }[l] : { 3: 2000, 2: 1600, 1: 1250, 0.5: 950 }[l];
    const dec = beep ? 0.09 : 0.045;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol * (beep ? 0.6 : 0.9), t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
    o.connect(g);
    o.start(t); o.stop(t + dec + 0.02);
  }
}

export function makeNoise(c) {
  const len = c.sampleRate * 0.05, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

// onTempo(bpm, seconds) — сколько секунд сыграно на темпе (для «лучшего темпа» в сессии);
// onBpmChange(bpm) — тренер поднял темп
// onSave() — сохранить настройки (если это общие настройки, а не копия песни)
export function createMetronome({ mixer, cfg, onTempo = () => {}, onBpmChange = () => {}, onSave = () => {} }) {
  let c = null, noise = null, timer = null, next = 0, pos = newPosition(), lastTick = 0;
  const beatSubs = new Set();

  const m = {
    cfg,
    running: false,
    queue: [], // запланированные удары для анимации: { t, b, s, bar, silent }

    // Учесть время на текущем темпе (перед сменой темпа, паузой, остановкой)
    flush() {
      const now = Date.now();
      if (m.running && lastTick) onTempo(m.cfg.bpm, (now - lastTick) / 1000);
      lastTick = now;
    },

    sched() {
      const ahead = lookahead();
      while (next < c.currentTime + ahead) {
        const ev = step(pos, m.cfg);
        if (ev.level) voice(c, mixer.bus('metro'), next, ev.level, m.cfg.sound, noise);
        m.queue.push({ t: next, b: ev.b, s: ev.s, bar: ev.bar, silent: ev.silent });
        if (m.queue.length > 256) m.queue.splice(0, m.queue.length - 128); // свёрнуто — анимация не разбирает очередь
        // Сигналы без звука (вспышка, вибрация): только доли, не дробления; через сколько мс удар станет слышен
        if (ev.s === 0 && ev.level && beatSubs.size) {
          const ms = (next - c.currentTime + (c.outputLatency || c.baseLatency || 0)) * 1000;
          beatSubs.forEach((fn) => fn({ level: ev.level, b: ev.b, ms }));
        }
        next += ev.dur;
        if (ev.tempoUp) {
          const nb = m.cfg.bpm;
          m.cfg.bpm = ev.prevBpm; // время до смены — на старом темпе
          m.flush();
          m.cfg.bpm = nb;
          onBpmChange(nb);
        }
      }
    },

    start() {
      c = getContext(mixer.state.mode);
      if (!c) return false;
      if (!noise) noise = makeNoise(c);
      m.running = true;
      pos = newPosition();
      next = c.currentTime + 0.08;
      m.queue = [];
      m.sched();
      timer = setInterval(m.sched, TICK_MS);
      lastTick = Date.now();
      return true;
    },

    stop() {
      m.flush();
      m.running = false;
      clearInterval(timer);
      m.queue = [];
    },

    toggle() { return m.running ? (m.stop(), false) : m.start(); },

    // После смены дробления — с начала доли; после смены размера — с начала такта
    restartBeat({ bar = false } = {}) {
      pos.subI = 0;
      if (bar) pos.beat = 0;
    },

    save() { onSave(m.cfg); },

    setBpm(v) {
      m.flush();
      m.cfg.bpm = clampBpm(v);
    },

    // Подписка на доли: fn({ level, b, ms }) — вызывается заранее, при планировании; ms — через сколько удар
    onBeat(fn) { beatSubs.add(fn); return () => beatSubs.delete(fn); },

    // Удары, время которых уже наступило (для мигающих точек)
    due() {
      const out = [];
      while (c && m.queue.length && m.queue[0].t <= c.currentTime) out.push(m.queue.shift());
      return out;
    },
  };
  mixer.probe('metro', () => m.running);
  return m;
}

export { voice as clickVoice, makeNoise as clickNoise };
