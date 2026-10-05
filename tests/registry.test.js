import { describe, it, expect } from 'vitest';
import { visibleTabs, hiddenTabs, editTabs, DEFAULT_TABS } from '../src/core/settings.js';

globalThis.document ??= { documentElement: {}, addEventListener() {}, createElement: () => ({ style: {} }) };
globalThis.navigator ??= { language: 'ru' };
const { modules, skippedModules, validate } = await import('../src/modules/index.js');
const template = (await import('../docs/module-template/index.js')).default;

describe('реестр модулей', () => {
  it('встроенные модули подключены по порядку, без ошибок', () => {
    expect(skippedModules).toEqual([]);
    expect(modules.map((m) => m.id)).toEqual(['metro', 'tuner', 'piano', 'drone', 'theory', 'ear', 'timer', 'audio', 'notes']);
    modules.forEach((m) => expect(m.i18n.ru.about, m.id).toBeTruthy());
  });
  it('шаблон модуля проходит проверку контракта', () => {
    expect(validate(template)).toBe(null);
  });
  it('ошибки в описании модуля находятся', () => {
    const ok = { ...template };
    expect(validate(null)).toMatch(/default export/);
    expect(validate({ ...ok, id: 'Мой' })).toMatch(/latin/);
    expect(validate({ ...ok, mount: null })).toMatch(/mount/);
    expect(validate({ ...ok, name: {} })).toMatch(/name/);
  });
});

describe('вкладки', () => {
  const KNOWN = ['home', 'library', 'tools', 'calendar'];
  const mk = (st = {}) => ({ state: { settings: st }, settingsChanged() {} });
  it('по умолчанию — все; новая вкладка появляется в конце, убранная не возвращается', () => {
    expect(visibleTabs({}, DEFAULT_TABS)).toEqual(DEFAULT_TABS);
    expect(visibleTabs({}, KNOWN)).toEqual(KNOWN);
    expect(visibleTabs({ tabs: ['tools', 'home'], tabsOff: ['library'] }, KNOWN)).toEqual(['tools', 'home', 'calendar']);
    expect(hiddenTabs({ tabs: ['tools', 'home'], tabsOff: ['library'] }, KNOWN)).toEqual(['library']);
  });
  it('переставить, убрать, вернуть; последнюю не убрать', () => {
    const s = mk();
    expect(editTabs(s, DEFAULT_TABS, 'tools', 'up')).toBe(true);
    expect(visibleTabs(s.state.settings, DEFAULT_TABS)).toEqual(['home', 'tools', 'library']);
    editTabs(s, DEFAULT_TABS, 'home', 'off');
    editTabs(s, DEFAULT_TABS, 'library', 'off');
    expect(editTabs(s, DEFAULT_TABS, 'tools', 'off')).toBe(false);
    expect(visibleTabs(s.state.settings, DEFAULT_TABS)).toEqual(['tools']);
    editTabs(s, DEFAULT_TABS, 'home', 'on');
    expect(visibleTabs(s.state.settings, DEFAULT_TABS)).toEqual(['tools', 'home']);
    expect(visibleTabs({ tabs: ['x'], tabsOff: DEFAULT_TABS }, DEFAULT_TABS)).toEqual(['home']);
  });
});
