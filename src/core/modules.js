// Хозяин модулей: создаёт ctx по контракту (MODULE_SPEC.md), монтирует модуль в окно,
// учитывает время инструмента, открытого вне сессии.
import { getLang, makeT, makeTn, fmtNum } from '../i18n/index.js';
import { ui } from '../ui/index.js';
import { createToolView, toolViewMs, toolViewVisibility, saveToolView, recordToolTime } from './session.js';
import { fmtDur } from './format.js';
import '../ui/pane.css';

export const SIZES = ['full', 'half', 'quarter', 'strip'];

// Пространство имён настроек модуля на устройстве: device[id]
function moduleStore(app, id) {
  const subs = new Set();
  const ns = () => (app.device[id] ??= {});
  return {
    get: (k, def) => ns()[k] ?? def,
    set(k, v) {
      ns()[k] = v;
      app.saveDevice();
      subs.forEach((fn) => fn(k, v));
    },
    all: ns,
    save: () => app.saveDevice(),
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
}

// ctx — всё, что ядро даёт модулю
export function makeCtx(app, mod) {
  const t = makeT(mod.i18n || {}), tn = makeTn(mod.i18n || {});
  return {
    id: mod.id,
    t, tn,
    lang: getLang,
    num: fmtNum,
    store: moduleStore(app, mod.id),
    audio: app.audio,
    mic: { request: () => app.audio.openMic() },
    get session() { return app.active ? { type: app.active.type, songId: app.active.songId } : null; },
    ui,
  };
}

export const moduleName = (mod) => mod.name[getLang()] || mod.name.ru;

// Смонтировать модуль в host с размером size; возвращает { resize, unmount }
export function mountModule(app, mod, host, size = 'full') {
  const ctx = makeCtx(app, mod);
  host.classList.add('pane', size);
  host.dataset.tool = mod.id;
  host.dataset.size = size;
  host.style.setProperty('--mod', mod.color);
  mod.mount(host, ctx, size);
  return {
    ctx,
    resize(next) {
      host.classList.remove(...SIZES);
      host.classList.add(next);
      host.dataset.size = next;
      mod.resize(next);
    },
    unmount() {
      mod.unmount();
      host.replaceChildren();
    },
  };
}

// Инструмент вне сессии: время идёт, пока страница видна; при закрытии — в статистику (от 10 с)
export function trackToolTime(app, toolId) {
  const tv = createToolView(toolId, { visible: document.visibilityState === 'visible' });
  const onVis = () => { toolViewVisibility(tv, document.visibilityState === 'visible'); saveToolView(tv); };
  document.addEventListener('visibilitychange', onVis);
  saveToolView(tv);
  const hb = setInterval(() => saveToolView(tv), 5000);
  return {
    // Возвращает секунды, если записано в статистику, иначе 0
    stop() {
      clearInterval(hb);
      document.removeEventListener('visibilitychange', onVis);
      const ms = toolViewMs(tv);
      saveToolView(null);
      return recordToolTime(app.store, toolId, tv.start, ms) ? ms / 1000 : 0;
    },
  };
}

export { fmtDur };
