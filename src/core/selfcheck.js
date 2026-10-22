// Самопроверка на устройстве: приложение само проверяет то, что в браузере разработчика не видно, —
// звук и его задержку, часы звукового потока, нагрузку, движок плеера, микрофон, запись, хранилище,
// встроенные модели, экран. Запускается по нажатию (панель → «Самопроверка»), ничего не отправляет:
// результат — в технический журнал (src/core/log.js), его прикладывает «Сообщить о проблеме».
// Во время проверки звучит короткий тихий сигнал — так видно, что до динамика звук доходит.
// Логика без DOM: экран — screens/selfcheck.js; те же проверки гоняет e2e-тест (tests/e2e/selfcheck.spec.js).
import { Capacitor } from '@capacitor/core';
import { peekContext, masterNode } from '../audio/context.js';
import { after, clockReady } from '../audio/clock.js';
import { createStretchPlayer, stretchAvailable } from '../audio/stretchplayer.js';
import { stemsSupported, stemsNative } from '../audio/stems.js';
import { canRecord, pickType } from './recorder.js';
import { isDesktop } from './desktop.js';
import { log } from './log.js';

// Порядок — как на экране. st: 'ok' | 'warn' | 'fail' | 'skip'
export const CHECKS = ['sound', 'clock', 'load', 'player', 'mic', 'rec', 'files', 'storage', 'models', 'screen', 'env'];

export const STEP_MS = 9000; // одна проверка — не дольше
const ms = (s) => Math.round((s || 0) * 1000) + ' мс';
const db = (rms) => Math.round(20 * Math.log10(rms + 1e-9));
const sleep = (t) => new Promise((r) => setTimeout(r, t));
const withTimeout = (p, t = STEP_MS) => Promise.race([p, sleep(t).then(() => ({ st: 'fail', info: 'нет ответа за ' + Math.round(t / 1000) + ' с' }))]);
const rmsOf = (an) => { const b = new Float32Array(an.fftSize); an.getFloatTimeDomainData(b); let e = 0; for (const v of b) e += v * v; return Math.sqrt(e / b.length); };

// Короткий тон в общую шину: 440 Гц, тихо, dur секунд. Возвращает узел громкости (для записи — чтобы было что писать)
function tone(c, dur = 0.3, vol = 0.06) {
  const t = c.currentTime, o = c.createOscillator(), g = c.createGain();
  o.type = 'sine'; o.frequency.value = 440;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
  g.gain.setValueAtTime(vol, t + dur - 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(masterNode()); o.start(t); o.stop(t + dur + 0.05);
  return g;
}

const checks = {
  // Контекст идёт, сигнал доходит до шины: тон → анализатор общего выхода
  async sound(app) {
    app.audio.unlock();
    const c = peekContext();
    if (!c) return { st: 'fail', info: 'звуковой контекст не создан' };
    if (c.state !== 'running') { try { await c.resume(); } catch { /* ниже */ } }
    if (c.state !== 'running') return { st: 'fail', info: 'контекст ' + c.state };
    const an = app.audio.analyser();
    if (!an) return { st: 'fail', info: 'нет анализатора выхода' };
    tone(c, 0.35);
    await sleep(220);
    const level = db(rmsOf(an));
    const lat = (c.baseLatency || 0) + (c.outputLatency || 0);
    const info = c.sampleRate + ' Гц, буфер ' + ms(c.baseLatency) + ', выход ' + ms(c.outputLatency) + ', сигнал ' + level + ' дБ';
    if (level < -60) return { st: 'fail', info: info + ' — до шины не доходит' };
    return { st: lat > 0.15 ? 'warn' : 'ok', info: info + (lat > 0.15 ? ' — большая задержка' : '') };
  },
  // Часы звукового потока (clock.js): тик приходит, и вовремя
  async clock() {
    const t0 = performance.now();
    const dt = await withTimeout(new Promise((r) => after(40, () => r(performance.now() - t0))), 1500);
    if (typeof dt !== 'number') return { st: 'fail', info: 'таймер звука не сработал' };
    const info = 'тик через ' + Math.round(dt) + ' мс' + (clockReady() ? '' : ', часы на запасном ходу (setInterval)');
    return { st: dt > 400 ? 'warn' : clockReady() ? 'ok' : 'warn', info };
  },
  // Измеритель нагрузки звукового потока
  async load(app) {
    const m = app.audio.load;
    if (!m) return { st: 'fail', info: 'контекста нет' };
    for (let i = 0; i < 15 && !m.ready; i++) await sleep(100);
    if (!m.ready) return { st: 'warn', info: 'измеритель не запустился' };
    await sleep(600);
    const v = Math.round(m.value * 100), pk = Math.round(m.peak * 100);
    return { st: v >= 90 ? 'fail' : v >= 70 ? 'warn' : 'ok', info: v + ' %, пик ' + pk + ' %' };
  },
  // Движок плеера медиатеки (Signalsmith в AudioWorklet): молчит ли на этом устройстве
  async player() {
    const c = peekContext();
    if (!c) return { st: 'skip', info: 'звука нет' };
    if (!stretchAvailable()) return { st: 'warn', info: 'нет AudioWorklet — плеер на запасном движке, без тональности' };
    let p = null;
    try {
      p = await createStretchPlayer(c, masterNode());
      const r = await p.selfTest();
      if (!r) return { st: 'warn', info: 'контекст не идёт' };
      const info = Math.round(r.db) + ' дБ, задержка ' + ms(r.lat) + ', каналов ' + r.channels + (r.err ? ', ошибка: ' + r.err : '');
      return r.db < -60 ? { st: 'fail', info: info + ' — движок молчит, плеер на запасном' } : { st: 'ok', info };
    } catch (e) { return { st: 'fail', info: String((e && e.message) || e) }; }
    finally { try { p && p.destroy(); } catch { /* */ } }
  },
  // Микрофон: доступ и уровень за полсекунды (только анализ, никуда не пишется)
  async mic(app) {
    let m = null;
    try { m = await app.audio.openMic(); } catch (e) { return { st: 'fail', info: e && e.reason === 'denied' ? 'нет разрешения' : 'недоступен' }; }
    try {
      await sleep(500);
      const level = db(rmsOf(m.analyser));
      return { st: 'ok', info: 'уровень ' + level + ' дБ' + (level < -80 ? ' (тишина)' : '') };
    } finally { try { m.stop(); } catch { /* */ } }
  },
  // Запись звука приложения: отвод шины → MediaRecorder, полсекунды тона → файл не пустой
  async rec(app) {
    if (!canRecord()) return { st: 'fail', info: 'MediaRecorder недоступен' };
    const tap = app.audio.tap();
    if (!tap) return { st: 'fail', info: 'нет отвода звука' };
    const c = tap.ctx, dest = c.createMediaStreamDestination(), off = tap.into(dest);
    const type = pickType(['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']);
    const chunks = [];
    try {
      const mr = type ? new MediaRecorder(dest.stream, { mimeType: type }) : new MediaRecorder(dest.stream);
      mr.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      const done = new Promise((r) => { mr.onstop = r; mr.onerror = r; });
      mr.start(); tone(c, 0.6, 0.05);
      await sleep(700); mr.stop(); await withTimeout(done, 2000);
    } catch (e) { return { st: 'fail', info: String((e && e.message) || e) }; }
    finally { try { off && off(); } catch { /* */ } }
    const size = chunks.reduce((s, b) => s + b.size, 0);
    return size ? { st: 'ok', info: (type || 'по умолчанию') + ', ' + (size / 1024).toFixed(1) + ' КБ за 0,7 с' } : { st: 'fail', info: 'пустая запись' };
  },
  // IndexedDB: своя маленькая база — запись, чтение, удаление 64 КБ
  async files(app) {
    if (app.files && app.files.noDb) return { st: 'fail', info: 'хранилище файлов недоступно — файлы живут до перезагрузки' };
    if (!globalThis.indexedDB) return { st: 'fail', info: 'нет IndexedDB' };
    const t0 = performance.now();
    try {
      const dbh = await new Promise((res, rej) => { const q = indexedDB.open('melete-check', 1); q.onupgradeneeded = () => q.result.createObjectStore('k'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
      const tx = (mode, f) => new Promise((res, rej) => { const t = dbh.transaction('k', mode), r = f(t.objectStore('k')); t.oncomplete = () => res(r.result); t.onerror = () => rej(t.error); });
      const blob = new Blob([new Uint8Array(65536)]);
      await tx('readwrite', (s) => s.put(blob, 'x'));
      const got = await tx('readonly', (s) => s.get('x'));
      await tx('readwrite', (s) => s.delete('x'));
      dbh.close();
      if (!got || got.size !== 65536) return { st: 'fail', info: 'прочиталось не то' };
      const n = app.files ? app.files.list('audio').length + app.files.list('tab').length : 0;
      return { st: 'ok', info: Math.round(performance.now() - t0) + ' мс, файлов в медиатеке ' + n };
    } catch (e) { return { st: 'fail', info: String((e && e.message) || e) }; }
  },
  // localStorage и место: занято / квота, постоянное ли хранилище
  async storage() {
    try { localStorage.setItem('melete.check', '1'); if (localStorage.getItem('melete.check') !== '1') throw new Error('read'); localStorage.removeItem('melete.check'); } catch { return { st: 'fail', info: 'localStorage не пишет — данные не сохранятся' }; }
    const mb = (n) => (n / 1048576).toFixed(0) + ' МБ';
    let est = null, persisted = null;
    try { est = await navigator.storage.estimate(); } catch { /* нет оценки */ }
    try { persisted = await navigator.storage.persisted(); } catch { /* нет API */ }
    const info = (est ? 'занято ' + mb(est.usage || 0) + ' из ' + mb(est.quota || 0) : 'оценки места нет') + (persisted === null ? '' : persisted ? ', постоянное' : ', не постоянное');
    const low = est && est.quota && est.quota - (est.usage || 0) < 200 * 1048576;
    return { st: low ? 'warn' : 'ok', info: info + (low ? ' — мало места' : '') };
  },
  // Встроенные модели и банки (APK и Windows): файлы на месте
  async models() {
    if (!stemsSupported()) return { st: 'skip', info: 'веб-версия без моделей' };
    const base = document.baseURI;
    const have = async (path) => {
      try {
        const r = await fetch(new URL(path, base).href, { headers: { Range: 'bytes=0-0' } });
        if (r.body) { try { await r.body.cancel(); } catch { /* */ } }
        return r.ok;
      } catch { return false; }
    };
    const want = [['дорожки', 'models/demucs/htdemucs_embedded.onnx'], ['тональность', 'models/mir/skey.onnx'], ['доли', 'models/mir/small0.onnx'], ['аккорды', 'models/mir/chordnet.onnx'], ['рояль', 'models/piano/pack.json'], ['ноты', 'bp/model.json']];
    const got = await Promise.all(want.map(([, p]) => have(p)));
    const missing = want.filter((_, i) => !got[i]).map(([n]) => n);
    const eng = stemsNative() ? (isDesktop() ? 'нативный (Windows)' : 'нативный (Android)') : 'веб (WebAssembly)';
    return missing.length ? { st: missing.length === want.length ? 'fail' : 'warn', info: 'нет: ' + missing.join(', ') + '; движок дорожек ' + eng } : { st: 'ok', info: 'все на месте; движок дорожек ' + eng };
  },
  // Экран: размер, масштаб, нет горизонтального переполнения
  async screen() {
    const de = document.documentElement;
    const over = de.scrollWidth > innerWidth + 1;
    const info = innerWidth + '×' + innerHeight + ' @' + (devicePixelRatio || 1) + ', экран ' + screen.width + '×' + screen.height;
    return over ? { st: 'fail', info: info + ' — страница шире окна на ' + (de.scrollWidth - innerWidth) + ' px' } : { st: 'ok', info };
  },
  // Окружение — только сведения: платформа, потоки, WebAssembly, MIDI, камеры, уведомления
  async env() {
    const n = navigator, out = [];
    out.push(Capacitor.isNativePlatform() ? 'Android' : isDesktop() ? 'Windows' : 'веб');
    out.push('ядер ' + (n.hardwareConcurrency || '?') + (n.deviceMemory ? ', память ' + n.deviceMemory + ' ГБ' : ''));
    out.push(typeof WebAssembly === 'undefined' ? 'без WebAssembly' : globalThis.crossOriginIsolated ? 'WebAssembly с потоками' : 'WebAssembly без потоков');
    out.push(typeof AudioWorkletNode === 'undefined' ? 'без AudioWorklet' : 'AudioWorklet есть');
    out.push(n.requestMIDIAccess || Capacitor.isPluginAvailable('Midi') ? 'MIDI есть' : 'MIDI нет');
    try { const d = await n.mediaDevices.enumerateDevices(); out.push('камер ' + d.filter((x) => x.kind === 'videoinput').length + ', микрофонов ' + d.filter((x) => x.kind === 'audioinput').length); } catch { out.push('устройства не перечислены'); }
    if (Capacitor.isNativePlatform()) {
      try { const { LocalNotifications } = await import('@capacitor/local-notifications'); const p = await LocalNotifications.checkPermissions(); out.push('уведомления: ' + p.display); } catch { /* */ }
    } else if (typeof Notification !== 'undefined') out.push('уведомления: ' + Notification.permission);
    return { st: 'ok', info: out.join(', ') };
  },
};

// Запуск всех проверок по порядку; onStep(id, result) — после каждой. Возвращает [{ id, st, info }]
export async function runChecks(app, onStep = () => {}) {
  const out = [];
  log('check', 'самопроверка: начало');
  for (const id of CHECKS) {
    let r;
    try { r = await withTimeout(checks[id](app)); } catch (e) { r = { st: 'fail', info: String((e && e.message) || e) }; }
    if (!r || !r.st) r = { st: 'fail', info: 'нет результата' };
    out.push({ id, ...r });
    log('check', id + ': ' + r.info, r.st === 'fail' ? 'e' : r.st === 'warn' ? 'w' : 'i');
    onStep(id, r);
  }
  log('check', 'самопроверка: ' + summary(out));
  return out;
}

// Счёт по исходам: { ok, warn, fail, skip }
export const counts = (res) => ({ ok: 0, warn: 0, fail: 0, skip: 0, ...Object.fromEntries(['ok', 'warn', 'fail', 'skip'].map((st) => [st, res.filter((r) => r.st === st).length])) });
const summary = (res) => { const n = counts(res); return n.ok + ' в порядке' + (n.warn ? ', ' + n.warn + ' с замечанием' : '') + (n.fail ? ', ' + n.fail + ' не прошло' : '') + (n.skip ? ', ' + n.skip + ' пропущено' : ''); };
