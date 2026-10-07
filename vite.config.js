import { defineConfig } from 'vite';
import { alphaTab } from '@coderline/alphatab-vite';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { mediapipe } from './build/mediapipe.js';

// pdf.js: стандартные шрифты, таблицы кодировок (cmaps) и декодеры изображений — файлы пакета, кладутся в сборку
// по пути pdfjs/…; в режиме разработки отдаются прямо из node_modules. Никаких CDN.
const PDFJS = 'node_modules/pdfjs-dist', PDFJS_DIRS = ['standard_fonts', 'cmaps', 'wasm'];
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
function pdfjsAssets() {
  return {
    name: 'pdfjs-assets',
    configureServer(server) {
      server.middlewares.use('/pdfjs', (req, res, next) => {
        const f = join(PDFJS, decodeURIComponent(req.url.split('?')[0]));
        if (!PDFJS_DIRS.some((d) => f.startsWith(join(PDFJS, d))) || !existsSync(f) || statSync(f).isDirectory()) return next();
        res.setHeader('Content-Type', extname(f) === '.wasm' ? 'application/wasm' : 'application/octet-stream');
        res.end(readFileSync(f));
      });
    },
    generateBundle() {
      PDFJS_DIRS.forEach((d) => walk(join(PDFJS, d)).forEach((f) => {
        if ((/\.(md|txt|json)$/i.test(f) && !f.includes('cmaps')) || f.includes('quickjs')) return; // скрипты внутри PDF не выполняем
        this.emitFile({ type: 'asset', fileName: 'pdfjs/' + relative(PDFJS, f).split('\\').join('/'), source: readFileSync(f) });
      }));
    },
  };
}

export default defineConfig({
  // относительные пути — нужны для Capacitor (этап 3)
  base: './',
  // дата сборки: часы устройства раньше неё — сбиты (src/core/clock.js)
  // версия — в отчёт о проблеме (src/core/report.js)
  define: { __BUILD_TIME__: Date.now(), __APP_VERSION__: JSON.stringify(JSON.parse(readFileSync('package.json', 'utf8')).version) },
  // alphaTab: воркеры для отрисовки и звука; шрифт и звуковой банк подключает модуль «Табы» сам (только нужные файлы)
  plugins: [alphaTab({ assetOutputDir: false }), pdfjsAssets(), mediapipe()],
  // MediaPipe не собирается заранее: иначе в режиме разработки вырезка статистики (build/mediapipe.js) не сработает
  optimizeDeps: { exclude: ['@mediapipe/tasks-vision'] },
  // воркеры alphaTab сжимаются так же, как основной код
  worker: { format: 'es', rolldownOptions: { output: { minify: true } } },
  server: {
    host: true, // доступ с телефона по Wi-Fi
    port: 5173,
  },
  // тесты — только из tests/ (в docs/archive лежат отложенные модули со своими тестами)
  test: { include: ['tests/**/*.test.js'] },
  build: {
    outDir: 'dist',
    target: 'es2022',
    chunkSizeWarningLimit: 1300, // alphaTab (~1,2 МБ) грузится отдельно, только при открытии табулатуры
  },
});
