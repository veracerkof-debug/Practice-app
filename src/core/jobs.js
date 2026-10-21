// Долгие обработки записей медиатеки — одна за раз, с ходом и отменой: разделение на дорожки (src/audio/stems.js) и
// снятие нот (src/audio/transcribe.js), текст песни (src/audio/lyrics.js, только Windows: rec.lyr на самой записи) и
// шумоподавление (src/audio/denoise.js, только Windows: новый WAV рядом с записью, пометка dn: { src }).
// Результаты ложатся в медиатеку рядом с записью: дорожки — WAV с пометкой
// stem: { src, part, mode, hq, db } — обычная и улучшенная (hq) версии живут рядом, ноты — .mid с пометкой trans: { src }. Запускают плеер медиатеки (по кнопке) и
// фоновая очередь (autostems.js). Подписчики получают состояние: { kind: 'stems' | 'notes' | 'lyrics' | 'denoise', id, stage, frac, stageAt, mode, auto }.
// Без DOM: имена дорожек — через t() ядра.
import { t } from '../i18n/index.js';
import { separate, PARTS_OF, stemEmpty, stemLevelDb, stemsSupported } from '../audio/stems.js';
import { transcribe } from '../audio/transcribe.js';
import { transcribeLyrics, lyricsSupported } from '../audio/lyrics.js';
import { denoise, denoiseSupported } from '../audio/denoise.js';
import { encodeWav, peaks } from '../audio/voicefx.js';
import { takeDur, writeMidiTracks } from '../music/midi.js';
import { beatMap, fitOffset, quantizeNotes, instForNotes, notesToEventsSec } from '../music/quantize.js';
import { log, logErr } from './log.js';

const stemPeaks = (ch) => { const pk = peaks(ch, 600), mx = Math.max(1e-6, ...pk); return Array.from(pk, (v) => Math.round((v / mx) * 100) / 100); };
const base = (r) => String(r.name || '').replace(/\.[a-z0-9]+$/i, '');

export const stemsOf = (files, id) => files.list('audio').filter((r) => r.stem && r.stem.src === id);
export const notesOf = (files, id) => files.list('midi').find((r) => r.trans && r.trans.src === id) || null;
// hq — нужен набор «ночного» качества (обычный не считается)
// Дорожка вокала записи — для текста песни: улучшенная версия, если есть
export const vocalsOf = (files, id) => { const v = stemsOf(files, id).filter((r) => r.stem.part === 'vocals'); return v.find((r) => r.stem.hq) || v[0] || null; };
export const denoisedOf = (files, id) => files.list('audio').find((r) => r.dn && r.dn.src === id) || null;
export const hasStems = (files, id, mode = null, hq = false) => stemsOf(files, id).some((r) => (!mode || (r.stem.mode || '4') === mode) && (!hq || r.stem.hq));

export function createJobs(files) {
  const subs = new Set();
  let cur = null; // { kind, id, rec, stage, frac, mode, job }
  const emit = () => subs.forEach((fn) => { try { fn(cur); } catch { /* */ } });
  const set = (patch) => { if (!cur) return; Object.assign(cur, patch); emit(); };

  // Разделить запись rec в режиме mode ('2' | '4' | '6') → { stems: [записи], absent: [части] }
  async function runStems(rec, mode, hq) {
    const res = await cur.job.promise;
    const stems = [], absent = [], at = Date.now(), parts = PARTS_OF[mode] || PARTS_OF['4'];
    for (const old of stemsOf(files, rec.id).filter((x) => (x.stem.mode || '4') === mode && !!x.stem.hq === !!hq)) await files.remove(old.id); // другая версия (обычная / улучшенная) остаётся
    for (const part of parts) {
      const s = res.parts[part];
      if (!s) continue;
      if (stemEmpty(s, res.mix)) { absent.push(part); continue; }
      const ch = [s.left, s.right], wav = encodeWav(ch, res.sr);
      const r = { id: 'sm' + at.toString(36) + part.slice(0, 2), name: base(rec) + ' — ' + t('stems.part.' + part) + '.wav', size: wav.length, type: 'audio/wav', kind: 'audio', songs: rec.songs || [], created: at + parts.indexOf(part),
        blob: new Blob([wav], { type: 'audio/wav' }), dur: res.dur, peaks: stemPeaks(ch), stem: { src: rec.id, part, mode, hq: !!hq, db: Math.round(stemLevelDb(s, res.mix) * 10) / 10 } };
      await files.add(r);
      stems.push(r);
    }
    rec.stemsAbsent = { ...(rec.stemsAbsent && !Array.isArray(rec.stemsAbsent) ? rec.stemsAbsent : {}), [mode]: absent }; // чего в записи нет — для плеера
    rec.stemsAt = at;
    await files.save(rec);
    log('jobs', 'дорожки: ' + mode + (hq ? ' hq' : '') + ' → ' + stems.length + (absent.length ? ', нет: ' + absent.join(', ') : ''));
    return { stems, absent };
  }
  // Снять ноты записи rec → запись .mid
  // Ноты модели → ритм: сетка долей записи (rec.ana: доли, сильные, темп) или темп по записи с подгонкой сдвига; начала и
  // концы — к шестнадцатым, паузы сами, призвуки вон; инструмент по характеру нот. Файл .mid — с темпом и размером
  // (такты в любой программе), события игры (take.ev) — по карте записи (следуют за ней); score — ноты в долях для студии.
  // С изгибами высоты (bends) ритм не трогаем: изгибы привязаны к сырому времени
  function withRhythm(rec, res, bends) {
    const ana = rec.ana || null, raw = res.raw || [];
    const bpm = (ana && ana.bpm) || (res.tempo && res.tempo.bpm) || 120, bpb = (ana && ana.bpb) || 4;
    const map = ana && ana.beats && ana.beats.length >= 4 ? beatMap(ana.beats, bpm, { downbeats: ana.downbeats, bpb })
      : beatMap(null, bpm, { offset: fitOffset(raw.map((n) => n.t), 60 / bpm) });
    const notes = quantizeNotes(raw, map, { div: 4 }), inst = instForNotes(notes);
    const program = inst === 'wair' ? 89 : inst === 'abass' ? 33 : 0;
    const mid = writeMidiTracks({ bpm: map.bpm || bpm, num: bpb, den: 4, name: base(rec), key: ana && ana.pc != null ? { pc: ana.pc, minor: !!ana.minor } : null, tracks: [{ name: base(rec), program, notes }] });
    const ev = bends ? res.ev : notesToEventsSec(notes, map);
    return { ev, mid, notes: notes.length, score: { v: 1, bpm: map.bpm || bpm, num: bpb, inst, grid: 4, beats: !!(ana && ana.beats && ana.beats.length >= 4), notes } };
  }
  async function runNotes(rec, bends) {
    const res = await cur.job.promise;
    const at = Date.now(), old = notesOf(files, rec.id);
    const q = res.raw ? withRhythm(rec, res, bends) : { ev: res.ev, mid: res.mid, notes: res.notes, score: null };
    const r = { id: old ? old.id : 'tn' + at.toString(36), name: base(rec) + ' — ' + t('stems.notesSuffix') + '.mid', size: q.mid.length, type: 'audio/midi', kind: 'midi', tool: 'piano', songs: rec.songs || [],
      created: at, blob: new Blob([q.mid], { type: 'audio/midi' }), take: { v: 1, ev: q.ev }, dur: takeDur(q.ev), notes: q.notes, trans: { src: rec.id }, ...(q.score ? { score: q.score } : {}) };
    await files.add(r);
    log('jobs', 'ноты: ' + q.notes + (q.score ? ', темп ' + q.score.bpm + (q.score.beats ? ' по долям записи' : ' ровный') + ', ' + q.score.inst : ''));
    return r;
  }

  // Текст песни записи rec → rec.lyr (на самой записи; строки с временем)
  async function runLyrics(rec, src) {
    const res = await cur.job.promise;
    rec.lyr = { v: 1, lang: res.lang, lines: res.lines, src, at: Date.now() };
    delete rec.lyrTried;
    await files.save(rec);
    log('jobs', 'текст: ' + res.lines.length + ' строк, ' + (res.lang || '?') + ', ' + src);
    return rec.lyr;
  }

  // Очищенная запись → новый WAV (моно 48 кГц) рядом; прежняя очищенная версия заменяется
  async function runDenoise(rec) {
    const res = await cur.job.promise;
    const at = Date.now(), old = denoisedOf(files, rec.id), wav = encodeWav([res.x], res.sr);
    const r = { id: old ? old.id : 'dn' + at.toString(36), name: base(rec) + ' — ' + t('stems.cleanSuffix') + '.wav', size: wav.length, type: 'audio/wav', kind: 'audio', songs: rec.songs || [], created: at,
      blob: new Blob([wav], { type: 'audio/wav' }), dur: res.dur, peaks: stemPeaks([res.x]), dn: { src: rec.id, at }, noAuto: true };
    await files.add(r);
    log('jobs', 'шум убран: ' + r.name);
    return r;
  }

  const api = {
    get current() { return cur; },
    busy: () => !!cur,
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    supported: () => stemsSupported(),
    // → Promise<{ stems, absent }>; занято — отказ 'busy'
    separate(rec, mode = '4', { onDone = () => {}, auto = false, hq = false } = {}) {
      if (cur) return Promise.reject(new Error('busy'));
      if (!stemsSupported()) return Promise.reject(new Error('web'));
      cur = { kind: 'stems', id: rec.id, rec, stage: 'load', frac: 0, mode, hq: !!hq, auto, t0: Date.now() };
      cur.job = separate(rec.blob, { mode, hq, onStage: (stage, frac) => set({ stage, frac, ...(cur && stage !== cur.stage ? { stageAt: Date.now() } : {}) }) });
      emit();
      return runStems(rec, mode, hq).then((r) => { onDone(r); return r; }).catch((e) => { if (!(e && e.message === 'cancel')) logErr('jobs', e); throw e; }).finally(() => { cur = null; emit(); });
    },
    notes(rec, { sens = 'normal', bends = false } = {}) {
      if (cur) return Promise.reject(new Error('busy'));
      cur = { kind: 'notes', id: rec.id, rec, stage: 'load', frac: 0, t0: Date.now() };
      cur.job = transcribe(rec.blob, { sens, bends, name: base(rec), onStage: (stage, f) => set({ stage, frac: f, ...(cur && stage !== cur.stage ? { stageAt: Date.now() } : {}) }) });
      emit();
      return runNotes(rec, bends).catch((e) => { if (!(e && e.message === 'cancel')) logErr('jobs', e); throw e; }).finally(() => { cur = null; emit(); });
    },
    lyricsSupported: () => lyricsSupported(),
    // Текст песни (Windows): по отделённому вокалу, если он есть, иначе по записи целиком
    lyrics(rec, { auto = false, lang = null } = {}) {
      if (cur) return Promise.reject(new Error('busy'));
      if (!lyricsSupported()) return Promise.reject(new Error('web'));
      const v = vocalsOf(files, rec.id), src = v ? 'vocals' : 'mix';
      cur = { kind: 'lyrics', id: rec.id, rec, stage: 'decode', frac: 0, auto, t0: Date.now() };
      cur.job = transcribeLyrics((v || rec).blob, { lang, onStage: (stage, frac) => set({ stage, frac, ...(cur && stage !== cur.stage ? { stageAt: Date.now() } : {}) }) });
      emit();
      return runLyrics(rec, src).catch((e) => { if (!(e && e.message === 'cancel')) logErr('jobs', e); throw e; }).finally(() => { cur = null; emit(); });
    },
    denoiseSupported: () => denoiseSupported(),
    // Убрать шум (Windows): atten — предел ослабления в дБ (null — полностью)
    denoise(rec, { atten = null } = {}) {
      if (cur) return Promise.reject(new Error('busy'));
      if (!denoiseSupported()) return Promise.reject(new Error('web'));
      cur = { kind: 'denoise', id: rec.id, rec, stage: 'decode', frac: 0, t0: Date.now() };
      cur.job = denoise(rec.blob, { atten, onStage: (stage, frac) => set({ stage, frac, ...(cur && stage !== cur.stage ? { stageAt: Date.now() } : {}) }) });
      emit();
      return runDenoise(rec).catch((e) => { if (!(e && e.message === 'cancel')) logErr('jobs', e); throw e; }).finally(() => { cur = null; emit(); });
    },
    cancel() { if (cur && cur.job) cur.job.cancel(); },
  };
  return api;
}
