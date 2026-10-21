import { defineConfig } from 'vite';
import { alphaTab } from '@coderline/alphatab-vite';
import { readdirSync, readFileSync, statSync, existsSync, rmSync } from 'node:fs';
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

// Демонстрация (vite build --mode showcase): своя точка входа — выдуманный музыкант без регистрации (src/showcase/),
// и её файлы (видео и звук к демо-песне) из showcase/media/ — только в этой сборке, не в APK и не в обычной веб-версии
function showcase(mode) {
  if (mode !== 'showcase') return null;
  return {
    name: 'showcase',
    // order: 'pre' — до того, как сборка возьмёт точку входа из index.html
    transformIndexHtml: { order: 'pre', handler: (html) => html.replace('/src/main.js', '/src/showcase/main.js').replace('<title>Melete</title>', '<title>Melete — демонстрация</title>') },
    generateBundle() {
      if (existsSync('showcase/media')) walk('showcase/media').forEach((f) => this.emitFile({ type: 'asset', fileName: 'media/' + relative('showcase/media', f).split('\\').join('/'), source: readFileSync(f) }));
    },
  };
}

// Веб-версия (vite build --mode web): тяжёлые файлы (модели, банки звуков) из public/models/ в сборку не идут —
// такие модули (heavy: true) показывают заглушку, сами они есть в APK и Windows (DECISIONS: размер и тяжёлые модули)
// ONNX Runtime Web (разделение на дорожки): файлы WebAssembly пакета кладутся в сборку по пути ort/…; в режиме
// разработки отдаются из node_modules. В веб-сборке не нужны (модуль там — заглушка)
const ORT = 'node_modules/onnxruntime-web/dist', ORT_FILES = ['ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.jsep.wasm', 'ort-wasm-simd-threaded.jsep.mjs'];
function ortAssets(mode) {
  return {
    name: 'ort-assets',
    configureServer(server) {
      server.middlewares.use('/ort', (req, res, next) => {
        const f = join(ORT, decodeURIComponent(req.url.split('?')[0]));
        if (!ORT_FILES.some((n) => f === join(ORT, n)) || !existsSync(f)) return next();
        res.setHeader('Content-Type', extname(f) === '.wasm' ? 'application/wasm' : 'text/javascript');
        // рабочие потоки WebAssembly: их скрипт обязан нести ту же изоляцию, что и страница (иначе Chrome молча не запускает)
        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin'); res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
        res.end(readFileSync(f));
      });
    },
    generateBundle(_, bundle) {
      // ORT ссылается на свой .wasm через import.meta.url (запасной путь, у нас не используется: пути заданы явно, ort/…) —
      // Vite кладёт из-за этого вторую копию .wasm (28 МБ) в assets/; убираем её
      Object.keys(bundle).forEach((k) => { if (/ort-wasm-simd-threaded[^/]*\.wasm$/.test(k)) delete bundle[k]; });
      if (mode !== 'web') ORT_FILES.forEach((n) => { if (existsSync(join(ORT, n))) this.emitFile({ type: 'asset', fileName: 'ort/' + n, source: readFileSync(join(ORT, n)) }); });
    },
  };
}
// Веб-версия без тяжёлого: рабочий поток разделения на дорожки подменяется пустышкой (ONNX Runtime и demucs.js в сборку
// не попадают), модель из public/models/ после сборки удаляется (public/ копируется целиком)
const lightWeb = (mode) => {
  let out = 'dist';
  return mode !== 'web' ? null : {
    name: 'light-web',
    configResolved(c) { out = c.build.outDir; },
    closeBundle() { rmSync(join(out, 'models'), { recursive: true, force: true }); },
  };
};
// …и сам рабочий поток (собирается отдельной сборкой — свой список плагинов, worker.plugins)
const lightWebWorker = (mode) => (mode !== 'web' ? null : { name: 'light-web-worker', load(id) { if (id.endsWith('/src/audio/stems.worker.js')) return "self.onmessage = () => self.postMessage({ k: 'error', msg: 'web' });"; } }); // public/ копируется целиком — лишнее убираем после сборки
export default defineConfig(({ mode }) => ({
  // относительные пути — нужны для Capacitor (этап 3)
  base: './',
  // дата сборки: часы устройства раньше неё — сбиты (src/core/clock.js)
  // версия — в отчёт о проблеме (src/core/report.js)
  define: { __WEB_BUILD__: mode === 'web', __BUILD_TIME__: Date.now(), __APP_VERSION__: JSON.stringify(JSON.parse(readFileSync('package.json', 'utf8')).version) },
  // alphaTab: воркеры для отрисовки и звука; шрифт и звуковой банк подключает модуль «Табы» сам (только нужные файлы)
  plugins: [alphaTab({ assetOutputDir: false }), pdfjsAssets(), mediapipe(), showcase(mode), lightWeb(mode), ortAssets(mode)],
  // onnxruntime-web грузит свои .wasm сам (ort/…), предсборка Vite ему не нужна
  optimizeDeps: { exclude: ['@mediapipe/tasks-vision', 'onnxruntime-web'] },
  // MediaPipe не собирается заранее: иначе в режиме разработки вырезка статистики (build/mediapipe.js) не сработает
  // воркеры alphaTab сжимаются так же, как основной код
  worker: { format: 'es', plugins: () => [lightWebWorker(mode)], rolldownOptions: { output: { minify: true } } },
  server: {
    host: true, // доступ с телефона по Wi-Fi
    port: 5173,
    // изоляция для SharedArrayBuffer (потоки WebAssembly в разделении на дорожки) — как в APK и Windows
    headers: { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' },
  },
  // тесты — только из tests/ (в docs/archive лежат отложенные модули со своими тестами)
  test: { include: ['tests/**/*.test.js'] },
  build: {
    outDir: 'dist',
    target: 'es2022',
    chunkSizeWarningLimit: 1300, // alphaTab (~1,2 МБ) грузится отдельно, только при открытии табулатуры
  },
}));
