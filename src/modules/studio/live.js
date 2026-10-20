// Живой ввод в редакторе клипа — как в FL Studio Mobile: под пиано-роллом клавиши (две октавы, сдвиг октавы по краям),
// под шагами ударных — пэды. Касание — звук; при включённой записи (●) и проигрывании клипа по кругу сыгранное
// ложится в кусок: ноты — начало к сетке (длина — сколько держали), удары — к ближайшей шестнадцатой. Наложение:
// кусок играет, новое добавляется к старому. MIDI-клавиатура — то же (midiIn модуля). Без зависимости от модуля.
import { kbHTML } from '../../ui/keyboard.js';
import { DRUMS, STEP, addPlayedNote, setStep } from '../../music/project.js';

export const OCT_LO = 24, OCT_HI = 84;

// Разметка полосы: ноты — клавиши от m0 (две октавы) с кнопками октавы; ударные — пэды
export function liveHTML(ctx, tr, m0) {
  const { t, ui } = ctx;
  if (tr.kind === 'drums') return '<div class="stpads" style="--c:' + tr.color + '">' + DRUMS.map((l) => '<button class="stpad" data-pad="' + l + '" aria-label="' + ui.esc(t('drum.' + l)) + '">' + ui.esc(t('drum.' + l)) + '</button>').join('') + '</div>';
  if (tr.kind !== 'notes') return '';
  return '<div class="stkb" style="--c:' + tr.color + '"><button class="stoct" data-oct="-1" aria-label="' + ui.esc(t('tr.oct') + ' −') + '"' + (m0 <= OCT_LO ? ' disabled' : '') + '>−</button>' +
    kbHTML(m0, 15, null, null) + '<button class="stoct" data-oct="1" aria-label="' + ui.esc(t('tr.oct') + ' +') + '"' + (m0 >= OCT_HI ? ' disabled' : '') + '>+</button></div>';
}

// Жесты. get() → { p, tr, d, total, grid, rec (запись включена), pos() → доля в куске или -1 }
// on: { audition(m|lane, hold) → key, release(key), change(), toggleOct(d) }
export function liveBind(host, get, on) {
  const held = new Map(); // pointerId → { el, m, key, t0 }
  const strip = host.querySelector('.stkb, .stpads');
  if (!strip) return () => {};
  const keyAt = (e) => { const el = document.elementFromPoint(e.clientX, e.clientY); return el && el.closest ? el.closest('[data-m],[data-pad]') : null; };
  const press = (id, el) => {
    const { tr, d, grid, rec, pos, total } = get();
    if (el.dataset.pad) { // пэд: удар сразу
      el.classList.add('down'); setTimeout(() => el.classList.remove('down'), 120);
      on.audition(el.dataset.pad, false);
      const b = pos();
      if (rec && b >= 0) { setStep(d, el.dataset.pad, Math.round(b / STEP) % Math.round(total / STEP), true); on.change(); }
      return;
    }
    const m = +el.dataset.m;
    el.classList.add('down');
    held.set(id, { el, m, key: on.audition(m, true), t0: pos() });
    void tr; void grid;
  };
  const release = (id) => {
    const h = held.get(id); if (!h) return;
    held.delete(id);
    h.el.classList.remove('down');
    on.release(h.key);
    const { d, grid, rec, pos, total } = get(), b = pos();
    if (!rec || h.t0 < 0 || b < 0) return;
    let dur = b - h.t0; if (dur < 0) dur += total; // через границу круга
    addPlayedNote(d, total, h.t0, Math.max(grid, dur), h.m, 0.8, grid);
    on.change();
  };
  const down = (e) => { const el = keyAt(e); if (!el) return; e.preventDefault(); try { strip.setPointerCapture(e.pointerId); } catch { /* */ } press(e.pointerId, el); };
  const move = (e) => { // вести по клавишам — глиссандо
    const h = held.get(e.pointerId); if (!h) return;
    const el = keyAt(e); if (!el || el === h.el || !el.dataset.m) return;
    release(e.pointerId); press(e.pointerId, el);
  };
  const up = (e) => release(e.pointerId);
  strip.addEventListener('pointerdown', down); strip.addEventListener('pointermove', move); strip.addEventListener('pointerup', up); strip.addEventListener('pointercancel', up);
  strip.addEventListener('contextmenu', (e) => e.preventDefault());
  const click = (e) => { const b = e.target.closest('[data-oct]'); if (b) on.toggleOct(+b.dataset.oct); };
  strip.addEventListener('click', click);
  // MIDI-клавиатура: midi(e) — событие { k: 'on' | 'off', id, m, v }
  const midi = (e) => {
    if (e.k === 'on' && e.m != null) { const m = Math.round(e.m); release('midi' + e.id); const { pos } = get(); held.set('midi' + e.id, { el: { classList: { remove() {} } }, m, key: on.audition(m, true), t0: pos() }); }
    else if (e.k === 'off') release('midi' + e.id);
  };
  const off = () => { held.forEach((h, id) => { on.release(h.key); held.delete(id); }); strip.removeEventListener('pointerdown', down); strip.removeEventListener('pointermove', move); strip.removeEventListener('pointerup', up); strip.removeEventListener('pointercancel', up); strip.removeEventListener('click', click); };
  off.midi = midi;
  return off;
}
