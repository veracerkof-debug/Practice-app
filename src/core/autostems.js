// Разделение на дорожки само, в фоне: каждая запись медиатеки (звук, не видео, не дорожка, до 20 минут) разделяется
// в режиме из настройки (settings.autoStems: 'off' | '2' | '4' | '6', по умолчанию '4'), а ещё у неё определяются
// тональность и темп (settings.autoAna, по умолчанию включено; результат — rec.ana). Порядок — от недавних: сначала
// то, что недавно слушали (device.audio.used) или добавили. Две очереди: сперва все записи получают обычное разделение,
// и только когда оно есть у всех — «улучшенное разделение» (settings.autoHq, выкл: три прохода, ×4,5 времени), первая
// версия при этом остаётся — в плеере можно вернуться к ней.
// Когда считать: только в тишине (ничего не звучит, нет занятия и записи — счёт берёт все ядра и помешал бы живому
// звуку) и, по умолчанию, только на зарядке (settings.autoPower: 'charge' | 'always') — обычно это ночь, за ночь
// 10–20 песен; зазвучало — текущее разделение прерывается между сегментами и повторится позже. Ход виден в плеере
// и в уведомлении (background.js). Очередь переживает закрытие окон, но не приложения: после запуска встанет снова.
import { hasStems } from './jobs.js';
import { log } from './log.js';

export const AUTO_MODES = ['off', '2', '4', '6'];
export const autoMode = (settings) => (AUTO_MODES.includes(settings.autoStems) ? settings.autoStems : '4');
export const autoAna = (settings) => settings.autoAna !== false;
export const autoHq = (settings) => settings.autoHq === true; // улучшенное разделение (вторая очередь)
export const AUTO_POWER = ['charge', 'always'];
export const autoPower = (settings) => (AUTO_POWER.includes(settings.autoPower) ? settings.autoPower : 'charge');
const MAX_SEC = 20 * 60, DELAY_MS = 15000, RETRY_MS = 60000;

export function createAutoStems(app) {
  const { files, jobs } = app;
  let timer = 0, running = false, failed = new Map(); // id → когда можно пробовать снова
  const settings = () => app.store.state.settings;
  const quiet = () => !app.active && !app.soundingAudio() && !(app.rec && app.rec.active) && !jobs.busy() && !(app.audio.metro && app.audio.metro.running);
  // Зарядка: Battery Status API (Chrome, Android WebView); где его нет (Windows, другие браузеры) — считается, что питание есть
  let bat = null, charging = true;
  if (typeof navigator !== 'undefined' && navigator.getBattery) navigator.getBattery().then((b) => { bat = b; charging = b.charging; b.addEventListener('chargingchange', () => { charging = b.charging; schedule(1000); }); }).catch(() => {});
  const powered = () => autoPower(settings()) === 'always' || !bat || charging;
  const candidate = (r) => r.kind === 'audio' && !r.stem && r.blob && !(r.type || '').startsWith('video/') && !r.noAuto && (!r.dur || r.dur <= MAX_SEC);
  const needsAna = (r) => autoAna(settings()) && !r.ana && !r.anaTried;
  const ok = (r) => !(failed.get(r.id) > Date.now());
  const needsStems = (r) => { const m = autoMode(settings()); return m !== 'off' && jobs.supported() && !hasStems(files, r.id, m) && ok(r); };
  const needsHq = (r) => { const m = autoMode(settings()); return autoHq(settings()) && m !== 'off' && jobs.supported() && !hasStems(files, r.id, m, true) && ok(r); };
  const usedAt = (r) => Math.max(r.created || 0, ((app.device.audio || {}).used || {})[r.id] || 0);
  const recent = () => files.list('audio').filter(candidate).sort((a, b) => usedAt(b) - usedAt(a));
  // первая очередь — тональность и обычное разделение у всех; вторая — улучшенное, когда первая пуста
  const next = () => { const L = recent(); return L.find((r) => needsAna(r) || needsStems(r)) || L.find(needsHq) || null; };

  async function analyze(r) {
    try {
      const { analyzeAudio } = await import('./songanalyze.js');
      const a = await analyzeAudio(r.blob);
      r.ana = { pc: a.key ? a.key.pc : null, minor: !!(a.key && a.key.minor), cents: a.tuning ? a.tuning.cents : null, bpm: a.tempo ? Math.round(a.tempo.bpm) : null, at: Date.now() };
    } catch (e) { r.anaTried = true; log('auto', 'тональность и темп не определились: ' + (e && e.message), 'w'); }
    await files.save(r);
  }
  async function tick() {
    timer = 0;
    if (running) return;
    const r = next();
    if (!r) return;
    if (!quiet() || !powered()) { schedule(RETRY_MS); return; }
    running = true;
    try {
      if (needsAna(r)) await analyze(r);
      else {
        const m = autoMode(settings()), hq = !needsStems(r);
        log('auto', 'дорожки в фоне: ' + r.name + ' (' + m + (hq ? ', hq' : '') + ')');
        try { await jobs.separate(r, m, { auto: true, hq }); } catch (e) { if (e && e.message === 'cancel') failed.set(r.id, Date.now() + RETRY_MS); else failed.set(r.id, Date.now() + 6 * 3600000); }
      }
    } finally { running = false; }
    schedule(2000);
  }
  function schedule(ms = DELAY_MS) { if (timer) return; timer = setTimeout(tick, ms); }
  // зазвучало — прервать фоновое разделение (между сегментами), доделает позже
  const onSound = () => { const c = jobs.current; if (c && c.auto) jobs.cancel(); };
  const api = {
    start() { files.subscribe(() => schedule()); schedule(DELAY_MS); setInterval(() => { if (!quiet()) onSound(); else schedule(); }, 5000); },
    kick: () => schedule(1000),
    power: () => autoPower(settings()),
    setPower(v) { settings().autoPower = v; app.store.settingsChanged(); schedule(1000); },
    mode: () => autoMode(settings()), // режим из настройки — умолчание и для разделения по кнопке
    hq: () => autoHq(settings()),
    setHq(v) { settings().autoHq = !!v; app.store.settingsChanged(); schedule(1000); }, // переключатель и в плеере, и в настройках — один
    get pending() { return files.list('audio').filter((r) => candidate(r) && (needsAna(r) || needsStems(r) || needsHq(r))).length; },
  };
  return api;
}
