// Ядро: песни, сессии, статистика, цели, ударный режим, хранение.
import { initTama } from '../ui/tama.js';
import { webIcon, iconOf, setAppIcon, ICON_BY_MASCOT } from './appicon.js';
import { Capacitor } from '@capacitor/core';
import { t, initI18n, getLang } from '../i18n/index.js';
import { modules } from '../modules/index.js';
import { createStore } from './store.js';
import { loadActive, saveActive, recoverToolView, addBpmTime } from './session.js';
import { loadDevice, saveDevice } from './device.js';
import { createAudio } from '../audio/index.js';
import { ensureLib } from './library.js';
import { applyTheme, tabsMigrate, calmMigrate, mascotOf } from './settings.js';
import { registerTools } from './palettes.js';
import { dropTestMode } from './cleanup.js';
import { removeDemoFiles } from './demo.js';
import { createShell } from './screens/shell.js';
import { initBack } from './back.js';
import { createSessionScreen } from './screens/session.js';
import { createMixerDrawer } from './screens/mixer.js';
import { createShared } from './modules.js';
import { createPomodoro, pomoDefaults } from './pomodoro.js';
import { pause as pauseActive, resume as resumeActive, awayStart, awayEnd, countsWhileHidden } from './session.js';
import { createStopwatch } from './stopwatch.js';
import { createActivity } from './activity.js';
import { initNoSound } from './nosound.js';
import { createPulse } from './pulse.js';
import { initBackground } from './background.js';
import { initPlayer } from './player.js';
import { initGuard } from './guard.js';
import { initDrop } from './drop.js';
import { initWebMemory } from './webmemory.js';
import { initScreenOn } from './screenon.js';
import { createClock } from './clock.js';
import { clockNotice } from './screens/clock.js';
import { BUSES } from '../audio/mixer.js';
import { toast, confirm } from '../ui/index.js';
import { startLog } from './log.js';
import { createBible } from './reading.js';
import { APP_VERSION } from './report.js';
import { crashOffer } from './screens/report.js';
import { bindVerses } from './screens/verses.js';
import { createFiles } from './files.js';
import { createRecorder } from './recorder.js';
import { createMidi } from './midi.js';
import { reschedule, rescheduleEvents } from './reminders.js';
import { ensureCal, eventReminders, liveEvents, kindOf } from './calendar.js';
import { remindText, remindCtx } from './remindtexts.js';
import { initShareIn } from './screens/share.js';
import { initFolder } from './foldersync.js';
import { initDesktop } from './desktop.js';

export function boot(root) {
  // журнал — первым: ошибки запуска тоже попадут в него
  startLog(APP_VERSION + ' · ' + (navigator.userAgent.match(/Android [\d.]+|Chrome\/[\d.]+/g) || []).join(' · '));
  // Часы устройства: пока сбиты, новые записи о занятиях не подтверждаются
  let clock = null;
  // коды и проверка создателем убраны: если проверка шла — настоящие данные возвращаются из копии (до чтения данных)
  const { restored } = dropTestMode();
  const store = createStore({ clockBad: () => !!(clock && clock.bad) });
  // Язык из настроек (выбран в «Оформлении»), иначе — язык системы
  const st0 = store.state.settings;
  if (tabsMigrate(st0)) store.settingsChanged();
  if (calmMigrate(store.state)) store.settingsChanged(); // прежние яркие цвета меток и событий — спокойнее
  initI18n(st0.uiStyle === 'mono' && st0.monoLang !== false ? 'el' : st0.lang);
  ensureLib(store.state, t);
  registerTools(modules); // цвет инструментов — от палитры
  applyTheme(store.state.settings);
  recoverToolView(store);
  let active = loadActive();
  let activity = { hiddenAt: null, heard: 0 };
  const device = loadDevice();
  // Способ регулировки темпа в прототипе хранился в общих настройках — теперь в настройках модуля
  device.metro ??= { adj: store.state.settings.metroAdj || 'wheel' };
  // Гамма в прототипе хранилась отдельно (tools.scale) — теперь в настройках теории
  device.theory.scale ??= device.scale || { pc: 9, type: 'minor' };
  // Помодоро: настройки прототипа (tools.pomo) и вид (tools.ui.pomo) — в настройки модуля timer
  device.timer ??= { ...pomoDefaults(), ...device.pomo, style: device.ui?.pomo === 'flip' ? 'flip' : 'ring' };
  // Недостающие длительности (старые или неполные настройки) — по умолчанию, иначе часы показывают NaN
  device.timer = { ...pomoDefaults(), ...device.timer };
  device.notes ??= { ...device.tab };
  device.audio ??= { last: device.lastAudio || {}, style: device.ui?.audio === 'vinyl' ? 'vinyl' : 'wave' };

  // Звук создаётся сразу, но AudioContext — только на первом жесте пользователя
  const audio = createAudio({
    device,
    metroCfg: store.state.settings.metro,
    save: () => saveDevice(device),
    onTempo: (bpm, sec) => {
      if (!active || active.pausedAt || active.awaySince) return;
      addBpmTime(active, bpm, sec);
      saveActive(active);
    },
    onBpmChange: () => store.persist(),
    // Копия настроек песни сохраняется в песню при завершении сессии; общие — сразу
    saveMetro: (cfg) => { if (cfg === store.state.settings.metro) store.persist(); },
  });
  addEventListener('pointerdown', () => audio.unlock(), { once: true, capture: true });

  // Помодоро идёт в фоне; перерыв ставит сессию на паузу (прототип: sessPause)
  const pomoSubs = new Set();
  const pomodoro = createPomodoro(device.timer, {
    onEnd: (phase) => { audio.chime(); toast(t(phase === 'work' ? 'pomo.breakOver' : 'pomo.breakTime')); },
    pauseSession: (on) => {
      if (!active || !device.timer.pauseSession) return;
      if (on && !active.pausedAt) { audio.metro.flush(); pauseActive(active); active.pomoPaused = true; saveActive(active); }
      // время паузы на темп не засчитываем: сначала сбросить отсчёт, потом снять паузу
      else if (!on && active.pomoPaused && active.pausedAt) { audio.metro.flush(); resumeActive(active); saveActive(active); }
    },
    onChange: () => pomoSubs.forEach((fn) => fn()),
  });
  pomodoro.subscribe = (fn) => { pomoSubs.add(fn); return () => pomoSubs.delete(fn); };
  setInterval(() => pomodoro.tick(), 500);

  // Секундомер «сколько я играю» — в ядре: идёт и при закрытом окне, переживает перезагрузку
  device.watch ??= {};
  const watchSubs = new Set();
  const stopwatch = createStopwatch(device.watch, { onChange: () => { saveDevice(device); watchSubs.forEach((fn) => fn()); } });
  stopwatch.subscribe = (fn) => { watchSubs.add(fn); return () => watchSubs.delete(fn); };

  // Звучит ли приложение (метроном, пианино, пэды, медиа, теория) с ненулевой громкостью в микшере.
  // В обычном режиме учёта время при погасшем экране или в фоне идёт только тогда: помодоро и секундомер без звука
  // не считаются — в фоне без звука никто не занимается
  // звучит ли приложение (игра продлевает учёт); воспроизведение своей MIDI-записи игрой не считается
  let midiRef = null;
  const soundingAudio = () => !(midiRef && midiRef.playing) && BUSES.some((b) => audio.mixer.isActive(b) && audio.mixer.value(b) > 0);

  // Экран погас или вкладка скрыта: по режиму учёта сессии время «вдали» засчитывается или нет.
  // Если звук затих, пока приложение было в фоне, — «вдали» с момента, когда звук слышали последний раз
  const awayCheck = () => {
    if (!active || active.pausedAt) return;
    const counts = document.visibilityState === 'visible' || countsWhileHidden(active.mode, soundingAudio());
    const now = Date.now(), at = Math.min(now, Math.max(activity.hiddenAt || now, activity.heard || 0));
    if (!counts && !active.awaySince) { audio.metro.flush(); awayStart(active, at); saveActive(active); }
    else if (counts && active.awaySince) { audio.metro.flush(); awayEnd(active); saveActive(active); }
  };
  document.addEventListener('visibilitychange', () => awayCheck());
  setInterval(awayCheck, 15000);
  // после перезагрузки: «вдали», начатое при закрытии страницы, заканчивается сразу
  setTimeout(awayCheck, 0);

  const files = createFiles();

  // Перед первой загрузкой файла — предупреждение о правах (прототип: uploadGuard)
  async function confirmUpload() {
    if (store.state.settings.upOk) return true;
    if (!(await confirm(t('upload.title'), t('upload.text'), t('upload.ok')))) return false;
    store.state.settings.upOk = 1;
    store.settingsChanged();
    return true;
  }

  const app = {
    store, device, audio, modules, pomodoro, stopwatch, sounding: soundingAudio, soundingAudio, files, confirmUpload,
    shared: createShared(),
    rec: null, // запись в инструментах (recorder.js) — ниже, когда app уже есть
    saveDevice: () => saveDevice(device),
    get active() { return active; },
    set active(a) { active = a; saveActive(a); },
  };
  app.rec = createRecorder(app);
  app.midi = midiRef = createMidi(app);
  app.midi.input.resume();
  // напоминания о практике: расписание на неделю — при запуске, смене настроек и после занятий (с задержкой)
  let remT = 0;
  const remSync = () => { clearTimeout(remT); remT = setTimeout(() => reschedule(store.state, (x) => remindText(x, remindCtx(store.state.settings))), 1500); };
  store.subscribe(remSync);
  remSync();
  // напоминания о событиях календаря (у события — «Напомнить»): ближайшие две недели, пересчёт при изменениях
  let evT = 0, evSig = '';
  const evSync = () => {
    clearTimeout(evT);
    evT = setTimeout(() => {
      const c = ensureCal(store.state, t), lang = getLang() === 'uz' ? 'uz-Latn' : getLang();
      const list = eventReminders(liveEvents(store.state), Date.now()).map(({ ts, ev, start }) => {
        const m = +ev.remind || 0, hm = new Date(start).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' });
        const lead = ev.allDay || m >= 1440 ? t(m >= 1440 ? 'cal.rem.tomorrow' : 'cal.rem.today') : !m ? t('cal.rem.now') : m < 60 ? t('cal.rem.inMin', { n: m }) : t('cal.rem.inH', { n: m / 60 });
        return { ts, title: ev.title || (kindOf(c, ev.kind) || {}).name || t('cal.event'), body: [lead, ev.allDay ? '' : hm, ev.place || ''].filter(Boolean).join(' · ') };
      });
      const sig = JSON.stringify(list);
      if (sig === evSig) return; // ничего не поменялось — не трогать расписание
      evSig = sig;
      rescheduleEvents(list);
    }, 2000);
  };
  store.subscribe(evSync);
  evSync();
  // Церковный режим: чтение Библии — план, отметки, место (src/core/reading.js)
  app.bible = createBible(store);
  // Вспышка, фонарик и вибрация в такт метронома
  app.pulse = createPulse(app);
  // Часы перевели или они сбиты: идущая сессия и секундомер не подтверждаются; окно с проверкой по интернету
  clock = app.clock = createClock({
    onChange: (c) => {
      if (!c.bad) return;
      if (active && !active.clk) { active.clk = c.reason; saveActive(active); }
      if (stopwatch.running && !device.watch.clk) { device.watch.clk = c.reason; saveDevice(device); }
      clockNotice(app);
    },
  });
  setTimeout(() => clockNotice(app), 1500);
  const session = createSessionScreen(app);
  app.session = session;
  // Признаки занятия: касания, звук, микрофон — и проверки бездействия сессии и секундомера
  activity = app.activity = createActivity(app, { soundingAudio });
  // Мелета-тамагочи: по желанию рядом на занятии, слушает (если разрешено) и говорит, как идёт
  initTama(app);
  // иконка приложения: значок вкладки в браузере (на Android — выбранный alias уже включён)
  // Иконка следует за маскотом (по умолчанию — Мелетий), пока её не выбрали сами в «Оформлении». Один раз — и у тех,
  // кто ставил ранние сборки, где по умолчанию была Мелета (на Android переключается ярлык запуска)
  const sti = store.state.settings, wantIcon = ICON_BY_MASCOT[mascotOf(sti)];
  if (!sti.appIconOwn && (sti.appIcon !== wantIcon || sti.iconSync !== 1)) { sti.iconSync = 1; setAppIcon(sti, wantIcon).then(() => store.settingsChanged()); }
  webIcon(iconOf(sti));
  app.startSession = (type, songId, tool) => session.start(type, songId, tool);
  // Язык и вид поменялись (Оформление, доступ к «Минимал»): строки и стили — на месте, без перезапуска и без ухода с экрана
  app.relang = () => {
    const st = store.state.settings;
    initI18n(st.uiStyle === 'mono' && st.monoLang !== false ? 'el' : st.lang);
    applyTheme(st);
    if (app.render) app.render();
  };
  createShell(app, root);
  // Работа в фоне на Android: пока что-то идёт — служба с уведомлением, приложение не замораживается
  initBackground(app);
  initPlayer(app); // шторка, плавающая кнопка, всплывающее окно (Android)
  // веб-версия: один раз — что это знакомство, а полная версия — приложение для Android
  // (после регистрации: на стартовом экране не мешает выбору языка)
  const webHello = () => {
    const st = store.state.settings;
    if (Capacitor.isNativePlatform() || st.webHello) return;
    if (!st.configured || document.querySelector('#onboard, .askname, .ask, #sheetLayer .sheet')) { setTimeout(webHello, 4000); return; }
    toast(t('web.hello')); st.webHello = true; store.settingsChanged();
  };
  setTimeout(webHello, 2500);
  initGuard(app);
  initDrop(app); // файлы, перетащенные в окно
  initWebMemory(app); // веб-версия: постоянное хранилище и работа без сети (service worker)
  initScreenOn(app); // экран не гаснет, пока приложение открыто
  // после возврата из копии — файлы демо-набора, которые добавила проверка, убрать (если набора не было)
  if (restored && !store.state.settings.demo) removeDemoFiles(app).catch(() => {});
  createMixerDrawer(app);
  // Играет, но не слышно (микшер, громкость устройства) — уведомление внизу
  initNoSound(app);
  // Сессия, начатая до перезагрузки страницы, продолжается
  session.resume();
  // Сцена, открытая до сбоя или перезапуска, — снова на той же песне (файлы минусовок читаются из базы)
  if (localStorage.getItem('melete.stage')) files.ready.then(() => import('./screens/stage.js')).then((m) => m.resumeStage(app)).catch(() => {});
  // «Назад» на Android закрывает открытое по очереди, а не всё приложение
  initBack(app);
  // Статус медиатеки и табов зависит от файлов, которые читаются из базы асинхронно
  files.ready.then(() => { if (!app.openTool) app.render(); });
  // файл .melete от команды, открытый в Melete
  initShareIn(app);
  // папка Melete на устройстве: данные, медиа, табы, PDF, тексты — синхронизация в обе стороны
  app.folder = initFolder(app);
  // компьютер (Tauri): файлы, открытые двойным щелчком, F11
  initDesktop(app);
  // прошлый запуск закрылся неожиданно — предложить отправить отчёт
  crashOffer(app);
  // касание названия раздела — его стих (в обоих видах)
  bindVerses(app);
  return app;
}

