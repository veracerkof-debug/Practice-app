// Воздушный звук для поклонения (пэды, клавиши, глайдер, терменвокс). Без пил и резонанса — от них звук «электронный»:
// основа — мягкие волны (почти синус, немного второй и третьей гармоник), несколько слегка расстроенных голосов,
// которые медленно и неравномерно «плывут» (как живой ансамбль, а не ровный хорус), высокая октава и квинта
// вступают позже основы (мерцание), тихое дыхание — розовый шум в полосе около ноты, мягкий фильтр без резонанса.
// Пространство — длинный зал (context.js: sendToHall) у того, кто звук играет.
// Цена: пэд — самый дорогой звук приложения (на один голос — унисон, октава, дыхание). Чтобы четыре источника звучали
// разом и не захлёбывались: «плавание» — не генератор на каждый голос унисона (это была половина всех генераторов),
// а автоматизация расстройки; дыхание — моно-шум; когда голосов уже много, новые берутся легче (унисон и мерцание меньше).
import { uniCap } from './perf.js';
import { partsWave, pinkNoise } from './waves.js';

// Рецепты. parts — гармоники основы; uni — голосов в унисоне, det — их расстройка (центы), drift — «плавание» (центы);
// oct, fifth — октава и квинта над ней (мерцание); sub — октава вниз; breath — дыхание; cut — фильтр (× частота ноты);
// vib — [частота, центы, задержка с]; formant — гласная «а» (хор); chiff — придых в начале (флейта);
// ping — яркие гармоники удара, гаснут за ~0,4 с (мягкое пиано), thump — войлочный удар молоточка;
// lvl — поправка громкости, чтобы все рецепты звучали одинаково громко
export const AIR = {
  air: { parts: [1, 0.16, 0.05, 0.015], uni: 3, det: 7, drift: 3, oct: 0.1, breath: 0.03, cut: 7 },
  light: { parts: [1, 0.08], uni: 3, det: 6, drift: 3, oct: 0.24, fifth: 0.09, breath: 0.045, cut: 10, lvl: 0.92 },
  warm: { parts: [1, 0.3, 0.12, 0.05, 0.02], uni: 3, det: 5, drift: 2, sub: 0.2, breath: 0.018, cut: 3.2, lvl: 0.92 },
  choir: { parts: [1, 0.55, 0.4, 0.28, 0.2, 0.14, 0.1, 0.07, 0.05, 0.035], uni: 3, det: 9, drift: 4, breath: 0.05, cut: 9, formant: true, vib: [4.6, 8, 0.9], lvl: 1.6 },
  flute: { parts: [1, 0.1, 0.03], uni: 1, det: 0, drift: 2, breath: 0.07, chiff: 0.22, cut: 8, vib: [5, 13, 0.55], lvl: 0.82 },
  felt: { parts: [1, 0.22, 0.06, 0.02], uni: 2, det: 3, drift: 1.5, cut: 5, ping: [1, 0.5, 0.35, 0.22, 0.14, 0.09, 0.05], thump: 0.12 },
};
export const isAir = (k) => !!AIR[k];

const rnd = (a, b) => a + Math.random() * (b - a);

// Сколько воздушных голосов звучит сейчас (по всему приложению): считаем по концу первого генератора голоса
let live = 0;
export const airLive = () => live;
// Бюджет под нагрузкой (ступень): 0 — до 8 голосов, как задумано; 1 — до 16: унисон не больше двух, без плавания,
// мерцание одним генератором; 2 — дальше по одному генератору на всё (созвучие из многих нот всё равно звучит густо).
// Плавание — самое дорогое в голосе: расстройка, меняющаяся во времени, считается генератором на каждый отсчёт
const tierNow = () => (live < 8 ? 0 : live < 16 ? 1 : 2);
const budget = (tier, n) => (tier === 0 ? n : tier === 1 ? Math.min(n, 2) : 1);

// «Плавание» расстройки автоматизацией: каждые 1,2…2,2 с — новая случайная цель в пределах ±amt центов, к которой
// параметр подходит плавно. Один таймер на все голоса, цели ставятся на 30 с вперёд (фоновая вкладка режет таймеры)
const drifting = new Set();
let driftTimer = null;
const HORIZON = 30, DRIFT_TICK = 5000;
function driftMore(d) {
  const { c, p, base, amt } = d;
  while (d.next < c.currentTime + HORIZON) {
    p.setTargetAtTime(base + rnd(-amt, amt), d.next, 0.6);
    d.next += rnd(1.2, 2.2);
  }
}
function drift(c, p, base, amt, t) {
  const d = { c, p, base, amt, next: t };
  driftMore(d);
  drifting.add(d);
  if (!driftTimer) driftTimer = setInterval(() => { drifting.forEach(driftMore); }, DRIFT_TICK);
  return d;
}
function undrift(ds) {
  ds.forEach((d) => drifting.delete(d));
  if (!drifting.size && driftTimer) { clearInterval(driftTimer); driftTimer = null; }
}

// Один голос (нота). dest — куда звучать; f — частота; t — начало.
// opts: width (ширина, 0…1,5), bright (×фильтр), fade — за сколько секунд вступает мерцание,
//       vibIn — узел вибрато «от руки» (центы, подключается к расстройке), body — { decay, floor }: основа гаснет сама,
//       uni — не больше стольких голосов в унисоне (лёгкий вариант для созвучий из многих нот),
//       mul — ручки звука (множители рецепта, 1 — как задумано): breath — дыхание, shim — мерцание, drift — плавание,
//       vib — вибрато, hammer — удар молоточка
// → { set(f, tau), srcs (что остановить), out }
export const airOf = (kind, mul) => {
  const B = AIR[kind] || AIR.air;
  if (!mul) return B;
  const k = (x) => (mul[x] == null ? 1 : +mul[x]);
  return { ...B, breath: (B.breath || 0) * k('breath'), chiff: (B.chiff || 0) * k('breath'), oct: (B.oct || 0) * k('shim'), fifth: (B.fifth || 0) * k('shim'),
    drift: (B.drift || 0) * k('drift'), vib: B.vib && [B.vib[0], B.vib[1] * k('vib'), B.vib[2]], thump: (B.thump || 0) * k('hammer'), pingAmp: 0.55 * k('hammer') };
};
export function airVoice(c, dest, kind, f, t, { width = 1, bright = 1, fade = 2.5, vibIn = null, body = null, uni = 0, mul = null } = {}) {
  const R = airOf(kind, mul), srcs = [], tr = [], tier = tierNow(); // tr — [параметр, множитель частоты, предел]
  const out = c.createGain(), lp = c.createBiquadFilter(), mix = c.createGain();
  lp.type = 'lowpass';
  lp.Q.value = 0.3;
  out.gain.value = R.lvl || 1;
  lp.connect(out).connect(dest);
  // основа гаснет к floor за decay секунд, если задано (клавиши под пэдом)
  let core = mix;
  if (body) {
    core = c.createGain();
    core.gain.setValueAtTime(1, t);
    core.gain.setTargetAtTime(body.floor, t + 0.02, body.decay / 3);
    mix.connect(core);
  }
  if (R.formant) { // хор: форманты гласной «а» и немного прямого звука
    const dry = c.createGain();
    dry.gain.value = 0.35;
    core.connect(dry).connect(lp);
    [[800, 5, 1], [1150, 6, 0.7], [2900, 8, 0.22]].forEach(([fq, q, g0]) => {
      const bp = c.createBiquadFilter(), bg = c.createGain();
      bp.type = 'bandpass'; bp.frequency.value = fq; bp.Q.value = q; bg.gain.value = g0 * 1.5;
      core.connect(bp).connect(bg).connect(lp);
    });
  } else core.connect(lp);
  const vibs = [];
  if (vibIn) vibs.push(vibIn);
  if (R.vib) { // своё вибрато: вступает с задержкой, как у певца или флейтиста
    const lo = c.createOscillator(), lg = c.createGain();
    lo.frequency.value = R.vib[0] * rnd(0.95, 1.05);
    lg.gain.setValueAtTime(0, t);
    lg.gain.setValueAtTime(0, t + R.vib[2]);
    lg.gain.linearRampToValueAtTime(R.vib[1], t + R.vib[2] + 0.8);
    lo.connect(lg);
    lo.start(t);
    srcs.push(lo);
    vibs.push(lg);
  }
  const pan = (node, p) => {
    if (!p || !c.createStereoPanner) return node;
    const pn = c.createStereoPanner();
    pn.pan.value = Math.max(-1, Math.min(1, p));
    node.connect(pn);
    return pn;
  };
  const osc = (mult, wave, gain, detune, p, to = mix) => {
    const o = c.createOscillator(), g = c.createGain();
    if (wave) o.setPeriodicWave(wave); else o.type = 'sine';
    o.frequency.value = f * mult;
    o.detune.value = detune;
    vibs.forEach((v) => v.connect(o.detune));
    g.gain.value = gain;
    o.connect(g);
    pan(g, p).connect(to);
    o.start(t);
    srcs.push(o);
    tr.push([o.frequency, mult]);
    return { o, g };
  };
  // основа: унисон с расстройкой и медленным неровным «плаванием» каждого голоса (автоматизацией, без генераторов)
  const n = uniCap(budget(tier, uni ? Math.min(uni, R.uni) : R.uni)), wave = partsWave(c, R.parts), lv = 1 / Math.sqrt(n), ds = [];
  for (let i = 0; i < n; i++) {
    const k = n === 1 ? 0 : (i / (n - 1)) * 2 - 1, det = k * R.det * width + rnd(-1, 1), { o } = osc(1, wave, lv, det, k * 0.7 * Math.min(1, width));
    if (R.drift && tier === 0) ds.push(drift(c, o.detune, det, R.drift, t));
  }
  // учёт живых голосов: первый генератор основы кончается — голос кончился
  live++;
  srcs[srcs.length - n].addEventListener('ended', () => { live = Math.max(0, live - 1); undrift(ds); }, { once: true });
  // мерцание сверху и опора снизу — вступают медленнее основы
  const swell = (amt) => {
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(amt, t + fade);
    g.connect(lp);
    return g;
  };
  if (R.oct) { // мерцание: два генератора по сторонам; под нагрузкой — один (с расстройкой, в середине)
    const g = swell(R.oct);
    if (budget(tier, 2) > 1) { osc(2, null, 0.5, -4, -0.5, g); osc(2, null, 0.5, 4, 0.5, g); } else osc(2, null, 0.7, rnd(-4, 4), 0, g);
  }
  if (R.fifth) osc(3, null, 1, rnd(-3, 3), 0, swell(R.fifth));
  if (R.sub) osc(0.5, null, R.sub, 0, 0);
  // удар мягкого пиано: яркие гармоники быстро гаснут, остаётся тёплая основа
  if (R.ping) {
    const { g } = osc(1, partsWave(c, R.ping), 0, 0, 0);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(R.pingAmp ?? 0.55, t + 0.004);
    g.gain.setTargetAtTime(0, t + 0.01, 0.14);
  }
  // шум в полосе около ноты (моно); срез низа нужен только низким нотам — у высоких полоса и так выше 350 Гц
  const noise = (amt, to) => {
    const src = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain(), fc = Math.min(9000, f * 2);
    src.buffer = pinkNoise(c, true);
    src.loop = true;
    src.loopStart = rnd(0, 3);
    bp.type = 'bandpass'; bp.frequency.value = fc; bp.Q.value = 0.9;
    g.gain.value = amt;
    let tail = bp;
    if (fc < 1200) { const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 350; bp.connect(hp); tail = hp; }
    src.connect(bp); tail.connect(g).connect(to);
    src.start(t, rnd(0, 3));
    srcs.push(src);
    tr.push([bp.frequency, 2, 9000]);
    return g;
  };
  // дыхание: тихий шум в полосе около ноты; у флейты — придых в начале
  if (R.breath || R.chiff) {
    const g = noise(R.breath || 0, out);
    if (R.chiff) {
      g.gain.setValueAtTime(R.chiff, t);
      g.gain.setTargetAtTime(R.breath || 0, t + 0.03, 0.06);
    }
  }
  if (R.thump) { // войлочный удар: низкий глухой шум, 40 мс
    const src = c.createBufferSource(), lpn = c.createBiquadFilter(), g = c.createGain();
    src.buffer = pinkNoise(c, true);
    lpn.type = 'lowpass'; lpn.frequency.value = Math.min(900, f * 2.5);
    g.gain.setValueAtTime(R.thump, t);
    g.gain.setTargetAtTime(0, t + 0.004, 0.015);
    src.connect(lpn).connect(g).connect(out);
    src.start(t, rnd(0, 3));
    src.stop(t + 0.12);
  }
  const cutOf = (fq) => Math.max(700, Math.min(18000, fq * R.cut * bright));
  lp.frequency.value = cutOf(f);
  return {
    out, srcs,
    set(fq, tau = 0.03) {
      const now = c.currentTime;
      tr.forEach(([p, m, max = 24000]) => p.setTargetAtTime(Math.min(max, fq * m), now, tau));
      lp.frequency.setTargetAtTime(cutOf(fq), now, Math.max(tau, 0.05));
    },
  };
}
