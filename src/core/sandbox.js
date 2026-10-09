// Проверка создателем: на время проверки все данные приложения (localStorage practice.*) сохраняются копией,
// а любые числа на экране можно переписать долгим нажатием — посмотреть, как выглядит. Выход — вводом кода
// создателя или бета-тестера: данные возвращаются из копии в точности как были, правки чисел исчезают.
// Записи и файлы в IndexedDB (аудио, табы) в копию не входят — их проверка не меняет.
import { extTest } from './ext.js';

const SNAP = 'practice.sandbox', EDITS = 'practice.sandbox.edits', HOURS = 'practice.sandbox.hours';

// «20 000 ч 15 мин», «297 h», «12 soat» → часы (первое число — часы, второе — минуты); null — не похоже на время
export function parseHours(txt) {
  const ns = String(txt).replace(/(\d)[\s\u00a0\u202f](?=\d{3}\b)/g, '$1').match(/\d+(?:[.,]\d+)?/g);
  if (!ns) return null;
  const v = ns.map((x) => +x.replace(',', '.'));
  return v.length > 1 ? v[0] + v[1] / 60 : v[0];
}
// Часы для камня, заданные правкой во время проверки (или null — настоящие)
export function sandboxHours(settings) {
  if (!extTest(settings)) return null;
  try { const v = localStorage.getItem(HOURS); return v == null ? null : +v; } catch { return null; }
}
const keys = () => Object.keys(localStorage).filter((k) => k.startsWith('practice.') && k !== SNAP && k !== EDITS);

// Перед входом: копия всех данных (если копии ещё нет — повторный вход её не затирает)
export function snapshot() {
  try {
    if (localStorage.getItem(SNAP)) return;
    const data = {};
    keys().forEach((k) => { data[k] = localStorage.getItem(k); });
    localStorage.setItem(SNAP, JSON.stringify(data));
  } catch { /* хранилище недоступно — проверка просто без отката */ }
}

export const hasSnapshot = () => { try { return !!localStorage.getItem(SNAP); } catch { return false; } };

// Выход: всё как было до проверки; apply(settings) — применить введённый код к восстановленным настройкам
export function restore(apply) {
  const data = JSON.parse(localStorage.getItem(SNAP) || '{}');
  keys().forEach((k) => { if (!(k in data)) localStorage.removeItem(k); });
  Object.entries(data).forEach(([k, v]) => localStorage.setItem(k, v));
  localStorage.removeItem(SNAP);
  localStorage.removeItem(EDITS);
  const main = localStorage.getItem('practice.v1');
  if (main && apply) {
    const st = JSON.parse(main);
    apply(st.settings || (st.settings = {}));
    localStorage.setItem('practice.v1', JSON.stringify(st));
  }
}

/* ---------- правка чисел на экране ---------- */

// Правка: где (класс ближайшего оформленного предка) и что было → что стало. После перерисовки экрана
// правки накладываются заново, пока проверка не закончится
let edits = [];
const load = () => { try { edits = JSON.parse(localStorage.getItem(EDITS) || '[]'); } catch { edits = []; } };
const save = () => { try { localStorage.setItem(EDITS, JSON.stringify(edits)); } catch { /* ignore */ } };
const where = (el) => { const c = el.closest('[class]'); return c ? c.className.toString().split(' ')[0] : ''; };

function applyAll(root = document.body) {
  if (!edits.length) return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = w.nextNode())) {
    const txt = n.nodeValue, el = n.parentElement;
    if (!el || !/\d/.test(txt)) continue;
    const e = edits.find((x) => x.from === txt.trim() && x.at === where(el));
    if (e) n.nodeValue = txt.replace(e.from, e.to);
  }
}

// Включить для приложения: долгое нажатие на число — окно правки (только пока проверка включена)
export function initSandbox(app, ask) {
  load();
  let timer = 0, start = null;
  const clear = () => { clearTimeout(timer); timer = 0; start = null; };
  addEventListener('pointerdown', (e) => {
    if (!extTest(app.store.state.settings)) return;
    const el = e.target;
    // самый вложенный элемент с цифрами и коротким текстом
    const txt = el && el.childElementCount === 0 ? (el.textContent || '').trim() : '';
    if (!txt || !/\d/.test(txt) || txt.length > 40 || el.closest('input, textarea, .logo')) return;
    start = { x: e.clientX, y: e.clientY };
    timer = setTimeout(() => {
      timer = 0;
      ask(txt, (to) => {
        if (to == null || to === txt) return;
        const at = where(el);
        edits = edits.filter((x) => !(x.at === at && (x.from === txt || x.to === txt)));
        // правят уже исправленное — «было» остаётся исходным
        const prev = JSON.parse(localStorage.getItem(EDITS) || '[]').find((x) => x.at === at && x.to === txt);
        edits.push({ at, from: prev ? prev.from : txt, to });
        save();
        el.textContent = to;
        // правка часов (элементы с data-hours: часы камня, всего в профиле) — камень показывается для этих часов
        const hEl = el.closest('[data-hours]');
        if (hEl) { const h = parseHours(to); if (h != null) { try { localStorage.setItem(HOURS, String(h)); } catch { /* ignore */ } dispatchEvent(new CustomEvent('sandbox:hours', { detail: h })); } }
      });
    }, 650);
  }, { capture: true, passive: true });
  addEventListener('pointermove', (e) => { if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 12) clear(); }, { capture: true, passive: true });
  addEventListener('pointerup', clear, { capture: true });
  addEventListener('pointercancel', clear, { capture: true });
  new MutationObserver((ms) => {
    if (!edits.length || !extTest(app.store.state.settings)) return;
    ms.forEach((m) => m.addedNodes.forEach((nd) => { if (nd.nodeType === 1) applyAll(nd); else if (nd.nodeType === 3 && nd.parentElement) applyAll(nd.parentElement); }));
  }).observe(document.body, { childList: true, subtree: true });
  if (extTest(app.store.state.settings)) applyAll();
}
