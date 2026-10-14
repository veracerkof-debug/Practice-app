// Мелета-тамагочи (по желанию, settings.tama): пока идёт занятие, маскот рядом и изредка говорит, как оно идёт.
// Слушает, только если это разрешено (tama.listen и доступ к микрофону): микрофон меряет лишь громкость —
// звук не записывается и никуда не передаётся. Без DOM: решает, когда и что сказать (проверяется тестами).
// Без укоров и давления: замечает поток, паузы, возвращение, вехи времени; перерыв — отдых.

export const TAMA_DEFAULT = { on: false, listen: false, chat: 'normal' };
export const tamaOf = (st) => ({ ...TAMA_DEFAULT, ...(st && st.tama) });

const GAP = { normal: 150e3, rare: 480e3 }; // не чаще, мс
const FLOW_MS = 6 * 60e3, QUIET_MS = 75e3, BACK_MS = 60e3, LOUD_MS = 20e3, SOFT_MS = 30e3;
const MILES = [[15, 'm15'], [30, 'm30'], [60, 'm60'], [90, 'm90']];
// Лицо к каждой реплике (src/ui/mascot.js: MOODS)
export const TAMA_MOOD = { hello: 'glad', brk: 'rest', flow: 'sing', quiet: 'wait', back: 'glad', m15: 'grow', m30: 'happy', m60: 'delight', m90: 'cool', loud: 'surprised', soft: 'wink' };

// step(x) → { key, mood } | null. x: { now, active, brk, listening, playing, db, sounding, chat }
export function createTama() {
  const s = { on: false, start: 0, last: 0, said: new Set(), playFrom: 0, quietFrom: 0, flowDone: false, quietDone: false, hadPlay: false,
    brk: false, loudFrom: 0, softFrom: 0 };
  const say = (key, now, force = false, chat = 'normal') => {
    if (!force && now - s.last < (GAP[chat] || GAP.normal)) return null;
    s.last = now;
    return { key, mood: TAMA_MOOD[key] || 'calm' };
  };
  return {
    state: s,
    step(x) {
      const now = x.now ?? Date.now(), chat = x.chat || 'normal';
      if (!x.active) { s.on = false; return null; }
      if (!s.on) { // занятие началось
        Object.assign(s, { on: true, start: now, said: new Set(), playFrom: 0, quietFrom: 0, flowDone: false, quietDone: false, hadPlay: false, brk: !!x.brk, loudFrom: 0, softFrom: 0 });
        return say('hello', now, true);
      }
      if (x.brk && !s.brk) { s.brk = true; return say('brk', now, true); }
      if (!x.brk) s.brk = false;
      // вехи времени занятия
      const min = (now - s.start) / 60e3;
      for (const [m, key] of MILES) if (min >= m && !s.said.has(key)) { const r = say(key, now, false, chat); if (r) { s.said.add(key); return r; } }
      if (!x.listening || x.brk) return null;
      // слух: игра и тишина (свой звук приложения — не тишина и не игра)
      if (x.playing) {
        if (!s.playFrom) {
          const back = s.hadPlay && s.quietFrom && now - s.quietFrom >= BACK_MS;
          s.playFrom = now; s.quietFrom = 0; s.flowDone = false; s.quietDone = false;
          s.hadPlay = true;
          if (back) { const r = say('back', now, now - s.last >= 60e3, chat); if (r) return r; } // ответ на паузу — без долгого ожидания
        }
        if (!s.flowDone && now - s.playFrom >= FLOW_MS) { const r = say('flow', now, false, chat); if (r) { s.flowDone = true; return r; } }
        // громко или тихо — подолгу (один раз за занятие)
        if (x.db != null && x.db > -12) { s.loudFrom ||= now; if (!s.said.has('loud') && now - s.loudFrom >= LOUD_MS) { const r = say('loud', now, false, chat); if (r) { s.said.add('loud'); return r; } } } else s.loudFrom = 0;
        if (x.db != null && x.db < -45) { s.softFrom ||= now; if (!s.said.has('soft') && now - s.softFrom >= SOFT_MS) { const r = say('soft', now, false, chat); if (r) { s.said.add('soft'); return r; } } } else s.softFrom = 0;
      } else if (!x.sounding) {
        s.playFrom = 0; s.loudFrom = 0; s.softFrom = 0;
        if (!s.quietFrom) s.quietFrom = now;
        if (s.hadPlay && !s.quietDone && now - s.quietFrom >= QUIET_MS) { const r = say('quiet', now, false, chat); if (r) { s.quietDone = true; return r; } }
      }
      return null;
    },
  };
}
