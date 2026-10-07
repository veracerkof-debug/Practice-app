// Анализ записи в отдельном потоке, чтобы интерфейс не замирал
import { analyze, SR } from '../music/analyze.js';

self.onmessage = (e) => self.postMessage(analyze(e.data, SR));
