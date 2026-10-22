import './styles/tokens.css';
import './styles/base.css';
// Стили сессии — до стилей модулей, как в прототипе: правила окон модулей уточняют общие правила сессии
import './ui/session.css';
import { boot } from './core/index.js';
import { installDesk } from './ui/desk.js';
import './styles/desk.css';
// Движение (переходы, отклик) — после стилей экранов, чтобы перекрыть их старые анимации
import './styles/motion.css';
// «Минимал» (эксперимент) — последним: перекрывает обычные стили только при data-style="mono"
import './styles/mono.css';

installDesk(); // режим компьютера (html.desk) — до первой отрисовки
boot(document.getElementById('app'));
