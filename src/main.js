import './styles/tokens.css';
import './styles/base.css';
import { initI18n } from './i18n/index.js';
import { boot } from './core/index.js';

initI18n();
boot(document.getElementById('app'));
