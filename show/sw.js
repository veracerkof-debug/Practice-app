// Service worker веб-версии: приложение открывается и без сети, а установленное на главный экран — не чистится
// браузером (Safari стирает данные обычного сайта через 7 дней без посещений). Никаких внешних обращений.
// Оболочка (страница, скрипты и стили сборки с хэшем в имени, значки, манифест) — в кэше; страница — сначала сеть,
// без сети — из кэша; файлы с хэшем — сразу из кэша (они не меняются). Большие файлы (рояль, демо, Библия, PDF.js) —
// только по сети, по запросу: место в кэше не тратим.
const CACHE = 'melete-shell-v1';
const SHELL = /\/(assets|icons)\/|manifest\.webmanifest$|\.(woff2?|ttf)$/;

self.addEventListener('install', (e) => { e.waitUntil(self.skipWaiting()); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

const put = (req, res) => { if (res && res.ok && res.type === 'basic') caches.open(CACHE).then((c) => c.put(req, res)).catch(() => {}); };

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin || req.headers.has('range')) return;
  if (req.mode === 'navigate') { // страница: сеть, иначе кэш (своя страница, потом корень)
    e.respondWith(fetch(req).then((r) => { put(req, r.clone()); return r; }).catch(async () => (await caches.match(req)) || (await caches.match('./')) || (await caches.match('./index.html')) || Response.error()));
    return;
  }
  if (!SHELL.test(req.url)) return; // остальное — по сети, как есть
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => { put(req, r.clone()); return r; })));
});
