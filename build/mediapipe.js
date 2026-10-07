// MediaPipe (распознавание рук для модуля «Терменвокс»): файлы движка и модели — внутри приложения, без CDN.
// Пакет @mediapipe/tasks-vision при каждом запуске распознавания создаёт сборщик статистики, который раз в минуту
// отправляет в Google (odml.pa.googleapis.com) тип устройства, версию и время работы. Выключателя у него нет —
// поэтому при сборке отправка вырезается, а сборка падает, если вырезать не удалось (например, после обновления пакета).
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const MP_DIR = 'node_modules/@mediapipe/tasks-vision/wasm';
export const MP_FILES = ['vision_wasm_internal.js', 'vision_wasm_internal.wasm'];
export const MODEL = 'vendor/mediapipe/hand_landmarker.task';
export const TELEMETRY_HOST = 'odml.pa.googleapis.com';

// Вырезать отправку статистики из кода пакета. Бросает ошибку, если код не похож на ожидаемый
export function stripTelemetry(code) {
  if (!code.includes(TELEMETRY_HOST)) return code;
  const steps = [
    // сборщик не заводит таймер отправки
    [/this\.h=setInterval\(\(\)=>\{this\.flush\(\)\},6e4\)/, 'this.h=void 0'],
    // отправка — пустая: накопленное просто выбрасывается
    [/flush\(t,e\)\{if\(this\.error\)/, 'flush(t,e){this.i=[];t?.();return;if(this.error)'],
    // и адреса в коде нет вовсе
    [/"https:\/\/odml\.pa\.googleapis\.com\/v1\/log"/, '""'],
  ];
  let out = code;
  steps.forEach(([re, to]) => {
    if (!re.test(out)) throw new Error('MediaPipe: не найден код сборщика статистики (' + re + ') — проверить пакет после обновления');
    out = out.replace(re, to);
  });
  if (out.includes(TELEMETRY_HOST)) throw new Error('MediaPipe: адрес сбора статистики остался в коде');
  return out;
}

export function mediapipe() {
  return {
    name: 'mediapipe',
    transform(code, id) {
      if (!id.includes('@mediapipe/tasks-vision')) return null;
      return { code: stripTelemetry(code), map: null };
    },
    configureServer(server) {
      server.middlewares.use('/mediapipe', (req, res, next) => {
        const name = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
        const f = name === 'hand_landmarker.task' ? MODEL : MP_FILES.includes(name) ? join(MP_DIR, name) : null;
        if (!f || !existsSync(f)) return next();
        res.setHeader('Content-Type', name.endsWith('.wasm') ? 'application/wasm' : name.endsWith('.js') ? 'text/javascript' : 'application/octet-stream');
        res.end(readFileSync(f));
      });
    },
    generateBundle(_, bundle) {
      MP_FILES.forEach((n) => this.emitFile({ type: 'asset', fileName: 'mediapipe/' + n, source: readFileSync(join(MP_DIR, n)) }));
      this.emitFile({ type: 'asset', fileName: 'mediapipe/hand_landmarker.task', source: readFileSync(MODEL) });
      // последняя проверка: адреса сбора статистики нет ни в одном файле сборки
      Object.values(bundle).forEach((f) => {
        const src = f.type === 'chunk' ? f.code : typeof f.source === 'string' ? f.source : '';
        if (src.includes(TELEMETRY_HOST)) this.error('В сборке остался адрес сбора статистики MediaPipe: ' + f.fileName);
      });
    },
  };
}
