// Микшер: шина на каждый источник, громкость 0…1.5, выключение звука.
// Состояние — объект device.mix (как в прототипе: { metro, piano, drone, audio, theory, mode, mute }).
import { getContext, masterNode, reverbNode, directOut } from './context.js';
import { createFxChain, normalizeFx, fxIsFlat } from './fx.js';

// Шины по контракту модуля. 'media' хранится в mix под ключом 'audio' (совместимость с прототипом)
export const BUSES = ['metro', 'piano', 'glider', 'drone', 'media', 'theory'];
const KEY = { metro: 'metro', piano: 'piano', glider: 'glider', drone: 'drone', media: 'audio', theory: 'theory' };
export const mixKey = (bus) => KEY[bus] || bus;

export const MIX_MAX = 1.5;

export function normalizeMix(mx) {
  if (mx.theory == null) mx.theory = 1;
  if (!mx.mute) mx.mute = {};
  if (!mx.mode) mx.mode = 'bal';
  if (!mx.fx || typeof mx.fx !== 'object') mx.fx = {}; // эффекты шин (fx.js): ключ — как у громкости
  return mx;
}

export function createMixer(mx, { onChange = () => {} } = {}) {
  normalizeMix(mx);
  const nodes = {}, sends = {}, chains = {}, probes = {}, subs = new Set();

  const value = (bus) => {
    const k = mixKey(bus);
    if (mx.mute[k]) return 0;
    const v = mx[k];
    return v == null ? 1 : v;
  };

  const apply = () => {
    // плавно, чтобы не щёлкало
    Object.entries(nodes).forEach(([bus, g]) => g.gain.setTargetAtTime(value(bus), g.context.currentTime, 0.03));
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
      onChange(mx);
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
