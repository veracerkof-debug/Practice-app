// Долгие обработки записей медиатеки — одна за раз, с ходом и отменой: разделение на дорожки (src/audio/stems.js) и
// снятие нот (src/audio/transcribe.js). Результаты ложатся в медиатеку рядом с записью: дорожки — WAV с пометкой
// stem: { src, part, mode, hq, db }, ноты — .mid с пометкой trans: { src }. Запускают плеер медиатеки (по кнопке) и
// фоновая очередь (autostems.js). Подписчики получают состояние: { kind: 'stems' | 'notes', id, stage, frac, stageAt, mode, auto }.
// Без DOM: имена дорожек — через t() ядра.
import { t } from '../i18n/index.js';
import { separate, PARTS_OF, stemEmpty, stemLevelDb, stemsSupported } from '../audio/stems.js';
import { transcribe } from '../audio/transcribe.js';
import { encodeWav, peaks } from '../audio/voicefx.js';
import { takeDur } from '../music/midi.js';
import { log, logErr } from './log.js';

const stemPeaks = (ch) => { const pk = peaks(ch, 600), mx = Math.max(1e-6, ...pk); return Array.from(pk, (v) => Math.round((v / mx) * 100) / 100); };
const base = (r) => String(r.name || '').replace(/\.[a-z0-9]+$/i, '');

export const stemsOf = (files, id) => files.list('audio').filter((r) => r.stem && r.stem.src === id);
export const notesOf = (files, id) => files.list('midi').find((r) => r.trans && r.trans.src === id) || null;
// hq — нужен набор «ночного» качества (обычный не считается)
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
    for (const old of stemsOf(files, rec.id).filter((x) => (x.stem.mode || '4') === mode)) await files.remove(old.id);
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
  async function runNotes(rec) {
    const res = await cur.job.promise;
    const at = Date.now(), old = notesOf(files, rec.id);
    const r = { id: old ? old.id : 'tn' + at.toString(36), name: base(rec) + ' — ' + t('stems.notesSuffix') + '.mid', size: res.mid.length, type: 'audio/midi', kind: 'midi', tool: 'piano', songs: rec.songs || [],
      created: at, blob: new Blob([res.mid], { type: 'audio/midi' }), take: { v: 1, ev: res.ev }, dur: takeDur(res.ev), notes: res.notes, trans: { src: rec.id } };
    await files.add(r);
    log('jobs', 'ноты: ' + res.notes);
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
      return runNotes(rec).catch((e) => { if (!(e && e.message === 'cancel')) logErr('jobs', e); throw e; }).finally(() => { cur = null; emit(); });
    },
    cancel() { if (cur && cur.job) cur.job.cancel(); },
  };
  return api;
}
