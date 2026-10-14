// Мелета-тамагочи на экране занятия (сессия или окно инструмента): маленькое лицо в углу и изредка — реплика
// в облачке (src/core/tama.js решает, когда и что). Касание — реакция лица. Выключается в «Мелета и напоминания».
// «Минимал» без текста — только лицо. Полный экран инструмента — Мелета не мешает и прячется.
// Лицо можно перетащить в любое место (запоминается: tama.pos — доли окна); убрать с экрана и вернуть —
// кнопкой с лицом в шторке микшера (tama.hide).
import { getLang, isBare, t, hasMascot } from '../i18n/index.js';
import { mascotSVG, pokeMascot } from './mascot.js';
import { createTama, tamaOf } from '../core/tama.js';
import { tamaLine } from '../core/tamatexts.js';
import './tama.css';

export function initTama(app) {
  const brain = createTama();
  let el = null, face = '', bubbleT = 0, sayMood = null, sayUntil = 0;
  const st = () => app.store.state.settings;
  // маскот уместен здесь: включён, есть занятие или окно инструмента (для кнопки в шторке микшера)
  const here = () => { const tm = tamaOf(st()); return tm.on && hasMascot() && (!!app.active || !!document.querySelector('.tview:not(.leaving)')) && shown(); };
  const shown = () => document.querySelector('.session:not(.leaving), .tview:not(.leaving)') && !document.querySelector('.tview.pure');
  const make = () => {
    el = document.createElement('div');
    el.className = 'tama';
    el.innerHTML = '<button class="tamab" data-mascot aria-label="' + t('tama.aria') + '"></button><div class="tamas" role="status" aria-live="polite" hidden></div>';
    document.body.appendChild(el);
    place();
  };
  // своё место: доли окна (левый верхний угол лица 48×48), в пределах экрана; облачко растёт вверх,
  // справа — слева от лица
  const FACE = 48;
  const place = () => {
    const p = tamaOf(st()).pos;
    if (!el || !p) return;
    const x = Math.max(4, Math.min(innerWidth - FACE - 4, p.x * innerWidth)), y = Math.max(4, Math.min(innerHeight - FACE - 4, p.y * innerHeight));
    const flip = x + FACE / 2 > innerWidth / 2;
    el.classList.add('moved');
    el.classList.toggle('flip', flip);
    el.style.left = flip ? 'auto' : x + 'px';
    el.style.right = flip ? innerWidth - x - FACE + 'px' : 'auto';
    el.style.bottom = innerHeight - y - FACE + 'px';
  };
  addEventListener('resize', place);
  const setFace = (mood) => {
    if (mood === face || !el) return;
    face = mood;
    const b = el.querySelector('.tamab');
    if (!b.dataset.mood) b.innerHTML = mascotSVG(mood, { size: 44, ring: app.store.state.settings.uiStyle !== 'mono' });
  };
  const bubble = (text) => {
    const s = el.querySelector('.tamas');
    if (!text || isBare()) { s.hidden = true; return; }
    s.textContent = text;
    s.hidden = false;
    s.classList.remove('in'); void s.offsetWidth; s.classList.add('in');
    clearTimeout(bubbleT);
    bubbleT = setTimeout(() => { s.hidden = true; }, 7000);
  };
  setInterval(() => {
    const st = app.store.state.settings, tm = tamaOf(st), act = app.activity || {};
    const active = tm.on && hasMascot() && (!!app.active || !!document.querySelector('.tview:not(.leaving)'));
    const po = app.pomodoro, brk = !!(po && po.running && po.phase !== 'work');
    const r = brain.step({ now: Date.now(), active, brk, listening: tm.listen && !!act.hearing, playing: !!act.playing, db: act.level, sounding: app.soundingAudio ? app.soundingAudio() : false, chat: tm.chat });
    const vis = active && shown() && !tm.hide;
    if (!vis) { if (el) { el.remove(); el = null; face = ''; } return; }
    if (!el) make();
    if (r) { sayMood = r.mood; sayUntil = Date.now() + 7000; bubble(tamaLine(r.key === 'brk' ? 'brk' : r.key, getLang())); }
    const mood = sayMood && Date.now() < sayUntil ? sayMood : brk ? 'rest' : act.playing ? 'focus' : 'calm';
    setFace(mood);
  }, 1000);
  // перетаскивание: сдвиг больше 6 px — двигаем, иначе касание (реакция лица)
  let drag = null;
  document.addEventListener('pointerdown', (e) => {
    const b = el && e.target.closest('.tama .tamab');
    if (!b) return;
    const r = b.getBoundingClientRect();
    drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, dx: e.clientX - r.left, dy: e.clientY - r.top, moved: false };
  });
  document.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id || !el) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 6) return;
    drag.moved = true;
    e.preventDefault();
    const tm = st().tama || (st().tama = {});
    tm.pos = { x: (e.clientX - drag.dx) / innerWidth, y: (e.clientY - drag.dy) / innerHeight };
    el.querySelector('.tamas').hidden = true;
    place();
  }, { passive: false });
  document.addEventListener('pointerup', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (drag.moved) { app.store.settingsChanged(); el && el.classList.add('nopoke'); setTimeout(() => el && el.classList.remove('nopoke'), 80); }
    drag = null;
  });
  // касание — реакция (общий обработчик data-mascot в ui/mascot.js) и облачко прячется; после перетаскивания — без реакции
  document.addEventListener('click', (e) => {
    if (!el || !e.target.closest('.tama .tamab')) return;
    if (el.classList.contains('nopoke')) { e.stopPropagation(); return; }
    const s = el.querySelector('.tamas'); if (s) s.hidden = true;
  }, true);
  // шторка микшера: убрать с экрана или вернуть
  app.tama = {
    here,
    hidden: () => !!tamaOf(st()).hide,
    toggle() { const tm = st().tama || (st().tama = {}); tm.hide = !tm.hide; app.store.settingsChanged(); if (tm.hide && el) { el.remove(); el = null; face = ''; } },
  };
  return { pokeMascot };
}
