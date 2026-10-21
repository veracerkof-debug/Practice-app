// Скачать тяжёлые модели и банки (build/models.json) перед сборкой APK и Windows: файл есть и sha256 сходится — пропуск.
// Архив (.tar.bz2) с полем extract распаковывается в папку dir (только файлы по регулярке only, без путей),
// рядом пишется pack.json — список файлов и признак для приложения; повторный запуск архив не качает, если pack.json
// на месте и сходится. Запуск: node build/fetch-models.mjs (GitHub Actions — шаг перед сборкой; локально — npm run models)
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync, createWriteStream, readdirSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const { models } = JSON.parse(readFileSync(new URL('./models.json', import.meta.url), 'utf8'));
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

async function download(m) {
  let last = null;
  for (let i = 0; i < 3; i++) {
    try {
      console.log('скачиваю: ' + m.url + ' (' + Math.round(m.bytes / 1048576) + ' МБ)');
      const r = await fetch(m.url, { redirect: 'follow' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const buf = Buffer.from(await r.arrayBuffer());
      const h = createHash('sha256').update(buf).digest('hex');
      if (h !== m.sha256) throw new Error('sha256 не сходится: ' + h);
      return buf;
    } catch (e) { last = e; console.log('попытка ' + (i + 1) + ': ' + e.message); }
  }
  throw last;
}

// Архив → файлы в m.extract.dir; pack.json — { sha256 архива, files: [...] }
async function extract(m, buf) {
  const { default: unbzip2 } = await import('unbzip2-stream');
  const { default: tar } = await import('tar-stream');
  const { dir, from = '', only = '.' } = m.extract, re = new RegExp(only), files = [];
  mkdirSync(dir, { recursive: true });
  const ex = tar.extract();
  ex.on('entry', (hdr, stream, next) => {
    const name = hdr.name.startsWith(from) ? hdr.name.slice(from.length) : null;
    if (hdr.type !== 'file' || !name || name.includes('/') || !re.test(name)) { stream.resume(); stream.on('end', next); return; }
    files.push(name);
    stream.pipe(createWriteStream(join(dir, name))).on('finish', next);
  });
  await pipeline(Readable.from([buf]), unbzip2(), ex);
  files.sort();
  writeFileSync(m.file, JSON.stringify({ sha256: m.sha256, files }));
  console.log('распаковано: ' + files.length + ' файлов → ' + dir);
}

// platform: 'windows' — модель только Windows-версии: на других системах не качается (MODELS_ALL=1 — качать всё)
for (const m of models) {
  if (m.platform === 'windows' && process.platform !== 'win32' && !process.env.MODELS_ALL) { console.log('не для этой системы: ' + m.file); continue; }
  if (m.extract) {
    if (existsSync(m.file)) {
      try { const pk = JSON.parse(readFileSync(m.file, 'utf8')); if (pk.sha256 === m.sha256 && pk.files.every((f) => existsSync(join(m.extract.dir, f)))) { console.log('есть: ' + m.extract.dir); continue; } } catch { /* перекачать */ }
    }
    try { await extract(m, await download(m)); } catch (e) { console.error('не удалось: ' + m.file + ' — ' + e.message); process.exit(1); }
    continue;
  }
  if (existsSync(m.file) && statSync(m.file).size === m.bytes && sha(m.file) === m.sha256) { console.log('есть: ' + m.file); continue; }
  try {
    const buf = await download(m);
    mkdirSync(dirname(m.file), { recursive: true });
    writeFileSync(m.file, buf);
    console.log('готово: ' + m.file);
  } catch (e) { console.error('не удалось: ' + m.file + ' — ' + e.message); process.exit(1); }
}
