// Хозяин модулей: создаёт ctx по контракту (MODULE_SPEC.md), монтирует модуль в окно,
// учитывает время инструмента, открытого вне сессии.
import { getLang, makeT, makeTn, fmtNum, t as coreT } from '../i18n/index.js';
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

// Свои пресеты звука (пианино, пэды) — в общих данных: попадают в резервную копию (как в прототипе)
function presetsApi(app, kind) {
  const list = () => {
    const st = app.store.state.settings;
    st.presets ??= { piano: [], drone: [] };
    return (st.presets[kind] ??= []);
  };
  const changed = () => app.store.settingsChanged();
  return {
    list,
    add(name, data) {
      const id = 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      list().push({ id, name, data: JSON.parse(JSON.stringify(data)) });
      changed();
      return id;
    },
    rename(id, name) { const p = list().find((x) => x.id === id); if (p) { p.name = name; changed(); } },
    remove(id) { app.store.state.settings.presets[kind] = list().filter((x) => x.id !== id); changed(); },
    get: (id) => list().find((x) => x.id === id),
  };
}

// Общие между модулями значения на время работы (например, подсветка гаммы на пианино из «Теории»)
export function createShared() {
  const vals = {}, subs = new Set();
  return {
    get: (k) => vals[k] ?? null,
    set(k, v) { vals[k] = v; subs.forEach((fn) => fn(k, v)); },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
}

// ctx — всё, что ядро даёт модулю
export function makeCtx(app, mod) {
  // Строки модуля; если ключа нет — общие строки ядра (ui.*, preset.*)
  const mt = makeT(mod.i18n || {}), tn = makeTn(mod.i18n || {});
  const t = (k, v) => { const r = mt(k, v); return r === k ? coreT(k, v) : r; };
  return {
    id: mod.id,
    t, tn,
    lang: getLang,
    num: fmtNum,
    store: moduleStore(app, mod.id),
    audio: app.audio,
    mic: { request: () => app.audio.openMic() },
    presets: (kind) => presetsApi(app, kind),
    // Данные модуля в общем состоянии (попадают в резервную копию): state.settings[id]
    data: () => (app.store.state.settings[mod.id] ??= {}),
    saveData: () => app.store.settingsChanged(),
    pomodoro: app.pomodoro,
    // Открыть другой инструмент (например, пианино с подсветкой гаммы)
    openTool: (id) => app.openTool && app.openTool(id),
    // Настройки другого модуля — только чтение (копия)
    peek: (id) => JSON.parse(JSON.stringify(app.device[id] || {})),
    shared: app.shared,
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
