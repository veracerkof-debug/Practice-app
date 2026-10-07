// Просмотр PDF (ноты, табы): все страницы одной лентой по ширине окна, масштаб щипком, кнопками и двойным касанием,
// при повороте экрана текущее место сохраняется. pdf.js (Apache-2.0) и его ресурсы — в сборке приложения, без сети.
// Страницы рисуются лениво — только видимые и соседние; дальние освобождают память.
// Поток pdf.js собирается Vite в обычный .js (у .mjs на Android может не оказаться нужного типа файла)
import PdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?worker';

export const ZOOM_MIN = 0.5, ZOOM_MAX = 4;
export const isPdf = (rec) => !!rec && (rec.type === 'application/pdf' || /\.pdf$/i.test(rec.fileName || '') || rec.fmt === 'pdf');

// PDF по содержимому: «%PDF-» в начале файла (стандарт допускает немного мусора перед ним). На Android файл из
// «Загрузок» или с Диска часто приходит без расширения и без типа — по имени его не узнать
export function pdfBytes(bytes) {
  const n = Math.min(bytes.length - 4, 1024);
  for (let i = 0; i < n; i++) if (bytes[i] === 0x25 && bytes[i + 1] === 0x50 && bytes[i + 2] === 0x44 && bytes[i + 3] === 0x46 && bytes[i + 4] === 0x2d) return true;
  return false;
}
export async function sniffPdf(blob) {
  try { return pdfBytes(new Uint8Array(await blob.slice(0, 1029).arrayBuffer())); } catch { return false; }
}

let lib = null;
const loadLib = () => lib || (lib = import('pdfjs-dist/legacy/build/pdf.mjs').catch((e) => { lib = null; throw e; }));

const asset = (p) => new URL('pdfjs/' + p, document.baseURI).href;

// Большой файл не читается в память целиком: pdf.js просит нужные куски, они берутся из файла по месту
export const RANGE_FROM = 4 * 1024 * 1024;
export const CHUNK = 256 * 1024;
export const IMG_MAX_BYTES = 64 * 1024 * 1024;

// У каждого документа свой поток pdf.js: закрытие одного не мешает открыть следующий
// (общий поток, закрытый без ожидания, ломал повторное открытие)
const docs = new WeakMap();
let closing = Promise.resolve();

// askPassword(wrong) — файл под паролем: спросить (wrong — прошлый не подошёл); null — отказались
export async function openPdf(blob, { password, askPassword } = {}) {
  const pdfjs = await loadLib();
  await closing;
  const port = new PdfWorker(), worker = new pdfjs.PDFWorker({ port });
  const opts = {
    worker,
    standardFontDataUrl: asset('standard_fonts/'),
    cMapUrl: asset('cmaps/'), cMapPacked: true,
    wasmUrl: asset('wasm/'),
    isEvalSupported: false, // без eval — безопаснее для файлов из интернета
    // картинки больше 16 Мп (скан 600 dpi — 35 Мп, 140 МБ в памяти) уменьшаются вдвое ещё в потоке pdf.js:
    // для экрана телефона хватает и при увеличении, а память не кончается на первой же странице
    canvasMaxAreaInBytes: IMG_MAX_BYTES,
  };
  if (blob.size > RANGE_FROM) {
    const range = new pdfjs.PDFDataRangeTransport(blob.size, null);
    // если кусок с середины не читается (поток без перемотки) — файл читается один раз подряд, куски — из него;
    // не вышло и так — открытие обрывается с ошибкой, а не ждёт вечно
    // (кусок отдаётся копией: pdf.js может передать его буфер в поток, и общий буфер стал бы пустым)
    let whole = null;
    const read = async (b, e) => {
      if (!whole) {
        try { return new Uint8Array(await blob.slice(b, e).arrayBuffer()); } catch { /* ниже — целиком */ }
        whole = blob.arrayBuffer().then((x) => new Uint8Array(x));
      }
      return (await whole).slice(b, e);
    };
    range.requestDataRange = (begin, end) => {
      read(begin, end).then((d) => range.onDataRange(begin, d), (e) => fail(Object.assign(new Error(String(e && e.message || e)), { name: 'ReadError' })));
    };
    Object.assign(opts, { range, length: blob.size, rangeChunkSize: CHUNK, disableAutoFetch: true, disableStream: true });
  } else opts.data = new Uint8Array(await blob.arrayBuffer());
  if (password) opts.password = password;
  // отказ (не читается файл, не дали пароль): у pdf.js destroy() не завершает ожидание — завершаем сами
  let fail;
  const failed = new Promise((_, rej) => { fail = rej; });
  failed.catch(() => {});
  const task = pdfjs.getDocument(opts);
  let pw = password || null;
  task.onPassword = (update, reason) => {
    const ask = askPassword ? askPassword(reason === pdfjs.PasswordResponses.INCORRECT_PASSWORD) : Promise.resolve(null);
    ask.then((v) => {
      if (v == null) { fail(Object.assign(new Error('password'), { name: 'PasswordCancel' })); return; }
      pw = v;
      update(v);
    });
  };
  let doc;
  try { doc = await Promise.race([task.promise, failed]); } catch (e) { task.destroy().finally(() => port.terminate()); throw e; }
  docs.set(doc, { task, port });
  doc._pw = pw; // подошедший пароль — чтобы в следующий раз не спрашивать
  return doc;
}

// Закрыть документ и его поток; следующее открытие дождётся
export function closePdfDoc(doc) {
  const d = docs.get(doc);
  if (!d) return closing;
  docs.delete(doc);
  closing = closing.then(() => d.task.destroy()).catch(() => {}).then(() => d.port.terminate());
  return closing;
}

// Масштаб в пределах; шаг кнопок — 25 %
export const clampZoom = (z) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(z * 100) / 100));
export const zoomStep = (z, d) => clampZoom(d > 0 ? z * 1.25 : z / 1.25);

// Предел размера холста (память телефона): не больше 8 Мп и 4096 по стороне — сканы нот бывают огромными
export const CANVAS_MAX = 8e6;
export function canvasScale(cssW, cssH, dpr) {
  let k = dpr;
  const px = cssW * cssH * k * k;
  if (px > CANVAS_MAX) k *= Math.sqrt(CANVAS_MAX / px);
  if (Math.max(cssW, cssH) * k > 4096) k = 4096 / Math.max(cssW, cssH);
  return k;
}

// doc — документ pdf.js; state { page (с 1), zoom } — откуда начать; onState({ page, pages, zoom }) — для панели
export function createPdfView(doc, { page = 1, zoom = 1, onState = () => {} } = {}) {
  const el = document.createElement('div');
  el.className = 'pdfv';
  el.tabIndex = 0;
  const inner = document.createElement('div');
  inner.className = 'pdfpages';
  el.appendChild(inner);

  const pages = [], sizes = [];
  let spot = null, z = clampZoom(zoom), width = 0, cur = Math.max(1, Math.min(doc.numPages, page)), destroyed = false, def = null;
  const PAD = 8;

  for (let i = 1; i <= doc.numPages; i++) {
    const d = document.createElement('div');
    d.className = 'pdfpg';
    d.dataset.n = i;
    d.setAttribute('aria-label', String(i));
    inner.appendChild(d);
    pages.push({ el: d, canvas: null, task: null, drawn: 0 });
  }

  // Размер страницы узнаётся, когда она понадобится (у тяжёлого файла чтение всех страниц заранее — долгое);
  // до того — размер первой: у нот и табов страницы почти всегда одинаковые
  const sizeOf = (i) => sizes[i] || def;
  const loading = new Map();
  function pageAt(i) {
    if (sizes[i]) return Promise.resolve(sizes[i]);
    if (!loading.has(i)) {
      loading.set(i, doc.getPage(i + 1).then((p) => {
        const v = p.getViewport({ scale: 1 }), s = { w: v.width, h: v.height, p };
        const old = sizeOf(i);
        sizes[i] = s;
        // страница другого размера — пересчитать разметку, оставшись на том же месте
        if (old && width && Math.abs(old.h / old.w - s.h / s.w) > 0.001) { const a = anchor(); layout(); restore(a); }
        return s;
      }));
    }
    return loading.get(i);
  }
  const ready = pageAt(0).then((s) => { def = s; return cur > 1 ? pageAt(cur - 1) : s; });

  const pageW = () => Math.max(50, (width - PAD * 2) * z);
  function layout() {
    const w = pageW();
    inner.style.width = (w + PAD * 2) + 'px';
    pages.forEach((pg, i) => {
      const s = sizeOf(i);
      const h = s ? (w * s.h) / s.w : w * 1.414;
      pg.el.style.width = w + 'px';
      pg.el.style.height = h + 'px';
    });
  }

  async function draw(i) {
    const pg = pages[i];
    const s = await pageAt(i);
    if (destroyed) return;
    const w = pageW(), h = (w * s.h) / s.w, k = canvasScale(w, h, window.devicePixelRatio || 1);
    const key = Math.round(w * k);
    if (pg.drawn === key) return;
    if (pg.task) { try { pg.task.cancel(); } catch { /* уже закончилась */ } }
    const c = document.createElement('canvas');
    c.width = Math.round(w * k);
    c.height = Math.round(h * k);
    const task = s.p.render({ canvasContext: c.getContext('2d'), viewport: s.p.getViewport({ scale: (w * k) / s.w }) });
    pg.task = task;
    try { await task.promise; } catch { c.width = c.height = 0; return; }
    if (destroyed || pg.task !== task) { c.width = c.height = 0; return; }
    pg.task = null;
    pg.drawn = key;
    // нарисованное живёт в холсте, а расшифрованные картинки страницы (у скана — десятки МБ) больше не нужны:
    // без этого память росла на каждую пролистанную страницу, и телефон закрывал тяжёлую книгу
    s.p.cleanup();
    if (pg.canvas) { pg.canvas.width = pg.canvas.height = 0; pg.canvas.remove(); }
    pg.canvas = c;
    pg.el.appendChild(c);
  }
  function free(i) {
    const pg = pages[i];
    if (pg.task) { try { pg.task.cancel(); } catch { /* */ } pg.task = null; }
    // обнулённый холст отдаёт память сразу, не дожидаясь сборщика мусора
    if (pg.canvas) { pg.canvas.width = pg.canvas.height = 0; pg.canvas.remove(); pg.canvas = null; pg.drawn = 0; }
    if (sizes[i]) sizes[i].p.cleanup();
  }

  // Рисуется по одной странице за раз, ближние к текущей — первыми: тяжёлые сканы не забивают память разом
  let want = [], busy = false;
  async function pump() {
    if (busy) return;
    busy = true;
    while (want.length && !destroyed) await draw(want.shift()).catch(() => {});
    busy = false;
  }

  // Видимые страницы и по одной соседней — рисовать; дальние (на 2 страницы и больше) — освобождать
  function refresh() {
    if (destroyed || !width) return;
    const top = el.scrollTop, bot = top + el.clientHeight;
    let a0 = -1, a1 = -1;
    pages.forEach((pg, i) => {
      const a = pg.el.offsetTop, b = a + pg.el.offsetHeight;
      if (b >= top && a <= bot) { if (a0 < 0) a0 = i; a1 = i; }
    });
    if (a0 < 0) return;
    // текущая страница — та, что занимает верхнюю треть окна
    const mark = top + el.clientHeight / 3;
    const n = pages.findIndex((pg) => pg.el.offsetTop + pg.el.offsetHeight > mark) + 1 || doc.numPages;
    if (n !== cur) { cur = n; emit(); }
    const lo = Math.max(0, a0 - 1), hi = Math.min(pages.length - 1, a1 + 1);
    pages.forEach((_, i) => { if (i < lo - 1 || i > hi + 1) free(i); });
    want = [];
    for (let i = lo; i <= hi; i++) want.push(i);
    want.sort((x, y) => Math.abs(x - (cur - 1)) - Math.abs(y - (cur - 1)));
    pump();
    // место запоминается сейчас: при повороте экрана размеры окна меняются раньше, чем придёт событие
    spot = anchor();
  }
  const emit = () => onState({ page: cur, pages: doc.numPages, zoom: z });

  // Место на текущей странице (доля высоты) — чтобы после смены масштаба или поворота остаться там же
  // (точка — на трети высоты окна, как и при определении текущей страницы)
  const anchor = () => {
    const pg = pages[cur - 1].el, mark = el.scrollTop + el.clientHeight / 3;
    return { i: cur - 1, f: (mark - pg.offsetTop) / Math.max(1, pg.offsetHeight), x: el.scrollWidth > el.clientWidth ? (el.scrollLeft + el.clientWidth / 2) / el.scrollWidth : 0.5 };
  };
  const restore = (a) => {
    const pg = pages[a.i].el;
    el.scrollTop = pg.offsetTop + a.f * pg.offsetHeight - el.clientHeight / 3;
    el.scrollLeft = a.x * el.scrollWidth - el.clientWidth / 2;
  };

  let scrollT = 0;
  el.addEventListener('scroll', () => { cancelAnimationFrame(scrollT); scrollT = requestAnimationFrame(refresh); }, { passive: true });

  const ro = new ResizeObserver(() => {
    const w = el.clientWidth;
    if (!w || !def || Math.abs(w - width) < 1) return;
    const a = width && spot ? spot : { i: cur - 1, f: 0, x: 0.5 };
    width = w;
    layout();
    restore(a);
    refresh();
  });

  // Масштаб вокруг точки (fx, fy — координаты в окне просмотра)
  function setZoom(nz, fx = el.clientWidth / 2, fy = el.clientHeight / 3) {
    nz = clampZoom(nz);
    if (nz === z) return;
    const k = nz / z, cx = el.scrollLeft + fx, cy = el.scrollTop + fy;
    z = nz;
    layout();
    el.scrollLeft = cx * k - fx;
    el.scrollTop = cy * k - fy;
    refresh();
    emit();
  }

  /* ---------- жесты: щипок двумя пальцами, двойное касание, Ctrl + колесо ---------- */
  let pinch = null, lastTap = 0;
  const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  el.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      const r = el.getBoundingClientRect();
      pinch = { d: dist(e.touches), fx: (e.touches[0].clientX + e.touches[1].clientX) / 2 - r.left, fy: (e.touches[0].clientY + e.touches[1].clientY) / 2 - r.top, s: 1 };
      inner.style.transformOrigin = (el.scrollLeft + pinch.fx) + 'px ' + (el.scrollTop + pinch.fy) + 'px';
      e.preventDefault();
    } else if (e.touches.length === 1) {
      const now = Date.now(), t = e.touches[0];
      if (now - lastTap < 300) {
        const r = el.getBoundingClientRect();
        setZoom(z > 1.05 ? 1 : 2, t.clientX - r.left, t.clientY - r.top);
        lastTap = 0;
        e.preventDefault();
      } else lastTap = now;
    }
  }, { passive: false });
  el.addEventListener('touchmove', (e) => {
    if (!pinch || e.touches.length !== 2) return;
    e.preventDefault();
    pinch.s = Math.max(ZOOM_MIN / z, Math.min(ZOOM_MAX / z, dist(e.touches) / pinch.d));
    inner.style.transform = 'scale(' + pinch.s + ')'; // во время жеста — только растяжение, перерисовка после
  }, { passive: false });
  const pinchEnd = (e) => {
    if (!pinch || e.touches.length >= 2) return;
    const p = pinch;
    pinch = null;
    inner.style.transform = '';
    setZoom(z * p.s, p.fx, p.fy);
  };
  el.addEventListener('touchend', pinchEnd);
  el.addEventListener('touchcancel', pinchEnd);
  el.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const r = el.getBoundingClientRect();
    setZoom(z * (e.deltaY < 0 ? 1.1 : 1 / 1.1), e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'PageDown' || e.key === ' ') { view.go(cur + 1); e.preventDefault(); }
    else if (e.key === 'PageUp') { view.go(cur - 1); e.preventDefault(); }
  });

  const view = {
    el,
    get page() { return cur; },
    get zoom() { return z; },
    pages: doc.numPages,
    // Вставлена в страницу: размеры известны — разметка и переход на сохранённую страницу
    async mounted() {
      ro.observe(el);
      try { await ready; } catch { /* страница не читается — останется пустой */ }
      if (destroyed) return;
      width = el.clientWidth;
      layout();
      el.scrollTop = pages[cur - 1].el.offsetTop - PAD;
      refresh();
      emit();
    },
    // Перенос в другое место страницы (окно перерисовано): прокрутка при переносе сбрасывается — вернуть её
    moveTo(parent) {
      if (el.parentNode === parent) return;
      const t = el.scrollTop, l = el.scrollLeft;
      parent.appendChild(el);
      el.scrollTop = t;
      el.scrollLeft = l;
    },
    zoomBy(d) { setZoom(zoomStep(z, d)); },
    fit() { setZoom(1); },
    go(n) {
      n = Math.max(1, Math.min(doc.numPages, n));
      el.scrollTo({ top: pages[n - 1].el.offsetTop - PAD, behavior: 'smooth' });
    },
    destroy() {
      destroyed = true;
      ro.disconnect();
      want = [];
      pages.forEach((_, i) => free(i));
      el.remove();
      return closePdfDoc(doc);
    },
  };
  return view;
}
