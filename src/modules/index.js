// Реестр встроенных модулей. Контракт — MODULE_SPEC.md.
// id совпадают с прототипом (metro, tuner, timer, audio, piano, drone, theory, ear, tabs, text),
// чтобы сохранённые раскладки окон и настройки переносились без миграции.
import metro from './metro/index.js';
import tuner from './tuner/index.js';
import piano from './piano/index.js';
import drone from './drone/index.js';

// Порядок — как на экране «Инструменты» прототипа
export const modules = [metro, tuner, piano, drone];
export const moduleById = (id) => modules.find((m) => m.id === id);
