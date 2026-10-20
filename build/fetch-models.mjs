// Скачать тяжёлые модели (build/models.json) перед сборкой APK и Windows: файл есть и sha256 сходится — пропуск.
// Запуск: node build/fetch-models.mjs (в GitHub Actions — шаг перед сборкой; локально — npm run models)
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const { models } = JSON.parse(readFileSync(new URL('./models.json', import.meta.url), 'utf8'));
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
for (const m of models) {
  if (existsSync(m.file) && statSync(m.file).size === m.bytes && sha(m.file) === m.sha256) { console.log('есть: ' + m.file); continue; }
  console.log('скачиваю: ' + m.url + ' (' + Math.round(m.bytes / 1048576) + ' МБ)');
  let last = null;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(m.url, { redirect: 'follow' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const buf = Buffer.from(await r.arrayBuffer());
      const h = createHash('sha256').update(buf).digest('hex');
      if (h !== m.sha256) throw new Error('sha256 не сходится: ' + h);
      mkdirSync(dirname(m.file), { recursive: true });
      writeFileSync(m.file, buf);
      console.log('готово: ' + m.file);
      last = null;
      break;
    } catch (e) { last = e; console.log('попытка ' + (i + 1) + ': ' + e.message); }
  }
  if (last) { console.error('не удалось: ' + m.file); process.exit(1); }
}
