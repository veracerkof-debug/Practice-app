// Экран «Инструменты»: карточки модулей и окно отдельного инструмента (время идёт в статистику).
// Перенесено из legacy/practice.html (toolsHTML, openToolView).
import '../../ui/screens.css';
import { t } from '../../i18n/index.js';
import { ui, esc, icons } from '../../ui/index.js';
import { isOn } from '../settings.js';
import { mountModule, makeCtx, moduleName, trackToolTime, fmtDur } from '../modules.js';
import { modules, moduleById } from '../../modules/index.js';
import { topbar } from './common.js';
import { showHelp } from '../help.js';
import { recButtonHTML, bindRec } from './rec.js';
import { canRecord } from '../recorder.js';
import { pureEnter, pureLeave } from '../pure.js';

export function renderTools(app, root) {
  const list = modules.filter((m) => !m.tab && isOn(app.store.state.settings, m.id)); // Библия — своя вкладка
  root.innerHTML = topbar() + '<div class="large">' + t('tools.title') + '</div><div class="tgrid">' + list.map((m) => {
    let st = '';
    try { st = m.status ? m.status(makeCtx(app, m)) : ''; } catch { /* статус необязателен */ }
    return '<button class="tcard2" data-open-tool="' + m.id + '" style="--c:' + m.color + ';--on:' + (m.on || '#fff') + '"><span class="tci2">' + m.icon + '</span><span class="tcb"><span class="tcn2">' +
      esc(moduleName(m)) + '</span><span class="tcs2">' + esc(st) + '</span></span></button>';
  }).join('') + '</div>';
  root.onclick = (e) => {
    const b = e.target.closest('[data-open-tool]');
    if (b) openToolView(app, b.dataset.openTool, () => renderTools(app, root));
  };
}

const EXPAND = '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';

export function openToolView(app, id, onClose) {
  const mod = moduleById(id), name = moduleName(mod);
  // полный экран (manifest.pure): кнопка — рядом с «?», выход — «Назад», Esc
  const pureBtn = mod.pure ? ui.icb('data-tv="pure"', EXPAND, t('tools.pure'), 'sm' + (mod.immersive ? ' tvpure' : '')) : '';
  const layer = document.createElement('div');
  // запись — во всех инструментах (звук приложения, по желанию микрофон; у терменвокса — и видео)
  const rec = canRecord() && mod.record !== false;
  // immersive — модуль на весь экран без шапки: кнопка «назад» плавает поверх (глайдер)
  layer.innerHTML = mod.immersive
    ? '<div class="tview imm" role="dialog" aria-modal="true" aria-label="' + esc(name) + '">' + ui.icb('data-tv="close"', icons.back, t('ui.back'), 'sm tvback') +
      ui.icb('data-tv="help"', icons.help, t('help.open'), 'sm tvhelp') + pureBtn + (rec ? recButtonHTML('tvrecf') : '') +
      '<div class="tvbody"><div class="toolhost tvhost"></div></div></div>'
    : '<div class="tview" role="dialog" aria-modal="true" aria-label="' + esc(name) + '"><div class="tvhd">' +
      ui.icb('data-tv="close"', icons.back, t('ui.back'), 'sm') + '<div class="stitle2">' + esc(name) + '</div>' + (rec ? recButtonHTML() : '') + pureBtn + ui.icb('data-tv="help"', icons.help, t('help.open'), 'sm') + '</div>' +
      '<div class="tvbody"><div class="toolhost tvhost"></div></div></div>';
  document.body.appendChild(layer);
  const inst = mountModule(app, mod, layer.querySelector('.tvhost'), 'full');
  const recOff = rec ? bindRec(app, layer, mod, layer.querySelector('.tvhost'), name) : () => {};
  // Поворот всего окна с надписями (пианино: телефон держат горизонтально); сторону задаёт модуль
  const rotCheck = () => {
    const tv = layer.querySelector('.tview');
    if (!tv) return;
    const dir = mod.rotate ? mod.rotate(inst.ctx) : null;
    tv.classList.toggle('rot', !!dir);
    tv.classList.toggle('rotl', dir === 'l');
    tv.style.width = dir ? innerHeight + 'px' : '';
    tv.style.height = dir ? innerWidth + 'px' : '';
  };
  const onRot = () => requestAnimationFrame(rotCheck);
  if (mod.rotate) { addEventListener('melete:rot', onRot); addEventListener('resize', onRot); rotCheck(); }
  // Рабочие инструменты (stats: false, например шумомер) в статистику не пишут
  const track = mod.stats === false ? { stop: () => 0 } : trackToolTime(app, id);

  // Полный экран: окно без шапки и кнопок, модуль убирает свои (класс .pure у окна), размер — заново
  let pure = false;
  const setPure = (on) => {
    const tv = layer.querySelector('.tview');
    if (!tv || pure === on) return;
    pure = on;
    tv.classList.toggle('pure', on);
    if (on) { pureEnter(() => setPure(false)); ui.toast(t('tools.pureHint')); } else pureLeave();
    if (mod.onPure) { try { mod.onPure(on, inst.ctx); } catch { /* модуль перерисуется по размеру */ } }
    requestAnimationFrame(rotCheck);
  };
  layer.pureExit = () => (pure ? (setPure(false), true) : false);

  const close = (next) => {
    if (pure) setPure(false);
    app.openTool = null;
    document.removeEventListener('keydown', onKey);
    recOff(); // идёт запись — сохраняется до того, как модуль отключит камеру и звук
    removeEventListener('melete:rot', onRot); removeEventListener('resize', onRot);
    inst.unmount();
    ui.leave(layer.firstElementChild || layer, 260);
    setTimeout(() => layer.remove(), 280);
    const sec = track.stop();
    if (sec) ui.toast(t('tools.recorded', { tool: name, dur: fmtDur(sec) }));
    if (next) openToolView(app, next, onClose);
    else if (onClose) onClose();
  };
  // Переход из модуля в другой инструмент: это окно закрывается, открывается новое
  app.openTool = (id) => { if (moduleById(id)) close(id); };
  const onKey = (e) => { if (e.key === 'Escape' && !document.querySelector('#sheetLayer .scrim')) { if (pure) setPure(false); else close(); } };
  document.addEventListener('keydown', onKey);
  layer.addEventListener('click', (e) => {
    if (e.target.closest('[data-tv="close"]')) close();
    else if (e.target.closest('[data-tv="help"]')) showHelp(app, mod);
    else if (e.target.closest('[data-tv="pure"]')) setPure(true);
  });
  return close;
}
