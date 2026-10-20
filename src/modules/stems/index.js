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
import { separate, estimateSec, stemsThreads, stemPeaks, PARTS } from '../../audio/stems.js';
import { encodeWav } from '../../audio/voicefx.js';
import { projectFromStems } from '../../music/project.js';

const ICON = '<svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/><path d="M8 5v4M14 10v4M11 15v4" style="stroke-width:3"/></svg>';
const I = {
  stop: '<svg viewBox="0 0 24 24"><rect x="6.5" y="6.5" width="11" height="11" rx="2" style="fill:currentColor"/></svg>',
  studio: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="4" height="4" rx="1"/><rect x="10" y="4" width="4" height="4" rx="1"/><rect x="17" y="4" width="4" height="4" rx="1"/><rect x="3" y="11" width="4" height="4" rx="1"/><rect x="17" y="11" width="4" height="4" rx="1"/><rect x="3" y="18" width="18" height="2.5" rx="1"/></svg>',
};

let host = null, ctx = null, onClick = null;
// идущее разделение (одно на всё приложение, переживает закрытие окна): { src (запись), job, stage, frac, t0, est }
let R = null, last = null; // last — { src, stems: [записи] } для экрана «готово»

const fmtT = (sec) => { const m = Math.floor(sec / 60), s = Math.round(sec % 60); return m ? m + ' ' + ctx.t('min') + (s ? ' ' + s + ' ' + ctx.t('sec') : '') : s + ' ' + ctx.t('sec'); };
const sources = () => ctx.files.list('audio').filter((r) => !r.stem).sort((a, b) => (b.created || 0) - (a.created || 0));
const stemsOf = (id) => ctx.files.list('audio').filter((r) => r.stem && r.stem.src === id);

function listHTML() {
  const { t, ui } = ctx, L = sources(), done = L.filter((r) => stemsOf(r.id).length === 4), todo = L.filter((r) => stemsOf(r.id).length !== 4);
  const row = (r, extra = '') => '<button class="cell" data-src="' + r.id + '"><span class="grow">' + ui.esc(r.name) + '<span class="bksub">' + ui.esc((r.dur ? fmtT(r.dur) : '') + extra) + '</span></span>' + ui.icons.chev + '</button>';
  return '<div class="smwrap"><div class="smlist">' +
    (todo.length ? '<div class="hdr">' + ui.esc(t('pick')) + '</div><div class="group">' + todo.map((r) => row(r, r.dur ? ' · ≈ ' + fmtT(estimateSec(r.dur)) : '')).join('') + '</div>' : '') +
    (done.length ? '<div class="hdr">' + ui.esc(t('done.title')) + '</div><div class="group">' + done.map((r) => '<button class="cell" data-done="' + r.id + '"><span class="grow">' + ui.esc(r.name) + '<span class="bksub">' + ui.esc(PARTS.map((p) => t('part.' + p)).join(' · ')) + '</span></span>' + ui.icons.chev + '</button>').join('') + '</div>' : '') +
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
  return '<div class="smwrap"><div class="smlist"><div class="hdr">' + ui.esc(last.src.name) + '</div><div class="smparts">' + last.stems.map((r) => '<div class="smpart"><b>' + ui.esc(t('part.' + r.stem.part)) + '</b><span>' + ui.esc(fmtT(r.dur || 0)) + '</span></div>').join('') + '</div>' +
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
  R = { src: r, stage: 'load', frac: 0, t0: Date.now(), est: estimateSec(r.dur || 60) };
  R.job = separate(r.blob, { onStage: (stage, frac) => { if (!R) return; if (stage !== R.stage) { R.stage = stage; R.t0 = Date.now(); } R.frac = frac; render(); } });
  render();
  let res;
  try { res = await R.job.promise; } catch (e) {
    const cancelled = e && e.message === 'cancel';
    R = null; render();
    if (cancelled) { ctx.ui.toast(t('cancelled')); return; }
    ctx.logErr(e); ctx.ui.toast(t(/model|wasm|fetch|onnx/i.test(String(e && e.message)) ? 'err.load' : 'err.fail'));
    return;
  }
  // в медиатеку: четыре WAV, имена «исходник — Вокал.wav», волна и длительность как у записей
  const stems = [], base = r.name.replace(/\.[a-z0-9]+$/i, ''), at = Date.now();
  try {
    for (const part of PARTS) {
      const s = res[part], ch = [s.left, s.right], wav = encodeWav(ch, res.sr);
      const rec = { id: 'sm' + at.toString(36) + part[0], name: base + ' — ' + t('part.' + part) + '.wav', size: wav.length, type: 'audio/wav', kind: 'audio', songs: r.songs || [], created: at + PARTS.indexOf(part),
        blob: new Blob([wav], { type: 'audio/wav' }), dur: res.dur, peaks: stemPeaks(ch), stem: { src: r.id, part } };
      await ctx.files.add(rec);
      stems.push(rec);
    }
  } catch (e) { ctx.logErr(e); R = null; render(); ctx.ui.toast(t('err.fail')); return; }
  R = null; last = { src: r, stems };
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
  heavy: true, heavyMb: 180, // модель в сборке; в веб-версии — заглушка
  sizes: ['full', 'half'],
  status(c) { const n = c.files.list('audio').filter((r) => r.stem).length / 4; return n ? c.tn('stemsDone', Math.floor(n)) : ''; },
  mount(el, c) {
    host = el; ctx = c;
    render();
    onClick = (e) => {
      let b;
      if ((b = e.target.closest('[data-src]'))) { const r = c.files.get(b.dataset.src); if (r && r.blob) start(r); return; }
      if ((b = e.target.closest('[data-done]'))) { const r = c.files.get(b.dataset.done); if (r) { last = { src: r, stems: PARTS.map((p) => stemsOf(r.id).find((x) => x.stem.part === p)).filter(Boolean) }; render(); } return; }
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
