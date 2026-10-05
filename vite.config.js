import { defineConfig } from 'vite';
import { alphaTab } from '@coderline/alphatab-vite';

export default defineConfig({
  // относительные пути — нужны для Capacitor (этап 3)
  base: './',
  // alphaTab: воркеры для отрисовки и звука; шрифт и звуковой банк подключает модуль «Табы» сам (только нужные файлы)
  plugins: [alphaTab({ assetOutputDir: false })],
  // воркеры alphaTab сжимаются так же, как основной код
  worker: { format: 'es', rolldownOptions: { output: { minify: true } } },
  server: {
    host: true, // доступ с телефона по Wi-Fi
    port: 5173,
  },
  build: {
    outDir: 'dist',
    target: 'es2022',
    chunkSizeWarningLimit: 1300, // alphaTab (~1,2 МБ) грузится отдельно, только при открытии табулатуры
  },
});
