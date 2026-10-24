// Описание релиза на GitHub из «Что нового» (src/core/whatsnew.js): последние записи по-русски — для страницы
// релиза. Вызов: node build/whatsnew-notes.mjs <канал> <номер сборки>
import { NEWS } from '../src/core/whatsnew.js';

const [ch = 'dev', n = '?', sha = ''] = process.argv.slice(2);
const head = ch === 'pre' ? 'Melete 1.2 — предрелиз для тестеров' : 'Melete — сборка для разработки (dev)';
const news = NEWS.slice().sort((a, b) => b.n - a.n).slice(0, 3)
  .map((e) => e.d + '\n' + e.ru.map((x) => '• ' + x).join('\n')).join('\n\n');
process.stdout.write(head + ', сборка ' + n + (sha ? ' (' + sha + ')' : '') + '.\n\nЧто нового:\n' + news + '\n\nОбновление — само (Профиль → Обновления). Android: ' +
  (ch === 'pre' ? 'Melete-PreRelease.apk' : 'Melete-Dev.apk') + '; Windows: ' + (ch === 'pre' ? 'Melete-Setup.exe' : 'Melete-Dev-Setup.exe') + '.\n');
