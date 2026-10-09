// Сигналы метронома, кроме звука: вспышка экрана, фонарик и вибрация в такт. Работают, где бы ни было открыто окно
// метронома (и в сессии, и при свёрнутом окне), пока метроном играет. Настройки — на устройстве: device.metro.sig.
// Фонарик и вибрация на Android — свой плагин Pulse (без сторонних библиотек); в браузере — только вибрация,
// если она есть (navigator.vibrate).
import { Capacitor, registerPlugin } from '@capacitor/core';

const Pulse = Capacitor.isNativePlatform() ? registerPlugin('Pulse') : null;

// Основные цвета вспышки
export const FLASH_COLORS = ['#FFFFFF', '#A75750', '#9C7242', '#AE934D', '#5F8568', '#567198', '#866B9D'];
export const SIG_DEF = { flash: false, strong: '#A75750', other: '#FFFFFF', torch: false, vibe: false };

export const sigOf = (device) => ({ ...SIG_DEF, ...((device.metro ??= {}).sig || {}) });

// Короткий отклик вибрацией вне метронома (на Android — плагин Pulse: navigator.vibrate в WebView часто молчит)
export function buzz(ms = 45, amp = 200) {
  if (Pulse) Pulse.vibrate({ ms, amp }).catch(() => {});
  else try { if (navigator.vibrate) navigator.vibrate(ms); } catch { /* нет вибрации */ }
}

// Вибрация: сильная доля — длиннее и сильнее
export const vibeFor = (level) => (level >= 3 ? { ms: 70, amp: 255 } : level === 2 ? { ms: 50, amp: 190 } : { ms: 35, amp: 120 });

export function createPulse(app) {
  const metro = app.audio.metro;
  let el = null, caps = null;
  // Что умеет устройство: { vibrate, torch }
  const info = async () => {
    if (caps) return caps;
    if (Pulse) { try { caps = await Pulse.info(); } catch { caps = { vibrate: false, torch: false }; } }
    else caps = { vibrate: typeof navigator !== 'undefined' && 'vibrate' in navigator, torch: false };
    return caps;
  };
  info();

  const flash = (color) => {
    if (document.visibilityState !== 'visible') return;
    if (!el) {
      el = document.createElement('div');
      el.className = 'mflash';
      el.setAttribute('aria-hidden', 'true');
      document.body.appendChild(el);
    }
    el.style.background = color;
    el.classList.remove('on');
    void el.offsetWidth;
    el.classList.add('on');
  };
  const vibe = (level) => {
    const v = vibeFor(level);
    if (Pulse) Pulse.vibrate(v).catch(() => {});
    else if (navigator.vibrate) navigator.vibrate(v.ms);
  };
  const torch = (level) => {
    if (!Pulse) return;
    Pulse.torch({ on: true }).catch(() => {});
    setTimeout(() => Pulse.torch({ on: false }).catch(() => {}), level >= 3 ? 90 : 60);
  };

  metro.onBeat(({ level, ms }) => {
    const s = sigOf(app.device);
    if (!s.flash && !s.torch && !s.vibe) return;
    // моторчик и фонарик отзываются чуть медленнее экрана — запускаем на 25 мс раньше
    if (s.flash) setTimeout(() => flash(level >= 3 ? s.strong : s.other), Math.max(0, ms));
    if (s.vibe) setTimeout(() => vibe(level), Math.max(0, ms - 25));
    if (s.torch) setTimeout(() => torch(level), Math.max(0, ms - 25));
  });

  return { info, sig: () => sigOf(app.device) };
}
