// Экран «Инструменты»: карточки модулей и окно отдельного инструмента (время идёт в статистику).
// Перенесено из legacy/practice.html (toolsHTML, openToolView). Переключатель размера окна — временный,
// для проверки модулей до переноса рабочего пространства сессии.
import '../../ui/screens.css';
import { t } from '../../i18n/index.js';
import { ui, esc, icons } from '../../ui/index.js';
import { isOn } from '../settings.js';
import { mountModule, makeCtx, moduleName, trackToolTime, SIZES, fmtDur } from '../modules.js';
import { modules, moduleById } from '../../modules/index.js';

export function renderTools(app, root) {
  const list = modules.filter((m) => isOn(app.store.state.settings, m.id));
  root.innerHTML = '<div class="large">' + t('tools.title') + '</div><div class="tgrid">' + list.map((m) => {
    let st = '';
    try { st = m.status ? m.status(makeCtx(app, m)) : ''; } catch { /* статус необязателен */ }
    return '<button class="tcard2" data-open-tool="' + m.id + '" style="--c:' + m.color + '"><span class="tci2">' + m.icon + '</span><span class="tcb"><span class="tcn2">' +
      esc(moduleName(m)) + '</span><span class="tcs2">' + esc(st) + '</span></span></button>';
  }).join('') + '</div>';
  root.onclick = (e) => {
    const b = e.target.closest('[data-open-tool]');
    if (b) openToolView(app, b.dataset.openTool, () => renderTools(app, root));
  };
}

export function openToolView(app, id, onClose) {
  const mod = moduleById(id), name = moduleName(mod);
  let size = 'full';
  const layer = document.createElement('div');
  layer.innerHTML = '<div class="tview" role="dialog" aria-modal="true" aria-label="' + esc(name) + '"><div class="tvhd">' +
    ui.icb('data-tv="close"', icons.back, t('ui.back'), 'sm') + '<div class="stitle2">' + esc(name) + '</div><span style="width:36px"></span></div>' +
    '<div class="tvsize">' + ui.seg('size', SIZES.filter((s) => mod.sizes.includes(s)).map((s) => [s, t('size.' + s)]), size, t('tools.size')) + '</div>' +
    '<div class="tvbody" data-size="full"><div class="toolhost tvhost"></div></div></div>';
  document.body.appendChild(layer);
  const hostEl = layer.querySelector('.tvhost'), body = layer.querySelector('.tvbody');
  const inst = mountModule(app, mod, hostEl, size);
  const track = trackToolTime(app, id);

  const close = () => {
    document.removeEventListener('keydown', onKey);
    inst.unmount();
    layer.remove();
    const sec = track.stop();
    if (sec) ui.toast(t('tools.recorded', { tool: name, dur: fmtDur(sec) }));
    if (onClose) onClose();
  };
  const onKey = (e) => { if (e.key === 'Escape' && !document.querySelector('#sheetLayer .scrim')) close(); };
  document.addEventListener('keydown', onKey);
  layer.addEventListener('click', (e) => {
    if (e.target.closest('[data-tv="close"]')) { close(); return; }
    const sb = e.target.closest('[data-seg="size"] [data-v]');
    if (sb) {
      size = sb.dataset.v;
      body.dataset.size = size;
      layer.querySelectorAll('[data-seg="size"] button').forEach((x) => x.setAttribute('aria-pressed', x === sb));
      inst.resize(size);
    }
  });
  return close;
}
