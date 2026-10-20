// Экран не гаснет, пока приложение открыто (settings.screenOn, по умолчанию включено): музыкант играет,
// руки заняты — экран не должен тухнуть посреди песни. Android — флаг окна (GuardPlugin.keepOn), браузер — Wake Lock
// (браузер снимает его, когда вкладка скрыта, — при возвращении берётся заново).
import { Capacitor, registerPlugin } from '@capacitor/core';

const G = Capacitor.isNativePlatform() ? registerPlugin('Guard') : null;
export const screenOnOf = (settings) => settings.screenOn !== false;

let lock = null, want = false;
async function webLock() {
  if (!want || document.hidden || lock || !navigator.wakeLock) return;
  try { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => { lock = null; }); } catch { lock = null; }
}

export function applyScreenOn(settings) {
  const on = screenOnOf(settings);
  if (on === want && (G || lock || !on)) return;
  want = on;
  if (G) { G.keepOn({ on }).catch(() => {}); return; }
  if (on) webLock(); else if (lock) { lock.release().catch(() => {}); lock = null; }
}

export function initScreenOn(app) {
  const st = () => app.store.state.settings;
  applyScreenOn(st());
  app.store.subscribe(() => applyScreenOn(st()));
  if (!G) document.addEventListener('visibilitychange', () => { if (!document.hidden) webLock(); });
}
