// Каркас приложения: нижние вкладки «Практика / Песни / Инструменты», экраны, общие действия.
// Перенесено из legacy/practice.html (view, renderTabs, go, render, глобальные обработчики нажатий).
import '../../ui/screens.css';
import { t } from '../../i18n/index.js';
import { confirm } from '../../ui/index.js';
import { deleteSong } from '../library.js';
import { TAB_ICONS } from './common.js';
import { homeHTML, quickEdit, streakSheet } from './home.js';
import { libraryHTML, songHTML, songForm, libManager } from './songs.js';
import { renderTools, openToolView } from './tools.js';
import { createPanel, donateSheet, legalSheet, tosGate } from './panel.js';

const TABS = ['home', 'library', 'tools'];

export function createShell(app, root) {
  const view = { tab: 'home', song: null, q: '', genre: '', tag: '', cat: '', sort: 'recent' };
  root.innerHTML = '<main class="wrap" id="main"></main><nav class="tabbar" aria-label="' + t('nav.aria') + '"><div class="in" id="tabs"></div></nav>';
  const main = root.querySelector('#main'), tabs = root.querySelector('#tabs');

  const renderTabs = () => {
    tabs.innerHTML = TABS.map((k) => '<button class="tab" data-tab="' + k + '"' + (view.tab === k ? ' aria-current="page"' : '') + '>' + TAB_ICONS[k] + '<span>' + t('nav.' + k) + '</span></button>').join('');
  };

  function render() {
    renderTabs();
    if (view.tab === 'tools') { renderTools(app, main); return; }
    main.onclick = null;
    if (view.tab === 'library') {
      const h = view.song && songHTML(app, view.song);
      if (!h) view.song = null;
      main.innerHTML = h || libraryHTML(app, view);
    } else main.innerHTML = homeHTML(app);
  }

  function go(tab, song) {
    if (panel.page) panel.close();
    if (tab === 'settings') { panel.open('week'); return; }
    if (tab === 'stats') { panel.open('stats'); return; }
    view.tab = TABS.includes(tab) ? tab : 'home';
    view.song = song || null;
    render();
    window.scrollTo(0, 0);
  }

  const panel = createPanel(app, () => render());

  // Действия, общие для экранов и панели. Возвращает true, если нажатие обработано
  function act(e) {
    const b = e.target.closest('button,[data-song]');
    if (!b) return false;
    const d = b.dataset;
    if (d.tab) go(d.tab);
    else if (d.go) go(d.go);
    else if (d.play) app.startSession('song', d.play);
    else if (d.song) go('library', d.song);
    else if (d.edit) songForm(app, d.edit, (id) => go('library', id));
    else if (d.del) {
      const s = app.store.songById(d.del);
      confirm(t('song.delTitle', { title: s.title }), t('song.delText'), t('song.delYes')).then((ok) => { if (ok) { deleteSong(app.store, s.id); go('library'); } });
    }
    else if (d.act === 'panel') panel.open('root');
    else if (d.pp) panel.open(d.pp);
    else if (d.act === 'libman') libManager(app, render);
    else if (d.act === 'quickedit') quickEdit(app, render);
    else if (d.act === 'donate') donateSheet();
    else if (d.act === 'legal') legalSheet(d.v);
    else if (d.act === 'streak') streakSheet(app);
    else if (d.cat !== undefined) { view.cat = d.cat; view.genre = ''; view.tag = ''; render(); }
    else if (d.fg !== undefined) { view.genre = view.genre === d.fg ? '' : d.fg; render(); }
    else if (d.ft !== undefined) { view.tag = view.tag === d.ft ? '' : d.ft; render(); }
    else if (d.fclear !== undefined) { view.genre = ''; view.tag = ''; render(); }
    else if (d.openTool) openToolView(app, d.openTool, render);
    else if (d.act === 'free') app.startSession('free');
    else if (d.act === 'addSong') songForm(app, null, (id) => go('library', id));
    else return false;
    return true;
  }

  // Вкладка «Инструменты» обрабатывает свои карточки сама
  root.addEventListener('click', (e) => { if (!e.target.closest('[data-open-tool]') || view.tab !== 'tools') act(e); });
  root.addEventListener('input', (e) => {
    const k = e.target.dataset && e.target.dataset.input;
    if (!k) return;
    view[k] = e.target.value;
    if (k === 'q') {
      const pos = e.target.selectionStart;
      render();
      const s = main.querySelector('[data-input="q"]');
      if (s) { s.focus(); try { s.setSelectionRange(pos, pos); } catch { /* ignore */ } }
    } else render();
  });

  app.go = go;
  app.render = render;
  app.shellAct = act;
  render();
  setTimeout(() => tosGate(app), 400);
  return { render, go, panel };
}
