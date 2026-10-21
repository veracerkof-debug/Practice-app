// «Дорожки» — разделение записи из медиатеки на вокал, ударные, бас и остальное (src/audio/stems.js: HTDemucs в
// ONNX Runtime Web, всё на устройстве). Экран: список записей во всё окно — касание запускает разделение; во время
// счёта — ход и оценка времени во всё окно, «Прервать»; по концу — четыре дорожки ложатся в медиатеку рядом с
// исходной (помечены stem: { src, part }) и кнопка «Открыть в студии» — проект с четырьмя дорожками-записями.
// Тяжёлый модуль (heavy): в веб-версии вместо него заглушка ядра (DECISIONS: размер и тяжёлые модули).
import ru from './i18n/ru.json';
import uz from './i18n/uz.json';
import en from './i18n/en.json';
import el from './i18n/el.json';
import './stems.css';
import { separate, estimateSec, stemsThreads, stemPeaks, MODES, PARTS_OF, ALL_PARTS, stemEmpty, stemLevelDb } from '../../audio/stems.js';
import { encodeWav } from '../../audio/voicefx.js';
import { projectFromStems } from '../../music/project.js';

const ICON = '<svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/><path d="M8 5v4M14 10v4M11 15v4" style="stroke-width:3"/></svg>';
const I = {
  stop: '<svg viewBox="0 0 24 24"><rect x="6.5" y="6.5" width="11" height="11" rx="2" style="fill:currentColor"/></svg>',
  studio: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="4" height="4" rx="1"/><rect x="10" y="4" width="4" height="4" rx="1"/><rect x="17" y="4" width="4" height="4" rx="1"/><rect x="3" y="11" width="4" height="4" rx="1"/><rect x="17" y="11" width="4" height="4" rx="1"/><rect x="3" y="18" width="18" height="2.5" rx="1"/></svg>',
};

let host = null, ctx = null, onClick = null;
// идущее разделение (одно на всё приложение, переживает закрытие окна): { src (запись), job, stage, frac, t0, est }
let R = null, last = null; // last — { src, stems: [записи], absent: [части, которых в записи нет] } для экрана «готово»
const mode = () => (MODES.includes(ctx.store.get('mode')) ? ctx.store.get('mode') : '4');
const byOrder = (a, b) => ALL_PARTS.indexOf(a.stem.part) - ALL_PARTS.indexOf(b.stem.part);

const fmtT = (sec) => { const m = Math.floor(sec / 60), s = Math.round(sec % 60); return m ? m + ' ' + ctx.t('min') + (s ? ' ' + s + ' ' + ctx.t('sec') : '') : s + ' ' + ctx.t('sec'); };
const sources = () => ctx.files.list('audio').filter((r) => !r.stem).sort((a, b) => (b.created || 0) - (a.created || 0));
const stemsOf = (id) => ctx.files.list('audio').filter((r) => r.stem && r.stem.src === id).sort(byOrder);

function listHTML() {
  const { t, ui } = ctx, L = sources(), m = mode(), done = L.filter((r) => stemsOf(r.id).length), todo = L.filter((r) => !stemsOf(r.id).some((x) => (x.stem.mode || '4') === m));
  const row = (r, extra = '') => '<button class="cell" data-src="' + r.id + '"><span class="grow">' + ui.esc(r.name) + '<span class="bksub">' + ui.esc((r.dur ? fmtT(r.dur) : '') + extra) + '</span></span>' + ui.icons.chev + '</button>';
  // режим: сколько дорожек — 2 (вокал и инструментал), 4, 6 (ещё гитара и клавиши)
  const seg = '<div class="group"><div class="cellcol">' + ui.seg('smmode', MODES.map((k) => [k, t('mode.' + k)]), m, t('mode.title')) + '<div class="segcap">' + ui.esc(t('mode.hint.' + m)) + '</div></div></div>';
  return '<div class="smwrap"><div class="smlist">' + seg +
    (todo.length ? '<div class="hdr">' + ui.esc(t('pick')) + '</div><div class="group">' + todo.map((r) => row(r, r.dur ? ' · ≈ ' + fmtT(estimateSec(r.dur, m)) : '')).join('') + '</div>' : '') +
    (done.length ? '<div class="hdr">' + ui.esc(t('done.title')) + '</div><div class="group">' + done.map((r) => '<button class="cell" data-done="' + r.id + '"><span class="grow">' + ui.esc(r.name) + '<span class="bksub">' + ui.esc(stemsOf(r.id).map((x) => t('part.' + x.stem.part)).join(' · ')) + '</span></span>' + ui.icons.chev + '</button>').join('') + '</div>' : '') +
    (L.length ? '' : '<p class="ftr">' + ui.esc(t('empty')) + '</p>') + '</div></div>';
}
function runHTML() {
  const { t, ui } = ctx, pct = Math.round((R.frac || 0) * 100), gone = (Date.now() - R.t0) / 1000, left = R.stage === 'separate' && R.frac > 0.02 ? Math.max(0, gone / R.frac - gone) : R.est;
  return '<div class="smwrap"><div class="smrun"><div class="smname">' + ui.esc(R.src.name) + '</div><div class="smbig num">' + (R.stage === 'separate' ? pct + ' %' : '…') + '</div>' +
    '<div class="smbar"><b style="width:' + pct + '%"></b></div><div class="smstage">' + ui.esc(t('stage.' + R.stage)) + (R.stage === 'separate' ? ' · ' + ui.esc(t('left', { t: fmtT(left) })) : '') + '</div>' +
    '<p class="ftr">' + ui.esc(t('threads', { n: stemsThreads() })) + '</p>' +
    '<button class="cell act center" data-x="cancel">' + I.stop + ' ' + ui.esc(t('cancel')) + '</button></div></div>';
}
function doneHTML() {
  const { t, ui } = ctx;
  return '<div class="smwrap"><div class="smlist"><div class="hdr">' + ui.esc(last.src.name) + '</div><div class="smparts">' + last.stems.map((r) => '<div class="smpart"><b>' + ui.esc(t('part.' + r.stem.part)) + '</b><span>' + ui.esc(fmtT(r.dur || 0) + (r.stem.db != null ? ' · ' + Math.round(r.stem.db) + ' dB' : '')) + '</span></div>').join('') + '</div>' +
    (last.absent && last.absent.length ? '<p class="ftr">' + ui.esc(t('absent', { list: last.absent.map((p) => t('part.' + p)).join(', ') })) + '</p>' : '') +
    '<div class="group" style="margin-top:14px"><button class="cell act center b" data-x="studio">' + I.studio + ' ' + ui.esc(t('toStudio')) + '</button><button class="cell center" data-x="back">' + ui.esc(t('pick')) + '</button></div></div></div>';
}
function render() {
  if (!host) return;
  host.innerHTML = R ? runHTML() : last ? doneHTML() : listHTML();
}

// Запустить разделение записи r: модель → чтение → счёт; результат — четыре WAV в медиатеку с пометкой stem
async function start(r) {
  const { t } = ctx;
  if (R) return;
  const m = mode();
  R = { src: r, stage: 'load', frac: 0, t0: Date.now(), est: estimateSec(r.dur || 60, m) };
  R.job = separate(r.blob, { mode: m, onStage: (stage, frac) => { if (!R) return; if (stage !== R.stage) { R.stage = stage; R.t0 = Date.now(); } R.frac = frac; render(); } });
  render();
  let res;
  try { res = await R.job.promise; } catch (e) {
    const cancelled = e && e.message === 'cancel';
    R = null; render();
    if (cancelled) { ctx.ui.toast(t('cancelled')); return; }
    ctx.logErr(e); ctx.ui.toast(t(/model|wasm|fetch|onnx/i.test(String(e && e.message)) ? 'err.load' : 'err.fail'));
    return;
  }
  // в медиатеку: WAV на дорожку, имена «исходник — Вокал.wav», волна и длительность как у записей; прежний набор этого
  // режима заменяется; дорожки, которых в записи нет (тише микса на 25 дБ), не сохраняются — о них говорит итог
  const stems = [], absent = [], base = r.name.replace(/\.[a-z0-9]+$/i, ''), at = Date.now(), parts = PARTS_OF[m];
  try {
    for (const old of stemsOf(r.id).filter((x) => (x.stem.mode || '4') === m)) await ctx.files.remove(old.id);
    for (const part of parts) {
      const s = res.parts[part];
      if (!s) continue;
      if (stemEmpty(s, res.mix)) { absent.push(part); continue; }
      const ch = [s.left, s.right], wav = encodeWav(ch, res.sr);
      const rec = { id: 'sm' + at.toString(36) + part.slice(0, 2), name: base + ' — ' + t('part.' + part) + '.wav', size: wav.length, type: 'audio/wav', kind: 'audio', songs: r.songs || [], created: at + parts.indexOf(part),
        blob: new Blob([wav], { type: 'audio/wav' }), dur: res.dur, peaks: stemPeaks(ch), stem: { src: r.id, part, mode: m, db: Math.round(stemLevelDb(s, res.mix) * 10) / 10 } };
      await ctx.files.add(rec);
      stems.push(rec);
    }
  } catch (e) { ctx.logErr(e); R = null; render(); ctx.ui.toast(t('err.fail')); return; }
  R = null; last = { src: r, stems, absent };
  render();
  ctx.ui.toast(t('saved'));
}
function toStudio() {
  const { t } = ctx, p = projectFromStems(last.src.name, last.stems.map((r) => ({ part: r.stem.part, name: t('part.' + r.stem.part), fileId: r.id, dur: r.dur })), { songId: (last.src.songs || [])[0] || null });
  ctx.projects.save(p);
  ctx.ui.toast(t('studioMade'));
}

export default {
  id: 'stems',
  order: 48,
  name: { ru: ru.name, uz: uz.name, en: en.name, el: el.name },
  i18n: { ru, uz, en, el },
  icon: ICON,
  color: '#6E5A8E',
  heavy: true, heavyMb: 235, // модели (180 + 55 МБ) в сборке; в веб-версии — заглушка
  sizes: ['full', 'half'],
  status(c) { const n = new Set(c.files.list('audio').filter((r) => r.stem).map((r) => r.stem.src)).size; return n ? c.tn('stemsDone', n) : c.t('st.idle'); },
  mount(el, c) {
    host = el; ctx = c;
    render();
    onClick = (e) => {
      let b;
      if ((b = e.target.closest('[data-src]'))) { const r = c.files.get(b.dataset.src); if (r && r.blob) start(r); return; }
      if ((b = e.target.closest('[data-done]'))) { const r = c.files.get(b.dataset.done); if (r) { last = { src: r, stems: stemsOf(r.id), absent: [] }; render(); } return; }
      if ((b = e.target.closest('[data-seg="smmode"] [data-v]'))) { c.store.set('mode', b.dataset.v); render(); return; }
      if ((b = e.target.closest('[data-x]'))) {
        if (b.dataset.x === 'cancel' && R) R.job.cancel();
        else if (b.dataset.x === 'studio' && last) toStudio();
        else if (b.dataset.x === 'back') { last = null; render(); }
      }
    };
    host.addEventListener('click', onClick);
  },
  resize() { render(); },
  unmount() { if (host && onClick) host.removeEventListener('click', onClick); host = null; }, // счёт продолжается, окно можно открыть снова
};
