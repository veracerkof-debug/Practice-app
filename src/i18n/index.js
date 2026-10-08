// Строки интерфейса только через t('key'). Языки: ru (основной), uz (латиница), en.
// el — язык вида «Минимал»: названия (вкладки, инструменты, разделы) — слова Септуагинты и Нового Завета,
// политоникой; всё остальное — по-русски (чего нет в el, берётся из ru). В обычный список языков не входит.
import ru from './ru.json';
import uz from './uz.json';
import en from './en.json';
import el from './el.json';

const dicts = { ru, uz, en, el };
export const LANGS = ['ru', 'uz', 'en'];
export const MONO_LANG = 'el';
// Название языка на нём самом
export const LANG_NAMES = { ru: 'Русский', uz: 'Oʻzbekcha', en: 'English' };
let lang = 'ru';

export function initI18n(preferred) {
  const sys = (navigator.language || 'ru').slice(0, 2);
  lang = [preferred, sys].find((l) => LANGS.includes(l) || l === MONO_LANG) || 'ru';
  document.documentElement.lang = lang;
  return lang;
}

export function getLang() {
  return lang;
}

// {name} в строке заменяется значением из vars
const fill = (s, vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m)) : s);

// Словарь с запасным русским
export function makeT(byLang) {
  return (key, vars) => {
    const v = byLang[lang]?.[key] ?? byLang.ru?.[key];
    if (v == null) return key;
    return fill(Array.isArray(v) ? v[0] : v, vars);
  };
}

// Форма слова для числа: в словаре — массив форм
// ru: [1, 2–4, 5+], en: [1, остальные], uz: одна форма
export function pluralForm(n, forms, l = lang) {
  if (!Array.isArray(forms)) return forms;
  const a = Math.abs(n);
  if (l === 'ru') {
    const m100 = a % 100, m10 = a % 10;
    return forms[m100 > 10 && m100 < 20 ? 2 : m10 > 1 && m10 < 5 ? 1 : m10 === 1 ? 0 : 2] ?? forms.at(-1);
  }
  if (l === 'en' || l === 'el') return forms[a === 1 ? 0 : 1] ?? forms.at(-1);
  return forms[0];
}

// t с числом: tn('cents', 5) → «5 центов»; vars.n подставляется в {n}
export function makeTn(byLang) {
  return (key, n, vars) => {
    const v = byLang[lang]?.[key] ?? byLang.ru?.[key];
    if (v == null) return key;
    return fill(pluralForm(n, v, byLang[lang]?.[key] != null ? lang : 'ru'), { n: fmtNum(n), ...vars });
  };
}

// Числа по правилам языка: десятичная запятая в ru и uz (данные ICU для uz в браузерах расходятся — задаём сами)
export function fmtNum(n, digits = 0) {
  const s = new Intl.NumberFormat('en', { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: false }).format(n);
  return lang === 'en' ? s : s.replace('.', ',');
}

export const t = makeT(dicts);
export const tn = makeTn(dicts);
