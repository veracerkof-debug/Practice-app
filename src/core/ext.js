// Дополнительное оформление: доступ. Без DOM.
import { sha256 } from './integrity.js';

const S = 'μ·ε·λ';
const K = { t: '7b95e2f4ff954149dad4a4cf', p: '5872fc266cf4d107f1ab62d0' };
export const EXT_TEMP_MS = 5 * 60000;

const mark = (st) => sha256(S + 'p' + ((st.profile && st.profile.createdAt) || 0)).slice(0, 16);

// Доступно ли сейчас
export const extOn = (st, now = Date.now()) => st.vx === mark(st) || (+st.vy > now && +st.vy - now <= EXT_TEMP_MS);

// Код: 'p' — насовсем, 't' — на время, null — нет
export function extTry(st, code, now = Date.now()) {
  const h = sha256(S + String(code)).slice(0, 24);
  if (h === K.p) { st.vx = mark(st); delete st.vy; return 'p'; }
  if (h === K.t) { st.vy = now + EXT_TEMP_MS; return 't'; }
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
