// Лупер: петля из слоёв. Первая запись задаёт длину петли (по метроному — целое число тактов), дальше —
// наложения (overdub): каждое — свой слой, последний можно отменить. Несколько петель (слотов) — у каждой
// свои слои и длина, звучит одна. Звук — в шину media (микшер ядра). Без DOM.
// Устойчивость: микрофон открывается один раз и держится, пока лупер открыт; каждая операция в try —
// сбой одной не роняет петлю; ограничение длины (MAX_SEC) защищает память телефона.
import { getContext } from './context.js';
import { createFxChain, normalizeFx } from './fx.js';
import { after, cancel } from './clock.js';

export const MAX_SEC = 90, MAX_LAYERS = 12, SLOTS = 4;
export const MARGIN_SEC = 1; // первая запись пишется с хвостом на секунду дольше петли: слой можно сдвинуть назад-вперёд
const CHUNK = 2048;

// Слой из полной записи со сдвигом: shift > 0 — звук раньше (берём хвост), < 0 — позже (начало — с конца петли)
export function shifted(full, len, shift) {
  const out = new Float32Array(len), n = full.length;
  for (let i = 0; i < len; i++) {
    let j = i + shift;
    if (j < 0) j += len; // с конца петли (по кругу)
    else if (j >= n) j -= len;
    out[i] = j >= 0 && j < n ? full[j] : 0;
  }
  return out;
}
// Обрезка слоя внутри петли: вне [a, b) (доли петли) — тишина, края с короткими спадами (без щелчков)
export function trimmed(buf, a, b, fade = 220) {
  const len = buf.length, i0 = Math.round(Math.max(0, a) * len), i1 = Math.round(Math.min(1, b) * len);
  if (i0 <= 0 && i1 >= len) return buf;
  const out = new Float32Array(len);
  for (let i = i0; i < i1; i++) { const k = Math.min(1, (i - i0) / fade, (i1 - 1 - i) / fade); out[i] = buf[i] * Math.max(0, k); }
  return out;
}
export const FX_DEF = () => normalizeFx(null); // эффекты слоя — общая цепочка (fx.js): эквалайзер, сжатие, драйв, тремоло, задержка, хор, реверберация
// Огибающая для рисунка: n отрезков, среднеквадратичный уровень каждого, 0…1 (относительно самого громкого)
export function peaksOf(buf, n) {
  const out = new Float32Array(n), step = buf.length / n;
  let mx = 0;
  for (let k = 0; k < n; k++) {
    const a = Math.floor(k * step), b = Math.min(buf.length, Math.floor((k + 1) * step)) || a + 1;
    let s = 0;
    for (let i = a; i < b; i++) s += buf[i] * buf[i];
    out[k] = Math.sqrt(s / Math.max(1, b - a));
    if (out[k] > mx) mx = out[k];
  }
  if (mx > 0) for (let k = 0; k < n; k++) out[k] = Math.min(1, out[k] / mx);
  return out;
}

// Длина петли по метроному: сколько тактов ближе всего к сыгранному (не меньше одного)
export const quantBars = (sec, barSec) => Math.max(1, Math.round(sec / barSec));

// Свести слои в один канал: сумма с громкостями, без клиппинга (мягкое ограничение)
export function mixdown(layers, len) {
  const out = new Float32Array(len);
  layers.forEach((L) => { if (L.mute) return; const g = L.gain, b = L.buf; for (let i = 0; i < len; i++) out[i] += b[i] * g; });
  for (let i = 0; i < len; i++) { const x = out[i]; out[i] = Math.abs(x) > 0.95 ? Math.tanh(x) : x; }
  return out;
}

export function createLooper({ mixer, onChange = () => {}, log = () => {} }) {
  let c = null, mic = null, proc = null, out = null, mon = null;
  const slots = Array.from({ length: SLOTS }, () => ({ layers: [], len: 0, t0: 0, srcs: [] }));
  let cur = 0, state = 'idle'; // idle | rec | play | dub
  let rec = null; // идёт запись: { start, chunks | buf, pos }
  let shift = 0; // сдвиг записи, с: звук слышен позже, чем задуман, и доходит до микрофона позже
  let monOn = false;

  const S = () => slots[cur];
  const emit = () => onChange(api.state);

  function ctxOf() {
    c = getContext(mixer.state.mode);
    if (!c) throw new Error('nosound');
    if (!out || out.context !== c) {
      out = c.createGain();
      out.connect(mixer.bus('media'));
    }
    return c;
  }
  const latency = () => (c ? (c.outputLatency || 0) + (c.baseLatency || 0) : 0) + shift;

  // Микрофон: поток → процессор (захват) и монитор (только по выбору — на телефоне без наушников свистит)
  async function openMic() {
    if (mic) return true;
    const cx = ctxOf();
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }); }
    catch (e) { throw Object.assign(new Error('mic'), { reason: e && e.name === 'NotAllowedError' ? 'denied' : 'unavailable' }); }
    const src = cx.createMediaStreamSource(stream);
    proc = cx.createScriptProcessor(CHUNK, 1, 1);
    proc.onaudioprocess = (e) => { if (rec) capture(e.inputBuffer.getChannelData(0), e.playbackTime); };
    const sink = cx.createGain();
    sink.gain.value = 0;
    src.connect(proc).connect(sink).connect(cx.destination); // процессор молчит без выхода
    mon = cx.createGain();
    mon.gain.value = monOn ? 1 : 0;
    src.connect(mon).connect(out);
    mic = { stream, src, sink };
    return true;
  }
  function closeMic() {
    if (!mic) return;
    try { mic.stream.getTracks().forEach((t) => t.stop()); } catch { /* */ }
    [mic.src, proc, mic.sink, mon].forEach((n) => { try { n && n.disconnect(); } catch { /* */ } });
    if (proc) proc.onaudioprocess = null;
    mic = null; proc = null; mon = null;
  }

  // Кусок с микрофона: at — время его первого отсчёта (с поправкой на задержку)
  function capture(data, playbackTime) {
    const sr = c.sampleRate, at = playbackTime - latency();
    if (rec.tail) { // хвост первой записи: ещё MARGIN_SEC после конца петли — в полную запись слоя (для сдвига)
      const L = rec.tail, p0 = Math.round((at - rec.start) * sr);
      for (let i = 0, p = p0; i < data.length; i++, p++) if (p >= 0 && p < L.full.length) L.full[p] = data[i];
      if (at >= rec.until) rec = null;
      return;
    }
    if (rec.chunks) { // первая запись: копим всё
      if (rec.total >= MAX_SEC * sr) { api.stopRec(); return; }
      rec.chunks.push({ at, d: new Float32Array(data) });
      rec.total += data.length;
      return;
    }
    // наложение: сложить в буфер слоя по месту в петле
    const s = S(), len = s.len, lenSec = len / sr;
    let pos = Math.round((((at - s.t0) % lenSec) + lenSec) % lenSec * sr);
    const b = rec.buf;
    for (let i = 0; i < data.length; i++) { b[pos] += data[i]; if (++pos >= len) pos = 0; }
    rec.got += data.length;
  }

  // Запустить воспроизведение слоя с нужного места (в такт остальным)
  function startLayer(L, when = c.currentTime) {
    const s = S(), sr = c.sampleRate, ab = c.createBuffer(1, s.len, sr);
    ab.copyToChannel(L.buf, 0);
    const src = c.createBufferSource();
    L.fx = normalizeFx(L.fx);
    src.buffer = ab; src.loop = true; src.loopStart = 0; src.loopEnd = s.len / sr;
    // цепочка слоя — общая (fx.js) и громкость создаются один раз на слой и живут при перезапусках (сдвиг, обрезка):
    // запись → цепочка → громкость → выход. Перезапуск меняет только источник — без переподключений в цепочке
    if (!L.chain || L.chain.ctx !== c) {
      const g = c.createGain();
      g.gain.value = L.mute ? 0 : L.gain;
      L.chain = createFxChain(c, L.fx); L.chain.ctx = c; L.chain.g = g;
      L.chain.output.connect(g).connect(out);
    }
    src.connect(L.chain.input);
    L.node = { src, g: L.chain.g };
    const lenSec = s.len / sr, off = (((when - s.t0) % lenSec) + lenSec) % lenSec;
    src.start(when, off);
    s.srcs.push(src);
  }
  // Буфер слоя из полной записи: сдвиг и обрезка
  const rebuild = (L, len) => { L.buf = trimmed(shifted(L.full, len, L.shift || 0), L.trim ? L.trim.a : 0, L.trim ? L.trim.b : 1); L.ver = (L.ver || 0) + 1; };
  function restart(L, s = S()) { if (L.node) { try { L.node.src.stop(); L.node.src.disconnect(); } catch { /* */ } s.srcs = s.srcs.filter((x) => x !== L.node.src); startLayer(L); } }
  const freeChain = (L) => { if (L.chain) { try { L.chain.g.disconnect(); } catch { /* */ } L.chain.dispose(); L.chain = null; } };
  function stopAll(s = S()) {
    s.srcs.forEach((x) => { try { x.stop(); x.disconnect(); } catch { /* */ } });
    s.srcs = [];
    s.layers.forEach((L) => { L.node = null; });
  }

  const api = {
    get state() {
      const s = S(), sr = c ? c.sampleRate : 44100;
      return { state, slot: cur, len: s.len / sr, layers: s.layers.map((L) => ({ gain: L.gain, mute: !!L.mute, shift: Math.round((L.shift || 0) / sr * 1000), margin: Math.round((L.margin || 0) / sr * 1000), trim: { ...(L.trim || { a: 0, b: 1 }) }, fx: normalizeFx(L.fx), ver: L.ver || 0 })), slots: slots.map((x) => x.layers.length),
        pos: c && s.len && (state === 'play' || state === 'dub') ? ((((c.currentTime - s.t0) % (s.len / sr)) + s.len / sr) % (s.len / sr)) / (s.len / sr) : state === 'rec' && rec ? Math.min(1, (c.currentTime - rec.start) / MAX_SEC) : 0,
        recSec: state === 'rec' && rec ? c.currentTime - rec.start : 0, mon: monOn, mic: !!mic };
    },
    setShift(ms) { shift = (+ms || 0) / 1000; },
    setMonitor(on) { monOn = !!on; if (mon) mon.gain.setTargetAtTime(monOn ? 1 : 0, c.currentTime, 0.02); emit(); },
    openMic,

    // Первая запись: at — когда начать (время контекста; null — сейчас)
    async startRec(at = null) {
      await openMic();
      if (state === 'rec' || state === 'dub') return;
      const s = S();
      stopAll(s);
      s.layers.forEach(freeChain);
      s.layers = []; s.len = 0;
      rec = { start: at ?? c.currentTime, chunks: [], total: 0 };
      state = 'rec';
      emit();
    },
    // Остановить первую запись → петля играет. barSec — длина такта (по метроному): длина петли — целые такты;
    // если такт ещё не кончился, запись продолжается до его конца
    stopRec(barSec = 0) {
      if (state !== 'rec' || !rec) return;
      const sr = c.sampleRate, now = c.currentTime, played = now - rec.start;
      let lenSec = played;
      if (barSec > 0) lenSec = quantBars(played, barSec) * barSec;
      lenSec = Math.min(MAX_SEC, lenSec);
      if (lenSec > played + 0.02) { // дождаться конца такта
        if (!rec.wait) { rec.wait = after((lenSec - played) * 1000 + 5, () => { rec && (rec.wait = null); api.stopRec(barSec); }); }
        return;
      }
      const len = Math.max(1, Math.round(lenSec * sr)), margin = Math.round(MARGIN_SEC * sr), full = new Float32Array(len + margin), r = rec;
      r.chunks.forEach(({ at, d }) => {
        let p = Math.round((at - r.start) * sr);
        for (let i = 0; i < d.length; i++, p++) if (p >= 0 && p < full.length) full[p] = d[i];
      });
      const s = S(), L = { buf: full.slice(0, len), full, margin, shift: 0, trim: { a: 0, b: 1 }, fx: FX_DEF(), gain: 1, mute: false };
      s.len = len; s.t0 = r.start + lenSec;
      if (s.t0 > now) s.t0 -= lenSec; // первая петля ещё идёт — продолжаем её, не повторяя сначала
      s.layers = [L];
      state = 'play';
      rec = { tail: L, start: r.start, until: r.start + lenSec + MARGIN_SEC }; // хвост дописывается уже под петлю
      startLayer(L);
      emit();
    },
    // Наложение: новый слой пишется поверх, пока не остановят (можно несколько кругов)
    async startDub() {
      const s = S();
      if (!s.len || state !== 'play') return;
      await openMic();
      if (s.layers.length >= MAX_LAYERS) throw Object.assign(new Error('layers'), { reason: 'layers' });
      rec = { buf: new Float32Array(s.len), got: 0 }; // хвост первой записи, если ещё шёл, обрывается
      state = 'dub';
      emit();
    },
    stopDub() {
      if (state !== 'dub' || !rec) return;
      const s = S(), r = rec;
      rec = null;
      state = 'play';
      if (r.got > 0) { const L = { buf: r.buf, full: r.buf, margin: 0, shift: 0, trim: { a: 0, b: 1 }, fx: FX_DEF(), gain: 1, mute: false }; s.layers.push(L); startLayer(L); }
      emit();
    },
    // Главная кнопка: пусто → запись; запись → петля; играет → наложение; наложение → петля
    async tap(barSec = 0, at = null) {
      if (state === 'idle') return api.startRec(at);
      if (state === 'rec') return api.stopRec(barSec);
      if (state === 'play') return api.startDub();
      if (state === 'dub') return api.stopDub();
    },
    play() {
      const s = S();
      if (!s.len || state !== 'idle') return;
      stopAll(s);
      s.t0 = c.currentTime;
      s.layers.forEach((L) => startLayer(L));
      state = 'play';
      emit();
    },
    stop() {
      if (rec && rec.wait) cancel(rec.wait);
      rec = null;
      stopAll();
      state = 'idle';
      emit();
    },
    // Отменить последний слой (при наложении — само наложение)
    undo() {
      const s = S();
      if (state === 'dub') { rec = null; state = 'play'; emit(); return true; }
      if (state === 'rec') { api.stop(); return true; }
      const L = s.layers.pop();
      if (!L) return false;
      if (L.node) { try { L.node.src.stop(); L.node.src.disconnect(); } catch { /* */ } s.srcs = s.srcs.filter((x) => x !== L.node.src); }
      freeChain(L);
      if (!s.layers.length) { s.len = 0; state = 'idle'; }
      emit();
      return true;
    },
    clear() { api.stop(); const s = S(); s.layers.forEach(freeChain); s.layers = []; s.len = 0; emit(); },
    // Сдвиг слоя, мс: вперёд (+, звук раньше — хвост из записи с запасом) или назад (−); наложения — по кругу.
    // Нужен при записи в наушниках: звук доходит с задержкой, слой садится точно под петлю
    shiftLayer(i, ms) {
      const s = S(), L = s.layers[i];
      if (!L || !c) return;
      const sr = c.sampleRate, lim = L.margin || s.len;
      L.shift = Math.max(-lim, Math.min(lim, Math.round((+ms || 0) * sr / 1000)));
      rebuild(L, s.len); restart(L, s);
      emit();
    },
    // Обрезка слоя: a, b — доли петли (0…1), вне — тишина
    trimLayer(i, a, b) {
      const s = S(), L = s.layers[i];
      if (!L) return;
      a = Math.max(0, Math.min(0.98, +a || 0)); b = Math.max(a + 0.02, Math.min(1, +b || 1));
      L.trim = { a, b };
      rebuild(L, s.len); restart(L, s);
      emit();
    },
    // Эквалайзер, компрессия, реверберация слоя (живые ручки, без перезапуска)
    setFx(i, fx) {
      const L = S().layers[i];
      if (!L) return;
      L.fx = normalizeFx({ ...normalizeFx(L.fx), ...fx });
      if (L.chain) L.chain.set(L.fx);
      emit();
      return L.fx;
    },
    // Огибающая слоя для рисунка (n отрезков); fullPeaks — вся запись с хвостом (для окна слоя)
    peaks(i, n) { const L = S().layers[i]; return L ? peaksOf(L.buf, n) : null; },
    fullPeaks(i, n) { const L = S().layers[i]; return L ? peaksOf(L.full, n) : null; },
    setGain(i, v) { const L = S().layers[i]; if (!L) return; L.gain = Math.max(0, Math.min(1.5, v)); if (L.node) L.node.g.gain.setTargetAtTime(L.mute ? 0 : L.gain, c.currentTime, 0.02); emit(); },
    toggleMute(i) { const L = S().layers[i]; if (!L) return; L.mute = !L.mute; if (L.node) L.node.g.gain.setTargetAtTime(L.mute ? 0 : L.gain, c.currentTime, 0.02); emit(); },
    removeLayer(i) {
      const s = S(), L = s.layers[i];
      if (!L) return;
      if (L.node) { try { L.node.src.stop(); L.node.src.disconnect(); } catch { /* */ } s.srcs = s.srcs.filter((x) => x !== L.node.src); }
      s.layers.splice(i, 1);
      freeChain(L);
      if (!s.layers.length) { s.len = 0; state = 'idle'; }
      emit();
    },
    // Другая петля: текущая останавливается, новая (если записана) играет сразу
    select(i) {
      if (i === cur || i < 0 || i >= SLOTS) return;
      const was = state === 'play' || state === 'dub';
      api.stop();
      cur = i;
      if (was && S().len) api.play(); else emit();
    },
    // Сведение текущей петли → { data: Float32Array, sr } или null
    mix() { const s = S(); return s.len ? { data: mixdown(s.layers, s.len), sr: c.sampleRate } : null; },
    get hasAny() { return slots.some((s) => s.len > 0); },
    close() { api.stop(); closeMic(); },
    // Снять всё при выходе (память): петли забываются
    destroy() { slots.forEach((s) => { stopAll(s); s.layers.forEach(freeChain); s.layers = []; s.len = 0; }); closeMic(); state = 'idle'; },
  };
  return api;
}
