// Режим компьютера: широкое окно и мышь (или приложение для Windows) — html.desk. По нему вёрстка становится настольной:
// навигация слева, содержимое на всю ширину в несколько колонок, окна сессии рядом, подписи клавиш для игры с клавиатуры.
// Телефон и планшет пальцем — как были. Смена размера окна переключает на лету (событие 'melete:desk' на window).
const DESK_W = 1024;
const tauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
export function deskNow(w = typeof window !== 'undefined' ? window.innerWidth : 0) {
  if (typeof window === 'undefined') return false;
  const fine = !!(window.matchMedia && window.matchMedia('(pointer: fine)').matches);
  return w >= DESK_W && (fine || tauri());
}
let on = false;
export const isDesk = () => on;
export function installDesk() {
  if (typeof document === 'undefined') return;
  const apply = () => {
    const v = deskNow();
    if (v === on && document.documentElement.classList.contains('desk') === v) return;
    on = v;
    document.documentElement.classList.toggle('desk', v);
    window.dispatchEvent(new CustomEvent('melete:desk', { detail: v }));
  };
  apply();
  let tm = 0;
  window.addEventListener('resize', () => { clearTimeout(tm); tm = setTimeout(apply, 120); });
}
