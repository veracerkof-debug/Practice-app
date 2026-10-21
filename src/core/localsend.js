// Приём файлов с телефона по протоколу LocalSend — Windows (Rust: src-tauri/src/localsend.rs). Компьютер объявляет
// себя в сети Wi-Fi как «Melete · <имя>», приложение LocalSend на телефоне видит его и отправляет файлы: они ложатся
// в папку Melete по подпапкам, синхронизация папки (foldersync.js) кладёт их в медиатеку. Сеть — только по воле
// человека: переключатель в настройках (settings.localSend, по умолчанию выключен), нужна выбранная папка Melete.
// Каждая передача подтверждается в окне (кто и что шлёт); без подтверждения за 60 с телефон получает отказ.
import { isDesktop, folderPath } from './desktop.js';
import { t, tn } from '../i18n/index.js';
import { confirm, toast } from '../ui/index.js';
import { log, logErr } from './log.js';

const core = () => import('@tauri-apps/api/core');
const fmtMb = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1) + ' МБ' : Math.max(1, Math.round(b / 1024)) + ' КБ');

export function initLocalSend(app) {
  const avail = isDesktop();
  let state = { on: false, ips: [], alias: '' }, uns = [];
  const subs = new Set(), emit = () => subs.forEach((fn) => { try { fn(); } catch { /* */ } });
  const st = () => app.store.state.settings;
  const alias = () => { const n = (st().profile && st().profile.name) || ''; return 'Melete' + (n ? ' · ' + n : ''); };

  async function status() {
    if (!avail) return state;
    try { const { invoke } = await core(); const r = await invoke('localsend_status'); state = { on: !!r.on, ips: r.ips || [], alias: r.alias || '' }; } catch { state = { on: false, ips: [], alias: '' }; }
    emit();
    return state;
  }
  async function listen() {
    if (uns.length) return;
    const { listen: on } = await import('@tauri-apps/api/event'), { invoke } = await core();
    uns.push(await on('localsend-ask', async (e) => {
      const a = e.payload || {}, files = a.files || [], names = files.slice(0, 5).map((f) => f.fileName).join(', ') + (files.length > 5 ? '…' : '');
      const ok = await confirm(t('ls.ask', { from: a.from && a.from.alias ? a.from.alias : '?' }), tn('ls.askText', files.length, { names, size: fmtMb(a.total || 0) }), t('ls.accept'));
      invoke('localsend_answer', { sessionId: a.sessionId, ok }).catch(() => {});
      log('ls', (ok ? 'принято' : 'отказано') + ': ' + files.length + ' файл(ов) от ' + (a.from && a.from.alias));
    }));
    uns.push(await on('localsend-got', (e) => {
      const g = e.payload || {};
      toast(t('ls.got', { name: g.fileName || '' }));
      log('ls', 'получен: ' + g.fileName + ', ' + fmtMb(g.size || 0) + (g.left ? ', ещё ' + g.left : ''));
      if (app.folder && app.folder.schedule) app.folder.schedule(g.left ? 8000 : 1500); // разложит в медиатеку
    }));
    uns.push(await on('localsend-error', (e) => { toast(t('ls.err')); log('ls', 'сервер: ' + e.payload, 'w'); state.on = false; st().localSend = false; app.store.settingsChanged(); emit(); }));
  }
  async function start() {
    if (!avail) return false;
    const dir = folderPath();
    if (!dir || !(app.folder && app.folder.state.ok)) { toast(t('ls.needFolder')); return false; }
    try {
      await listen();
      const { invoke } = await core();
      const r = await invoke('localsend_start', { alias: alias(), dir });
      state = { on: !!r.on, ips: r.ips || [], alias: r.alias || '' };
      log('ls', 'приём включён: ' + state.alias + ' ' + state.ips.join(', ') + ':' + r.port);
    } catch (e) { logErr('ls', e); toast(t('ls.err')); state.on = false; }
    emit();
    return state.on;
  }
  async function stop() {
    if (!avail) return;
    try { const { invoke } = await core(); await invoke('localsend_stop'); } catch { /* */ }
    state.on = false; emit();
    log('ls', 'приём выключен');
  }
  const api = {
    available: avail,
    get state() { return state; },
    subscribe: (fn) => { subs.add(fn); return () => subs.delete(fn); },
    status, start, stop,
    enabled: () => st().localSend === true,
    async set(on) { st().localSend = !!on; app.store.settingsChanged(); if (on) { if (!(await start())) { st().localSend = false; app.store.settingsChanged(); } } else await stop(); },
    // при запуске: включён в настройках и папка на месте — поднять
    init() { if (avail && st().localSend) setTimeout(() => { if (app.folder && app.folder.state.ok) start(); else { const un = app.folder && app.folder.subscribe(() => { if (app.folder.state.ok) { un && un(); start(); } }); } }, 3000); },
  };
  return api;
}
