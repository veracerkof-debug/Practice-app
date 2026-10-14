// Полный экран инструмента (глайдер, терменвокс, пианино — manifest.pure): весь экран — рабочая поверхность,
// ни кнопок, ни полос. Android — системные панели скрыты (GuardPlugin.immersive, появляются жестом от края),
// браузер — Fullscreen API. Выход — «Назад» (жест или кнопка), Esc, выход браузера из полного экрана.
import { Capacitor, registerPlugin } from '@capacitor/core';

const G = Capacitor.isNativePlatform() ? registerPlugin('Guard') : null;

export function pureEnter(onExit) {
  const de = document.documentElement;
  if (G) G.immersive({ on: true }).catch(() => {});
  else if (de.requestFullscreen) {
    de.requestFullscreen({ navigationUI: 'hide' }).then(() => {
      const off = () => { if (!document.fullscreenElement) { document.removeEventListener('fullscreenchange', off); onExit(); } };
      document.addEventListener('fullscreenchange', off);
    }).catch(() => {});
  }
}

export function pureLeave() {
  if (G) G.immersive({ on: false }).catch(() => {});
  else if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
}
