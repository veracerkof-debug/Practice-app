// Дополнительное оформление: доступ. Без DOM.
import { sha256 } from './integrity.js';

const S = 'μ·ε·λ';
// p — постоянный (создатель), b — постоянный для бета-тестеров (без обращения «создатель»), t — на 5 минут;
// m, r — постоянные личные (бета-тестеры с обращением по имени: Михаил, Парисо);
// x — проверка создателем: всё как у создателя, плюс правка любых чисел долгим нажатием; данные — во временной копии
const K = { t: '7b95e2f4ff954149dad4a4cf', p: '5872fc266cf4d107f1ab62d0', b: 'e997013b5b6300d8f64ea7f5', m: 'af9fa859f5aeee8108c39af6', r: '6a5fb374f2b9d81b79473d59', x: '8be07595427b6b67f900bc75' };
const PERSONAL = ['m', 'r'];
export const codeHash = (code) => sha256(S + String(code)).slice(0, 24);
export const EXT_TEMP_MS = 5 * 60000;

// Отметка доступа — своя для профиля (перенос в чужой профиль не работает) и для вида доступа
const mark = (st, kind = 'p') => sha256(S + kind + ((st.profile && st.profile.createdAt) || 0)).slice(0, 16);

// Доступно ли сейчас
export const extOn = (st, now = Date.now()) => ['p', 'b', ...PERSONAL].some((k) => st.vx === mark(st, k)) || (+st.vy > now && +st.vy - now <= EXT_TEMP_MS);

// Постоянный доступ — у создателя: «Минимал» обращается к нему по роли (временный доступ — пробный, без обращения)
export const extOwner = (st) => st.vx === mark(st);

// Кому обращение: 'p' — создатель, 'm' — Михаил, 'r' — Парисо, иначе null
export const extWho = (st) => (st.vx === mark(st) ? 'p' : PERSONAL.find((k) => st.vx === mark(st, k)) || null);

// Вид кода без изменений: 'p', 'b', 'm', 'r', 't', 'x' или null
export function extKind(code, keys = K) {
  const h = codeHash(code);
  return Object.keys(keys).find((k) => keys[k] === h) || null;
}

// Проверка создателем включена
export const extTest = (st) => !!st.vt && st.vt === mark(st, 'x');

// Код: 'p' — насовсем (создатель), 'b' — насовсем (бета-тестер), 'm'/'r' — насовсем, с обращением по имени, 't' — на время, null — нет.
// keys — для тестов: проверка механизма на выдуманных кодах (настоящие коды в репозиторий не пишутся)
export function extTry(st, code, now = Date.now(), keys = K) {
  const h = codeHash(code);
  if (h === keys.p) { st.vx = mark(st); delete st.vy; return 'p'; }
  if (h === keys.b) { if (st.vx !== mark(st)) st.vx = mark(st, 'b'); delete st.vy; return 'b'; }
  const k = PERSONAL.find((x) => keys[x] && h === keys[x]);
  if (k) { if (st.vx !== mark(st)) st.vx = mark(st, k); delete st.vy; return k; }
  if (h === keys.t) { st.vy = now + EXT_TEMP_MS; return 't'; }
  if (keys.x && h === keys.x) { st.vx = mark(st); st.vt = mark(st, 'x'); delete st.vy; return 'x'; }
  return null;
}

// Доступ закончился — вернуть обычное. true — что-то поменялось (а lang — нужен ли перезапуск строк)
export function extCheck(st, now = Date.now()) {
  if (extOn(st, now)) return { changed: false };
  const lang = st.uiStyle === 'mono' && st.monoLang !== false;
  if (st.vy) delete st.vy;
  if (st.uiStyle !== 'mono') return { changed: false };
  st.uiStyle = 'default';
  return { changed: true, lang };
}
