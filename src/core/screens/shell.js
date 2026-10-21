// Каркас приложения: нижние вкладки (порядок и состав настраиваются — «Вкладки» в профиле), экраны, общие действия.
// Перенесено из legacy/practice.html (view, renderTabs, go, render, глобальные обработчики нажатий).
import '../../ui/screens.css';
import { t } from '../../i18n/index.js';
import { confirm, toast, esc } from '../../ui/index.js';
import { deleteSong } from '../library.js';
import { addDemo, removeDemo } from '../demo.js';
import { TAB_ICONS, tabIds, tabModuleOf, tabIcon } from './common.js';
import { moduleById } from '../../modules/index.js';
import { mountModule, moduleName } from '../modules.js';
import { visibleTabs, editTabs, orderTabs, unmakeTab } from '../settings.js';
import { homeHTML, mountStones, quickEdit, toolHoldMenu, homeEditAct, homeEditing, setHomeEdit, streakSheet, gemSheet, leagueCheck, nameSheet, homeLayout, setHomeLayout, QUICK_DEF } from './home.js';
import { libraryHTML, songHTML, songForm, libManager } from './songs.js';
import { renderTools, openToolView, toolsTab, setToolsTab } from './tools.js';
import { reportSheet } from './report.js';
import { songImportMenu } from './songimport.js';
import { shareSheet, shareMenu } from './share.js';
import { createPanel, legalSheet, unverifiedSheet } from './panel.js';
import { calendarHTML, bindCalendar, calAct } from './calendar.js';
import { onboarding, langGate, askName } from './onboard.js';
import { logoHTML } from '../../ui/logo.js';
import { coreHelp } from '../help.js';
import { bareScope } from '../../i18n/index.js';
import { dragSort, onHold, holdMenu } from '../../ui/hold.js';

// Значки меню песни (удержание строки в списке)
const SM = {
  play: '<svg viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
  share: '<svg viewBox="0 0 24 24"><path d="M12 15V4M8 7.5 12 3.5l4 4M6 11H5v9h14v-9h-1"/></svg>',
  del: '<svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13"/></svg>',
};

export function createShell(app, root) {
  const tabsNow = () => visibleTabs(app.store.state.settings, tabIds(app.store.state.settings));
  const view = { tab: tabsNow()[0], song: null, q: '', genre: '', tag: '', cat: '', sort: 'recent', cal: {} };
  root.innerHTML = '<main class="wrap" id="main"></main><nav class="tabbar" aria-label="' + t('nav.aria') + '"><div class="in" id="tabs"></div></nav>';
  const main = root.querySelector('#main'), tabs = root.querySelector('#tabs');

  const tabName = (k) => (TAB_ICONS[k] ? t('nav.' + k) : moduleName(moduleById(k)));
  const renderTabs = () => {
    const list = tabsNow();
    // вкладок может быть много (до 10): узкие — полоса прокручивается пальцем
    tabs.style.gridTemplateColumns = 'repeat(' + list.length + ',minmax(52px,1fr))';
    // вкладки — только значки (решение автора): название — в подсказке и для чтения с экрана
    tabs.innerHTML = list.map((k) => '<button class="tab" data-tab="' + k + '"' + (view.tab === k ? ' aria-current="page"' : '') + ' aria-label="' + esc(tabName(k)) + '" title="' + esc(tabName(k)) + '">' + tabIcon(k) + '</button>').join('');
  };
  // Удержание вкладки — меню: модуль-вкладку вернуть в инструменты, обычную убрать; ведение — порядок
  function tabHoldMenu(b) {
    const st = app.store.state.settings, id = b.dataset.tab, items = [];
    if ((st.tabMods || []).includes(id)) items.push({ icon: TAB_ICONS.tools, label: t('tabs.toTools'), run: () => { unmakeTab(app.store, id); if (view.tab === id) view.tab = tabsNow()[0]; render(); toast(t('tabs.toToolsDone')); } });
    else if (tabsNow().length > 1) items.push({ icon: TAB_ICONS.tools, label: t('tabs.remove'), danger: true, run: () => { editTabs(app.store, tabIds(st), id, 'off'); if (view.tab === id) view.tab = tabsNow()[0]; render(); } });
    items.push({ icon: TAB_ICONS.tabs || TAB_ICONS.tools, label: t('tabs.title'), run: () => panel.open('tabs') });
    holdMenu(b, items, tabName(id));
  }
  dragSort(tabs, '.tab', 'data-tab', {
    onStill: tabHoldMenu,
    onDrop: (ids) => { orderTabs(app.store, tabIds(app.store.state.settings), ids); render(); },
  });

  // Вкладки-модули («Библия» в церковном режиме, «Студия»): модуль на всё окно над вкладками; остаётся открытым,
  // пока выбрана вкладка
  let tabMod = null;
  const unmountBible = () => { if (tabMod) { tabMod.unmount(); tabMod = null; } main.classList.remove('wbible'); };
  function renderTabModule(id) {
    if (tabMod && tabMod.id === id && main.contains(tabMod.host)) return;
    unmountBible();
    main.onclick = null;
    main.classList.add('wbible');
    main.innerHTML = '<div class="toolhost btab"></div>';
    const host = main.firstElementChild;
    tabMod = { id, host, ...mountModule(app, moduleById(id), host, 'full') };
  }

  // «Минимал» без текста: рабочие экраны рисуются без слов (i18n: bareScope)
  const render = () => bareScope(renderNow);
  function renderNow() {
    // первый запуск: до конца регистрации — только заставка (поздние перерисовки — файлы, синхронизация — не в счёт)
    if (root.classList.contains('starting')) return;
    leagueCheck(app);
    renderTabs();
    document.documentElement.style.setProperty('--tabh', tabs.parentElement.offsetHeight + 'px');
    const tm = tabModuleOf(app.store.state.settings, view.tab);
    if (tm) { renderTabModule(tm); return; }
    unmountBible();
    if (view.tab === 'tools') { renderTools(app, main); return; }
    main.onclick = null;
    if (view.tab === 'calendar') { main.innerHTML = calendarHTML(app, view.cal); bindCalendar(app, main, view.cal, render); coreHelp(app, 'calendar'); return; }
    if (view.tab === 'library') {
      const h = view.song && songHTML(app, view.song);
      if (!h) view.song = null;
      main.innerHTML = h || libraryHTML(app, view);
      coreHelp(app, 'songs');
    } else { main.innerHTML = homeHTML(app); mountStones(app, main); if (!app.store.state.settings.toolsOnly) coreHelp(app, 'start'); }
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
    requestAnimationFrame(() => main.querySelectorAll('.big.num, .gring .num').forEach(countUp));
  }
  // крупные цифры (время недели, проценты) — набегают от нуля, как стрелка прибора
  function countUp(el) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const final = el.textContent, nums = [...final.matchAll(/\d+/g)].map((m) => +m[0]);
    if (!nums.some((n) => n > 0)) return;
    const t0 = performance.now(), T = 650;
    const step = (now) => {
      if (!el.isConnected) return;
      const k = Math.min(1, (now - t0) / T), e = 1 - Math.pow(1 - k, 3);
      let i = 0;
      el.textContent = k >= 1 ? final : final.replace(/\d+/g, () => String(Math.round(nums[i++] * e)));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function go(tab, song) {
    if (panel.page) panel.close();
    setHomeEdit(false); // правка главной заканчивается при уходе с неё
    if (tab === 'settings') { panel.open('week'); return; }
    if (tab === 'stats') { panel.open('stats'); return; }
    // Вкладку можно открыть и убранную (ссылкой «Все песни» и т.п.) — она просто не подсвечена внизу
    const changed = view.tab !== tab || (view.song || null) !== (song || null);
    view.tab = tabIds(app.store.state.settings).includes(tab) ? tab : tabsNow()[0];
    view.song = song || null;
    render();
    window.scrollTo(0, 0);
    if (changed) enter();
  }

  // Предпросмотр масштаба в «Оформлении»: разметка главной и инструментов без обработчиков
  app.preview = {
    home: (el) => { el.innerHTML = homeHTML(app); mountStones(app, el); },
    tools: (el) => { renderTools(app, el); el.onclick = null; },
    tabs: () => tabs.innerHTML,
  };
  const panel = createPanel(app, () => render());

  // Действия, общие для экранов и панели. Возвращает true, если нажатие обработано
  function act(e) {
    const b = e.target.closest('button,[data-song]');
    if (!b) return false;
    const d = b.dataset;
    // правка главной (блоки: меньше, больше, убрать, вернуть, готово)
    if (d.hbe) { if (homeEditAct(app, d.hbe)) render(); return true; }
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
    // чтение дня: Библия — на нужной главе
    else if (d.act === 'bible') {
      if (d.key) { const [code, ch] = d.key.split('.'); app.bible.setPos({ code, ch: +ch, y: 0 }); }
      if (tabsNow().includes('bible')) { unmountBible(); go('bible'); } else openToolView(app, 'bible', render); // есть вкладка — в неё
    }
    else if (d.act === 'report') reportSheet(app);
    else if (d.act === 'legal') legalSheet(d.v);
    else if (d.act === 'streak') streakSheet(app);
    else if (d.act === 'unver') unverifiedSheet(app);
    else if (d.act === 'gem') gemSheet(app);
    else if (d.act === 'rank') gemSheet(app); // прежняя кнопка звания — теперь лига
    else if (d.act === 'name') nameSheet(!!app.store.state.settings.church);
    else if (d.cat !== undefined) { view.cat = d.cat; view.genre = ''; view.tag = ''; render(); }
    else if (d.fg !== undefined) { view.genre = view.genre === d.fg ? '' : d.fg; render(); }
    else if (d.ft !== undefined) { view.tag = view.tag === d.ft ? '' : d.ft; render(); }
    else if (d.fclear !== undefined) { view.genre = ''; view.tag = ''; render(); }
    else if (d.openTool) openToolView(app, d.openTool, render);
    else if (d.act === 'free') app.startSession('free');
    else if (d.act === 'addSong') songForm(app, null, (id) => go('library', id));
    // команда: отправить песню или выбрать песни; принять файл .melete
    else if (d.act === 'share') { if (d.sid) shareSheet(app, { songIds: [d.sid] }); else shareMenu(app); }
    else if (d.act === 'songImport') songImportMenu(app, () => go('library'));
    else if (d.act === 'demoDel') {
      removeDemo(app).then(() => { render(); toast(t('demo.removed')); }); // одним нажатием: занятия по демо-песням остаются в статистике
    }
    else if (d.act === 'demoAdd') { toast(t('demo.adding')); addDemo(app, t).then(() => { render(); toast(t('demo.added')); }); }
    else if (calAct(app, b, view.tab === 'calendar' ? view.cal : null, render)) { /* календарь и строки событий */ }
    else return false;
    return true;
  }

  // Инструменты (быстрый доступ на главной, вкладка «Инструменты») и блоки главной переставляются, как значки на
  // главном экране телефона: удержать — поднять, перенести, отпустить. Удержание без движения — меню
  dragSort(root, '[data-open-tool]', 'data-open-tool', {
    onStill: (b) => toolHoldMenu(app, b, render, (id) => openToolView(app, id, render)),
    onDrop: (ids, el) => {
      const st = app.store.state.settings;
      if (el.closest('.tgrid')) { const T = toolsTab(st); T.order = [...ids, ...T.order.filter((x) => !ids.includes(x))]; setToolsTab(st, T); }
      else { const full = (st.quick || QUICK_DEF).slice(); st.quick = [...ids, ...full.filter((x) => !ids.includes(x))]; }
      app.store.settingsChanged(); render();
    },
  });
  // блоки главной (мимо инструментов и вращаемых камней)
  dragSort(root, '[data-hb]', 'data-hb', {
    skip: (e) => !!e.target.closest('[data-open-tool], canvas'),
    onStill: () => { setHomeEdit(true); render(); }, // удержание блока — правка главной прямо на ней
    onDrop: (ids) => { const st = app.store.state.settings, L = homeLayout(st); L.order = [...ids, ...L.order.filter((k) => !ids.includes(k))]; setHomeLayout(st, L); app.store.settingsChanged(); render(); },
  });
  // Песня в списке: удержание — меню (играть, изменить, отправить, удалить), как у значков приложений в телефоне
  onHold(root, 'button.stile3[data-song]', (b) => {
    const id = b.dataset.song, s = app.store.songById(id);
    if (!s) return;
    holdMenu(b, [
      { icon: SM.play, label: t('song.play'), run: () => app.startSession('song', id) },
      { icon: SM.edit, label: t('song.edit'), run: () => songForm(app, id, (nid) => go('library', nid)) },
      { icon: SM.share, label: t('share.title'), run: () => shareSheet(app, { songIds: [id] }) },
      { icon: SM.del, label: t('song.delete'), danger: true, run: () => confirm(t('song.delTitle', { title: s.title }), t('song.delText'), t('song.delYes')).then((ok) => { if (ok) { deleteSong(app.store, id); render(); } }) },
    ], s.title);
  });
  // Правка главной: щипок двумя пальцами по блоку — больше (развести) или меньше (свести)
  const pinch = new Map();
  let pinchBase = 0, pinchId = null;
  const pdist = () => { const [a, b] = [...pinch.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
  root.addEventListener('pointerdown', (e) => {
    if (!homeEditing()) return;
    const blk = e.target.closest('[data-hb]');
    if (!blk) return;
    pinch.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.size === 2) { pinchBase = pdist(); pinchId = blk.dataset.hb; }
  });
  root.addEventListener('pointermove', (e) => {
    if (!pinch.has(e.pointerId)) return;
    pinch.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.size !== 2 || !pinchBase || !pinchId) return;
    const r = pdist() / pinchBase;
    if (r > 1.3 || r < 0.77) { homeEditAct(app, (r > 1 ? 'bigger:' : 'smaller:') + pinchId); pinchBase = pdist(); render(); }
  });
  const pend = (e) => { pinch.delete(e.pointerId); if (pinch.size < 2) { pinchBase = 0; pinchId = null; } };
  root.addEventListener('pointerup', pend);
  root.addEventListener('pointercancel', pend);
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
  app.homeEditDone = () => { if (!homeEditing()) return false; setHomeEdit(false); render(); return true; };
  app.render = render;
  app.shellAct = act;
  // Первый запуск (профиля ещё нет): главная не показывается вовсе — заставка, затем язык, соглашение и регистрация;
  // главная появляется только после регистрации
  if (!app.store.state.settings.profile) {
    root.classList.add('starting');
    main.innerHTML = '<div class="splash" aria-hidden="true">' + logoHTML() + '</div>';
    langGate(app, () => onboarding(app, () => { root.classList.remove('starting'); render(); enter(); }));
    return { render, go, panel };
  }
  render();
  enter(); // первый экран тоже появляется плавно
  // перезапуск из настроек (язык, вид) — обратно на ту же страницу настроек
  const reopened = panel.reopen();
  // соглашение — только в настройках («О Melete»); имя — если его ещё не спрашивали
  if (!reopened) setTimeout(() => askName(app), 600);
  return { render, go, panel };
}
