// Версия для компьютера (Windows, Tauri 2): то же веб-приложение в своём окне. Здесь — только то, что на компьютере
// делается иначе, чем в браузере: сохранение файла через диалог «Сохранить как» (ссылка на скачивание в окне Tauri
// не работает). Модули Tauri подгружаются по требованию, в веб-версию и APK не попадают.
export const isDesktop = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

const EXT = { 'audio/midi': 'mid', 'application/json': 'json', 'text/markdown': 'md', 'text/calendar': 'ics', 'audio/wav': 'wav', 'application/pdf': 'pdf' };

// Сохранить файл туда, куда укажет человек. → 'saved' | 'cancel'
export async function saveFile(u8, name, type = 'application/octet-stream') {
  const { save } = await import('@tauri-apps/plugin-dialog'), { writeFile } = await import('@tauri-apps/plugin-fs');
  const ext = (/\.([a-z0-9]+)$/i.exec(name) || [, EXT[type] || ''])[1];
  const path = await save({ defaultPath: name, filters: ext ? [{ name: ext.toUpperCase(), extensions: [ext] }] : [] });
  if (!path) return 'cancel';
  await writeFile(path, u8);
  return 'saved';
}
