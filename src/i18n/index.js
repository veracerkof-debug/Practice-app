// Строки интерфейса только через t('key'). Языки: ru (основной), uz (латиница), en.
// el — язык вида «Минимал»: названия (вкладки, инструменты, разделы) — слова Септуагинты и Нового Завета,
// политоникой; всё остальное — по-русски (чего нет в el, берётся из ru). В обычный список языков не входит.
import ru from './ru.json';
import uz from './uz.json';
import en from './en.json';

const dicts = { ru, uz, en };
export const CORE_DICTS = dicts;
export const LANGS = ['ru', 'uz', 'en'];
// Название языка на нём самом
export const LANG_NAMES = { ru: 'Русский', uz: 'Oʻzbekcha', en: 'English' };
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

// «Минимал» без текста (settings.monoBare): на рабочих экранах (главная, вкладки, инструменты, сессия) строки интерфейса
// теряют слова — остаются цифры и знаки (12:30, 5, ♯, %); значения в {…} (названия песен, ноты) — как есть.
// Ядро — только внутри bareScope (отрисовка рабочих экранов: диалоги и настройки по нажатию — с текстом);
// инструменты — всегда, кроме шторок (настройки) — их отрисовка идёт в withText
let bareOn = false, depth = 0, keep = 0;
export const setBare = (on) => { bareOn = !!on; };
export const isBare = () => bareOn;
export function bareScope(fn) { depth++; try { return fn(); } finally { depth--; } }
export function withText(fn) { keep++; try { return fn(); } finally { keep--; } }
const stripping = (scoped) => bareOn && keep === 0 && (!scoped || depth > 0);
// Сейчас рисуется рабочий экран без слов (ядро): для списков-данных (месяцы, дни недели) — числа или ничего
export const bareNow = () => stripping(true);
// Без слов: буквы долой (кроме {подстановок}), остаток — без висячих знаков препинания
export const stripWords = (s) => s.replace(/\{\w+\}|[\p{L}\p{M}ʻʼ'’]+/gu, (m) => (m[0] === '{' ? m : ''))
  .replace(/[.,!?;«»"“”„()…]/g, '').replace(/\s+/g, ' ').replace(/^[\s:—–\-·/]+|[\s:—–\-·/]+$/g, '').trim();

// Маскот (settings.mascot): 'm' — Мелетий (по умолчанию), 'f' — Мелета, 'none' — без маскота. Строки, где он назван
// или говорит о себе, имеют варианты: «@m» — для Мелетия, «@n» — без маскота (нейтрально); обычная строка — Мелета
let gender = 'm';
export const setMascotGender = (g) => { gender = g === 'f' ? 'f' : g === 'none' ? 'none' : 'm'; };
export const mascotGender = () => gender;
export const hasMascot = () => gender !== 'none';
const pickG = (d, key) => {
  if (!d) return undefined;
  const v = gender === 'm' ? d[key + '@m'] : gender === 'none' ? d[key + '@n'] : null;
  return v != null ? v : d[key];
};

// {name} в строке заменяется значением из vars
const fill = (s, vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m)) : s);

// Словарь с запасным русским
// scoped — строки ядра (без слов только внутри bareScope); false — строки инструментов (без слов везде, кроме withText)
export function makeT(byLang, scoped = true) {
  return (key, vars) => {
    const v = pickG(byLang[lang], key) ?? pickG(byLang.ru, key);
    if (v == null) return key;
    const s = Array.isArray(v) ? v[0] : v;
    return fill(stripping(scoped) ? stripWords(s) : s, vars);
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
  if (l === 'en') return forms[a === 1 ? 0 : 1] ?? forms.at(-1);
  return forms[0];
}

// t с числом: tn('cents', 5) → «5 центов»; vars.n подставляется в {n}
export function makeTn(byLang, scoped = true) {
  return (key, n, vars) => {
    const v = pickG(byLang[lang], key) ?? pickG(byLang.ru, key);
    if (v == null) return key;
    const s = pluralForm(n, v, byLang[lang]?.[key] != null ? lang : 'ru');
    return fill(stripping(scoped) ? stripWords(s) : s, { n: fmtNum(n), ...vars });
  };
}

// Числа по правилам языка: десятичная запятая в ru и uz (данные ICU для uz в браузерах расходятся — задаём сами)
export function fmtNum(n, digits = 0) {
  const s = new Intl.NumberFormat('en', { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: false }).format(n);
  return lang === 'en' ? s : s.replace('.', ',');
}

export const t = makeT(dicts);
export const tn = makeTn(dicts);
