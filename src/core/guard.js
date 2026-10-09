// Защита игры от системных жестов. На многих телефонах касание тремя пальцами (или проведение ими) — снимок экрана,
// а на пианино, пэдах и барабанах так берут аккорды. Пока открыт инструмент, окно приложения помечается
// защищённым (android: GuardPlugin, FLAG_SECURE): снимок не делается. Выключается в «Функциях».
// В браузере — только то, что можно на странице: без меню по долгому касанию и без масштабирования двойным касанием.
import { Capacitor, registerPlugin } from '@capacitor/core';

const G = Capacitor.isNativePlatform() ? registerPlugin('Guard') : null;
export const guardAvailable = () => !!G;
const enabled = (st) => st.guardShots !== false;

let open = 0, cur = false, app = null;
function sync() {
  const want = !!app && open > 0 && enabled(app.store.state.settings);
  if (want === cur || !G) return;
  cur = want;
  G.secure({ on: want }).catch(() => {});
}

export function initGuard(a) {
  app = a;
  // долгое касание не открывает меню (кроме полей ввода)
  document.addEventListener('contextmenu', (e) => { if (!e.target.closest('input, textarea, [contenteditable="true"]')) e.preventDefault(); });
  // несколько пальцев на инструменте — не масштабирование и не прокрутка страницы
  document.addEventListener('touchmove', (e) => { if (e.touches.length > 1 && e.target.closest('.pane')) e.preventDefault(); }, { passive: false });
  app.store.subscribe(sync); // переключатель в «Функциях»
}

// Инструмент открыт / закрыт (modules.js: mountModule)
export function guardOpen() { open++; sync(); }
export function guardClose() { open = Math.max(0, open - 1); sync(); }
export const guardRefresh = sync;
