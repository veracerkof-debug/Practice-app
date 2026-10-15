// Тональность записи без изменения скорости (медиатека: аудио и видео) — Signalsmith Stretch (MIT, WebAssembly
// в AudioWorklet, без сети). Звук элемента <audio>/<video> идёт: элемент → сдвиг высоты → шина медиатеки.
// Пока сдвиг 0 — узел обходится (звук без обработки и без задержки). Граф создаётся при первом сдвиге: элемент,
// однажды подключённый к Web Audio, дальше звучит только через него — поэтому граф живёт, пока жив элемент.
const graphs = new WeakMap();

// el — медиа-элемент, dest — шина (GainNode). → { set(semitones, cents), latency() }
export async function pitchShifter(el, dest) {
  let g = graphs.get(el);
  if (g) return g;
  const ac = dest.context, src = ac.createMediaElementSource(el), dry = ac.createGain();
  src.connect(dry).connect(dest);
  let node = null, loading = null, cur = 0;
  const load = () => loading || (loading = import('signalsmith-stretch').then((m) => m.default(ac, { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] })).then((n) => {
    node = n;
    node.connect(dest);
    node.start();
    return n;
  }));
  g = {
    // полутоны и центы; 0 — обход
    async set(semi = 0, cents = 0) {
      const s = (+semi || 0) + (+cents || 0) / 100;
      cur = s;
      if (Math.abs(s) < 0.005) {
        if (node) { try { src.disconnect(node); } catch { /* уже */ } }
        try { src.disconnect(dry); } catch { /* уже */ }
        src.connect(dry);
        return;
      }
      const n = await load();
      if (cur !== s) return; // пока грузилось, сдвиг сменили
      n.schedule({ semitones: s, formantCompensation: true });
      try { src.disconnect(dry); } catch { /* уже */ }
      try { src.disconnect(n); } catch { /* не был */ }
      src.connect(n);
    },
    latency: () => (node && Math.abs(cur) >= 0.005 ? node.latency() : 0),
  };
  graphs.set(el, g);
  return g;
}
