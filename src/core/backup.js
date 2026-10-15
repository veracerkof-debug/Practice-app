// Резервная копия данных с подписью: кто сохранил (имя из профиля) и когда. Куда — по возможности:
// в папку Melete (Data/Backups, src/core/folder.js), иначе на Android — системное «Поделиться» (выбрать, куда
// положить файл: Документы, Telegram, почта), в браузере — скачивание файла.
export const backupBy = (app) => ((app.store.state.settings.profile || {}).name || '').trim();
export const backupInfo = (app, at = Date.now()) => ({ by: backupBy(app), at, app: 'Melete' });
export const backupText = (app) => app.store.exportBackup(backupInfo(app));

// Подпись из файла копии → { by, at } | null
export const infoOf = (p) => (p && p.backupInfo && typeof p.backupInfo === 'object' ? { by: String(p.backupInfo.by || ''), at: +p.backupInfo.at || 0 } : null);

// Сохранить копию. → { where: 'folder' | 'shared' | 'saved' | 'cancel', name }
export async function saveBackup(app) {
  const F = app.folder;
  if (F && F.state && F.state.ok && F.saveBackup) {
    const name = await F.saveBackup();
    if (name) return { where: 'folder', name };
  }
  const { backupName } = await import('./folder.js'), { sendFile } = await import('./screens/share.js');
  const name = backupName(backupBy(app)), where = await sendFile(new TextEncoder().encode(backupText(app)), name, name, 'application/json');
  return { where, name };
}
