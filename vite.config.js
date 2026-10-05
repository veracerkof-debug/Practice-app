import { defineConfig } from 'vite';

export default defineConfig({
  // относительные пути — нужны для Capacitor (этап 3)
  base: './',
  server: {
    host: true, // доступ с телефона по Wi-Fi
    port: 5173,
  },
  build: {
    outDir: 'dist',
    target: 'es2022',
  },
});
