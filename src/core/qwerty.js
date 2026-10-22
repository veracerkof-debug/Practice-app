// Игра с клавиатуры компьютера: два ряда клавиш — две с половиной октавы, как в трекерах и студиях.
// Нижний ряд Z S X D C V G B H N J M , L . ; / — от «До» базовой октавы; верхний Q 2 W 3 E R 5 T 6 Y 7 U I 9 O 0 P [ = ] —
// октавой выше. Клавиши — по физическому месту (e.code), поэтому в русской и любой другой раскладке одно и то же.
// ↑ ↓ — октава выше и ниже, пробел — педаль. Ноты идут тем же путём, что с MIDI-клавиатуры (midi.js: midiIn
// инструмента): играют пианино, глайдер, терменвокс, клавиши студии и всё, что понимает MIDI. Без DOM — кроме install.

const LOW = ['KeyZ', 'KeyS', 'KeyX', 'KeyD', 'KeyC', 'KeyV', 'KeyG', 'KeyB', 'KeyH', 'KeyN', 'KeyJ', 'KeyM', 'Comma', 'KeyL', 'Period', 'Semicolon', 'Slash'];
const HIGH = ['KeyQ', 'Digit2', 'KeyW', 'Digit3', 'KeyE', 'KeyR', 'Digit5', 'KeyT', 'Digit6', 'KeyY', 'Digit7', 'KeyU', 'KeyI', 'Digit9', 'KeyO', 'Digit0', 'KeyP', 'BracketLeft', 'Equal', 'BracketRight'];
export const BASE_DEF = 60, BASE_MIN = 24, BASE_MAX = 84;

// Полутон от «До» базовой октавы для кода клавиши, или null
export function stepOf(code) {
  const a = LOW.indexOf(code);
  if (a >= 0) return a;
  const b = HIGH.indexOf(code);
  return b >= 0 ? 12 + b : null;
}
export const noteOf = (code, base = BASE_DEF) => { const s = stepOf(code); return s == null ? null : base + s; };
export const shiftBase = (base, d) => Math.max(BASE_MIN, Math.min(BASE_MAX, base + d * 12));
// Подпись клавиши для ноты midi при базе base (для подсказок на клавишах пианино) — или ''
const LABEL = { Comma: ',', Period: '.', Semicolon: ';', Slash: '/', BracketLeft: '[', BracketRight: ']', Equal: '=' };
export function keyLabel(midi, base = BASE_DEF) {
  const s = midi - base, code = s >= 12 && s - 12 < HIGH.length ? HIGH[s - 12] : s >= 0 && s < LOW.length ? LOW[s] : null;
  if (!code) return '';
  return LABEL[code] || code.replace(/^Key|^Digit/, '');
}

// Где клавиши не трогаем: ввод текста, выбор, редактируемое, а также с Ctrl / Alt / Cmd (сочетания системы и приложения)
const typing = (el) => !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

// Подключить к окну. send(event) — событие в формате src/music/midi.js ({ t, k: 'on'|'off'|'ped', id, m, v });
// active() — есть ли сейчас инструмент, который слушает; onBase(base) — база сменилась (подсказка на экране)
export function installQwerty({ send, active, onBase = () => {}, getBase = () => BASE_DEF, setBase = () => {} }) {
  if (typeof window === 'undefined') return () => {};
  const down = new Map(); // code → id ноты
  let ped = false;
  const now = () => performance.now() / 1000;
  const releaseAll = () => {
    down.forEach((id) => send({ t: now(), k: 'off', id }));
    down.clear();
    if (ped) { ped = false; send({ t: now(), k: 'ped', v: 0 }); }
  };
  const onDown = (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target) || !active()) return;
    if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
      e.preventDefault(); e.stopImmediatePropagation();
      if (e.repeat) return;
      releaseAll();
      const b = shiftBase(getBase(), e.code === 'ArrowUp' ? 1 : -1);
      setBase(b); onBase(b);
      return;
    }
    if (e.code === 'Space') {
      e.preventDefault(); e.stopImmediatePropagation(); // не прокручивать, не нажимать кнопку в фокусе, не будить лупер
      if (!e.repeat && !ped) { ped = true; send({ t: now(), k: 'ped', v: 1 }); }
      return;
    }
    const m = noteOf(e.code, getBase());
    if (m == null) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (e.repeat || down.has(e.code)) return;
    const id = 'q' + e.code;
    down.set(e.code, id);
    send({ t: now(), k: 'on', id, m, v: e.shiftKey ? 1 : 0.8 });
  };
  const onUp = (e) => {
    if (e.code === 'Space' && ped) { ped = false; send({ t: now(), k: 'ped', v: 0 }); return; }
    const id = down.get(e.code);
    if (!id) return;
    down.delete(e.code);
    send({ t: now(), k: 'off', id });
  };
  // захват: раньше обработчиков инструментов на window (лупер слушает пробел и стрелки)
  window.addEventListener('keydown', onDown, true);
  window.addEventListener('keyup', onUp, true);
  window.addEventListener('blur', releaseAll); // окно ушло из фокуса с зажатой клавишей — нота не должна висеть
  document.addEventListener('visibilitychange', releaseAll);
  return () => { releaseAll(); window.removeEventListener('keydown', onDown, true); window.removeEventListener('keyup', onUp, true); window.removeEventListener('blur', releaseAll); document.removeEventListener('visibilitychange', releaseAll); };
}
