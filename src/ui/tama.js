// Мелета-тамагочи на экране занятия (сессия или окно инструмента): маленькое лицо в углу и изредка — реплика
// в облачке (src/core/tama.js решает, когда и что). Касание — реакция лица. Выключается в «Мелета и напоминания».
// «Минимал» без текста — только лицо. Полный экран инструмента — Мелета не мешает и прячется.
import { getLang, isBare, t, hasMascot } from '../i18n/index.js';
import { mascotSVG, pokeMascot } from './mascot.js';
import { createTama, tamaOf } from '../core/tama.js';
import { tamaLine } from '../core/tamatexts.js';
import './tama.css';

export function initTama(app) {
  const brain = createTama();
  let el = null, face = '', bubbleT = 0, sayMood = null, sayUntil = 0;
  const shown = () => document.querySelector('.session:not(.leaving), .tview:not(.leaving)') && !document.querySelector('.tview.pure');
  const make = () => {
    el = document.createElement('div');
    el.className = 'tama';
    el.innerHTML = '<button class="tamab" data-mascot aria-label="' + t('tama.aria') + '"></button><div class="tamas" role="status" aria-live="polite" hidden></div>';
    document.body.appendChild(el);
  };
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
    const vis = active && shown();
    if (!vis) { if (el) { el.remove(); el = null; face = ''; } return; }
    if (!el) make();
    if (r) { sayMood = r.mood; sayUntil = Date.now() + 7000; bubble(tamaLine(r.key === 'brk' ? 'brk' : r.key, getLang())); }
    const mood = sayMood && Date.now() < sayUntil ? sayMood : brk ? 'rest' : act.playing ? 'focus' : 'calm';
    setFace(mood);
  }, 1000);
  // касание — реакция (общий обработчик data-mascot в ui/mascot.js) и облачко прячется
  document.addEventListener('click', (e) => { if (el && e.target.closest('.tama .tamab')) { const s = el.querySelector('.tamas'); if (s) s.hidden = true; } });
  return { pokeMascot };
}
