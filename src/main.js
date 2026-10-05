import './styles/tokens.css';
import './styles/base.css';
// Стили сессии — до стилей модулей, как в прототипе: правила окон модулей уточняют общие правила сессии
import './ui/session.css';
import { boot } from './core/index.js';

boot(document.getElementById('app'));
