// Версия для компьютера (Windows, Tauri 2): то же веб-приложение в своём окне. Здесь — только то, что на компьютере
// делается иначе, чем в браузере: сохранение файла через «Сохранить как» (ссылка на скачивание в окне Tauri не
// работает), папка Melete на диске (драйвер для src/core/folder.js поверх файлового модуля Tauri), файлы, открытые
// двойным щелчком (.melete, табы, .mid, проекты студий), F11 — во весь экран. Модули Tauri подгружаются по
// требованию, в веб-версию и APK не попадают. Команды Rust — src-tauri/src/lib.rs (allow_dir, startup_files).
export const isDesktop = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

const EXT = { 'audio/midi': 'mid', 'application/json': 'json', 'text/markdown': 'md', 'text/calendar': 'ics', 'audio/wav': 'wav', 'application/pdf': 'pdf' };
const KEY = 'practice.v1.folderPath'; // путь к папке Melete на этом компьютере
const base = (p) => String(p).split(/[\\/]/).filter(Boolean).pop() || p;
const join = (root, rel) => (rel ? root.replace(/[\\/]+$/, '') + '/' + String(rel).replace(/^[\\/]+/, '') : root);

// Сохранить файл туда, куда укажет человек. → 'saved' | 'cancel'
export async function saveFile(u8, name, type = 'application/octet-stream') {
  const { save } = await import('@tauri-apps/plugin-dialog'), { writeFile } = await import('@tauri-apps/plugin-fs');
  const ext = (/\.([a-z0-9]+)$/i.exec(name) || [, EXT[type] || ''])[1];
  const path = await save({ defaultPath: name, filters: ext ? [{ name: ext.toUpperCase(), extensions: [ext] }] : [] });
  if (!path) return 'cancel';
  await writeFile(path, u8);
  return 'saved';
}

/* ---------- папка Melete на диске: драйвер для folder.js (тот же контракт, что у FolderPlugin на Android) ---------- */

const root = () => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } };
// Выбранная папка разрешается файловому модулю на этот запуск (права Tauri — только на то, что выбрал человек)
async function allow(path) { const { invoke } = await import('@tauri-apps/api/core'); await invoke('allow_dir', { path }); }

export const desktopDriver = {
  async status() {
    const r = root();
    if (!r) return { ok: false };
    try { await allow(r); const { exists } = await import('@tauri-apps/plugin-fs'); return { ok: await exists(r), name: base(r) }; } catch { return { ok: false }; }
  },
  async pick() {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const path = await open({ directory: true, multiple: false, defaultPath: root() || undefined });
    if (!path) return { ok: false };
    await allow(path);
    try { localStorage.setItem(KEY, path); } catch { /* без памяти — выберут снова */ }
    return { ok: true, name: base(path) };
  },
  async forget() { try { localStorage.removeItem(KEY); } catch { /* */ } },
  async list(dir) {
    const { readDir, stat } = await import('@tauri-apps/plugin-fs'), d = join(root(), dir), out = [];
    for (const e of await readDir(d)) {
      try { const s = await stat(join(d, e.name)); out.push({ name: e.name, dir: !!e.isDirectory, size: s.size || 0, mtime: s.mtime ? new Date(s.mtime).getTime() : 0 }); } catch { /* исчез */ }
    }
    return out;
  },
  async mkdirs(dir) { const { mkdir, exists } = await import('@tauri-apps/plugin-fs'), d = join(root(), dir); if (!(await exists(d))) await mkdir(d, { recursive: true }); },
  async read(path, offset, length) {
    const { open, SeekMode } = await import('@tauri-apps/plugin-fs'), f = await open(join(root(), path), { read: true });
    try {
      const size = (await f.stat()).size, want = Math.max(0, Math.min(length, size - offset)), data = new Uint8Array(want);
      await f.seek(offset, SeekMode.Start);
      let got = 0;
      while (got < want) { const n = await f.read(data.subarray(got)); if (!n) break; got += n; }
      return { data: got === want ? data : data.subarray(0, got), size };
    } finally { await f.close(); }
  },
  async write(path, u8, append) {
    const { open } = await import('@tauri-apps/plugin-fs'), f = await open(join(root(), path), { write: true, create: true, append: !!append, truncate: !append });
    try { await f.write(u8); } finally { await f.close(); }
  },
  async remove(path) { const { remove } = await import('@tauri-apps/plugin-fs'); await remove(join(root(), path)); },
};

/* ---------- запуск: файлы двойным щелчком, F11 ---------- */

export function initDesktop(app) {
  if (!isDesktop()) return;
  document.documentElement.classList.add('desktop');
  // F11 — окно во весь экран и обратно
  document.addEventListener('keydown', async (e) => {
    if (e.key !== 'F11') return;
    e.preventDefault();
    try { const { getCurrentWindow } = await import('@tauri-apps/api/window'), w = getCurrentWindow(); await w.setFullscreen(!(await w.isFullscreen())); } catch { /* окно без прав */ }
  });
  // Файлы, с которыми приложение открыли (двойной щелчок, «Открыть с помощью»): .melete — принять, остальное — как перетащенные
  (async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core'), paths = await invoke('startup_files');
      if (!paths || !paths.length) return;
      const { readFile } = await import('@tauri-apps/plugin-fs'), files = [];
      for (const p of paths) { try { files.push(new File([await readFile(p)], base(p))); } catch { /* не прочесть */ } }
      const wait = () => new Promise((ok) => { const tick = () => (app.store.state.settings.configured && !document.querySelector('#onboard') ? ok() : setTimeout(tick, 800)); tick(); });
      await wait();
      const melete = files.filter((f) => /\.melete$/i.test(f.name)), rest = files.filter((f) => !/\.melete$/i.test(f.name));
      if (rest.length) { const { dropFiles } = await import('./drop.js'); await dropFiles(app, rest); }
      for (const f of melete) { const { receive } = await import('./screens/share.js'); await receive(app, new Uint8Array(await f.arrayBuffer()), f.name); }
    } catch { /* нет команды — обычный запуск */ }
  })();
}
