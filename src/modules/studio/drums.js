// Степ-секвенсор ударных (как в FL Studio): ряды — бочка, малый, хэт, открытый хэт, хлопок; столбцы — шестнадцатые
// одного такта (крупные клетки на весь экран), такты — фишками сверху, при проигрывании такт идёт сам; сильные доли
// светлее. Касание — удар поставить или снять, вести по ряду — «красить» (ставит или снимает, как первая клетка),
// касание названия ряда — услышать, удержание названия — очистить ряд.
import { DRUMS, STEP, stepOn, setStep, toggleStep, clearLane } from '../../music/project.js';
import { holdMenu } from '../../ui/hold.js';

export function drumsHTML(ctx, p, pat, tr, d, bar = 0) {
  const { t, ui } = ctx, perBeat = 1 / STEP, perBar = p.num * perBeat, b0 = Math.min(bar, pat.bars - 1);
  const bars = '<div class="sdbars">' + Array.from({ length: pat.bars }, (_, b) => '<button class="stpat sm' + (b === b0 ? ' on' : '') + '" data-sdbar="' + b + '" aria-pressed="' + (b === b0) + '">' + (b + 1) + '</button>').join('') + '</div>';
  const rows = DRUMS.map((lane) => '<div class="sdrow" data-lane="' + lane + '"><button class="sdname" data-sdname="' + lane + '">' + ui.esc(t('drum.' + lane)) + '</button>' +
    Array.from({ length: pat.bars }, (_, b) => '<div class="sdcells" data-bar="' + b + '"' + (b === b0 ? '' : ' hidden') + '>' + Array.from({ length: perBar }, (_, k) => { const i = b * perBar + k; return '<i class="sdc' + (stepOn(d, lane, i) ? ' on' : '') + (k % perBeat === 0 ? ' beat' : '') + '" data-i="' + i + '"></i>'; }).join('') + '</div>').join('') + '</div>').join('');
  return '<div class="sdwrap" data-bar="' + b0 + '" style="--c:' + tr.color + ';--n:' + perBar + '">' + bars + rows + '<p class="ftr" style="margin:4px 8px">' + ui.esc(t('drum.hint')) + '</p></div>';
}
// Показать такт b (фишка и клетки)
export function showBar(host, b) {
  const w = host.querySelector('.sdwrap');
  if (!w || +w.dataset.bar === b) return;
  w.dataset.bar = b;
  w.querySelectorAll('.sdcells').forEach((el) => { el.hidden = +el.dataset.bar !== b; });
  w.querySelectorAll('[data-sdbar]').forEach((el) => { const on = +el.dataset.sdbar === b; el.classList.toggle('on', on); el.setAttribute('aria-pressed', on); });
}

// Жесты по сетке: host — контейнер .sdwrap; on: { change(), audition(lane) }. Возвращает снятие
export function drumsGestures(host, get, on) {
  let paint = null; // { id, lane, on }
  const cellAt = (e) => { const el = document.elementFromPoint(e.clientX, e.clientY); return el && el.classList.contains('sdc') ? el : null; };
  const down = (e) => {
    const c = cellAt(e);
    if (!c || !e.isPrimary) return;
    const { d } = get(), lane = c.closest('.sdrow').dataset.lane, i = +c.dataset.i, v = toggleStep(d, lane, i);
    c.classList.toggle('on', v);
    if (v) on.audition(lane);
    paint = { id: e.pointerId, lane, on: v };
    try { host.setPointerCapture(e.pointerId); } catch { /* */ }
    e.preventDefault();
  };
  const move = (e) => {
    if (!paint || e.pointerId !== paint.id) return;
    const c = cellAt(e);
    if (!c || c.closest('.sdrow').dataset.lane !== paint.lane) return;
    const { d } = get(), i = +c.dataset.i;
    if (stepOn(d, paint.lane, i) === paint.on) return;
    setStep(d, paint.lane, i, paint.on); c.classList.toggle('on', paint.on);
    if (paint.on) on.audition(paint.lane);
  };
  const up = (e) => { if (!paint || e.pointerId !== paint.id) return; paint = null; on.change(); };
  host.addEventListener('pointerdown', down);
  host.addEventListener('pointermove', move);
  host.addEventListener('pointerup', up);
  host.addEventListener('pointercancel', up);
  return () => { host.removeEventListener('pointerdown', down); host.removeEventListener('pointermove', move); host.removeEventListener('pointerup', up); host.removeEventListener('pointercancel', up); };
}

// Удержание названия ряда — очистить ряд
export function drumHold(ctx, d, el, done) {
  const lane = el.dataset.sdname;
  if (!lane || !d.steps[lane]) return;
  holdMenu(el, [{ icon: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>', label: ctx.t('drum.clear'), danger: true, run: () => { clearLane(d, lane); done(); } }], ctx.t('drum.' + lane));
}
