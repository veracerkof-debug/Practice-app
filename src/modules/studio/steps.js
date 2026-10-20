// Редактор ударных клипа — шаговый секвенсор, как в FL Studio Mobile: ряды — барабаны (бочка, малый, хэт, открытый,
// хлоп), шаги одного такта шестнадцатыми, такты куска — фишками сверху (при проигрывании такт идёт сам).
// Касание шага — удар, вести по ряду — «красить»; название ряда — услышать, удержать — очистить ряд.
// Без зависимости от модуля: получает проект и содержимое клипа.
import { DRUMS, STEP, stepOn, setStep, toggleStep } from '../../music/project.js';

const perBeat = 1 / STEP;
const cells = (perBar, bar, b0, on) => '<div class="rkcells" data-bar="' + bar + '"' + (bar === b0 ? '' : ' hidden') + '>' +
  Array.from({ length: perBar }, (_, k) => { const i = bar * perBar + k; return '<i class="rkc' + (on(i) ? ' on' : '') + (k % perBeat === 0 ? ' beat' : '') + '" data-i="' + i + '" data-step></i>'; }).join('') + '</div>';

// Разметка: p — проект, d — содержимое { bars, steps }, bar — показанный такт, color — цвет дорожки
export function stepsHTML(ctx, p, d, bar, color) {
  const { t, ui } = ctx, perBar = p.num * perBeat, b0 = Math.min(bar, d.bars - 1);
  const bars = '<div class="rkbars">' + Array.from({ length: d.bars }, (_, b) => '<button class="rkbar' + (b === b0 ? ' on' : '') + '" data-rkbar="' + b + '" aria-pressed="' + (b === b0) + '">' + (b + 1) + '</button>').join('') + '</div>';
  const rows = DRUMS.map((lane) => '<div class="rkrow" data-lane="' + lane + '" style="--c:' + color + '"><button class="rkname" data-lane="' + lane + '" aria-label="' + ui.esc(t('drum.' + lane)) + '"><b>' + ui.esc(t('drum.' + lane)) + '</b></button>' +
    Array.from({ length: d.bars }, (_, b) => cells(perBar, b, b0, (x) => stepOn(d, lane, x))).join('') + '</div>').join('');
  return '<div class="rack" data-bar="' + b0 + '" style="--n:' + perBar + '">' + bars + '<div class="rkrows">' + rows + '</div><p class="ftr">' + ui.esc(t('drum.hint')) + '</p></div>';
}
// Показать такт b (фишка и клетки всех рядов)
export function stepsBar(host, b) {
  const w = host.querySelector('.rack');
  if (!w || +w.dataset.bar === b) return;
  w.dataset.bar = b;
  w.querySelectorAll('.rkcells[data-bar]').forEach((el) => { el.hidden = +el.dataset.bar !== b; });
  w.querySelectorAll('[data-rkbar]').forEach((el) => { const on = +el.dataset.rkbar === b; el.classList.toggle('on', on); el.setAttribute('aria-pressed', on); });
}
// Звучащий шаг: подсветка клетки (i — номер шестнадцатой в куске, -1 — нет)
export function stepsPos(host, i) {
  host.querySelectorAll('.rkc.now').forEach((c) => { if (+c.dataset.i !== i) c.classList.remove('now'); });
  if (i >= 0) host.querySelectorAll('.rkc[data-i="' + i + '"]').forEach((c) => c.classList.add('now'));
}

// Жесты по шагам: касание — удар, вести по ряду — несколько. get() → содержимое; on: { change(), audition(lane) }
export function stepsGestures(host, get, on) {
  let paint = null; // { id, lane, on }
  const cellAt = (e) => { const el = document.elementFromPoint(e.clientX, e.clientY); return el && el.classList.contains('rkc') ? el : null; };
  const down = (e) => {
    const c = cellAt(e);
    if (!c || !e.isPrimary) return;
    const lane = c.closest('.rkrow').dataset.lane, d = get(), i = +c.dataset.i, v = toggleStep(d, lane, i);
    c.classList.toggle('on', v);
    if (v) on.audition(lane);
    paint = { id: e.pointerId, lane, on: v };
    try { host.setPointerCapture(e.pointerId); } catch { /* */ }
    e.preventDefault();
  };
  const move = (e) => {
    if (!paint || e.pointerId !== paint.id) return;
    const c = cellAt(e);
    if (!c || c.closest('.rkrow').dataset.lane !== paint.lane) return;
    const d = get(), i = +c.dataset.i;
    if (stepOn(d, paint.lane, i) === paint.on) return;
    setStep(d, paint.lane, i, paint.on); c.classList.toggle('on', paint.on);
    if (paint.on) on.audition(paint.lane);
  };
  const up = (e) => { if (!paint || e.pointerId !== paint.id) return; paint = null; on.change(); };
  host.addEventListener('pointerdown', down); host.addEventListener('pointermove', move); host.addEventListener('pointerup', up); host.addEventListener('pointercancel', up);
  return () => { host.removeEventListener('pointerdown', down); host.removeEventListener('pointermove', move); host.removeEventListener('pointerup', up); host.removeEventListener('pointercancel', up); };
}
