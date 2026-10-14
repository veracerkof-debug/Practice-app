// Иконка приложения на выбор (settings.appIcon): Android — activity-alias (IconPlugin.java), браузер — значок вкладки.
import { Capacitor, registerPlugin } from '@capacitor/core';
import { APP_ICON_IDS, DEFAULT_ICON, appIconSVG } from '../ui/appicons.js';

const Icon = Capacitor.isNativePlatform() ? registerPlugin('Icon') : null;
// Иконка по выбранному маскоту (пока её не выбрали сами): Мелетий, Мелета, без маскота — нота
export const ICON_BY_MASCOT = { m: 'meletiy', f: 'melete', none: 'note' };
export const iconOf = (st) => (APP_ICON_IDS.includes(st && st.appIcon) ? st.appIcon : DEFAULT_ICON);


// Значок вкладки (веб) — тот же рисунок; маскоту нужны стили лица — вписываются прямо в SVG
const FACE_CSS = '<style>.ms{fill:none;stroke:currentColor;stroke-width:3.2;stroke-linecap:round;stroke-linejoin:round}.mt{fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}.md{fill:currentColor}.mbow{color:#9C7242}.mbw{stroke:currentColor;stroke-width:2;stroke-linejoin:round}</style>';
export function webIcon(id) {
  if (typeof document === 'undefined' || !document.head) return;
  const svg = appIconSVG(id, { size: 64 }).replace('aria-hidden="true">', 'aria-hidden="true">' + FACE_CSS);
  let l = document.querySelector('link[rel="icon"]');
  if (!l) { l = document.createElement('link'); l.rel = 'icon'; document.head.appendChild(l); }
  l.type = 'image/svg+xml';
  l.href = 'data:image/svg+xml,' + encodeURIComponent(svg);
}

// Сменить иконку. true — сменилась (на Android лаунчер обновит значок через несколько секунд)
export async function setAppIcon(st, id) {
  st.appIcon = APP_ICON_IDS.includes(id) ? id : DEFAULT_ICON;
  webIcon(st.appIcon);
  if (!Icon) return true;
  try { await Icon.set({ id: st.appIcon }); return true; } catch { return false; }
}
