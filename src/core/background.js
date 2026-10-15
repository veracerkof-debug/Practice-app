// Работа в фоне (Android): пока что-то идёт — занятие, метроном, звук инструментов или медиа, помодоро, секундомер, —
// включена служба с тихим уведомлением (android: KeepAliveService), и Android не замораживает приложение через
// 10–15 секунд после сворачивания. Всё выключено — служба останавливается. Службу можно запустить только пока
// приложение на экране, поэтому она включается сразу, как что-то началось, а не при сворачивании.
// Один раз при первом запуске — шторка: снять ограничение батареи, разрешить уведомления (у Honor, Xiaomi и других
// оболочек — ещё «Запуск приложений» в настройках). В браузере ничего не делает.
import { Capacitor, registerPlugin } from '@capacitor/core';
import { t } from '../i18n/index.js';
import { sheet, snav } from '../ui/index.js';
import { log } from './log.js';

const KA = Capacitor.isNativePlatform() ? registerPlugin('KeepAlive') : null;
export const bgAvailable = () => !!KA;
export const bgStatus = () => (KA ? KA.status().catch(() => null) : Promise.resolve(null));
export const bgAsk = { battery: () => KA && KA.askBattery(), notify: () => KA && KA.askNotify(), settings: () => KA && KA.openSettings(), autostart: () => KA && KA.autostart().catch(() => KA.openSettings()) };

// Что сейчас идёт — строка для уведомления; null — ничего
export function busyText(app) {
  if (app.active) return t(app.active.pausedAt ? 'bg.paused' : 'bg.session');
  if (app.audio.metro.running) return t('bg.metro');
  if (app.soundingAudio()) return t('bg.sound');
  if (app.pomodoro && app.pomodoro.running) return t('bg.pomo');
  if (app.stopwatch && app.stopwatch.running) return t('bg.watch');
  return null;
}

export function initBackground(app) {
  if (!KA) return;
  let on = false, shown = '', asked = !!app.device.bgAsked;
  const tick = () => {
    const text = busyText(app);
    if (text && (!on || text !== shown)) {
      if (document.visibilityState !== 'visible' && !on) return; // из фона Android службу не даёт — дождёмся экрана
      KA.start({ title: 'Melete', text, channel: t('bg.channel') }).then(() => {
        if (!on) log('bg', 'работа в фоне: включена');
        on = true; shown = text;
        if (!asked) { asked = true; app.device.bgAsked = true; app.saveDevice(); offer(); }
      }, (e) => log('bg', 'работа в фоне не включилась: ' + (e && e.message), 'w'));
    } else if (!text && on) {
      on = false; shown = '';
      KA.stop().catch(() => {});
      log('bg', 'работа в фоне: выключена');
    }
  };
  setInterval(tick, 1500);
  document.addEventListener('visibilitychange', tick);
  app.bgTick = tick;
}

// Шторка «Работа в фоне»: что сделать, чтобы Android не останавливал занятие
export function offer(force = false) {
  bgStatus().then((s) => {
    if (!s || (!force && s.battery && s.notify)) return;
    const api = sheet(() => snav(t('bg.title')) + '<p class="ftr" style="margin-top:0">' + t('bg.text') + '</p>' + bgRows(s), (el) => bindBg(el, () => api.close()));
  });
}
export const bgRows = (s) => '<div class="group">' +
  '<button class="cell act" data-bg="battery"><span class="grow">' + t('bg.battery') + '</span><span class="val">' + (s && s.battery ? '✓' : '') + '</span></button>' +
  '<button class="cell act" data-bg="notify"><span class="grow">' + t('bg.notify') + '</span><span class="val">' + (s && s.notify ? '✓' : '') + '</span></button>' +
  '<button class="cell act" data-bg="settings"><span class="grow">' + t('bg.settings') + '</span></button></div>' +
  '<p class="ftr">' + t('bg.hint') + '</p>';
export function bindBg(el, after = () => {}) {
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-bg]');
    if (!b) return;
    const k = b.dataset.bg;
    log('bg', 'разрешение: ' + k);
    if (bgAsk[k]) bgAsk[k]();
    after(k);
  });
}
