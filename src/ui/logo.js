// Логотип — само название по-гречески: Μελέτη («упражнение, усердное занятие»), шрифт GFS Didot (OFL).
// Нажатие открывает справку о названии (src/core/screens/home.js — nameSheet).
import '@fontsource/gfs-didot/greek-400.css';
import { t } from '../i18n/index.js';
import { esc } from './index.js';

export const NAME_GR = 'Μελέτη';
export const NAME_LAT = 'Melete';

export const logoHTML = (cls = '') => '<button class="logo' + (cls ? ' ' + cls : '') + '" data-act="name" aria-label="' + esc(t('name.aria')) + '"><span lang="el">' + NAME_GR + '</span></button>';
