// Форматирование времени для интерфейса
import { t, tn } from '../i18n/index.js';

// 3725 → «1 ч 2 мин», 30 → «<1 мин»
export function fmtDur(sec) {
  sec = Math.round(sec || 0);
  const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
  if (h && m === 60) return t('time.h', { n: h + 1 });
  if (h) return m ? t('time.hm', { h, m }) : t('time.h', { n: h });
  if (sec < 60 && sec > 0) return t('time.lt1m');
  return t('time.m', { n: m });
}

export const pad2 = (n) => String(n).padStart(2, '0');

export function fmtClock(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? h + ':' + pad2(m) + ':' + pad2(s) : pad2(m) + ':' + pad2(s);
}

export { tn };
