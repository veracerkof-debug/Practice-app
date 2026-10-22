// Хозяин модулей: создаёт ctx по контракту (MODULE_SPEC.md), монтирует модуль в окно,
// учитывает время инструмента, открытого вне сессии.
import { getLang, makeT, makeTn, fmtNum, CORE_DICTS as coreDicts } from '../i18n/index.js';
import { ui } from '../ui/index.js';
import { createToolView, toolViewMs, toolViewVisibility, saveToolView, recordToolTime, trackMode, countsWhileHidden, FREE_TAGS, freeTagName } from './session.js';
import { overlapMs, mergeSegs } from './stopwatch.js';
import { fmtDur } from './format.js';
import '../ui/pane.css';
import { log, logErr } from './log.js';
import { epigraphHTML } from './screens/verses.js';
import { gemSec } from './profile.js';
import { createFxPanel } from '../ui/fxpanel.js';
import { gemOf } from './mastery.js';
import { firstHelp, showHelp } from './help.js';
import { guardOpen, guardClose } from './guard.js';
import { isOn } from './settings.js';
import { moduleById } from '../modules/index.js';

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
  // «Минимал» без текста: строки инструмента — без слов везде, кроме шторок настроек (i18n: makeT(…, false))
  const mt = makeT(mod.i18n || {}, false), tn = makeTn(mod.i18n || {}, false), ct = makeT(coreDicts, false);
  const t = (k, v) => { const r = mt(k, v); return r === k ? ct(k, v) : r; };
  return {
    id: mod.id,
    t, tn,
    lang: getLang,
    num: fmtNum,
    store: moduleStore(app, mod.id),
    audio: app.audio,
    mic: { request: () => app.audio.openMic() },
    // Сигналы метронома без звука (вспышка, фонарик, вибрация): info() → { vibrate, torch } — что есть на устройстве
    pulse: app.pulse,
    // Вид «Минимал» (эксперимент): у инструментов с выбором вида он закреплён — самый простой и функциональный
    get mono() { return app.store.state.settings.uiStyle === 'mono'; },
    presets: (kind) => presetsApi(app, kind),
    // Стих-эпиграф (Пс 89:12) — помодоро и секундомер
    epigraph: () => epigraphHTML(),
    // Технический журнал (src/core/log.js): только события и ошибки, без названий и личных данных
    log: (msg, lvl) => log(mod.id, msg, lvl),
    logErr: (e) => logErr(mod.id, e),
    // Файлы пользователя на устройстве (src/core/files.js) и предупреждение о правах перед загрузкой
    files: app.files,
    // Долгие обработки записей (ядро, jobs.js): дорожки и ноты — ход, отмена, подписка; очередь в фоне — auto
    jobs: app.jobs,
    auto: app.auto,
    // MIDI: событие игры (src/music/midi.js) — в запись, если идёт MIDI-запись этого инструмента
    midi: {
      ev: (e) => app.rec && app.rec.midiEv(mod.id, e),
      // запись MIDI (медиатека): открыть её инструмент и проиграть в нём
      play(rec) {
        if (!app.midi || !rec) return;
        if (app.openTool) app.openTool(rec.tool);
        let n = 0;
        const go = () => { if (!app.midi.play(rec, { speed: app.store.state.settings.midiSpeed || 1 }) && ++n < 40) setTimeout(go, 100); };
        setTimeout(go, 150);
      },
      // отправить файлом .mid
      share: async (rec) => {
        const { sendFile } = await import('./screens/share.js'), name = /\.midi?$/i.test(rec.name) ? rec.name : rec.name + '.mid';
        return sendFile(new Uint8Array(await rec.blob.arrayBuffer()), name, name, 'audio/midi');
      },
      // инструмент записи: название, значок, цвет
      tool: (id) => { const m = (app.modules || []).find((x) => x.id === id); return m ? { name: moduleName(m), icon: m.icon, color: m.color } : null; },
    },
    // Отправить файл («Поделиться» на Android, «Сохранить как» на Windows): u8, имя, заголовок, тип
    sendFile: async (u8, name, title, type) => { const { sendFile } = await import('./screens/share.js'); return sendFile(u8, name, title, type); },
    confirmUpload: () => app.confirmUpload(),
    // согласие на загрузку уже дано — выбор файла открывается прямо в нажатии (iPhone иначе его не покажет)
    uploadOk: () => !!app.store.state.settings.upOk,
    // Песни библиотеки — только чтение: [{ id, title, artist, key, text }] (text — есть ли текст с аккордами)
    songs: () => app.store.songs().map((s) => ({ id: s.id, title: s.title, artist: s.artist || '', key: s.key || null, text: !!String(s.notes || '').trim() })),
    // Текст песни (с аккордами) — записать; → true, если песня есть
    songText(id, text) { const s = app.store.songs().find((x) => x.id === id); if (!s) return false; s.notes = String(text || ''); s.updatedAt = app.store.now(); app.store.save(); return true; },
    // Проекты студии (state.projects, в резервной копии вместе с песнями): list(), get(id), save(p), remove(id)
    projects: {
      list: () => (app.store.state.projects || []).filter((x) => !x.deleted),
      get: (id) => (app.store.state.projects || []).find((x) => x.id === id && !x.deleted) || null,
      save(p) { const L = (app.store.state.projects ||= []), i = L.findIndex((x) => x.id === p.id); p.updatedAt = app.store.now(); if (i >= 0) L[i] = p; else L.push(p); app.store.save(); },
      remove(id) { const x = (app.store.state.projects || []).find((y) => y.id === id); if (x) { x.deleted = true; x.updatedAt = app.store.now(); app.store.save(); } },
    },
    // Данные модуля в общем состоянии (попадают в резервную копию): state.settings[id]
    // Общая панель эффектов (src/ui/fxpanel.js) для слоя, дорожки и т. п.: { get, set } → { html(), bind(el, api) }
    fxPanel: ({ get, set }) => createFxPanel({ get, set, profile: app.store.state.settings.profile }),
    data: () => (app.store.state.settings[mod.id] ??= {}),
    saveData: () => app.store.settingsChanged(),
    pomodoro: app.pomodoro,
    // Камень пользователя (для сцен помодоро): зерно породы, часы занятий в приложении, текущий самоцвет
    // лига музыканта (часы практики в приложении) — для модулей, которым она нужна
    league: () => { const hours = gemSec(app.store.sessions()) / 3600; return { hours, gem: gemOf(hours) }; },
    // Церковный режим: чтение Библии (src/core/reading.js: createBible)
    bible: app.bible,
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
      commit: (o) => (app.store.state.settings.toolsOnly ? null : app.stopwatch.commit(app.store, app.active, o)),
      // Можно ли записать время в статистику (в режиме «Только инструменты» — нет)
      get saves() { return !app.store.state.settings.toolsOnly; },
      tags: () => FREE_TAGS.map((v) => ({ value: v, label: freeTagName(v) })),
    },
    // Открыть другой инструмент (например, пианино с подсветкой гаммы)
    openTool: (id) => app.openTool && app.openTool(id),
    // Есть ли другой модуль и включён ли он (кнопки «В студию» прячутся, когда студия выключена)
    hasTool: (id) => !!moduleById(id) && isOn(app.store.state.settings, id),
    // Открыть инструмент с переданными настройками (например, «Табы» на файле: { lastTab, sec })
    openIn(id, patch) { Object.assign(app.device[id] ??= {}, patch); app.saveDevice(); if (app.openTool) app.openTool(id); },
    // инструкция модуля (для вкладок-модулей, у которых нет шапки с «?»)
    help: () => showHelp(app, mod),
    openMixer: () => { if (app.openMixer) app.openMixer(); }, // шторка микшера (студия: кнопка в транспорте)
    // Настройки другого модуля — только чтение (копия)
    peek: (id) => JSON.parse(JSON.stringify(app.device[id] || {})),
    shared: app.shared,
    get session() { return app.active ? { type: app.active.type, songId: app.active.songId } : null; },
    // Песня (копия): { id, title, notes, tr, key } или null. Без id — песня текущей сессии; с id — любая из библиотеки
    // (библиотека текстов и аккордов в «Табах и текстах»)
    song(id) {
      const s = id ? app.store.songById(id) : app.active && app.active.songId && app.store.songById(app.active.songId);
      return s ? { id: s.id, title: s.title, notes: s.notes || '', tr: s.tr || 0, capo: s.capo || 0, key: s.key || null } : null;
    },
    // Правка песни (без id — текущей сессии): только текст с аккордами (notes) и транспонирование (tr)
    updateSong(patch, id) {
      const s = id ? app.store.songById(id) : app.active && app.active.songId && app.store.songById(app.active.songId);
      if (!s) return;
      if ('notes' in patch) s.notes = String(patch.notes);
      if ('tr' in patch) s.tr = Math.max(-11, Math.min(11, Math.round(+patch.tr || 0)));
      if ('capo' in patch) { const v = Math.max(0, Math.min(7, Math.round(+patch.capo || 0))); if (v) s.capo = v; else delete s.capo; } // капо: формы аккордов ниже, звучит та же тональность
      s.updatedAt = app.store.now();
      app.store.save();
    },
    ui,
  };
}

export const moduleName = (mod) => mod.name[getLang()] || mod.name.ru;

// Тяжёлый модуль (heavy: true — модели, банки звуков) в веб-сборке не работает: его файлов там нет (DECISIONS: размер)
const WEB_BUILD = typeof __WEB_BUILD__ !== 'undefined' && __WEB_BUILD__;
export const heavyStub = (mod) => !!(mod && mod.heavy && WEB_BUILD);
const RELEASE = 'https://github.com/veracerkof-debug/Practice-app/releases/tag/pre';
function heavyHTML(ctx, mod) {
  const { t, ui } = ctx, name = moduleName(mod);
  let what = ''; try { what = t('heavy.desc'); } catch { /* */ }
  if (!what || what === 'heavy.desc') what = '';
  return '<div class="heavy"><span class="hvic" style="--c:' + mod.color + '">' + mod.icon + '</span><h2>' + ui.esc(name) + '</h2>' + (what ? '<p>' + ui.esc(what) + '</p>' : '') +
    '<p class="hvnote">' + ui.esc(t('heavy.web', { mb: mod.heavyMb || '' })) + '</p>' +
    '<a class="cell act center b" href="' + RELEASE + '" target="_blank" rel="noopener">' + ui.esc(t('heavy.get')) + '</a></div>';
}
// Смонтировать модуль в host с размером size; возвращает { resize, unmount }.
// frame — окно (.pane) с классом размера; по умолчанию сам host. В сессии модуль рисует внутри окна,
// где есть ещё полоска перетаскивания и переключатель «метроном / тюнер».
export function mountModule(app, mod, host, size = 'full', frame = host) {
  const ctx = makeCtx(app, mod);
  log('mod', 'открыт ' + mod.id + ' (' + size + ')');
  frame.classList.add('pane', size);
  frame.dataset.tool = mod.id;
  frame.dataset.size = size;
  frame.style.setProperty('--mod', mod.color);
  if (heavyStub(mod)) { // тяжёлый модуль в веб-версии: заглушка с описанием и ссылкой на приложение
    host.innerHTML = heavyHTML(ctx, mod);
    return { ctx, resize() {}, unmount() { host.innerHTML = ''; frame.classList.remove('pane', size); } };
  }
  mod.mount(host, ctx, size);
  // инструмент, где играют несколькими пальцами: пока открыт — системный снимок экрана тремя пальцами не срабатывает
  // (у остальных — медиатека, ноты, тюнер… — защиты нет: она выключала бы и запись экрана)
  const guarded = !!mod.multitouch;
  if (guarded) guardOpen();
  firstHelp(app, mod); // при первом открытии — инструкция
  // понимает MIDI — слушает клавиатуру и воспроизводит свои записи, пока открыт
  const midiOff = mod.midiIn && app.midi ? app.midi.attach(mod.id, mod) : () => {};
  return {
    ctx,
    resize(next) {
      frame.classList.remove(...SIZES);
      frame.classList.add(next);
      frame.dataset.size = next;
      mod.resize(next);
      log('mod', mod.id + ' → ' + next);
    },
    unmount() {
      log('mod', 'закрыт ' + mod.id);
      midiOff(); // воспроизведение останавливается, пока инструмент ещё на месте
      try { mod.unmount(host); } catch (e) { logErr('mod', e); } // host — какое из мест закрывается (модуль может быть открыт в двух)
      host.replaceChildren();
      if (guarded) guardClose();
    },
  };
}

// Инструмент вне сессии: время идёт, пока страница видна (в обычном режиме учёта — и при погасшем экране,
// пока что-то звучит); 10 минут без звука и действий — не идёт (с последнего действия); при закрытии — в статистику (от 10 с)
export function trackToolTime(app, toolId) {
  const mode = trackMode(app.store.state.settings), act = app.activity;
  const quiet = () => !!act && act.quiet();
  const counting = () => (document.visibilityState === 'visible' || countsWhileHidden(mode, app.sounding ? app.sounding() : false)) && !quiet();
  const tv = createToolView(toolId, { visible: counting() });
  const jumps0 = app.clock ? app.clock.jumps : 0; // перевод часов, пока окно открыто, — время не подтверждается
  const onVis = () => {
    const on = counting();
    // затихло — время останавливается на последнем действии, а не на моменте проверки
    toolViewVisibility(tv, on, !on && quiet() ? Math.max(act.last(), tv.seg || 0) : Date.now());
    saveToolView(tv);
  };
  document.addEventListener('visibilitychange', onVis);
  addEventListener('pointerdown', onVis, { passive: true });
  act?.toolOpen(true);
  saveToolView(tv);
  const hb = setInterval(onVis, 5000);
  return {
    // Возвращает секунды, если записано в статистику, иначе 0
    stop() {
      clearInterval(hb);
      document.removeEventListener('visibilitychange', onVis);
      removeEventListener('pointerdown', onVis);
      act?.toolOpen(false);
      onVis();
      const ms = toolViewMs(tv);
      saveToolView(null);
      // То, что уже записал секундомер, второй раз не засчитывается
      const now = Date.now(), sw = mergeSegs(app.store.sessions().filter((s) => s.src === 'stopwatch').map((s) => [s.start, s.end]));
      const ov = overlapMs([[tv.start, now]], sw);
      const clk = app.clock && (app.clock.bad || app.clock.jumps !== jumps0) ? 'jump' : '';
      return recordToolTime(app.store, toolId, tv.start, ms, now, { mode, overlapMs: ov, clk }) ? Math.max(0, ms - ov) / 1000 : 0;
    },
  };
}

export { fmtDur };
