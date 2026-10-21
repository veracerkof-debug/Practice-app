// Управление звуком вне приложения (Android, плагин PlayerPlugin.java):
//   • шторка уведомлений — в уведомлении «Melete» (KeepAliveService) кнопки «Пауза / Продолжить», «Тише», «Громче»;
//   • плавающая кнопка поверх других приложений (FloatService) — пауза и каждый звучащий источник: громкость и вкл/выкл;
//   • всплывающее окно — режим «картинка в картинке»: пока открыт инструмент и что-то звучит, при выходе на рабочий стол
//     окно приложения становится маленьким, его можно двигать и менять размер.
// Каждое — переключателем в «Модулях и функциях → Работа в фоне» (settings.bgCtl: notify, float, pip; по умолчанию вкл).
// Пауза — заморозка общего звукового контекста (метроном, пэды, инструменты и медиа замирают и продолжают с того же места).
import { Capacitor, registerPlugin } from '@capacitor/core';
import { t } from '../i18n/index.js';
import { BUSES, mixKey, MIX_MAX } from '../audio/mixer.js';
import { peekContext, hold, isHeld } from '../audio/context.js';
import { log } from './log.js';

const P = Capacitor.isNativePlatform() ? registerPlugin('Player') : null;
export const playerAvailable = () => !!P;
export const BGCTL_DEF = { notify: true, float: true, pip: true };
export const bgCtl = (st) => ({ ...BGCTL_DEF, ...(st.bgCtl || {}) });
export const canOverlay = () => (P ? P.canOverlay().then((r) => !!(r && r.ok)).catch(() => false) : Promise.resolve(false));
export const askOverlay = () => P && P.askOverlay().catch(() => {});

export function initPlayer(app) {
  if (!P) return;
  const mixer = app.audio.mixer, seen = new Map(); // шина → когда звучала (выключенные остаются в списке ещё минуту)
  let sig = '';
  const raw = (k) => { const v = mixer.state[k]; return v == null ? 1 : v; };

  function sources(now = Date.now()) {
    BUSES.forEach((b) => { if (mixer.isActive(b)) seen.set(b, now); });
    return BUSES.filter((b) => seen.has(b) && now - seen.get(b) < 60000).map((b) => {
      const k = mixKey(b);
      return { id: b, name: t('mix.' + (b === 'media' ? 'media' : b)), vol: raw(k), on: !(mixer.state.mute || {})[k] };
    });
  }
  // пауза — заморозка контекста с удержанием (context.js: hold): касание экрана и его включение её не снимают;
  // «играть» в приложении снимает (release в модулях) — тогда и кнопка в шторке снова «Пауза»
  const pause = (on) => {
    if (!peekContext()) return;
    hold(on);
    log('player', on ? 'пауза из шторки' : 'продолжить из шторки');
  };
  const nudge = (d) => sources().filter((s) => s.on).forEach((s) => mixer.set(s.id, Math.max(0, Math.min(MIX_MAX, s.vol + d))));

  P.addListener('control', ({ action, bus, value }) => {
    if (action === 'toggle') pause(!isHeld());
    else if (action === 'down') nudge(-0.1);
    else if (action === 'up') nudge(0.1);
    else if (action === 'vol' && BUSES.includes(bus)) mixer.set(bus, Math.max(0, Math.min(MIX_MAX, +value)));
    else if (action === 'on' && BUSES.includes(bus)) { const k = mixKey(bus), mu = !!(mixer.state.mute || {})[k]; if (mu === !!+value) mixer.toggleMute(bus); }
    sync(true);
  });
  // всплывающее окно открылось или закрылось — компактный вид (без вкладок и шапок)
  P.addListener('pip', ({ on }) => { document.documentElement.classList.toggle('pip', !!on); log('player', on ? 'всплывающее окно' : 'полный экран'); });

  function sync(force = false) {
    const c = bgCtl(app.store.state.settings), list = sources();
    const tool = !!document.querySelector('.tview, .session');
    const state = {
      playing: !isHeld(), sounding: list.length > 0, sources: list,
      labels: { pause: t('pl.pause'), play: t('pl.play'), down: t('pl.down'), up: t('pl.up'), open: t('pl.open'), title: t('pl.title'), none: t('pl.none') },
    };
    const msg = { state: JSON.stringify(state), notify: c.notify, float: c.float, pip: c.pip && tool && list.length > 0, aspect: Math.max(0.45, Math.min(2.3, innerWidth / innerHeight)) };
    const s = JSON.stringify(msg);
    if (!force && s === sig) return;
    sig = s;
    P.update(msg).catch(() => {});
  }
  setInterval(sync, 1000);
  document.addEventListener('visibilitychange', () => sync(true));
  app.player = { sync, get paused() { return isHeld(); }, pause };
}
