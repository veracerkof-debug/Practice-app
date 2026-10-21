// Разделение на дорожки само, в фоне: каждая новая запись в медиатеке (звук, не видео, не дорожка, до 20 минут)
// ставится в очередь и разделяется в режиме из настройки (settings.autoStems: 'off' | '2' | '4' | '6', по умолчанию
// '4'; settings.autoHq — «ночное» качество, дольше в 4,5 раза), а ещё у неё определяются тональность и темп (settings.autoAna, по умолчанию включено; результат — rec.ana).
// Считает только в тишине: ничего не звучит, нет занятия и записи — счёт берёт все ядра и помешал бы живому звуку;
// зазвучало — текущее разделение прерывается между сегментами и повторится позже. Ход виден в плеере и в уведомлении
// (background.js). Очередь переживает закрытие окон, но не приложения: после запуска всё непосчитанное встанет снова.
import { hasStems } from './jobs.js';
import { log } from './log.js';

export const AUTO_MODES = ['off', '2', '4', '6'];
export const autoMode = (settings) => (AUTO_MODES.includes(settings.autoStems) ? settings.autoStems : '4');
export const autoAna = (settings) => settings.autoAna !== false;
// «Ночное» качество (settings.autoHq, по умолчанию выключено): наборы обычного качества пересчитываются заново
export const autoHq = (settings) => settings.autoHq === true;
const MAX_SEC = 20 * 60, DELAY_MS = 15000, RETRY_MS = 60000;

export function createAutoStems(app) {
  const { files, jobs } = app;
  let timer = 0, running = false, failed = new Map(); // id → когда можно пробовать снова
  const settings = () => app.store.state.settings;
  const quiet = () => !app.active && !app.soundingAudio() && !(app.rec && app.rec.active) && !jobs.busy() && !(app.audio.metro && app.audio.metro.running);
  const candidate = (r) => r.kind === 'audio' && !r.stem && r.blob && !(r.type || '').startsWith('video/') && !r.noAuto && (!r.dur || r.dur <= MAX_SEC);
  const needsAna = (r) => autoAna(settings()) && !r.ana && !r.anaTried;
  const needsStems = (r) => { const m = autoMode(settings()); return m !== 'off' && jobs.supported() && !hasStems(files, r.id, m, autoHq(settings())) && !(failed.get(r.id) > Date.now()); };
  const next = () => files.list('audio').filter(candidate).sort((a, b) => (b.created || 0) - (a.created || 0)).find((r) => needsAna(r) || needsStems(r)) || null;

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
    if (!quiet()) { schedule(RETRY_MS); return; }
    running = true;
    try {
      if (needsAna(r)) await analyze(r);
      else if (needsStems(r)) {
        const m = autoMode(settings());
        const hq = autoHq(settings());
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
    mode: () => autoMode(settings()), // режим из настройки — умолчание и для разделения по кнопке
    hq: () => autoHq(settings()),
    setHq(v) { settings().autoHq = !!v; app.store.settingsChanged(); schedule(1000); }, // переключатель и в плеере, и в настройках — один
    get pending() { return files.list('audio').filter((r) => candidate(r) && (needsAna(r) || needsStems(r))).length; },
  };
  return api;
}
