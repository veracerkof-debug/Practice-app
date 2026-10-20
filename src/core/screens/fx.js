// Шторка эффектов шины микшера: общая панель эффектов (src/ui/fxpanel.js) на шине. Открывается из шторки микшера
// (кнопка над ползунком или удержание значка источника). Настройки хранятся в device.mix.fx по шине
import { t } from '../../i18n/index.js';
import { snav, sheet } from '../../ui/index.js';
import { createFxPanel } from '../../ui/fxpanel.js';
export { defaultFxMode, fmtFreq } from '../../ui/fxpanel.js';

export function openFx(app, bus) {
  const mixer = app.audio.mixer;
  const panel = createFxPanel({ get: () => mixer.fx(bus), set: (fx) => mixer.setFx(bus, fx), profile: app.store.state.settings.profile });
  return sheet(() => snav(t('fx.title', { src: t('mix.' + bus) })) + panel.html(), (el, api) => panel.bind(el, api));
}
