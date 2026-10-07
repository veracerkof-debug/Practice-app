// Часы устройства. Пока часы сбиты, записи о занятиях не подтверждаются (src/core/integrity.js).
// Сбиты — если дата раньше сборки приложения (условный 2002 год), если время ушло назад относительно уже виденного
// или если его перевели (дата сдвинулась сильнее, чем прошло на самом деле). «На самом деле» — системный счётчик
// Android с включения устройства (плагин Clock, идёт и во сне); в браузере — performance.now(), только пока
// страница открыта. Проверить дату можно по интернету (заголовок Date ответа сервера) — только по нажатию.
import { Capacitor, registerPlugin } from '@capacitor/core';
import { BUILD_TIME, DAY_MS } from './integrity.js';

const LS = 'practice.v1.clock';
const Clock = Capacitor.isNativePlatform() ? registerPlugin('Clock') : null;
export const JUMP_MS = 2 * 60000;     // перевод часов больше чем на 2 минуты
export const NET_OK_MS = 5 * 60000;   // расхождение с интернетом до 5 минут — часы в порядке

// Чистая проверка: { bad, reason } — reason: 'past' | 'back' | 'jump'
export function judge({ wall, seen = 0, prev = null, mono = null }) {
  if (wall < BUILD_TIME - 2 * DAY_MS) return { bad: true, reason: 'past' };
  if (seen && wall < seen - 2 * 3600e3) return { bad: true, reason: 'back' };
  if (prev && mono != null && prev.mono != null && mono >= prev.mono) {
    const drift = (wall - prev.wall) - (mono - prev.mono);
    if (Math.abs(drift) > JUMP_MS) return { bad: true, reason: 'jump' };
  }
  return { bad: false, reason: null };
}

const load = () => { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch { return {}; } };
const keep = (s) => { try { localStorage.setItem(LS, JSON.stringify(s)); } catch { /* */ } };

// Дата из интернета, мс; бросает ошибку без сети
export async function netTime() {
  if (Clock) { const r = await Clock.net(); return r.ms + (Date.now() - r.wall); }
  // в браузере — свой же сервер (тот же адрес: заголовок Date доступен)
  const res = await fetch(location.href, { method: 'HEAD', cache: 'no-store' });
  const d = Date.parse(res.headers.get('date') || '');
  if (!d) throw new Error('no date');
  return d;
}

// onChange(state) — сбитость поменялась; state: { bad, reason }
export function createClock({ onChange = () => {} } = {}) {
  const s = load();
  s.seen = s.seen || 0;
  // прошлый замер переживает перезапуск: если устройство не перезагружалось, перевод часов виден и после закрытия
  let prev = s.prev || null, hiddenSince = null;
  if (!Clock) prev = null;
  const st = { bad: !!s.bad, reason: s.reason || null, jumps: s.jumps || 0 };

  const set = (bad, reason) => {
    if (bad === st.bad && reason === st.reason) return;
    st.bad = bad; st.reason = bad ? reason : null;
    if (bad && reason === 'jump') st.jumps++;
    Object.assign(s, { bad: st.bad, reason: st.reason, jumps: st.jumps });
    keep(s);
    onChange(st);
  };
  async function sample() {
    const wall = Date.now();
    let mono = null;
    if (Clock) { try { const r = await Clock.elapsed(); mono = r.ms + (Date.now() - r.wall); } catch { /* нет данных */ } }
    else if (hiddenSince == null) mono = performance.now(); // в браузере сон не виден — сравниваем только открытую страницу
    const j = judge({ wall, seen: s.seen, prev, mono });
    if (j.bad) set(true, j.reason);
    // дату исправили — пометка снимается сама; перевод часов снимается только проверкой по интернету
    else if (st.bad && st.reason !== 'jump' && wall >= s.seen) set(false, null);
    if (!j.bad || j.reason === 'jump') { s.seen = Math.max(s.seen, wall); keep(s); }
    prev = mono == null ? null : { wall, mono };
    if (Clock && prev) { s.prev = prev; keep(s); }
  }
  sample();
  setInterval(sample, 30000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { hiddenSince = Date.now(); if (!Clock) prev = null; }
    else { hiddenSince = null; sample(); }
  });

  return {
    get bad() { return st.bad; },
    get reason() { return st.reason; },
    get jumps() { return st.jumps; },
    // Сверить с интернетом: { ok, device, net } — ok: часы в порядке (тогда пометка снимается)
    async verify() {
      const net = await netTime(), device = Date.now(), ok = Math.abs(net - device) <= NET_OK_MS;
      if (ok) { s.seen = device; prev = null; s.prev = null; set(false, null); }
      return { ok, device, net };
    },
    sample,
  };
}
