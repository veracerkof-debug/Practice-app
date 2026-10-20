// Обёртка прототипа воздушного звука в AudioWorklet (wl/airsynth.worklet.js): один узел на все голоса.
// createAirWorklet(c, dest) → { on(id, f, v), off(id), set(id, f), all(), node } (после await).
export async function createAirWorklet(c, dest, { notes = [] } = {}) {
  await c.audioWorklet.addModule(new URL('./wl/airsynth.worklet.js', import.meta.url));
  const node = new AudioWorkletNode(c, 'melete-air', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2], processorOptions: { notes } });
  node.connect(dest);
  const send = (m) => node.port.postMessage(m);
  return { node, on: (id, f, v) => send({ k: 'on', id, f, v }), off: (id) => send({ k: 'off', id }), set: (id, f) => send({ k: 'set', id, f }), all: () => send({ k: 'all' }), dispose() { send({ k: 'all' }); setTimeout(() => node.disconnect(), 800); } };
}
