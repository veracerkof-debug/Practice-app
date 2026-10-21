// Дорожки на компьютере (Windows, Tauri): тот же контракт, что у плагина Stems на Android (src/audio/stems.js),
// поверх команд Rust stems_* (src-tauri/src/lib.rs, движок — demucs.rs: ONNX Runtime нативно на всех ядрах).
// Запись уходит в Rust двоичными кусками (без base64), дорожки читаются обратно кусками же.
const core = () => import('@tauri-apps/api/core');
const CHUNK = 4 << 20;

export const desktopStems = {
  async begin() { const { invoke } = await core(); await invoke('stems_begin'); },
  // Кусок канала: float32 → тело запроса, номер канала — заголовок
  async pushRaw(ch, u8) { const { invoke } = await core(); await invoke('stems_push', u8, { headers: { ch: String(ch) } }); },
  async run({ model, hq }) { const { invoke } = await core(); return invoke('stems_run', { model: String(model), hq: !!hq }); },
  async cancel() { const { invoke } = await core(); await invoke('stems_cancel'); },
  async clean() { const { invoke } = await core(); await invoke('stems_clean'); },
  async addListener(name, cb) {
    const { listen } = await import('@tauri-apps/api/event');
    const un = await listen('stems-' + name, (e) => cb(e.payload || {}));
    return { remove: () => un() };
  },
  // Дорожка part (чередование L R, float32 LE) → { left, right }
  async readPart(part, total) {
    const { invoke } = await core(), bytes = total * 8, left = new Float32Array(total), right = new Float32Array(total);
    let off = 0;
    while (off < bytes) {
      const r = await invoke('stems_read', { part, off, len: Math.min(CHUNK, bytes - off) });
      const u8 = r instanceof ArrayBuffer ? new Uint8Array(r) : new Uint8Array(r.buffer || r), f = new Float32Array(u8.buffer, u8.byteOffset, u8.byteLength >> 2);
      let i = off >> 3;
      for (let k = 0; k + 1 < f.length; k += 2, i++) { left[i] = f[k]; right[i] = f[k + 1]; }
      if (!u8.byteLength) break;
      off += u8.byteLength;
    }
    return { left, right };
  },
};
