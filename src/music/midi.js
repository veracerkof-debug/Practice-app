// MIDI: запись игры и файлы .mid. Чистые функции, без звука и DOM.
//
// Игра хранится событиями (take.ev), общими для всех инструментов:
//   { t: секунды от начала, k: 'on' | 'mv' | 'off' | 'ped', id: голос, m: высота (полутоны, может быть дробной),
//     v: сила нажатия 0…1, y: выразительность 0…1 (высота пальца на доске глайдера), r: отпущена с педалью, x: данные модуля }
// 'mv' — голос сменил высоту или выразительность (скольжение, вибрато); 'ped' — педаль (v: 1 — нажата, 0 — отпущена).
//
// В файл: пианино — обычные ноты на одном канале и педаль (CC64). Скольжение (глайдер, терменвокс) — по стандарту MPE:
// у каждого голоса свой канал (2…16), высота — нота плюс изгиб (pitch bend, диапазон ±48 полутонов),
// выразительность — CC74. Такой файл понимают студии с MPE (Ableton, Logic, Bitwig, Cubase); в обычных нотах видны ноты.
// Чтение — любой файл формата 0 и 1: темп, изгиб с его диапазоном (RPN 0), CC74, педаль; ударные (канал 10) пропускаются,
// кроме файлов MPE (там канал 10 — один из голосов).

export const PPQ = 480;
const TEMPO = 500000;                 // 120 ударов в минуту: 960 тиков в секунде
const TPS = (PPQ * 1e6) / TEMPO;
export const MPE_RANGE = 48;          // диапазон изгиба голосов MPE, полутоны
const DRUMS = 9;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const vel = (v) => clamp(Math.round((v == null ? 0.8 : v) * 127), 1, 127);

// Нужен ли MPE: есть дробная высота или движение голоса
export const isMpe = (ev) => ev.some((e) => e.k === 'mv' || (e.m != null && Math.abs(e.m - Math.round(e.m)) > 0.004));

function varlen(n) {
  const out = [n & 0x7f];
  while ((n >>= 7)) out.unshift((n & 0x7f) | 0x80);
  return out;
}

// События игры → файл .mid (формат 0, одна дорожка). → Uint8Array
export function writeMidi(ev, { name = '' } = {}) {
  const list = [...ev].sort((a, b) => a.t - b.t), mpe = isMpe(list), msgs = []; // [тик, ...байты]
  const at = (t) => Math.max(0, Math.round(t * TPS));
  const put = (tk, ...b) => msgs.push([tk, b]);
  if (name) { const s = [...new TextEncoder().encode(name)].slice(0, 120); put(0, 0xff, 0x03, ...varlen(s.length), ...s); }
  put(0, 0xff, 0x51, 0x03, (TEMPO >> 16) & 0xff, (TEMPO >> 8) & 0xff, TEMPO & 0xff);
  if (mpe) {
    // зона MPE: главный канал 1, голоса — каналы 2…16; диапазон изгиба голосов — 48 полутонов
    put(0, 0xb0, 101, 0); put(0, 0xb0, 100, 6); put(0, 0xb0, 6, 15);
    for (let c = 1; c < 16; c++) { put(0, 0xb0 | c, 101, 0); put(0, 0xb0 | c, 100, 0); put(0, 0xb0 | c, 6, MPE_RANGE); put(0, 0xb0 | c, 38, 0); }
  }
  const on = new Map();     // id → { ch, n }
  const free = [];          // каналы MPE по очереди: дольше всех свободный — первым
  for (let c = 1; c < 16; c++) free.push(c);
  const bendOf = (d) => clamp(Math.round(8192 + (d / MPE_RANGE) * 8192), 0, 16383);
  const off = (tk, id) => {
    const v = on.get(id);
    if (!v) return;
    put(tk, 0x80 | v.ch, v.n, 0);
    on.delete(id);
    if (mpe) free.push(v.ch);
  };
  let ped = 0;
  for (const e of list) {
    const tk = at(e.t);
    if (e.k === 'on') {
      off(tk, e.id);
      const n = clamp(Math.round(e.m), 0, 127);
      let ch = 0;
      if (mpe) {
        if (!free.length) off(tk, on.keys().next().value); // голосов больше 15 — замолкает самый старый
        ch = free.shift();
        const b = bendOf(e.m - n);
        put(tk, 0xe0 | ch, b & 0x7f, b >> 7);
        if (e.y != null) put(tk, 0xb0 | ch, 74, clamp(Math.round(e.y * 127), 0, 127));
      }
      put(tk, 0x90 | ch, n, vel(e.v));
      on.set(e.id, { ch, n });
    } else if (e.k === 'mv') {
      const v = on.get(e.id);
      if (!v) continue;
      if (mpe && e.m != null) { const b = bendOf(e.m - v.n); put(tk, 0xe0 | v.ch, b & 0x7f, b >> 7); }
      if (mpe && e.y != null) put(tk, 0xb0 | v.ch, 74, clamp(Math.round(e.y * 127), 0, 127));
    } else if (e.k === 'off') off(tk, e.id);
    else if (e.k === 'ped' && !mpe) {
      const p = e.v ? 1 : 0;
      if (p !== ped) { put(tk, 0xb0, 64, p ? 127 : 0); ped = p; }
    }
  }
  const end = list.length ? at(list.at(-1).t) : 0;
  [...on.keys()].forEach((id) => off(end, id));
  if (ped) put(end, 0xb0, 64, 0);
  // дорожка: разница во времени + сообщение; сообщения одного тика — в порядке добавления
  const body = [];
  let last = 0;
  msgs.map((m, i) => [m, i]).sort((a, b) => a[0][0] - b[0][0] || a[1] - b[1]).forEach(([[tk, b]]) => { body.push(...varlen(tk - last), ...b); last = tk; });
  body.push(0, 0xff, 0x2f, 0x00);
  const n = body.length;
  return new Uint8Array([
    0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, PPQ >> 8, PPQ & 0xff,
    0x4d, 0x54, 0x72, 0x6b, (n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff, ...body,
  ]);
}

// Сообщения MIDI → события игры. Один разборщик и для файла, и для клавиатуры вживую.
// msg(t, [статус, d1, d2]) → массив событий. Состояние каналов: изгиб и его диапазон, CC74, педаль, звучащие ноты.
export function createDecoder({ prefix = 'm' } = {}) {
  const chs = Array.from({ length: 16 }, () => ({ range: 2, rpn: [127, 127], bend: 0, y: null, sus: false, notes: new Map() }));
  let seq = 0, mpe = false; // в зоне MPE канал 10 — обычный голос, а не ударные
  return {
    msg(t, [st, a = 0, b = 0]) {
      const type = st & 0xf0, c = st & 0x0f, C = chs[c], out = [];
      if (st < 0x80 || st >= 0xf0) return out;
      if (type === 0x90 && b > 0) {
        if (c === DRUMS && !mpe) return out;
        const old = C.notes.get(a);
        if (old) out.push({ t, k: 'off', id: old });
        const id = prefix + c + '.' + a + '.' + seq++;
        C.notes.set(a, id);
        out.push({ t, k: 'on', id, m: a + C.bend, v: b / 127, ...(C.y != null ? { y: C.y } : {}) });
      } else if (type === 0x80 || type === 0x90) {
        const id = C.notes.get(a);
        if (id) { C.notes.delete(a); out.push({ t, k: 'off', id, ...(C.sus ? { r: true } : {}) }); }
      } else if (type === 0xe0) {
        C.bend = (((b << 7) | a) - 8192) / 8192 * C.range;
        C.notes.forEach((id, n) => out.push({ t, k: 'mv', id, m: n + C.bend }));
      } else if (type === 0xb0) {
        if (a === 74) { C.y = b / 127; C.notes.forEach((id) => out.push({ t, k: 'mv', id, y: C.y })); }
        else if (a === 64) { const s = b >= 64; if (s !== C.sus) { C.sus = s; out.push({ t, k: 'ped', v: s ? 1 : 0 }); } }
        else if (a === 101) C.rpn[0] = b;
        else if (a === 100) C.rpn[1] = b;
        else if (a === 6 && C.rpn[0] === 0 && C.rpn[1] === 0) C.range = b;
        else if (a === 6 && C.rpn[0] === 0 && C.rpn[1] === 6) mpe = b > 0;
        else if (a === 38 && C.rpn[0] === 0 && C.rpn[1] === 0) C.range = Math.floor(C.range) + b / 100;
        else if (a === 120 || a === 123) { C.notes.forEach((id) => out.push({ t, k: 'off', id })); C.notes.clear(); }
      }
      return out;
    },
    // всё звучащее — отпустить (конец файла, клавиатуру отключили)
    flush(t) {
      const out = [];
      chs.forEach((C) => { C.notes.forEach((id) => out.push({ t, k: 'off', id })); C.notes.clear(); });
      return out;
    },
  };
}

// Файл .mid → { ev, dur, name }. Не MIDI — исключение
export function readMidi(u8) {
  const d = u8 instanceof Uint8Array ? u8 : new Uint8Array(u8);
  const str = (i) => String.fromCharCode(d[i], d[i + 1], d[i + 2], d[i + 3]);
  const u32 = (i) => ((d[i] << 24) | (d[i + 1] << 16) | (d[i + 2] << 8) | d[i + 3]) >>> 0;
  if (d.length < 14 || str(0) !== 'MThd') throw new Error('not midi');
  const hl = u32(4), ntr = (d[10] << 8) | d[11], div = (d[12] << 8) | d[13];
  // SMPTE: тиков в секунду — кадры × тики кадра
  const smpte = div & 0x8000 ? (256 - (div >> 8)) * (div & 0xff) : 0;
  const all = []; // { tk, tr, i, tempo?, msg?, name? }
  let p = 8 + hl, name = '';
  for (let tr = 0; tr < ntr && p + 8 <= d.length; tr++) {
    const len = u32(p + 4), start = p + 8, end = Math.min(d.length, start + len);
    if (str(p) !== 'MTrk') { p = end; tr--; if (p >= d.length) break; continue; }
    let i = start, tk = 0, run = 0, k = 0;
    const vl = () => { let v = 0, b; do { b = d[i++]; v = (v << 7) | (b & 0x7f); } while (b & 0x80 && i < end); return v; };
    while (i < end) {
      tk += vl();
      let st = d[i];
      if (st & 0x80) i++; else st = run;
      if (st === 0xff) {
        const type = d[i++], n = vl();
        if (type === 0x51 && n === 3) all.push({ tk, tr, k: k++, tempo: (d[i] << 16) | (d[i + 1] << 8) | d[i + 2] });
        if ((type === 0x03 || type === 0x01) && !name && n) { try { name = new TextDecoder().decode(d.subarray(i, i + n)).trim(); } catch { /* имя не прочесть */ } }
        if (type === 0x2f) break;
        i += n;
      } else if (st === 0xf0 || st === 0xf7) { const n = vl(); i += n; }
      else if (st >= 0x80) {
        run = st;
        const two = (st & 0xf0) !== 0xc0 && (st & 0xf0) !== 0xd0;
        const msg = two ? [st, d[i], d[i + 1]] : [st, d[i]];
        i += two ? 2 : 1;
        all.push({ tk, tr, k: k++, msg });
      } else break; // испорченная дорожка
    }
    p = end;
  }
  all.sort((a, b) => a.tk - b.tk || a.tr - b.tr || a.k - b.k);
  // тики → секунды по карте темпа
  let tempo = TEMPO, lastTk = 0, sec = 0;
  const dec = createDecoder(), ev = [];
  for (const e of all) {
    sec += smpte ? (e.tk - lastTk) / smpte : ((e.tk - lastTk) * tempo) / (div * 1e6 || 1);
    lastTk = e.tk;
    if (e.tempo) tempo = e.tempo;
    else ev.push(...dec.msg(sec, e.msg));
  }
  ev.push(...dec.flush(sec));
  return { ev, dur: sec, name };
}

// Длительность записи, с
export const takeDur = (ev) => (ev.length ? ev.reduce((a, e) => Math.max(a, e.t), 0) : 0);
