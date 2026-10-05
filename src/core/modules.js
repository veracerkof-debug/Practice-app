// Хозяин модулей: создаёт ctx по контракту (MODULE_SPEC.md), монтирует модуль в окно,
// учитывает время инструмента, открытого вне сессии.
import { getLang, makeT, makeTn, fmtNum, t as coreT } from '../i18n/index.js';
import { ui } from '../ui/index.js';
import { createToolView, toolViewMs, toolViewVisibility, saveToolView, recordToolTime, trackMode, countsWhileHidden, FREE_TAGS, freeTagName } from './session.js';
import { overlapMs, mergeSegs } from './stopwatch.js';
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
    // Файлы пользователя на устройстве (src/core/files.js) и предупреждение о правах перед загрузкой
    files: app.files,
    confirmUpload: () => app.confirmUpload(),
    // Песни библиотеки — только чтение: [{ id, title }]
    songs: () => app.store.songs().map((s) => ({ id: s.id, title: s.title })),
    // Данные модуля в общем состоянии (попадают в резервную копию): state.settings[id]
    data: () => (app.store.state.settings[mod.id] ??= {}),
    saveData: () => app.store.settingsChanged(),
    pomodoro: app.pomodoro,
    // Секундомер «сколько я играю» (ядро; второй режим «Помодоро»). commit — записать в статистику как свободную
    // практику; время, уже учтённое сессией или инструментами, не засчитывается дважды
    stopwatch: app.stopwatch && {
      get running() { return app.stopwatch.running; },
      elapsed: () => app.stopwatch.elapsed(),
      active: () => app.stopwatch.active(),
      toggle: () => app.stopwatch.toggle(),
      reset: () => app.stopwatch.reset(),
      subscribe: (fn) => app.stopwatch.subscribe(fn),
      credit: () => app.stopwatch.credit(app.store.sessions(), app.active),
      commit: (o) => app.stopwatch.commit(app.store, app.active, o),
      tags: () => FREE_TAGS.map((v) => ({ value: v, label: freeTagName(v) })),
    },
    // Открыть другой инструмент (например, пианино с подсветкой гаммы)
    openTool: (id) => app.openTool && app.openTool(id),
    // Настройки другого модуля — только чтение (копия)
    peek: (id) => JSON.parse(JSON.stringify(app.device[id] || {})),
    shared: app.shared,
    get session() { return app.active ? { type: app.active.type, songId: app.active.songId } : null; },
    // Песня текущей сессии (копия): { id, title, notes, tr } или null
    song() {
      const s = app.active && app.active.songId && app.store.songById(app.active.songId);
      return s ? { id: s.id, title: s.title, notes: s.notes || '', tr: s.tr || 0 } : null;
    },
    // Правка песни текущей сессии: только текст с аккордами (notes) и транспонирование (tr)
    updateSong(patch) {
      const s = app.active && app.active.songId && app.store.songById(app.active.songId);
      if (!s) return;
      if ('notes' in patch) s.notes = String(patch.notes);
      if ('tr' in patch) s.tr = Math.max(-11, Math.min(11, Math.round(+patch.tr || 0)));
      s.updatedAt = app.store.now();
      app.store.save();
    },
    ui,
  };
}

export const moduleName = (mod) => mod.name[getLang()] || mod.name.ru;

// Смонтировать модуль в host с размером size; возвращает { resize, unmount }.
// frame — окно (.pane) с классом размера; по умолчанию сам host. В сессии модуль рисует внутри окна,
// где есть ещё полоска перетаскивания и переключатель «метроном / тюнер».
export function mountModule(app, mod, host, size = 'full', frame = host) {
  const ctx = makeCtx(app, mod);
  frame.classList.add('pane', size);
  frame.dataset.tool = mod.id;
  frame.dataset.size = size;
  frame.style.setProperty('--mod', mod.color);
  mod.mount(host, ctx, size);
  return {
    ctx,
    resize(next) {
      frame.classList.remove(...SIZES);
      frame.classList.add(next);
      frame.dataset.size = next;
      mod.resize(next);
    },
    unmount() {
      mod.unmount();
      host.replaceChildren();
    },
  };
}

// Инструмент вне сессии: время идёт, пока страница видна (в обычном режиме учёта — и при погасшем экране,
// пока что-то звучит); при закрытии — в статистику (от 10 с)
export function trackToolTime(app, toolId) {
  const mode = trackMode(app.store.state.settings);
  const counting = () => document.visibilityState === 'visible' || countsWhileHidden(mode, app.sounding ? app.sounding() : false);
  const tv = createToolView(toolId, { visible: counting() });
  const onVis = () => { toolViewVisibility(tv, counting()); saveToolView(tv); };
  document.addEventListener('visibilitychange', onVis);
  saveToolView(tv);
  const hb = setInterval(onVis, 5000);
  return {
    // Возвращает секунды, если записано в статистику, иначе 0
    stop() {
      clearInterval(hb);
      document.removeEventListener('visibilitychange', onVis);
      const ms = toolViewMs(tv);
      saveToolView(null);
      // То, что уже записал секундомер, второй раз не засчитывается
      const now = Date.now(), sw = mergeSegs(app.store.sessions().filter((s) => s.src === 'stopwatch').map((s) => [s.start, s.end]));
      const ov = overlapMs([[tv.start, now]], sw);
      return recordToolTime(app.store, toolId, tv.start, ms, now, { mode, overlapMs: ov }) ? Math.max(0, ms - ov) / 1000 : 0;
    },
  };
}

export { fmtDur };
