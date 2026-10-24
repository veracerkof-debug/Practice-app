// Обновление из GitHub (решение автора 24.10.2026, DECISIONS). Сборок два канала: dev — каждая отправка в main
// (для автора), pre — тестерам, только по слову автора («выпускай»: ветка pre). У каждого канала свой релиз на GitHub
// (метка dev или pre), своё приложение и свои данные (Android: app.melete.dev и app.melete; Windows — свой
// идентификатор). Приложение спрашивает GitHub о релизе своего канала: метка сборки — маленький файл
// «<платформа>-<номер>.ver», CI кладёт его последним, после установочного файла. Пока файла нет или он грузится —
// обновления «нет»; тот же номер — тоже нет. Настройка «Обновление» (settings.updMode): «автоматически» (по умолчанию)
// — раз в сутки при запуске проверить, скачать (Android — только по Wi-Fi) и поставить: Windows — молча при закрытии
// программы (звук, запись и занятие не обрываются; src-tauri/src/update.rs), Android — системный установщик, одна
// кнопка «Установить» (молча ставить себя вне Play система не даёт); «только по кнопке» — ничего само, всё из
// Профиль → Обновления. Данные остаются: тот же пакет и ключ подписи (Android), тот же идентификатор (Windows).
// После обновления — «Что нового» (whatsnew.js). Веб-версия обновляется сама (service worker); Mac — позже.
import { Capacitor, registerPlugin } from '@capacitor/core';
import { isDesktop } from './desktop.js';
import { log, logErr } from './log.js';

export const REPO = 'veracerkof-debug/melete-app';
export const CHANNEL = typeof __CHANNEL__ !== 'undefined' && __CHANNEL__ === 'pre' ? 'pre' : 'dev';
export const BUILD = typeof __BUILD__ !== 'undefined' ? +__BUILD__ || 0 : 0; // 0 — собрано у себя: не обновляется
// Установочные файлы в релизе канала (имена — в .github/workflows)
export const FILES = {
  android: { pre: 'Melete-PreRelease.apk', dev: 'Melete-Dev.apk' },
  windows: { pre: 'Melete-Setup.exe', dev: 'Melete-Dev-Setup.exe' },
};
const KEY = 'melete.upd'; // { at — последняя проверка, skip — номер сборки, от которой отказались }
const DAY = 864e5;

export const platformOf = () => (Capacitor.isNativePlatform() ? 'android' : isDesktop() ? 'windows' : null);

// Ответ GitHub (релиз канала) → { build, url, size } или null: метка сборки и сам файл загружены полностью
export function parseRelease(rel, platform, channel) {
  const assets = (rel && rel.assets) || [], re = new RegExp('^' + platform + '-(\\d+)\\.ver$');
  let build = 0;
  for (const a of assets) { const m = re.exec(a.name || ''); if (m && a.state === 'uploaded') build = Math.max(build, +m[1]); }
  const file = assets.find((a) => a.name === FILES[platform][channel] && a.state === 'uploaded');
  return build && file ? { build, url: file.browser_download_url, size: file.size || 0 } : null;
}
export const isNewer = (info, build) => !!info && build > 0 && info.build > build;
export const MODES = ['auto', 'button'];
export const modeOf = (st) => (st && st.updMode === 'button' ? 'button' : 'auto');
// Пора ли проверять самой: только в «автоматически» и раз в сутки
export const due = (mem, now, mode) => mode === 'auto' && now - ((mem && mem.at) || 0) >= DAY;

const readMem = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const writeMem = (m) => { try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* память недоступна */ } };

export function createUpdater(app) {
  const platform = platformOf();
  const Native = platform === 'android' ? registerPlugin('Update') : null;
  const subs = new Set();
  // st: idle | checking | none | avail | down | ready | err; f — доля скачанного; wait — ждёт Wi-Fi
  let s = { st: 'idle', info: null, f: 0, wait: false, at: readMem().at || 0 };
  const set = (p) => { s = { ...s, ...p }; subs.forEach((fn) => { try { fn(s); } catch { /* */ } }); };
  const mode = () => modeOf(app.store.state.settings);
  let poll = 0, path = '';

  async function check() {
    if (!platform || s.st === 'checking' || s.st === 'down') return s;
    set({ st: 'checking' });
    try {
      const r = await fetch('https://api.github.com/repos/' + REPO + '/releases/tags/' + CHANNEL, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' });
      if (!r.ok) throw new Error('GitHub ' + r.status);
      const info = parseRelease(await r.json(), platform, CHANNEL), at = Date.now();
      writeMem({ ...readMem(), at });
      const fresh = isNewer(info, BUILD);
      log('upd', 'проверка ' + CHANNEL + ': у нас ' + BUILD + ', на GitHub ' + (info ? info.build : '—') + (fresh ? ' — есть новая' : ''));
      set({ st: fresh ? 'avail' : 'none', info: fresh ? info : null, at });
    } catch (e) { logErr('upd', e); set({ st: 'err' }); }
    return s;
  }

  // mobile — качать и по мобильной сети: настройка «Мобильная сеть» (settings.updMobile) или «Сейчас» на полосе ожидания Wi-Fi
  let dlId = null;
  async function download({ mobile = !!app.store.state.settings.updMobile } = {}) {
    if (s.st !== 'avail' || !s.info) return;
    set({ st: 'down', f: 0, wait: false });
    try {
      if (platform === 'android') {
        const { id } = await Native.download({ url: s.info.url, wifi: !mobile });
        dlId = id;
        clearInterval(poll);
        poll = setInterval(async () => {
          let r; try { r = await Native.status({ id }); } catch (e) { clearInterval(poll); logErr('upd', e); set({ st: 'avail' }); return; }
          if (r.status === 'done') { clearInterval(poll); log('upd', 'скачано: сборка ' + s.info.build); set({ st: 'ready', f: 1 }); }
          else if (r.status === 'fail') { clearInterval(poll); log('upd', 'скачивание не удалось: ' + (r.reason || ''), 'w'); set({ st: 'err' }); }
          else set({ f: r.total ? r.got / r.total : 0, wait: r.status === 'wait' });
        }, 1000);
      } else {
        const { invoke } = await import('@tauri-apps/api/core'), { listen } = await import('@tauri-apps/api/event');
        const un = await listen('update-progress', (e) => set({ f: +e.payload || 0 }));
        try { path = await invoke('update_download', { url: s.info.url }); } finally { un(); }
        log('upd', 'скачано: сборка ' + s.info.build);
        set({ st: 'ready', f: 1 });
        // «автоматически»: поставится само при закрытии программы
        if (mode() === 'auto') { await safeCopy(); await invoke('update_pending', { path }); set({ onClose: true }); }
      }
    } catch (e) { logErr('upd', e); set({ st: 'err' }); }
  }

  // Перед установкой — копия данных: на устройстве (snapshots.js) и в папку Melete, если выбрана
  async function safeCopy() {
    try { app.store.save(); } catch { /* */ }
    if (app.snapshots) await app.snapshots.take('update', { build: s.info ? s.info.build : 0 });
    if (app.folder && app.folder.state && app.folder.state.ok && app.folder.saveBackup) { try { await app.folder.saveBackup(); } catch { /* копия на устройстве уже есть */ } }
  }
  // Установка (данные остаются; копия — на всякий случай)
  async function install() {
    if (s.st !== 'ready') return;
    await safeCopy();
    log('upd', 'установка сборки ' + (s.info ? s.info.build : '?'));
    if (platform === 'android') {
      const { ok } = await Native.canInstall();
      if (!ok) { await Native.allowInstall(); return 'allow'; } // разрешить установку из Melete — один раз, в настройках системы
      await Native.install();
    } else {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('update_install', { path }); // окно закрывается, установщик ставит молча и запускает заново
    }
    return 'ok';
  }

  const api = {
    platform, channel: CHANNEL, build: BUILD,
    get state() { return s; },
    get mode() { return mode(); },
    // «Потом»: эту сборку больше не предлагать (следующую — предложит)
    skip() { if (s.info) writeMem({ ...readMem(), skip: s.info.build }); set({ st: 'none' }); },
    get skipped() { return !!s.info && readMem().skip === s.info.build; },
    check, download, install,
    // ждёт Wi-Fi, а нужно сейчас: то же скачивание заново — по любой сети
    async now() { if (platform !== 'android' || s.st !== 'down' || !s.wait) return; clearInterval(poll); try { await Native.cancel({ id: dlId }); } catch { /* уже нет */ } set({ st: 'avail' }); log('upd', 'скачивание по мобильной сети'); return download({ mobile: true }); },
    // при запуске: тихо, раз в сутки, не мешая звуку и занятию — через полминуты после старта
    // «автоматически»: найдено новое — сразу скачать (Android ждёт Wi-Fi сам)
    auto() {
      if (!platform || !BUILD || !due(readMem(), Date.now(), mode())) return;
      setTimeout(() => { check().then(() => { if (s.st === 'avail' && mode() === 'auto') download(); }).catch(() => {}); }, 30000);
    },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
  return api;
}
