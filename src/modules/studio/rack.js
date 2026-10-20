// Рэк каналов (как Channel Rack в FL Studio): каждая дорожка — канал: цветной огонёк (звук вкл/выкл), название
// и шаги одного такта шестнадцатыми. Ударные — каждый барабан своим каналом (бочка, малый, хэт…), шаг — удар
// (касание ставит или снимает, вести по ряду — «красить»). Ноты и аккорды — заполненность шагов; касание — в редактор.
// Такты — фишками над рэком, при проигрывании такт идёт сам; звучащий шаг подсвечен. Без зависимости от модуля.
import { DRUMS, STEP, stepOn, setStep, toggleStep, patternNotes } from '../../music/project.js';

const perBeat = 1 / STEP;
// Заполненность шагов нот или аккордов в паттерне: Set номеров шестнадцатых, где звучит нота
function filled(p, pat, tr) {
  const set = new Set();
  patternNotes(p, pat, tr).forEach((n) => { for (let i = Math.floor(n.t * perBeat); i < Math.ceil((n.t + n.d) * perBeat - 1e-6); i++) set.add(i); });
  return set;
}
const cells = (pat, perBar, bar, b0, on, attrs) => '<div class="rkcells" data-bar="' + bar + '"' + (bar === b0 ? '' : ' hidden') + '>' +
  Array.from({ length: perBar }, (_, k) => { const i = bar * perBar + k; return '<i class="rkc' + (on(i) ? ' on' : '') + (k % perBeat === 0 ? ' beat' : '') + '" data-i="' + i + '"' + attrs + '></i>'; }).join('') + '</div>';

// Разметка рэка: p — проект, pat — паттерн, bar — показанный такт; names(tr, i) — имя дорожки
export function rackHTML(ctx, p, pat, bar, names) {
  const { t, ui } = ctx, perBar = p.num * perBeat, b0 = Math.min(bar, pat.bars - 1), solo = p.tracks.some((x) => x.solo);
  const bars = '<div class="rkbars">' + Array.from({ length: pat.bars }, (_, b) => '<button class="rkbar' + (b === b0 ? ' on' : '') + '" data-rkbar="' + b + '" aria-pressed="' + (b === b0) + '">' + (b + 1) + '</button>').join('') + '</div>';
  const rows = p.tracks.map((tr, i) => {
    const off = tr.mute || (solo && !tr.solo), head = (name, extra) => '<button class="rklight' + (off ? ' off' : '') + (tr.solo ? ' solo' : '') + '" data-rkmute="' + tr.id + '" aria-pressed="' + !tr.mute + '" aria-label="' + ui.esc(t(tr.mute ? 'unmute' : 'mute')) + '"></button>' +
      '<button class="rkname" data-rkopen="' + tr.id + '"' + extra + '><b>' + ui.esc(name) + '</b></button>';
    if (tr.kind === 'drums') {
      const d = pat.data[tr.id] || { steps: {} };
      return DRUMS.map((lane, k) => '<div class="rkrow rk-drum' + (k === 0 ? ' first' : '') + (k === DRUMS.length - 1 ? ' last' : '') + '" data-tr="' + tr.id + '" data-lane="' + lane + '" style="--c:' + tr.color + '">' + head(t('drum.' + lane), ' data-lane="' + lane + '" title="' + ui.esc(names(tr, i)) + '"') +
        Array.from({ length: pat.bars }, (_, b) => cells(pat, perBar, b, b0, (x) => stepOn(d, lane, x), ' data-step')).join('') + '</div>').join('');
    }
    if (tr.kind === 'audio') return '<div class="rkrow rk-audio" data-tr="' + tr.id + '" style="--c:' + tr.color + '">' + head(names(tr, i)) + '<div class="rkcells rkloop"><span>' + ui.esc(tr.fileId ? '♪ ' + t('tr.audio') : t('tr.noFile')) + '</span></div></div>';
    const f = filled(p, pat, tr);
    return '<div class="rkrow rk-' + tr.kind + '" data-tr="' + tr.id + '" style="--c:' + tr.color + '">' + head(names(tr, i)) + Array.from({ length: pat.bars }, (_, b) => cells(pat, perBar, b, b0, (x) => f.has(x), ' data-edit')).join('') + '</div>';
  }).join('');
  return '<div class="rack" data-bar="' + b0 + '" style="--n:' + perBar + '">' + bars + '<div class="rkrows">' + rows + '</div></div>';
}
// Показать такт b (фишка и клетки всех каналов)
export function rackBar(host, b) {
  const w = host.querySelector('.rack');
  if (!w || +w.dataset.bar === b) return;
  w.dataset.bar = b;
  w.querySelectorAll('.rkcells[data-bar]').forEach((el) => { el.hidden = +el.dataset.bar !== b; });
  w.querySelectorAll('[data-rkbar]').forEach((el) => { const on = +el.dataset.rkbar === b; el.classList.toggle('on', on); el.setAttribute('aria-pressed', on); });
}
// Звучащий шаг: подсветка клетки (i — номер шестнадцатой в паттерне, -1 — нет)
export function rackPos(host, i) {
  host.querySelectorAll('.rkc.now').forEach((c) => { if (+c.dataset.i !== i) c.classList.remove('now'); });
  if (i >= 0) host.querySelectorAll('.rkc[data-i="' + i + '"]').forEach((c) => c.classList.add('now'));
}

// Жесты по шагам ударных: касание — удар, вести по ряду — несколько. get() → { cell(trackId) }; on: { change(), audition(tr, lane) }
export function rackGestures(host, get, on) {
  let paint = null; // { id, tr, lane, on }
  const cellAt = (e) => { const el = document.elementFromPoint(e.clientX, e.clientY); return el && el.classList.contains('rkc') && el.hasAttribute('data-step') ? el : null; };
  const down = (e) => {
    const c = cellAt(e);
    if (!c || !e.isPrimary) return;
    const row = c.closest('.rkrow'), tr = row.dataset.tr, lane = row.dataset.lane, d = get().cell(tr), i = +c.dataset.i, v = toggleStep(d, lane, i);
    c.classList.toggle('on', v);
    if (v) on.audition(tr, lane);
    paint = { id: e.pointerId, tr, lane, on: v };
    try { host.setPointerCapture(e.pointerId); } catch { /* */ }
    e.preventDefault();
  };
  const move = (e) => {
    if (!paint || e.pointerId !== paint.id) return;
    const c = cellAt(e);
    if (!c) return;
    const row = c.closest('.rkrow');
    if (row.dataset.tr !== paint.tr || row.dataset.lane !== paint.lane) return;
    const d = get().cell(paint.tr), i = +c.dataset.i;
    if (stepOn(d, paint.lane, i) === paint.on) return;
    setStep(d, paint.lane, i, paint.on); c.classList.toggle('on', paint.on);
    if (paint.on) on.audition(paint.tr, paint.lane);
  };
  const up = (e) => { if (!paint || e.pointerId !== paint.id) return; paint = null; on.change(); };
  host.addEventListener('pointerdown', down); host.addEventListener('pointermove', move); host.addEventListener('pointerup', up); host.addEventListener('pointercancel', up);
  return () => { host.removeEventListener('pointerdown', down); host.removeEventListener('pointermove', move); host.removeEventListener('pointerup', up); host.removeEventListener('pointercancel', up); };
}
