// Ансамбль: группа играет вместе, у каждого рядом свой телефон — он пишет свою партию; компьютер (Windows, хост)
// ведёт дубль, собирает записи и делает из них проект студии. Связь — та же, что «Связь с телефоном» (sync.js,
// сопряжение по коду, порт 53319): телефон в окне «Ансамбль» опрашивает компьютер 4 раза в секунду.
// Точный общий старт по сети невозможен (своя задержка микрофона у каждого телефона, кварцы расходятся), поэтому
// точность — после записи: компьютер даёт из динамика сигнал в начале (перед счётом «3, 2, 1») и в конце; по нему
// каждая дорожка выравнивается до долей миллисекунды и с поправкой хода часов (src/audio/align.js). Счёт на экранах —
// по сверенным часам (±десятки мс), а слышат его все из динамика компьютера.
// Ход дубля (компьютер): idle → arm (телефоны включают запись) → count (сигнал, счёт; все пишут) → rec → end (сигнал
// конца) → collect (телефоны останавливаются, сохраняют исходник у себя и отправляют копию) → сборка: выровненные
// дорожки (WAV 48 кГц, файлы с пометкой ens) и проект студии; по желанию — чистые дорожки (разделение, улучшенное
// качество: из записи барабанщика остаются барабаны, вокалиста — голос) вторым проектом. Исходники не меняются.
// Запись не теряется: исходник сохраняется на телефоне в медиатеку до отправки; оборвалась связь — запись идёт дальше
// и остановится по следующему ответу компьютера (или кнопкой).
import { t } from '../i18n/index.js';
import { chirp, locate, trackPlan, alignChannels, clockFit, OUT_SR, CHIRP } from '../audio/align.js';
import { decodeWav, encodeWav, peaks } from '../audio/voicefx.js';
import { projectFromStems } from '../music/project.js';
import { http, pcOf, CHUNK, b64, metaOf } from './sync.js';
import { log, logErr } from './log.js';

export const PARTS = ['vocals', 'guitar', 'bass', 'drums', 'piano', 'other'];
// Чистая дорожка партии: режим разделения и часть (прочее — не делится)
export const STEM_OF = { vocals: ['4', 'vocals'], drums: ['4', 'drums'], bass: ['4', 'bass'], guitar: ['6', 'guitar'], piano: ['6', 'piano'] };
// Партия по профилю музыканта
export function partOf(instruments = []) {
  const m = { vocal: 'vocals', guitar: 'guitar', egtr: 'guitar', uke: 'guitar', mando: 'guitar', banjo: 'guitar', bass: 'bass', dbass: 'bass', drums: 'drums', piano: 'piano' };
  for (const i of instruments) if (m[i]) return m[i];
  return 'other';
}
export const LIVE_MS = 4000;      // телефон на связи, если отвечал за это время
export const ARM_WAIT = 5000;     // сколько ждать, пока все включат запись
export const COUNT = [1, 2, 3];   // секунды после сигнала: «3», «2», «1»
export const GO = 4;              // «поехали» — через 4 с после сигнала
export const TAIL = 0.9;          // после сигнала конца — ещё столько секунд записи
export const HEAD = 0.5;          // дорожки начинаются через полсекунды после сигнала (сам сигнал вырезан)

/* ---------- чистые функции ---------- */

// Состояние участника для экрана
export function memberState(m, take, phase, now) {
  if (now - m.seen > LIVE_MS) return 'lost';
  if (take && m.got && m.got[take]) return 'got';
  if (take && m.rec === take && (phase === 'arm' || phase === 'count' || phase === 'rec' || phase === 'end')) return 'rec';
  if (take && phase === 'collect' && m.up != null && m.rec === take) return 'up';
  return 'here';
}
// Ждём ли ещё кого-то: участники дубля (включали запись), кто ещё не прислал файл и на связи
export function waitingFor(members, take, now) {
  return members.filter((m) => m.takes && m.takes.includes(take) && !(m.got && m.got[take]) && now - m.seen <= LIVE_MS * 15);
}
// Число на экране счёта: 3, 2, 1, 0 (поехали) или null — по времени до «поехали» (мс)
export function countNum(left) { if (left == null) return null; if (left > 3000) return null; if (left > 0) return Math.ceil(left / 1000); return left > -900 ? 0 : null; }

/* ---------- компьютер: ведущий ---------- */

// app — ядро (files, store, jobs, syncSrv); sound — звук хоста ({ ctx(), play(buf, at) }); now — часы (мс)
export function createEnsembleHost(app, { sound, now = () => Date.now() } = {}) {
  const subs = new Set(), emit = () => subs.forEach((fn) => { try { fn(); } catch { /* */ } });
  const members = new Map(); // ключ телефона → { key, name, part, seen, rec, takes: [], got: { take: fileId }, up, recAt }
  const takes = {};          // номер → { t0, t1, gap, epoch0, at, project, clean, err }
  let sid = '', phase = 'idle', take = 0, armAt = 0, goAt = 0, endAt = 0, timer = 0, work = null; // work — сборка: { stage, done, total }
  const list = () => [...members.values()];
  const live = () => list().filter((m) => now() - m.seen <= LIVE_MS);
  const setPhase = (p) => { phase = p; emit(); };

  function tick() {
    const n = now();
    if (phase === 'arm') {
      const L = live();
      if ((L.length && L.every((m) => m.rec === take)) || n - armAt > ARM_WAIT) startCount();
    } else if (phase === 'count' && n >= goAt) setPhase('rec');
    else if (phase === 'end' && n >= endAt) { setPhase('collect'); log('ens', 'дубль ' + take + ': остановлен, ждём записи'); }
    if (phase === 'collect' && !work) {
      const T = takes[take], w = waitingFor(list(), take, n);
      if (T && !T.project && !T.err && !w.length && list().some((m) => m.got && m.got[take])) assemble(take).catch(() => {});
    }
  }
  function startCount() {
    const c = sound.ctx();
    if (!c) { setPhase('idle'); log('ens', 'нет звука на компьютере', 'w'); return; }
    const sr = c.sampleRate, cb = sound.buffer(chirp(sr), sr), t0 = c.currentTime + 0.3;
    sound.play(cb, t0);
    COUNT.forEach((s) => sound.play(sound.buffer(beep(sr, 880, 0.09), sr), t0 + s));
    sound.play(sound.buffer(beep(sr, 1320, 0.14), sr), t0 + GO);
    const epoch0 = now() + (t0 - c.currentTime) * 1000;
    takes[take] = { t0, epoch0, at: now(), members: live().map((m) => m.key) };
    list().forEach((m) => { if (m.rec === take && !m.takes.includes(take)) m.takes.push(take); });
    goAt = epoch0 + GO * 1000;
    log('ens', 'дубль ' + take + ': счёт, телефонов ' + live().filter((m) => m.rec === take).length + ' из ' + live().length);
    setPhase('count');
  }
  const beep = (sr, f, d) => { const n = Math.round(d * sr), x = new Float32Array(n); for (let i = 0; i < n; i++) x[i] = 0.35 * Math.sin((2 * Math.PI * f * i) / sr) * Math.min(1, i / (0.004 * sr), (n - i) / (0.02 * sr)); return x; };

  // Сборка дубля: выровненные дорожки → проект; clean — потом чистые дорожки
  async function assemble(n, { clean = app.store.state.settings.ensClean !== false } = {}) {
    const T = takes[n];
    if (!T || work) return null;
    const F = app.files, who = list().filter((m) => m.got && m.got[n]);
    work = { stage: 'align', done: 0, total: who.length }; emit();
    try {
      const tracks = [];
      for (const m of who) {
        const rec = F.get(m.got[n]);
        if (!rec || !rec.blob) continue;
        const w = decodeWav(new Uint8Array(await rec.blob.arrayBuffer()));
        if (!w) { log('ens', m.name + ': не WAV', 'w'); continue; }
        const mono = w.ch.length === 1 ? w.ch[0] : w.ch[0].map((v, i) => (v + w.ch[1][i]) / 2);
        let loc = locate(mono, w.sr, T.gap), approx = false;
        if (loc.s == null) {
          // сигнала не слышно — по сверенным часам (точность — десятки мс)
          if (m.recAt == null) { log('ens', m.name + ': сигнал не найден, пропуск', 'w'); continue; }
          loc = { s: ((T.epoch0 - m.recAt) / 1000) * w.sr, rate: w.sr }; approx = true;
        }
        const plan = trackPlan(loc, w.sr, HEAD, T.gap), ch = await alignChannels(w.ch, plan, () => new Promise((r) => setTimeout(r, 0)));
        const wav = encodeWav(ch, OUT_SR), at = Date.now(), name = m.name + ' — ' + t('ens.part.' + m.part);
        const out = { id: 'en' + at.toString(36) + tracks.length, name: name + '.wav', size: wav.length, type: 'audio/wav', kind: 'audio', songs: [], created: at, noAuto: true,
          blob: new Blob([wav], { type: 'audio/wav' }), dur: plan.n / OUT_SR, peaks: Array.from(peaks(ch, 600)), ens: { sid, take: n, part: m.part, who: m.name, src: rec.id, role: 'aligned', ...(approx ? { approx: true } : {}) } };
        await F.add(out);
        tracks.push({ m, rec: out, approx, snr: loc.snr, drift: plan.driftMs });
        log('ens', m.name + ': выровнено' + (approx ? ' по часам' : ', сигнал ×' + Math.round(loc.snr) + ', ход часов ' + plan.driftMs + ' мс'));
        work.done++; emit();
      }
      if (!tracks.length) throw new Error('empty');
      const name = t('ens.projName', { d: stamp(T.at) });
      const p = saveProject(projectFromStems(name, tracks.map((x) => ({ part: x.m.part, name: x.m.name + ' · ' + t('ens.part.' + x.m.part), fileId: x.rec.id, dur: x.rec.dur }))));
      T.project = p.id; T.approx = tracks.filter((x) => x.approx).map((x) => x.m.name); T.tracks = tracks.map((x) => ({ who: x.m.name, part: x.m.part, id: x.rec.id }));
      log('ens', 'дубль ' + n + ': проект из ' + tracks.length + ' дорожек');
      work = null; emit();
      if (clean && app.jobs && app.jobs.supported()) cleanTake(n).catch((e) => logErr('ens', e));
      return p;
    } catch (e) { T.err = e.message; logErr('ens', e); work = null; emit(); throw e; }
  }
  // Чистые дорожки: каждая — разделение в улучшенном качестве, берётся партия музыканта; «прочее» — как есть
  async function cleanTake(n) {
    const T = takes[n], F = app.files, J = app.jobs;
    if (!T || !T.tracks) return;
    work = { stage: 'clean', done: 0, total: T.tracks.length }; emit();
    const out = [];
    try {
      for (const x of T.tracks) {
        const rec = F.get(x.id), how = STEM_OF[x.part];
        let use = rec;
        if (rec && how) {
          while (J.busy()) await new Promise((r) => setTimeout(r, 1000)); // фоновая очередь доделывает своё
          try {
            const r = await J.separate(rec, how[0], { hq: true });
            use = r.stems.find((s) => s.stem.part === how[1]) || rec;
          } catch (e) { logErr('ens', e); }
        }
        if (use) out.push({ part: x.part, name: x.who + ' · ' + t('ens.part.' + x.part), fileId: use.id, dur: use.dur || rec.dur });
        work.done++; emit();
      }
      const p = saveProject(projectFromStems(t('ens.projName', { d: stamp(T.at) }) + ' · ' + t('ens.cleanSuffix'), out));
      T.clean = p.id;
      log('ens', 'дубль ' + n + ': чистые дорожки готовы');
    } finally { work = null; emit(); }
  }
  function saveProject(p) {
    const L = (app.store.state.projects ||= []);
    p.updatedAt = app.store.now(); L.push(p); app.store.save();
    return p;
  }

  return {
    get sid() { return sid; },
    get phase() { return phase; },
    get take() { return take; },
    get goAt() { return goAt; },
    get work() { return work; },
    takes,
    members: () => list().map((m) => ({ ...m, st: memberState(m, take, phase, now()) })),
    get active() { return !!sid; },
    // идёт дубль: фоновые обработки (autostems.js) ждут — компьютер даёт сигнал и счёт
    get recording() { return phase === 'arm' || phase === 'count' || phase === 'rec' || phase === 'end'; },
    open() { if (!sid) { sid = 'e' + now().toString(36); members.clear(); log('ens', 'ансамбль открыт'); } if (!timer) timer = setInterval(tick, 100); emit(); },
    close() { if (phase === 'arm' || phase === 'count' || phase === 'rec') this.stop(); clearInterval(timer); timer = 0; sid = ''; phase = 'idle'; emit(); },
    // «Запись»: телефоны включают запись, потом сигнал и счёт
    record() {
      if (!sid || !(phase === 'idle' || phase === 'collect') || work) return false;
      take++; armAt = now(); members.forEach((m) => { m.up = null; });
      log('ens', 'дубль ' + take + ': запись');
      setPhase('arm');
      return true;
    },
    // «Стоп»: до сигнала — отмена; после — сигнал конца
    stop() {
      if (phase === 'arm') { setPhase('idle'); return; }
      if (phase !== 'count' && phase !== 'rec') return;
      const c = sound.ctx(), T = takes[take];
      const t1 = Math.max(c.currentTime + 0.15, T.t0 + GO + 0.5);
      sound.play(sound.buffer(chirp(c.sampleRate), c.sampleRate), t1);
      T.t1 = t1; T.gap = t1 - T.t0;
      endAt = now() + (t1 - c.currentTime + CHIRP.dur + TAIL) * 1000;
      setPhase('end');
    },
    assemble: (n = take, o) => assemble(n, o),
    clean: (n = take) => cleanTake(n),
    // Запрос телефона (sync.js: /melete/v1/ens): опрос и сверка часов
    poll(key, peerName, j = {}) {
      if (!sid) return { status: 409, json: { error: 'off' } };
      const m = members.get(key) || { key, takes: [], got: {} };
      Object.assign(m, { name: String(j.name || peerName || '…').slice(0, 40), part: PARTS.includes(j.part) ? j.part : m.part || 'other', seen: now(), rec: +j.rec || 0, up: j.up != null ? +j.up : m.up });
      if (j.recAt != null && m.rec === take) m.recAt = +j.recAt;
      if (m.rec === take && (phase === 'count' || phase === 'rec' || phase === 'end') && !m.takes.includes(take)) m.takes.push(take);
      const fresh = !members.has(key);
      members.set(key, m);
      if (fresh) { log('ens', 'подключился: ' + m.name); emit(); }
      return { status: 200, json: { th: now(), sid, phase, take, goAt, n: live().length, got: !!m.got[take] } };
    },
    // Файл дубля дошёл (sync.js: /melete/v1/put с пометкой ens)
    gotFile(key, meta) {
      const m = members.get(key), e = meta && meta.ens;
      if (!m || !e || e.sid !== sid) return;
      m.got[e.take] = meta.id; m.up = null;
      log('ens', m.name + ': запись получена (дубль ' + e.take + ')');
      emit();
    },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
}
const stamp = (at) => { const d = new Date(at), p = (x) => String(x).padStart(2, '0'); return p(d.getDate()) + '.' + p(d.getMonth() + 1) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()); };

/* ---------- телефон: участник ---------- */

// rec — движок записи ({ start, stop, read } — voiceengine.js); H — HTTP (sync.js)
export function createEnsembleClient(app, { rec, H = http, now = () => Date.now() } = {}) {
  const subs = new Set(), emit = () => subs.forEach((fn) => { try { fn(); } catch { /* */ } });
  const S = { on: false, conn: false, host: null, part: null, samples: [], off: null, recTake: 0, recAt: null, recording: false, up: null, saved: null, err: null, phase: 'idle', take: 0, goAt: 0, sid: '' };
  let timer = 0, busy = false;
  const st = () => app.store.state.settings;
  const part = () => S.part || st().ensPart || partOf(((st().profile || {}).instruments) || []);

  async function poll() {
    const pc = pcOf();
    if (!pc) { S.conn = false; S.err = 'nopc'; emit(); return; }
    const t0 = now();
    try {
      const r = await H('POST', pc.addr + '/melete/v1/ens', { key: pc.key, json: { t0, name: myName(), part: part(), rec: S.recTake, live: S.recording, up: S.up, recAt: S.recAt != null && S.off != null ? S.recAt + S.off : null }, timeout: 3000 });
      const t1 = now();
      S.samples.push({ t0, th: r.th, t1 }); if (S.samples.length > 40) S.samples.shift();
      const fit = clockFit(S.samples); if (fit) S.off = fit.off;
      S.conn = true; S.err = null; S.host = pc.name;
      if (r.sid !== S.sid) { S.sid = r.sid; S.saved = null; }
      Object.assign(S, { phase: r.phase, take: r.take, goAt: r.goAt });
      await react(r);
    } catch (e) { S.conn = false; S.err = e.status === 409 ? 'hostoff' : e.status === 401 ? 'key' : 'unreachable'; }
    emit();
  }
  async function react(r) {
    if (busy) return;
    if ((r.phase === 'arm' || r.phase === 'count' || r.phase === 'rec') && !S.recording && S.recTake !== r.take && S.failTake !== r.take) { busy = true; try { await startRec(r.take); } finally { busy = false; } return; }
    if (S.recording && r.take === S.recTake && (r.phase === 'collect' || r.phase === 'idle')) { busy = true; try { await stopRec(r.phase === 'idle'); } finally { busy = false; } }
  }
  async function startRec(n) {
    try {
      await rec.start({ deviceId: -1, stereo: false, raw: true });
      S.recTake = n; S.recording = true; S.recAt = now(); S.saved = null; S.err = null;
      log('ens', 'запись дубля ' + n);
    } catch (e) { S.err = 'mic'; S.failTake = n; logErr('ens', e); }
    emit();
  }
  // Остановить: сохранить исходник в медиатеку (до отправки), потом отправить копию компьютеру; cancel — отменили до сигнала
  async function stopRec(cancel = false) {
    S.recording = false; emit();
    let r;
    try { const x = await rec.stop(); r = { x, u8: await rec.read(x.path) }; } catch (e) { logErr('ens', e); S.err = 'save'; return; }
    if (cancel) { S.recTake = 0; S.recAt = null; return; }
    const at = now(), w = decodeWav(r.u8), d = new Date(at), p = (x) => String(x).padStart(2, '0');
    const name = t('ens.fileName', { part: t('ens.part.' + part()), d: p(d.getDate()) + '.' + p(d.getMonth() + 1), t: p(d.getHours()) + '-' + p(d.getMinutes()) }) + '.wav';
    const file = { id: 'er' + at.toString(36), name, size: r.u8.length, type: 'audio/wav', kind: 'audio', songs: [], created: at, noAuto: true, blob: new Blob([r.u8], { type: 'audio/wav' }),
      dur: w ? w.ch[0].length / w.sr : r.x.sec, ...(w ? { peaks: Array.from(peaks(w.ch, 600)) } : {}), ens: { sid: S.sid, take: S.recTake, part: part(), who: myName(), role: 'raw' } };
    await app.files.add(file);
    S.saved = file.id;
    log('ens', 'дубль ' + S.recTake + ' сохранён: ' + file.dur.toFixed(1) + ' с');
    emit();
    await send(file);
  }
  async function send(file) {
    const pc = pcOf(), meta = { ...metaOf(file), size: file.blob.size };
    S.up = 0; emit();
    try {
      let off = 0;
      while (off < meta.size) {
        const u8 = new Uint8Array(await file.blob.slice(off, off + CHUNK).arrayBuffer());
        const res = await H('POST', pc.addr + '/melete/v1/put', { key: pc.key, json: { meta, off, b64: b64.from(u8) }, timeout: 120000 });
        if (res.done) break;
        off = res.got != null ? res.got : off + u8.length;
        S.up = off / meta.size; emit();
      }
      S.up = null; S.sent = file.id;
      log('ens', 'дубль отправлен');
    } catch (e) { S.up = null; S.err = 'send'; S.unsent = file.id; logErr('ens', e); }
    emit();
  }
  const myName = () => (st().profile && st().profile.name) || t('ens.phone');
  const loop = async () => { if (!S.on) return; await poll(); if (S.on) timer = setTimeout(loop, S.recording || S.phase === 'count' || S.phase === 'arm' ? 150 : 250); };

  return {
    S,
    part,
    setPart(p) { if (PARTS.includes(p)) { S.part = p; st().ensPart = p; app.store.settingsChanged && app.store.settingsChanged(); emit(); } },
    // мс до «поехали» по часам телефона (или null)
    left() { return S.off == null || !S.goAt ? null : S.goAt - (now() + S.off); },
    join() { if (S.on) return; S.on = true; S.samples = []; loop(); },
    async leave() { S.on = false; clearTimeout(timer); if (S.recording) await stopRec(false); emit(); },
    stopNow: () => (S.recording ? stopRec(false) : null),
    resend() { const f = S.unsent && app.files.get(S.unsent); if (f) { S.unsent = null; S.err = null; send(f); } },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
}

// Звук хоста: сигнал и счёт — прямо на выход, мимо компрессора и микшера (одинаковая громкость каждый раз)
// (один узел на выходе на всё время; источники — одноразовые, к нему)
export function hostSound(getContext, directOut) {
  let out = null;
  return {
    ctx: () => getContext(),
    buffer(x, sr) { const c = getContext(), b = c.createBuffer(1, x.length, sr); b.copyToChannel(x, 0); return b; },
    play(buf, at) {
      const c = getContext();
      if (!out) { out = c.createGain(); directOut(out); }
      const s = c.createBufferSource(); s.buffer = buf; s.connect(out); s.onended = () => s.disconnect(); s.start(at);
    },
  };
}
