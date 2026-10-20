// Файлы студий (DAW) и .mid → песня для студии приложения: { name, bpm, num, den, key?, tracks: [{ name, drums,
// program?, notes: [{ t, d, m, v, lane? }] }] }, время — в долях проекта (при размере x/8 доля — восьмая).
// Читаются как есть, без правки чужого файла: ноты, темп, размер, названия дорожек, ударные.
//   .mid — формат 0 и 1 (дорожки, канал 10 — ударные, инструменты General MIDI);
//   .als — Ableton Live: gzip + XML (дорожки MIDI, клипы аранжировки, петли клипов, Drum Rack — ударные);
//   .rpp — Reaper: текст (TEMPO, дорожки, MIDI-элементы с событиями E);
//   .flp — FL Studio: двоичные события (каналы, паттерны с нотами, плейлист; сэмплеры по названию — ударные).
// Чистые функции, без DOM; распаковка gzip — DecompressionStream (браузер и Node).

const PROGRAM_NAMES = ['piano', 'piano', 'piano', 'piano', 'e-piano', 'e-piano', 'harpsichord', 'clavinet'];
const u16 = (d, i) => d[i] | (d[i + 1] << 8), u32 = (d, i) => (d[i] | (d[i + 1] << 8) | (d[i + 2] << 16) | (d[i + 3] << 24)) >>> 0;

export const DAW_FORMATS = { mid: 'MIDI', midi: 'MIDI', als: 'Ableton Live', rpp: 'Reaper', flp: 'FL Studio' };
export const dawFmt = (name) => { const m = /\.([a-z0-9]+)$/i.exec(String(name)); const e = m ? m[1].toLowerCase() : ''; return e === 'midi' ? 'mid' : DAW_FORMATS[e] ? e : null; };

export async function gunzip(u8) {
  const ds = new DecompressionStream('gzip'), w = ds.writable.getWriter();
  w.write(u8); w.close();
  return new Uint8Array(await new Response(ds.readable).arrayBuffer());
}

// Любой файл по формату: 'mid' | 'als' | 'rpp' | 'flp'
export async function readDaw(u8, fmt) {
  if (fmt === 'mid') return readMidiSong(u8);
  if (fmt === 'als') return readAls(new TextDecoder().decode(u8[0] === 0x1f && u8[1] === 0x8b ? await gunzip(u8) : u8));
  if (fmt === 'rpp') return readRpp(new TextDecoder().decode(u8));
  if (fmt === 'flp') return readFlp(u8);
  throw new Error('format');
}

// Ноты по каналам: включения и выключения → { t, d, m, v } (в четвертях); потом четверти → доли размера
function finish(song, tracks, quarters) {
  const k = (song.den || 4) / 4;
  song.tracks = tracks.filter((t) => t.notes.length).map((t) => ({ ...t, notes: t.notes.map((n) => ({ ...n, t: quarters ? n.t * k : n.t, d: Math.max(0.0625, (quarters ? n.d * k : n.d)) })).sort((a, b) => a.t - b.t || a.m - b.m) }));
  song.num = song.num || 4; song.den = song.den || 4; song.bpm = Math.max(20, Math.min(300, Math.round(song.bpm || 120)));
  return song;
}

/* ---------- .mid ---------- */

export function readMidiSong(u8) {
  const d = u8 instanceof Uint8Array ? u8 : new Uint8Array(u8);
  const str = (i) => String.fromCharCode(d[i], d[i + 1], d[i + 2], d[i + 3]);
  const be32 = (i) => ((d[i] << 24) | (d[i + 1] << 16) | (d[i + 2] << 8) | d[i + 3]) >>> 0;
  if (d.length < 14 || str(0) !== 'MThd') throw new Error('not midi');
  const hl = be32(4), ntr = (d[10] << 8) | d[11], div = (d[12] << 8) | d[13];
  if (div & 0x8000) throw new Error('smpte');
  const song = { name: '', bpm: 0, num: 0, den: 0, key: null }, tracks = [];
  let p = 8 + hl;
  for (let tr = 0; tr < ntr && p + 8 <= d.length; tr++) {
    const len = be32(p + 4), start = p + 8, end = Math.min(d.length, start + len);
    if (str(p) !== 'MTrk') { p = end; tr--; if (p >= d.length) break; continue; }
    let i = start, tk = 0, run = 0, name = '';
    const by = new Map(), prog = {}, open = new Map(); // канал → дорожка; канал → инструмент; ch:m → нота
    const vl = () => { let v = 0, b; do { b = d[i++]; v = (v << 7) | (b & 0x7f); } while (b & 0x80 && i < end); return v; };
    const trackOf = (ch) => { let t = by.get(ch); if (!t) { t = { name: '', drums: ch === 9, program: prog[ch] ?? null, notes: [] }; by.set(ch, t); tracks.push(t); } return t; };
    while (i < end) {
      tk += vl();
      let st = d[i];
      if (st & 0x80) i++; else st = run;
      if (st === 0xff) {
        const type = d[i++], n = vl(), s = () => { try { return new TextDecoder().decode(d.subarray(i, i + n)).replace(/\0/g, '').trim(); } catch { return ''; } };
        if (type === 0x51 && n === 3 && !song.bpm) song.bpm = 60e6 / ((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
        else if (type === 0x58 && n >= 2 && !song.num) { song.num = d[i]; song.den = 2 ** d[i + 1]; }
        else if (type === 0x59 && n === 2 && !song.key) { const f = d[i] > 127 ? d[i] - 256 : d[i], minor = d[i + 1] === 1; song.key = { pc: (((f * 7) % 12) + 12 + (minor ? 9 : 0)) % 12, minor }; }
        else if (type === 0x03 && n) { const v = s(); if (tr === 0 && !song.name) song.name = v; name = name || v; }
        else if (type === 0x01 && n && !song.name && tr === 0) song.name = s();
        if (type === 0x2f) break;
        i += n;
      } else if (st === 0xf0 || st === 0xf7) { const n = vl(); i += n; }
      else if (st >= 0x80) {
        run = st;
        const kind = st & 0xf0, ch = st & 0x0f, two = kind !== 0xc0 && kind !== 0xd0, a = d[i], b = two ? d[i + 1] : 0;
        i += two ? 2 : 1;
        if (kind === 0xc0) { prog[ch] = a; const t = by.get(ch); if (t && t.program == null) t.program = a; }
        else if (kind === 0x90 && b > 0) { const key = ch + ':' + a; if (open.has(key)) closeNote(open, key, tk, trackOf(ch), div); open.set(key, { tk, v: b / 127 }); }
        else if (kind === 0x80 || (kind === 0x90 && b === 0)) closeNote(open, ch + ':' + a, tk, trackOf(ch), div);
      } else break;
    }
    open.forEach((_, key) => closeNote(open, key, tk, trackOf(+key.split(':')[0]), div));
    by.forEach((t) => { t.name = name; });
    p = end;
  }
  tracks.forEach((t, i) => { t.name = t.name || (t.drums ? 'Drums' : PROGRAM_NAMES[t.program] ? '' : '') || 'Track ' + (i + 1); });
  return finish(song, tracks, true);
}
function closeNote(open, key, tk, tr, div) {
  const o = open.get(key);
  if (!o) return;
  open.delete(key);
  tr.notes.push({ t: o.tk / div, d: Math.max(1, tk - o.tk) / div, m: +key.split(':')[1], v: o.v });
}

/* ---------- Ableton Live (.als — XML) ---------- */

// Лёгкий обход XML без DOM: open(path, attrs), close(path) для каждого тега
function walkXml(text, open, close) {
  const re = /<(\/?)([\w:.-]+)([^>]*?)(\/?)>/g, stack = [];
  let m;
  while ((m = re.exec(text))) {
    const [, end, tag, rest, self] = m;
    if (end) { stack.pop(); close && close(stack.join('/') + '/' + tag); continue; }
    stack.push(tag);
    const attrs = {};
    rest.replace(/([\w:.-]+)="([^"]*)"/g, (_, k, v) => { attrs[k] = v.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&apos;/g, "'"); return ''; });
    open(stack.join('/'), attrs, tag);
    if (self) { stack.pop(); close && close(stack.join('/') + '/' + tag); }
  }
}
export function readAls(text) {
  const song = { name: '', bpm: 0, num: 0, den: 0, key: null }, tracks = [];
  let tr = null, clip = null, kt = null, inMaster = false, sigDone = false;
  const ends = (path, s) => path.endsWith(s);
  walkXml(text, (path, a, tag) => {
    if (tag === 'MasterTrack') inMaster = true;
    if (tag === 'MidiTrack') { tr = { name: '', drums: false, program: null, notes: [] }; tracks.push(tr); return; }
    if (inMaster && ends(path, 'Tempo/Manual') && !song.bpm) song.bpm = +a.Value;
    if (inMaster && !sigDone && ends(path, 'TimeSignature/TimeSignatures/RemoteableTimeSignature/Numerator')) song.num = +a.Value;
    if (inMaster && !sigDone && ends(path, 'RemoteableTimeSignature/Denominator')) { song.den = +a.Value; sigDone = true; }
    if (!tr) return;
    if (ends(path, 'MidiTrack/Name/EffectiveName') && !tr.name) tr.name = a.Value || '';
    if (tag === 'DrumGroupDevice') tr.drums = true;
    if (tag === 'MidiClip') { clip = { start: 0, end: 0, ls: 0, le: 0, loop: false, notes: [] }; return; }
    if (!clip) return;
    if (ends(path, 'MidiClip/CurrentStart')) clip.start = +a.Value;
    if (ends(path, 'MidiClip/CurrentEnd')) clip.end = +a.Value;
    if (ends(path, 'MidiClip/Loop/LoopStart')) clip.ls = +a.Value;
    if (ends(path, 'MidiClip/Loop/LoopEnd')) clip.le = +a.Value;
    if (ends(path, 'MidiClip/Loop/LoopOn')) clip.loop = a.Value === 'true';
    if (tag === 'KeyTrack') { kt = { m: 60, notes: [] }; return; }
    if (kt && tag === 'MidiNoteEvent' && a.IsEnabled !== 'false') kt.notes.push({ t: +a.Time, d: +a.Duration, v: (+a.Velocity || 100) / 127 });
    if (kt && ends(path, 'KeyTrack/MidiKey')) kt.m = +a.Value;
  }, (path) => {
    if (ends(path, '/KeyTrack') && kt && clip) { kt.notes.forEach((n) => clip.notes.push({ ...n, m: kt.m })); kt = null; }
    if (ends(path, '/MidiClip') && clip && tr) {
      // клип в аранжировке: ноты от начала петли; зациклен — повторяется до конца клипа
      const len = clip.le > clip.ls ? clip.le - clip.ls : clip.end - clip.start, reps = clip.loop && len > 0 ? Math.ceil((clip.end - clip.start) / len) : 1;
      for (let r = 0; r < reps; r++) clip.notes.forEach((n) => {
        if (n.t < clip.ls || n.t >= clip.ls + len) return;
        const t = clip.start + r * len + (n.t - clip.ls);
        if (t >= clip.end - 1e-6) return;
        tr.notes.push({ t, d: Math.min(n.d, clip.end - t), m: n.m, v: n.v });
      });
      clip = null;
    }
    if (ends(path, '/MidiTrack')) tr = null;
    if (ends(path, '/MasterTrack')) inMaster = false;
  });
  tracks.forEach((t, i) => { t.name = t.name || 'Track ' + (i + 1); });
  return finish(song, tracks, true);
}

/* ---------- Reaper (.rpp — текст) ---------- */

export function readRpp(text) {
  const song = { name: '', bpm: 0, num: 0, den: 0, key: null }, tracks = [];
  const tempo = /^\s*TEMPO\s+([\d.]+)(?:\s+(\d+)\s+(\d+))?/m.exec(text);
  if (tempo) { song.bpm = +tempo[1]; song.num = +tempo[2] || 4; song.den = +tempo[3] || 4; }
  const spq = 60 / (song.bpm || 120); // секунд в четверти
  let tr = null, item = null, src = null, depth = 0, trDepth = 0, itDepth = 0;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('<')) {
      depth++;
      if (line.startsWith('<TRACK')) { tr = { name: '', drums: false, program: null, notes: [] }; tracks.push(tr); trDepth = depth; }
      else if (line.startsWith('<ITEM') && tr) { item = { pos: 0, len: 0, soffs: 0, rate: 1 }; itDepth = depth; }
      else if (line.startsWith('<SOURCE MIDI') && item) src = { ppq: 960, tk: 0, open: new Map() };
      continue;
    }
    if (line === '>') {
      if (src && depth === itDepth + 1) { src.open.forEach((o, key) => pushRpp(tr, item, src, key, o, src.tk, spq)); src = null; }
      if (item && depth === itDepth) item = null;
      if (tr && depth === trDepth) tr = null;
      depth--;
      continue;
    }
    if (tr && depth === trDepth && line.startsWith('NAME ')) tr.name = line.slice(5).replace(/^"|"$/g, '');
    if (item && !src) {
      if (line.startsWith('POSITION ')) item.pos = +line.slice(9);
      else if (line.startsWith('LENGTH ')) item.len = +line.slice(7);
      else if (line.startsWith('SOFFS ')) item.soffs = +line.split(/\s+/)[1];
      else if (line.startsWith('PLAYRATE ')) item.rate = +line.split(/\s+/)[1] || 1;
    }
    if (!src) continue;
    if (line.startsWith('HASDATA ')) { src.ppq = +line.split(/\s+/)[2] || 960; continue; }
    const m = /^[Ee]m?\s+(\d+)\s+([0-9a-f]{2})\s+([0-9a-f]{2})(?:\s+([0-9a-f]{2}))?/i.exec(line);
    if (!m) continue;
    src.tk += +m[1];
    const st = parseInt(m[2], 16), a = parseInt(m[3], 16), b = parseInt(m[4] || '0', 16), kind = st & 0xf0, ch = st & 0x0f, key = ch + ':' + a;
    if (kind === 0xc0) { if (tr.program == null) tr.program = a; }
    else if (kind === 0x90 && b > 0) { if (src.open.has(key)) pushRpp(tr, item, src, key, src.open.get(key), src.tk, spq); src.open.set(key, { tk: src.tk, v: b / 127 }); if (ch === 9) tr.drums = true; }
    else if (kind === 0x80 || (kind === 0x90 && b === 0)) { const o = src.open.get(key); if (o) { src.open.delete(key); pushRpp(tr, item, src, key, o, src.tk, spq); } }
  }
  tracks.forEach((t, i) => { t.name = t.name || 'Track ' + (i + 1); });
  return finish(song, tracks, true);
}
function pushRpp(tr, item, src, key, o, endTk, spq) {
  // тики источника → секунды элемента (с учётом смещения и скорости) → четверти проекта
  const sec = (tk) => item.pos + ((tk / src.ppq) * spq - item.soffs) / (item.rate || 1);
  const t0 = sec(o.tk), t1 = sec(Math.max(endTk, o.tk + 1));
  if (t1 <= item.pos || (item.len && t0 >= item.pos + item.len)) return;
  const a = Math.max(t0, item.pos), b = item.len ? Math.min(t1, item.pos + item.len) : t1;
  tr.notes.push({ t: a / spq, d: Math.max(0.0625, (b - a) / spq), m: +key.split(':')[1], v: o.v });
}

/* ---------- FL Studio (.flp — события) ---------- */

const FL = { VERSION: 199, TIMESIG_NUM: 17, TIMESIG_DEN: 18, CH_TYPE: 21, CH_NEW: 64, PAT_NEW: 65, TEMPO_OLD: 66, FINE_TEMPO: 156, CH_NAME: 192, PAT_NAME: 193, TITLE: 194, PLUGIN_NAME: 203, PAT_NOTES: 224, PLAYLIST: 225, PAT_BASE: 20480 };
// Текст: FL Studio 12 и новее пишет UTF-16, старые — однобайтовые; версия неизвестна — по нулевым байтам
const flText = (d, i, n, wide = null) => {
  const b = d.subarray(i, i + n);
  const w = wide != null ? wide : n >= 2 && n % 2 === 0 && b[1] === 0 && (n < 4 || b[3] === 0);
  try { return new TextDecoder(w ? 'utf-16le' : 'windows-1252').decode(b).replace(/\0+$/g, '').trim(); } catch { return ''; }
};
export function readFlp(u8) {
  const d = u8 instanceof Uint8Array ? u8 : new Uint8Array(u8);
  const str = (i) => String.fromCharCode(d[i], d[i + 1], d[i + 2], d[i + 3]);
  if (str(0) !== 'FLhd') throw new Error('not flp');
  const hl = u32(d, 4), ppq = u16(d, 12) || 96;
  let p = 8 + hl;
  if (str(p) !== 'FLdt') throw new Error('not flp');
  const end = Math.min(d.length, p + 8 + u32(d, p + 4));
  p += 8;
  const song = { name: '', bpm: 0, num: 0, den: 0, key: null }, chans = [], pats = [];
  let ch = null, pat = null, playlist = null, tempoFine = false, wide = null;
  while (p < end) {
    const id = d[p++];
    let v = 0, data = null, n = 0;
    if (id < 64) { v = d[p]; p += 1; }
    else if (id < 128) { v = u16(d, p); p += 2; }
    else if (id < 192) { v = u32(d, p); p += 4; }
    else { let sh = 0, b; do { b = d[p++]; n |= (b & 0x7f) << sh; sh += 7; } while (b & 0x80 && p < end); data = p; p += n; }
    switch (id) {
      case FL.VERSION: { const ver = flText(d, data, n); wide = parseInt(ver, 10) >= 12; break; }
      case FL.TIMESIG_NUM: song.num = v; break;
      case FL.TIMESIG_DEN: song.den = v; break;
      case FL.CH_NEW: ch = chans[v] || (chans[v] = { name: '', type: 2, notes: [] }); pat = null; break;
      case FL.CH_TYPE: if (ch) ch.type = v; break;
      case FL.PAT_NEW: pat = pats[v] || (pats[v] = { name: '', notes: [] }); ch = null; break;
      case FL.TEMPO_OLD: if (!tempoFine) song.bpm = v; break;
      case FL.FINE_TEMPO: song.bpm = v / 1000; tempoFine = true; break;
      case FL.CH_NAME: if (ch) ch.name = flText(d, data, n, wide); break;
      case FL.PLUGIN_NAME: if (ch && !ch.plugin) ch.plugin = flText(d, data, n, wide); break;
      case FL.PAT_NAME: if (pat) pat.name = flText(d, data, n, wide); break;
      case FL.TITLE: if (!song.name) song.name = flText(d, data, n, wide); break;
      case FL.PAT_NOTES: if (pat) { // 24 байта на ноту (старые версии — 20)
        const sz = n % 24 === 0 ? 24 : 20;
        for (let i = data; i + sz <= data + n; i += sz) pat.notes.push({ tk: u32(d, i), ch: u16(d, i + 6), len: u32(d, i + 8), m: u16(d, i + 12), v: d[i + (sz === 24 ? 21 : 19)] });
      } break;
      case FL.PLAYLIST: if (!playlist) { // 32 байта на элемент: позиция, база, номер, длина, дорожка, …, начало и конец внутри паттерна (float)
        playlist = [];
        for (let i = data; i + 32 <= data + n; i += 32) {
          const base = u16(d, i + 4), idx = u16(d, i + 6);
          if (idx < base) continue; // звуковой клип
          const f32 = (o) => new DataView(d.buffer, d.byteOffset + i + o, 4).getFloat32(0, true);
          const s0 = f32(24), s1 = f32(28);
          playlist.push({ tk: u32(d, i), pat: idx - base + 1, len: u32(d, i + 8), from: s0 >= 0 ? s0 : 0, to: s1 >= 0 ? s1 : Infinity });
        }
      } break;
    }
  }
  // ноты паттернов → дорожки-каналы по плейлисту (нет плейлиста — паттерны подряд)
  const tracks = chans.map((c, i) => ({ name: c.name || c.plugin || 'Channel ' + (i + 1), drums: c.type === 0 || /kick|snare|hat|clap|drum|perc|tom|crash|ride|shaker|cymbal/i.test(c.name + ' ' + (c.plugin || '')), program: null, lane: null, notes: [], type: c.type }));
  const put = (nt, off, from, to) => { const tr = tracks[nt.ch]; if (!tr || tr.type === 4) return; const t = nt.tk / ppq; if (t < from || t >= to) return; tr.notes.push({ t: off + t - from, d: Math.max(1, nt.len) / ppq, m: nt.m, v: Math.min(1, (nt.v || 100) / 128), lane: tr.drums ? tr.name : undefined }); };
  if (playlist && playlist.length) playlist.forEach((it) => { const x = pats[it.pat]; if (!x) return; const end = Math.min(it.to, it.from + it.len / ppq); x.notes.forEach((nt) => put(nt, it.tk / ppq, it.from, end)); });
  else { let off = 0; pats.forEach((x) => { if (!x || !x.notes.length) return; const len = Math.max(...x.notes.map((nt) => (nt.tk + nt.len) / ppq)); x.notes.forEach((nt) => put(nt, off, 0, Infinity)); off += Math.ceil(len / 4) * 4; }); }
  return finish(song, tracks.map(({ type, ...t }) => t), true);
}
