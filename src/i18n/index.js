// Строки интерфейса только через t('key'). Языки: ru (основной), uz (латиница), en.
import ru from './ru.json';
import uz from './uz.json';
import en from './en.json';

const dicts = { ru, uz, en };
const LANGS = Object.keys(dicts);
let lang = 'ru';

export function initI18n(preferred) {
  const sys = (navigator.language || 'ru').slice(0, 2);
  lang = [preferred, sys].find((l) => LANGS.includes(l)) || 'ru';
  document.documentElement.lang = lang;
  return lang;
}

export function getLang() {
  return lang;
}

export function t(key) {
  return dicts[lang][key] ?? dicts.ru[key] ?? key;
}
