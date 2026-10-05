// Реестр встроенных модулей. Контракт — MODULE_SPEC.md.
// id совпадают с прототипом (metro, tuner, timer, audio, piano, drone, theory, ear, notes),
// чтобы сохранённые раскладки окон и настройки переносились без миграции.
import metro from './metro/index.js';
import tuner from './tuner/index.js';
import piano from './piano/index.js';
import drone from './drone/index.js';
import theory from './theory/index.js';
import timer from './timer/index.js';
import ear from './ear/index.js';
import audio from './audio/index.js';
import notes from './notes/index.js';

// Порядок — как на экране «Инструменты» прототипа
export const modules = [metro, tuner, piano, drone, theory, ear, timer, audio, notes];
export const moduleById = (id) => modules.find((m) => m.id === id);
