// Просмотр PDF (ноты, табы): все страницы одной лентой по ширине окна, масштаб щипком, кнопками и двойным касанием,
// при повороте экрана текущее место сохраняется. pdf.js (Apache-2.0) и его ресурсы — в сборке приложения, без сети.
// Страницы рисуются лениво — только видимые и соседние; дальние освобождают память.
// Поток pdf.js собирается Vite в обычный .js (у .mjs на Android может не оказаться нужного типа файла)
import PdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?worker';

export const ZOOM_MIN = 0.5, ZOOM_MAX = 4;
export const isPdf = (rec) => !!rec && (rec.type === 'application/pdf' || /\.pdf$/i.test(rec.fileName || '') || rec.fmt === 'pdf');

let lib = null;
const loadLib = () => lib || (lib = import('pdfjs-dist/legacy/build/pdf.mjs').then((m) => {
  m.GlobalWorkerOptions.workerPort = new PdfWorker();
  return m;
}).catch((e) => { lib = null; throw e; }));

const asset = (p) => new URL('pdfjs/' + p, document.baseURI).href;

export async function openPdf(blob) {
  const pdfjs = await loadLib();
  const data = new Uint8Array(await blob.arrayBuffer());
  return pdfjs.getDocument({
    data,
    standardFontDataUrl: asset('standard_fonts/'),
    cMapUrl: asset('cmaps/'), cMapPacked: true,
    wasmUrl: asset('wasm/'),
    isEvalSupported: false, // без eval — безопаснее для файлов из интернета
  }).promise;
}

// Масштаб в пределах; шаг кнопок — 25 %
export const clampZoom = (z) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(z * 100) / 100));
export const zoomStep = (z, d) => clampZoom(d > 0 ? z * 1.25 : z / 1.25);

// Предел размера холста (память телефона): не больше 16 Мп и 4096 по стороне
export function canvasScale(cssW, cssH, dpr) {
  let k = dpr;
  const px = cssW * cssH * k * k;
  if (px > 16e6) k *= Math.sqrt(16e6 / px);
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
  let last = null, z = clampZoom(zoom), width = 0, cur = Math.max(1, Math.min(doc.numPages, page)), destroyed = false;
  const PAD = 8;

  for (let i = 1; i <= doc.numPages; i++) {
    const d = document.createElement('div');
    d.className = 'pdfpg';
    d.dataset.n = i;
    d.setAttribute('aria-label', String(i));
    inner.appendChild(d);
    pages.push({ el: d, canvas: null, task: null, drawn: 0 });
  }

  // Размеры страниц без масштаба (для разметки до отрисовки)
  const ready = (async () => {
    for (let i = 1; i <= doc.numPages; i++) {
      const p = await doc.getPage(i), v = p.getViewport({ scale: 1 });
      sizes[i - 1] = { w: v.width, h: v.height, p };
    }
  })();

  const pageW = () => Math.max(50, (width - PAD * 2) * z);
  function layout() {
    const w = pageW();
    inner.style.width = (w + PAD * 2) + 'px';
    pages.forEach((pg, i) => {
      const s = sizes[i];
      const h = s ? (w * s.h) / s.w : w * 1.414;
      pg.el.style.width = w + 'px';
      pg.el.style.height = h + 'px';
    });
  }

  async function draw(i) {
    const pg = pages[i], s = sizes[i];
    if (!s || destroyed) return;
    const w = pageW(), h = (w * s.h) / s.w, k = canvasScale(w, h, window.devicePixelRatio || 1);
    const key = Math.round(w * k);
    if (pg.drawn === key) return;
    if (pg.task) { try { pg.task.cancel(); } catch { /* уже закончилась */ } }
    const c = document.createElement('canvas');
    c.width = Math.round(w * k);
    c.height = Math.round(h * k);
    const task = s.p.render({ canvasContext: c.getContext('2d'), viewport: s.p.getViewport({ scale: (w * k) / s.w }) });
    pg.task = task;
    try { await task.promise; } catch { return; }
    if (destroyed || pg.task !== task) return;
    pg.task = null;
    pg.drawn = key;
    if (pg.canvas) pg.canvas.remove();
    pg.canvas = c;
    pg.el.appendChild(c);
  }
  function free(i) {
    const pg = pages[i];
    if (pg.task) { try { pg.task.cancel(); } catch { /* */ } pg.task = null; }
    if (pg.canvas) { pg.canvas.remove(); pg.canvas = null; pg.drawn = 0; }
  }

  // Видимые страницы и по одной соседней — рисовать; дальние (на 3 страницы и больше) — освобождать
  function refresh() {
    if (destroyed || !width) return;
    const top = el.scrollTop, bot = top + el.clientHeight;
    let first = -1, last = -1;
    pages.forEach((pg, i) => {
      const a = pg.el.offsetTop, b = a + pg.el.offsetHeight;
      if (b >= top && a <= bot) { if (first < 0) first = i; last = i; }
    });
    if (first < 0) return;
    pages.forEach((_, i) => {
      if (i >= first - 1 && i <= last + 1) draw(i);
      else if (i < first - 3 || i > last + 3) free(i);
    });
    // текущая страница — та, что занимает верхнюю треть окна
    const mark = top + el.clientHeight / 3;
    const n = pages.findIndex((pg) => pg.el.offsetTop + pg.el.offsetHeight > mark) + 1 || doc.numPages;
    if (n !== cur) { cur = n; emit(); }
    // место запоминается сейчас: при повороте экрана размеры окна меняются раньше, чем придёт событие
    last = anchor();
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
    if (!w || Math.abs(w - width) < 1) return;
    const a = width && last ? last : { i: cur - 1, f: 0, x: 0.5 };
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
      await ready;
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
      pages.forEach((_, i) => free(i));
      el.remove();
      doc.destroy();
    },
  };
  return view;
}
