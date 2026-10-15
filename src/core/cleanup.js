// Коды доступа и проверка создателем убраны (решение автора, 2026-10): «Минимал» доступен всем, тестерских функций
// нет. Один раз при запуске (до чтения данных): если на устройстве шла проверка создателем — настоящие данные
// возвращаются из копии в точности как были; следы кодов из настроек убираются. Без DOM.
const SNAP = 'practice.sandbox';
const TEST_KEYS = ['practice.sandbox.edits', 'practice.sandbox.hours'];

// → { restored } — true, если данные вернулись из копии (тогда файлы демо-набора, добавленные проверкой, убрать)
export function dropTestMode(ls = globalThis.localStorage) {
  if (!ls) return { restored: false };
  let restored = false;
  try {
    const snap = ls.getItem(SNAP);
    if (snap) {
      const data = JSON.parse(snap) || {};
      const keys = [];
      for (let i = 0; i < ls.length; i++) keys.push(ls.key(i));
      keys.filter((k) => k && k.startsWith('practice.') && k !== SNAP && !TEST_KEYS.includes(k) && !(k in data)).forEach((k) => ls.removeItem(k));
      Object.entries(data).forEach(([k, v]) => ls.setItem(k, v));
      restored = true;
    }
    [SNAP, ...TEST_KEYS].forEach((k) => ls.removeItem(k));
    // отметки доступа в настройках
    const main = ls.getItem('practice.v1');
    if (main) {
      const st = JSON.parse(main), s = st.settings || {};
      if ('vx' in s || 'vy' in s || 'vt' in s) { delete s.vx; delete s.vy; delete s.vt; ls.setItem('practice.v1', JSON.stringify(st)); }
    }
  } catch { /* хранилище недоступно — ничего не делаем */ }
  return { restored };
}
