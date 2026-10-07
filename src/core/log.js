// Технический журнал — только на этом устройстве. Никуда не отправляется сам: отчёт отправляет человек
// («Сообщить о проблеме», src/core/screens/report.js). Хранятся последние KEEP_MS и не больше MAX_CHARS.
// Пишутся только технические события и ошибки — без названий песен и файлов, текстов, имени, кадров и звука.
// Журнал сохраняется сразу (localStorage — синхронно), поэтому переживает вылет приложения.

export const LOG_KEY = 'practice.v1.log';
const RUN_KEY = 'practice.v1.run';
export const KEEP_MS = 3 * 3600e3;
export const MAX_CHARS = 200_000;
const LINE_MAX = 600;

let lines = null, timer = 0, crashed = null;
const store = () => { try { return globalThis.localStorage; } catch { return null; } };

function load() {
  if (lines) return lines;
  try { lines = JSON.parse(store()?.getItem(LOG_KEY) || '[]'); } catch { lines = []; }
  if (!Array.isArray(lines)) lines = [];
  return lines;
}

// Убрать старое и лишнее: сначала по времени, потом по объёму
export function trim(arr, now = Date.now(), keep = KEEP_MS, max = MAX_CHARS) {
  let i = 0;
  while (i < arr.length && now - arr[i][0] > keep) i++;
  let out = i ? arr.slice(i) : arr, size = out.reduce((n, l) => n + l[3].length + 24, 0), j = 0;
  while (size > max && j < out.length) size -= out[j++][3].length + 24;
  return j ? out.slice(j) : out;
}

function flush() {
  clearTimeout(timer);
  timer = 0;
  lines = trim(load());
  try { store()?.setItem(LOG_KEY, JSON.stringify(lines)); } catch { /* места нет — останется в памяти */ }
}

// Запись: cat — раздел (app, nav, mod, pdf, cam…), msg — текст; lvl: i — событие, w — предупреждение, e — ошибка
export function log(cat, msg, lvl = 'i') {
  load().push([Date.now(), lvl, String(cat).slice(0, 12), String(msg).slice(0, LINE_MAX)]);
  if (lvl === 'e') flush(); // ошибка — сразу на диск: следом может случиться вылет
  else if (!timer) timer = setTimeout(flush, 1000);
}

// Ошибка словами: имя, сообщение и начало стека (пути — файлы приложения, без данных человека)
export function errText(e) {
  if (!e) return 'unknown';
  if (typeof e !== 'object') return String(e);
  const head = (e.name || 'Error') + ': ' + (e.message || '');
  const stack = String(e.stack || '').split('\n').slice(1, 5).map((s) => s.trim().replace(/https?:\/\/[^/]+/g, '')).join(' | ');
  return stack ? head + ' @ ' + stack : head;
}
export const logErr = (cat, e) => log(cat, errText(e), 'e');

export function entries() { return load().slice(); }
export function clearLog() { lines = []; flush(); }

// Текст журнала: «14:02:11 [pdf] сообщение»
const pad = (n) => String(n).padStart(2, '0');
export function stamp(t) { const d = new Date(t); return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); }
export const logText = (arr = entries()) => arr.map(([t, l, c, m]) => stamp(t) + (l === 'e' ? ' !! ' : l === 'w' ? ' ! ' : ' ') + '[' + c + '] ' + m).join('\n');

// Запуск: перехват необработанных ошибок и отметка «приложение на экране».
// Если прошлый запуск оборвался, пока приложение было на экране, — это вылет (система закрывает
// приложения в фоне — это обычное дело и вылетом не считается)
export function startLog(info = '') {
  const s = store();
  let prev = null;
  try { prev = JSON.parse(s?.getItem(RUN_KEY) || 'null'); } catch { /* */ }
  crashed = !!(prev && prev.vis);
  const mark = (vis) => { try { s?.setItem(RUN_KEY, JSON.stringify({ t: Date.now(), vis })); } catch { /* */ } };
  mark(document.visibilityState === 'visible');
  document.addEventListener('visibilitychange', () => {
    const vis = document.visibilityState === 'visible';
    mark(vis);
    log('app', vis ? 'на экране' : 'в фоне');
    if (!vis) flush();
  });
  addEventListener('pagehide', () => { mark(false); flush(); });
  addEventListener('error', (e) => {
    // ошибка загрузки файла (картинка, скрипт) — имя тега и путь внутри приложения
    if (e.target && e.target !== window && e.target.tagName) { log('load', e.target.tagName.toLowerCase() + ' ' + String(e.target.src || e.target.href || '').replace(/^[a-z]+:\/\/[^/]+/, ''), 'w'); return; }
    log('js', errText(e.error || { name: 'Error', message: e.message + ' ' + String(e.filename || '').replace(/^[a-z]+:\/\/[^/]+/, '') + ':' + e.lineno }), 'e');
  }, true);
  addEventListener('unhandledrejection', (e) => log('js', 'promise ' + errText(e.reason), 'e'));
  if (crashed) log('app', 'прошлый запуск закрылся неожиданно', 'w');
  log('app', 'запуск ' + info);
}
export const crashedLast = () => !!crashed;
export const crashSeen = () => { crashed = false; };
