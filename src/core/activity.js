// Признаки занятия: действия (касания, клавиши), звук приложения и — по желанию — игра, услышанная микрофоном.
// По ним время без занятия не попадает в статистику: сессия и секундомер останавливаются по последнему действию,
// открытый инструмент перестаёт считать время. Микрофон измеряет только громкость: звук не записывается
// и никуда не передаётся.
import { t } from '../i18n/index.js';
import { esc, toast, leave } from '../ui/index.js';
import { openMic } from '../audio/mic.js';
import { touch, noteHeard, idleAction, markAsked, confirmPlaying, saveActive, QUIET_MS } from './session.js';
import { tamaOf } from './tama.js';

export const MIC_TICK_MS = 250;

// Громкость кадра, дБ относительно полной шкалы
export function levelDb(buf) {
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  return 10 * Math.log10(s / buf.length + 1e-12);
}

// Игра или тишина по громкости. Фон — самый тихий уровень за последние ~2 минуты (по секундным средним),
// игра — заметно громче фона. Так постоянный шум (вентилятор, улица) не принимается за игру.
export function createLevelGate({ margin = 10, minDb = -62, window = 120, perSec = 4 } = {}) {
  const hist = [];
  let acc = 0, n = 0;
  const gate = {
    floor: null,
    push(db) {
      acc += db; n++;
      if (n >= perSec) { hist.push(acc / n); if (hist.length > window) hist.shift(); acc = 0; n = 0; gate.floor = Math.min(...hist); }
      const floor = gate.floor == null ? db : Math.min(gate.floor, db);
      return db > Math.max(floor + margin, minDb);
    },
  };
  return gate;
}

// Вопрос «Занятие продолжается?». why: 'touch' | 'quiet'; what: 'session' | 'watch'
function askDialog(id, why, what, onGo, onEnd) {
  if (document.querySelector('.ask[data-idle="' + id + '"]:not(.leaving)')) return;
  const d = document.createElement('div');
  d.className = 'ask';
  d.dataset.idle = id;
  const title = t(what === 'watch' ? 'idle.watchTitle' : 'idle.title');
  d.innerHTML = '<div class="alert" role="alertdialog" aria-label="' + esc(title) + '"><div class="ab"><h3>' + title + '</h3><p>' +
    t(why === 'quiet' ? 'idle.textQuiet' : 'idle.text') + ' ' + t('idle.wait') + '</p></div>' +
    '<div class="abtns"><button data-k="end">' + t(what === 'watch' ? 'idle.stop' : 'idle.end') + '</button><button data-k="go">' + t('idle.go') + '</button></div>' +
    '<div class="abtns"><button data-k="never" style="flex:1;text-align:center;font-weight:400;color:var(--l2)">' + t('idle.never') + '</button></div></div>';
  document.body.appendChild(d);
  d.addEventListener('click', (e) => {
    const k = e.target.closest('[data-k]');
    if (!k) return;
    leave(d, 160);
    // «Больше не спрашивать»: вопросы выключаются (вернуть — в «Подсказках приложения»), сейчас — как «Продолжается»
    if (k.dataset.k === 'never') { onNever(); onGo(); return; }
    (k.dataset.k === 'go' ? onGo : onEnd)();
  });
}
let onNever = () => {};
const closeAsk = (id) => document.querySelectorAll('.ask[data-idle="' + id + '"]:not(.leaving)').forEach((d) => leave(d, 160));

// app: store, stopwatch, active, session (idle: { ask, autoEnd }), saveDevice; soundingAudio() — звучит ли приложение
export function createActivity(app, { soundingAudio }) {
  const st = () => app.store.state.settings;
  onNever = () => { st().askIdle = false; app.store.settingsChanged(); toast(t('idle.neverDone')); };
  const asks = () => st().askIdle !== false;
  const off = () => !!st().toolsOnly; // «Только инструменты»: учёта нет — и проверять нечего
  const act = { touch: Date.now(), heard: 0, listening: false, level: null, hiddenAt: null, tools: 0 };
  let mic = null, micT = 0, gate = null, opening = false, micErr = false;

  const heard = (now) => {
    act.heard = now;
    if (app.active) noteHeard(app.active, now, { mic: act.listening });
  };
  // Последний признак занятия вообще (для инструмента и секундомера вне сессии)
  act.last = () => Math.max(act.touch, act.heard);
  act.quiet = (now = Date.now()) => !soundingAudio() && now - act.last() > QUIET_MS;

  // Действия: любое касание или клавиша в приложении
  const onAct = () => {
    act.touch = Date.now();
    const a = app.active;
    if (a) { touch(a, act.touch); saveActive(a); }
  };
  addEventListener('pointerdown', onAct, { capture: true, passive: true });
  addEventListener('keydown', onAct, { capture: true });

  /* ---------- микрофон: «подтверждение игры звуком» и слух Мелеты-тамагочи ---------- */
  // Учёт времени слушает только при «подтверждении игры звуком» (micPresence); тамагочи (tama.listen) — только чтобы
  // говорить, как идёт занятие: на статистику его слух не влияет
  const presence = () => !!st().micPresence;
  const tamaEar = () => { const tm = tamaOf(st()); return tm.on && tm.listen; };
  const wantMic = () => (presence() || tamaEar()) && !off() && !micErr && document.visibilityState === 'visible' && (!!app.active || app.stopwatch.running || act.tools > 0);
  async function micStart() {
    if (mic || opening) return;
    opening = true;
    try {
      mic = await openMic(app.device.mix?.mode);
    } catch (e) {
      micErr = true;
      toast(t(e.reason === 'denied' ? 'presence.denied' : 'presence.unavailable'));
    }
    opening = false;
    if (!mic) return;
    if (!wantMic()) { micStop(); return; }
    gate = createLevelGate();
    act.listening = presence();
    act.hearing = true;
    const now = Date.now();
    if (presence() && app.active && !app.active.micFrom) { app.active.micFrom = now; saveActive(app.active); }
    micT = setInterval(() => {
      const db = levelDb(mic.read()), now2 = Date.now();
      act.level = db;
      // свой звук приложения (метроном, пэды) за игру не считается
      if (soundingAudio()) { act.playing = false; return; }
      act.playing = gate.push(db);
      if (act.playing && presence()) heard(now2);
    }, MIC_TICK_MS);
    sync();
  }
  function micStop() {
    clearInterval(micT);
    if (mic) mic.stop();
    mic = null;
    act.listening = false;
    act.hearing = false;
    act.playing = false;
    act.level = null;
    sync();
  }

  /* ---------- секундомер: в фоне без звука не идёт, бездействие останавливает ---------- */
  const w = () => app.stopwatch.state;
  function watchCheck(now) {
    const sw = app.stopwatch;
    if (!sw.running || off()) { closeAsk('watch'); return; }
    if (document.visibilityState !== 'visible') {
      if (!soundingAudio()) { sw.pause(Math.max(act.hiddenAt || now, act.heard)); w().autoPaused = true; app.saveDevice(); }
      return;
    }
    if (app.active) return; // сессия считает сама; секундомер второй раз её время не засчитает
    const pseudo = { startedAt: w().since, last: Math.max(act.touch, w().since), heard: act.heard, askedAt: w().askedAt || null, askEnd: w().askEnd };
    const r = idleAction(pseudo, { sounding: soundingAudio(), mic: act.listening, ask: asks() }, now);
    if (!r && pseudo.askedAt && asks()) askDialog('watch', w().askWhy, 'watch', goWatch, () => stopWatch(w().askEnd));
    if (!r) return;
    if (r.end) { stopWatch(r.endAt); toast(t('idle.watchStopped')); return; }
    w().askedAt = now; w().askEnd = r.endAt; w().askWhy = now - pseudo.last > QUIET_MS && !soundingAudio() ? 'quiet' : 'touch';
    app.saveDevice();
    askDialog('watch', w().askWhy, 'watch', goWatch, () => stopWatch(w().askEnd));
  }
  function goWatch() { w().askedAt = null; w().askEnd = null; act.touch = Date.now(); app.saveDevice(); }
  function stopWatch(at) { closeAsk('watch'); w().askedAt = null; w().askEnd = null; app.stopwatch.pause(at); }

  /* ---------- сессия ---------- */
  function sessionCheck(now) {
    const a = app.active;
    if (!a || a.ending || off()) { closeAsk('session'); return; }
    const sounding = soundingAudio();
    const r = idleAction(a, { sounding, mic: act.listening, ask: asks() }, now);
    // после перезагрузки вопрос без ответа показывается снова
    if (!r && a.askedAt && asks()) askDialog('session', a.askWhy, 'session', goSession, endSession);
    if (!r) return;
    if (r.end) { closeAsk('session'); app.session.autoEnd(r.endAt); return; }
    markAsked(a, r.endAt, now);
    a.askWhy = !sounding && now - Math.max(a.last || 0, a.heard || 0) > QUIET_MS ? 'quiet' : 'touch';
    saveActive(a);
    askDialog('session', a.askWhy, 'session', goSession, endSession);
  }
  // «Завершить»: окно итога со временем до последнего действия (в нём можно вернуться — тогда сессия продолжается)
  function endSession() { const a = app.active; if (!a) return; const at = a.askEnd; confirmPlaying(a); saveActive(a); app.session.finish(at); }
  function goSession() { const a = app.active; if (a) { confirmPlaying(a); saveActive(a); } }

  const subs = new Set();
  const sync = () => subs.forEach((fn) => fn(act));
  act.subscribe = (fn) => { subs.add(fn); return () => subs.delete(fn); };

  function tick() {
    const now = Date.now();
    if (soundingAudio()) heard(now);
    if (!presence() && !tamaEar()) micErr = false; // настройки выключили — при следующем включении можно снова спросить разрешение
    if (wantMic()) micStart(); else if (mic) micStop();
    if (mic) act.listening = presence(); // «подтверждение звуком» включили или выключили, пока микрофон открыт
    sessionCheck(now);
    watchCheck(now);
  }
  setInterval(tick, 1000);

  document.addEventListener('visibilitychange', () => {
    const now = Date.now();
    if (document.visibilityState === 'visible') {
      act.hiddenAt = null;
      if (w().autoPaused) { w().autoPaused = false; app.saveDevice(); toast(t('idle.watchHidden')); }
    } else act.hiddenAt = now;
    tick();
  });

  // Инструмент вне сессии сообщает, что открыт (пока открыт — слушать микрофон есть смысл)
  act.toolOpen = (on) => { act.tools = Math.max(0, act.tools + (on ? 1 : -1)); };
  return act;
}
