// Микшер: шина на каждый источник, громкость 0…1.5, выключение звука.
// Состояние — объект device.mix (как в прототипе: { metro, piano, drone, audio, theory, mode, mute }).
import { getContext, masterNode, reverbNode, directOut, spaceInput, rebuildSpaces } from './context.js';
import { createFxChain, normalizeFx, fxIsFlat } from './fx.js';
import { setPerf, resolvePerf, setEngine, ENGINES, VERBS, setVerb, defaultVerb, desktopApp } from './perf.js';

// Шины по контракту модуля. 'media' хранится в mix под ключом 'audio' (совместимость с прототипом)
// looper — лупер (слои и монитор), notes — табы и ноты (alphaTab играет своим звуком: шина зеркалит громкость и выключение в masterVolume)
export const BUSES = ['metro', 'piano', 'glider', 'drone', 'media', 'looper', 'notes', 'theory'];
const KEY = { metro: 'metro', piano: 'piano', glider: 'glider', drone: 'drone', media: 'audio', looper: 'looper', notes: 'notes', theory: 'theory' };
export const mixKey = (bus) => KEY[bus] || bus;

export const MIX_MAX = 1.5;

export function normalizeMix(mx) {
  if (mx.theory == null) mx.theory = 1;
  if (!mx.mute) mx.mute = {};
  if (!mx.mode) mx.mode = 'smooth';
  if (!mx.v2) { mx.v2 = 1; if (mx.mode === 'bal') mx.mode = 'smooth'; } // 2026-10: надёжность важнее задержки — большой буфер по умолчанию
  // 2026-10-22: на компьютере большой буфер даёт ~0,1 с от нажатия до звука — играть с клавиатуры нельзя; процессор
  // там сильный, треска при среднем буфере нет. Телефон — как был
  if (!mx.v3) { mx.v3 = 1; if (desktopApp() && mx.mode === 'smooth') mx.mode = 'bal'; }
  if (!['full', 'eco'].includes(mx.perf)) mx.perf = 'full'; // режим качества (perf.js): по умолчанию полный
  if (!ENGINES.includes(mx.engine)) mx.engine = 'wl'; // движок воздушных голосов: worklet (по умолчанию) или узлы
  if (!VERBS.includes(mx.verb)) mx.verb = defaultVerb(); // реверберация: свёртка или лёгкая (телефон — лёгкая)
  if (!mx.fx || typeof mx.fx !== 'object') mx.fx = {}; // эффекты шин (fx.js): ключ — как у громкости
  return mx;
}

export function createMixer(mx, { onChange = () => {} } = {}) {
  normalizeMix(mx);
  setPerf(resolvePerf(mx.perf));
  setEngine(mx.engine);
  setVerb(mx.verb);
  const nodes = {}, sends = {}, chains = {}, probes = {}, subs = new Set(), wets = {};
  let saveTm = 0;
  const saveLater = () => { clearTimeout(saveTm); saveTm = setTimeout(() => onChange(mx), 250); }; // правка эффектов — десятки раз в секунду при ведении точки

  const value = (bus) => {
    const k = mixKey(bus);
    if (mx.mute[k]) return 0;
    const v = mx[k];
    return v == null ? 1 : v;
  };

  const apply = () => {
    // плавно, чтобы не щёлкало
    Object.entries(nodes).forEach(([bus, g]) => g.gain.setTargetAtTime(value(bus), g.context.currentTime, 0.03));
    Object.entries(wets).forEach(([k, g]) => g.gain.setTargetAtTime(value(k.split(':')[0]), g.context.currentTime, 0.03));
    subs.forEach((fn) => fn(mx));
  };

  const mixer = {
    state: mx,
    value,

    // GainNode шины. Клик метронома идёт мимо компрессора (минимальная задержка, как в прототипе)
    bus(name) {
      if (nodes[name]) return nodes[name];
      const c = getContext(mx.mode);
      if (!c) return null;
      const g = c.createGain();
      g.gain.value = value(name);
      // громкость → общие эффекты шины (эквалайзер, сжатие, задержка, хор; fx.js) → выход
      const fx = createFxChain(c, mixer.fx(name));
      g.connect(fx.input);
      chains[name] = fx;
      if (name === 'metro') directOut(fx.output); else fx.output.connect(masterNode());
      if (name === 'theory' || name === 'piano' || name === 'glider') {
        const rv = reverbNode();
        if (rv) {
          const s = c.createGain();
          s.gain.value = name === 'theory' ? 0.3 : 0;
          g.connect(s).connect(rv);
          sends[name] = s;
        }
      }
      return (nodes[name] = g);
    },

    // Пост-фейдерная точка посыла шины в пространство ('hall' — общая реверберация, 'cathedral', 'room', 'plate'):
    // узел с громкостью шины перед пространством. Голоса шлют свои посылы сюда (context.js: sendToHall(…, via)) —
    // ползунок и выключение шины глушат и хвост реверберации. null — контекста ещё нет
    wet(name, type = 'hall') {
      const k = name + ':' + type;
      if (wets[k]) return wets[k];
      const c = getContext(mx.mode), sp = c && (type === 'hall' ? reverbNode() : spaceInput(type));
      if (!sp) return null;
      const g = c.createGain();
      g.gain.value = value(name);
      g.connect(sp);
      return (wets[k] = g);
    },

    // Уровень посыла шины в реверберацию (пианино — из пресета)
    setReverb(name, level) {
      mixer.bus(name);
      if (sends[name]) sends[name].gain.value = level;
    },

    // Эффекты шины: настройки (полный вид) и правка — patch сливается, применяется к цепочке, сохраняется
    fx(bus) { const k = mixKey(bus); return (mx.fx[k] = normalizeFx(mx.fx[k])); },
    setFx(bus, patch) {
      const k = mixKey(bus), next = normalizeFx({ ...mixer.fx(bus), ...patch });
      mx.fx[k] = next;
      if (chains[bus]) chains[bus].set(next);
      subs.forEach((fn) => fn(mx));
      saveLater();
      return next;
    },
    fxActive: (bus) => !fxIsFlat(mixer.fx(bus)),

    set(bus, v) {
      const k = mixKey(bus);
      mx[k] = Math.round(Math.max(0, Math.min(MIX_MAX, v)) * 20) / 20;
      if (mx.mute[k]) mx.mute[k] = false;
      apply();
      onChange(mx);
    },

    toggleMute(bus) {
      const k = mixKey(bus);
      mx.mute[k] = !mx.mute[k];
      apply();
      onChange(mx);
    },

    setPerf(level) { mx.perf = level; setPerf(resolvePerf(level)); onChange(mx); }, // голоса и пэды — сразу, буфер — при следующем запуске
    get perf() { return resolvePerf(mx.perf); },
    setEngine(e) { mx.engine = ENGINES.includes(e) ? e : 'wl'; setEngine(mx.engine); onChange(mx); }, // новые ноты — сразу
    get engine() { return mx.engine; },
    setVerb(v) { mx.verb = VERBS.includes(v) ? v : defaultVerb(); setVerb(mx.verb); rebuildSpaces(); onChange(mx); }, // сразу: пространства пересобираются
    get verb() { return mx.verb; },
    setMode(mode) {
      mx.mode = mode; // применится при следующем запуске (контекст уже создан)
      onChange(mx);
    },

    // Громкость для HTMLMediaElement / alphaTab, где больше 1 нельзя
    elementVolume: (bus) => Math.min(1, value(bus)),

    // Играет ли источник сейчас — для подсветки в шторке
    // (на шину могут смотреть несколько источников: медиатека и табы — обе на 'media')
    probe(bus, fn) { (probes[bus] ??= new Set()).add(fn); },
    isActive: (bus) => !!probes[bus] && [...probes[bus]].some((fn) => fn()),

    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    apply,
  };
  return mixer;
}
