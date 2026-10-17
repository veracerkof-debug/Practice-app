// Файлы, перетащенные в окно (веб-версия на компьютере): аудио и видео — в медиатеку, табы, ноты и PDF — в «Табы и ноты».
// Модуль сам говорит, какие файлы берёт (accepts) и что с ними делать (drop); не открыт — открывается, файлы ждут его.
// Пока файл над окном — рамка по краю. Файлы остаются только на устройстве, как и при обычной загрузке.
import { modules, moduleById } from '../modules/index.js';
import { openToolView } from './screens/tools.js';
import { t } from '../i18n/index.js';
import { toast } from '../ui/index.js';

const hasFiles = (e) => !!e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files');

export function initDrop(app) {
  let depth = 0;
  const mark = (on) => document.documentElement.classList.toggle('dropping', on);
  document.addEventListener('dragenter', (e) => { if (!hasFiles(e)) return; e.preventDefault(); depth++; mark(true); });
  document.addEventListener('dragover', (e) => { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
  document.addEventListener('dragleave', (e) => { if (!hasFiles(e)) return; depth = Math.max(0, depth - 1); if (!depth) mark(false); });
  document.addEventListener('drop', async (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth = 0;
    mark(false);
    if (!app.store.state.settings.configured) return;
    const files = [...e.dataTransfer.files];
    // файлы — по модулям, которые их берут
    const by = new Map();
    files.forEach((f) => { const m = modules.find((x) => x.accepts && x.accepts(f)); if (m) by.set(m.id, [...(by.get(m.id) || []), f]); });
    if (!by.size) { toast(t('drop.none')); return; }
    if (!(await app.confirmUpload())) return;
    [...by].forEach(([id, fs], i) => {
      const mod = moduleById(id);
      mod.drop(fs);
      if (i) return; // открывается первый; остальные сохранятся, когда их модуль откроют
      if (app.openTool) app.openTool(id); else openToolView(app, id);
    });
  });
}
