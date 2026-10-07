// Каркас приложения: нижние вкладки (порядок и состав настраиваются — «Вкладки» в профиле), экраны, общие действия.
// Перенесено из legacy/practice.html (view, renderTabs, go, render, глобальные обработчики нажатий).
import '../../ui/screens.css';
import { t } from '../../i18n/index.js';
import { confirm } from '../../ui/index.js';
import { deleteSong } from '../library.js';
import { TAB_ICONS, TAB_IDS } from './common.js';
import { visibleTabs } from '../settings.js';
import { homeHTML, mountStones, quickEdit, streakSheet, gemSheet, rankSheet, rankCheck, nameSheet } from './home.js';
import { libraryHTML, songHTML, songForm, libManager } from './songs.js';
import { renderTools, openToolView } from './tools.js';
import { bindExt } from './ext.js';
import { reportSheet } from './report.js';
import { createPanel, donateSheet, legalSheet, tosGate, unverifiedSheet } from './panel.js';
import { calendarHTML, bindCalendar, calAct } from './calendar.js';
import { onboarding } from './onboard.js';

export function createShell(app, root) {
  const tabsNow = () => visibleTabs(app.store.state.settings, TAB_IDS);
  const view = { tab: tabsNow()[0], song: null, q: '', genre: '', tag: '', cat: '', sort: 'recent', cal: {} };
  root.innerHTML = '<main class="wrap" id="main"></main><nav class="tabbar" aria-label="' + t('nav.aria') + '"><div class="in" id="tabs"></div></nav>';
  const main = root.querySelector('#main'), tabs = root.querySelector('#tabs');

  const renderTabs = () => {
    const list = tabsNow();
    tabs.style.gridTemplateColumns = 'repeat(' + list.length + ',1fr)';
    tabs.innerHTML = list.map((k) => '<button class="tab" data-tab="' + k + '"' + (view.tab === k ? ' aria-current="page"' : '') + '>' + TAB_ICONS[k] + '<span>' + t('nav.' + k) + '</span></button>').join('');
  };

  function render() {
    rankCheck(app);
    renderTabs();
    if (view.tab === 'tools') { renderTools(app, main); return; }
    main.onclick = null;
    if (view.tab === 'calendar') { main.innerHTML = calendarHTML(app, view.cal); bindCalendar(app, main, view.cal, render); return; }
    if (view.tab === 'library') {
      const h = view.song && songHTML(app, view.song);
      if (!h) view.song = null;
      main.innerHTML = h || libraryHTML(app, view);
    } else { main.innerHTML = homeHTML(app); mountStones(app, main); }
  }

  // Новая вкладка или экран: содержимое поднимается, блоки — по очереди (styles/motion.css). Только при переходе,
  // не при каждой перерисовке
  let enterT = 0;
  function enter() {
    main.classList.remove('tab-enter');
    void main.offsetWidth;
    main.classList.add('tab-enter');
    clearTimeout(enterT);
    enterT = setTimeout(() => main.classList.remove('tab-enter'), 900);
  }

  function go(tab, song) {
    if (panel.page) panel.close();
    if (tab === 'settings') { panel.open('week'); return; }
    if (tab === 'stats') { panel.open('stats'); return; }
    // Вкладку можно открыть и убранную (ссылкой «Все песни» и т.п.) — она просто не подсвечена внизу
    const changed = view.tab !== tab || (view.song || null) !== (song || null);
    view.tab = TAB_IDS.includes(tab) ? tab : tabsNow()[0];
    view.song = song || null;
    render();
    window.scrollTo(0, 0);
    if (changed) enter();
  }

  const panel = createPanel(app, () => render());
  bindExt(app, () => panel.open('look'));

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
    else if (d.act === 'report') reportSheet(app);
    else if (d.act === 'legal') legalSheet(d.v);
    else if (d.act === 'streak') streakSheet(app);
    else if (d.act === 'unver') unverifiedSheet(app);
    else if (d.act === 'gem') gemSheet(app);
    else if (d.act === 'rank') rankSheet(app);
    else if (d.act === 'name') nameSheet();
    else if (d.cat !== undefined) { view.cat = d.cat; view.genre = ''; view.tag = ''; render(); }
    else if (d.fg !== undefined) { view.genre = view.genre === d.fg ? '' : d.fg; render(); }
    else if (d.ft !== undefined) { view.tag = view.tag === d.ft ? '' : d.ft; render(); }
    else if (d.fclear !== undefined) { view.genre = ''; view.tag = ''; render(); }
    else if (d.openTool) openToolView(app, d.openTool, render);
    else if (d.act === 'free') app.startSession('free');
    else if (d.act === 'addSong') songForm(app, null, (id) => go('library', id));
    else if (calAct(app, b, view.tab === 'calendar' ? view.cal : null, render)) { /* календарь и строки событий */ }
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

  // «Назад» внутри вкладок: со страницы песни — к списку, с другой вкладки — на первую; false — уже на первой
  app.shellBack = () => {
    if (view.tab === 'library' && view.song) { go('library'); return true; }
    const first = tabsNow()[0];
    if (view.tab !== first) { go(first); return true; }
    return false;
  };
  app.go = go;
  app.render = render;
  app.shellAct = act;
  render();
  enter(); // первый экран тоже появляется плавно
  // Соглашение, затем регистрация (у кого ещё нет профиля — в том числе у тех, кто пользовался прототипом)
  setTimeout(() => tosGate(app, () => { if (!app.store.state.settings.profile) onboarding(app, render); }), 400);
  return { render, go, panel };
}
