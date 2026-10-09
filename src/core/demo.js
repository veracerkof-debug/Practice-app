// Демо-набор для проверки создателем (sandbox.js): живая на вид история занятий с января 2025 года, пять песен
// (народные — общественное достояние; аккорды подобраны примерно), табулатуры и ноты (public/demo/: ноты —
// Mutopia Project, общественное достояние; табулатуры набраны заново). Всё это — только на время проверки:
// выход кодом создателя или бета-тестера возвращает прежние данные, файлы демо удаляются.
// ПЕРЕД ВЫПУСКОМ — удалить вместе с sandbox.js (см. ROADMAP.md).
import { seal, EARLIEST } from './integrity.js';
import { uid } from './time.js';

export const DEMO_PREFIX = 'demo-';

/* ---------- песни ---------- */

const SONGS = [
  { title: 'Amazing Grace', artist: 'John Newton (1779)', genre: 'Госпел', key: 'G', difficulty: 2, masteryPct: 92, targetBpm: 80, currentBpm: 78,
    tab: 'amazing-grace.musicxml', since: 0.02, weight: 1.4,
    notes: `[Куплет 1]
G            G7        C       G
Amazing grace, how sweet the sound
G                    D
That saved a wretch like me
G           G7         C        G
I once was lost, but now am found
G        D        G
Was blind, but now I see

[Куплет 2]
G               G7          C         G
'Twas grace that taught my heart to fear
G                     D
And grace my fears relieved
G             G7        C        G
How precious did that grace appear
G           D           G
The hour I first believed` },
  { title: 'Greensleeves', artist: 'Народная (Англия, XVI век)', genre: 'Классика', key: 'Am', difficulty: 3, masteryPct: 74, targetBpm: 96, currentBpm: 84,
    tab: 'greensleeves.musicxml', pdf: 'greensleeves.pdf', since: 0.12, weight: 1.2,
    notes: `Am            C          G           Em
Alas, my love, you do me wrong
Am              F            E
To cast me off discourteously
Am            C            G          Em
For I have loved you well and long
Am           E          Am
Delighting in your company

[Припев]
C               G           Em
Greensleeves was all my joy
Am             F          E
Greensleeves was my delight
C              G              Em
Greensleeves was my heart of gold
Am           E            Am
And who but my lady Greensleeves` },
  { title: 'The House of the Rising Sun', artist: 'Народная (США)', genre: 'Блюз', key: 'Am', difficulty: 3, masteryPct: 81, targetBpm: 116, currentBpm: 108,
    tab: 'rising-sun.musicxml', since: 0.3, weight: 1,
    notes: `Am      C         D           F
There is a house in New Orleans
Am       C        E
They call the Rising Sun
Am        C        D          F
And it's been the ruin of many a poor boy
Am        E         Am
And God, I know I'm one` },
  { title: 'Scarborough Fair', artist: 'Народная баллада (Англия)', genre: 'Фолк', key: 'Dm', difficulty: 2, masteryPct: 58, targetBpm: 88, currentBpm: 70,
    tab: 'scarborough-fair.musicxml', since: 0.55, weight: 0.9,
    notes: `Dm          C        Dm
Are you going to Scarborough Fair?
F       Dm    G      Dm
Parsley, sage, rosemary and thyme
Dm              F           C
Remember me to one who lives there
Dm         C          Dm
She once was a true love of mine` },
  { title: 'Калинка', artist: 'И. Ларионов (1860)', genre: 'Фолк', key: 'Am', difficulty: 4, masteryPct: 33, targetBpm: 160, currentBpm: 118,
    since: 0.78, weight: 0.8,
    notes: `[Припев]
Am         E7
Калинка, калинка, калинка моя!
E7                Am
В саду ягода малинка, малинка моя!

Am                E7
Ах, под сосною, под зелёною
E7                Am
Спать положите вы меня!` },
];

// Ноты без песни (этюды и пьесы)
const PIECES = [
  { file: 'bach-menuet-g-tab.pdf', name: 'И. С. Бах — Менуэт соль мажор (ноты и табулатура).pdf' },
  { file: 'bach-prelude-bwv999.pdf', name: 'И. С. Бах — Прелюдия ре минор BWV 999.pdf' },
  { file: 'carcassi-etude-op60-3.pdf', name: 'М. Каркасси — Этюд op. 60 № 3.pdf' },
];

/* ---------- история занятий ---------- */

// Повторяемый случайный ряд: одна и та же история при каждой загрузке
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const DAY = 86400000;
const TOOLS = [['metro', 5], ['tuner', 3], ['piano', 2], ['theory', 2], ['drone', 1], ['glider', 1]];
const pick = (r, list) => { const tot = list.reduce((a, x) => a + x[1], 0); let v = r() * tot; for (const x of list) { v -= x[1]; if (v <= 0) return x[0]; } return list[0][0]; };

// Сессии с from по to (мс). songs — [{ id, since (доля пути, когда начали учить), weight, targetBpm, currentBpm }]
export function demoSessions(songs, from, to, seed = 7) {
  const r = rng(seed), out = [], span = to - from;
  // отпуска и болезни: несколько пауз по 5–16 дней
  // (не в последние три недели: на главной и в неделе должно быть видно живое занятие)
  const gaps = Array.from({ length: Math.max(2, Math.round(span / DAY / 120)) }, () => { const a = from + r() * Math.max(0, span - 40 * DAY); return [a, a + (5 + r() * 11) * DAY]; });
  for (let d = new Date(from); d.getTime() < to; d = new Date(d.getTime() + DAY)) {
    const day = d.getTime(), wd = d.getDay(), month = d.getMonth(), prog = (day - from) / span;
    if (gaps.some(([a, b]) => day >= a && day < b)) continue;
    // охотнее в выходные, меньше летом и в декабрьскую суету; со временем — регулярнее
    let p = [0.72, 0.5, 0.58, 0.52, 0.6, 0.45, 0.75][wd];
    if (month === 6 || month === 7) p *= 0.7;
    if (month === 11) p *= 0.8;
    p *= 0.75 + 0.35 * prog;
    if (to - day < 16 * DAY) p = Math.max(p, 0.85); // последние две недели — почти каждый день
    if (r() > p) continue;
    // одно-три занятия в день: вечер чаще всего, иногда утро и обед
    const n = r() < 0.18 ? 2 + (r() < 0.25 ? 1 : 0) : 1;
    let busyTill = 0;
    for (let k = 0; k < n; k++) {
      const hour = k === 0 ? pick(r, [[7, 2], [8, 2], [12, 1], [13, 1], [17, 2], [18, 3], [19, 5], [20, 6], [21, 4], [22, 2]]) : 21 + r() * 1.5;
      let start = day + hour * 3600000 + Math.floor(r() * 50) * 60000;
      if (start < busyTill) start = busyTill + 20 * 60000;
      // длина: обычно 20–60 минут, иногда долгие репетиции; растёт с опытом
      const mins = Math.max(6, Math.min(170, Math.round(Math.exp(Math.log(28 + 22 * prog) + (r() - 0.5) * 1.1) + (wd === 0 || wd === 6 ? r() * 30 : 0))));
      const dur = mins * 60, end = start + dur * 1000 + Math.floor(r() * 4) * 60000;
      if (end > to) continue;
      busyTill = end;
      const learning = songs.filter((s) => prog >= s.since);
      const kind = r();
      let rec;
      if (learning.length && kind < 0.55) {
        const s = pick(r, learning.map((x) => [x, x.weight * (prog - x.since < 0.15 ? 1.8 : 1)]));
        // темп растёт от 70 % целевого к нынешнему
        const k2 = Math.min(1, (prog - s.since) / Math.max(0.05, 1 - s.since)), bpm = Math.round(s.targetBpm * 0.7 + (s.currentBpm - s.targetBpm * 0.7) * k2 + (r() - 0.5) * 4);
        rec = { type: 'song', songId: s.id, tool: null, bpm };
      } else if (kind < 0.8) rec = { type: 'tool', songId: null, tool: pick(r, TOOLS), bpm: null };
      else rec = { type: 'free', songId: null, tool: null, bpm: null, tag: null };
      out.push(seal({ id: DEMO_PREFIX + uid(), ...rec, start, end, dur: rec.type === 'tool' ? Math.min(dur, 40 * 60) : dur, mode: r() < 0.15 ? 'strict' : 'normal', updatedAt: end }));
    }
  }
  return out;
}

/* ---------- загрузка ---------- */

// Добавить демо в данные приложения (store) и файлы (files). base — адрес папки demo/ рядом с приложением
export async function loadDemo(app, base = new URL('demo/', document.baseURI).href) {
  const store = app.store, st = store.state, now = Date.now();
  if (st.songs.some((s) => String(s.id).startsWith(DEMO_PREFIX))) return false; // уже загружено
  const L = st.settings.lib || {};
  const tag = (i) => (L.tags && L.tags[i] ? [L.tags[i].id] : []);
  const songs = SONGS.map((s, i) => ({
    id: DEMO_PREFIX + uid(), title: s.title, artist: s.artist, genre: s.genre, cat: L.cats && L.cats[i % 3] ? L.cats[i % 3].id : null, tags: tag(i % 5),
    difficulty: s.difficulty, masteryPct: s.masteryPct, mastery: Math.max(1, Math.round(s.masteryPct / 20)),
    targetBpm: s.targetBpm, currentBpm: s.currentBpm, notes: s.notes, key: s.key, createdAt: now, updatedAt: now,
    _src: s,
  }));
  const from = Math.max(EARLIEST + DAY, new Date(2025, 0, 3).getTime());
  const sess = demoSessions(songs.map((s) => ({ id: s.id, since: s._src.since, weight: s._src.weight, targetBpm: s.targetBpm, currentBpm: s.currentBpm })), from, now - 3600000);
  songs.forEach((s) => { s.createdAt = from + s._src.since * (now - from); delete s._src; });
  st.songs.push(...songs);
  st.sessions.push(...sess);
  store.save();
  // файлы: табулатуры и ноты к песням, отдельные пьесы
  const add = async (file, name, songIds) => {
    try {
      const res = await fetch(base + file);
      if (!res.ok) return;
      const blob = await res.blob(), pdf = file.endsWith('.pdf');
      await app.files.add({ id: DEMO_PREFIX + uid(), name, size: blob.size, type: pdf ? 'application/pdf' : 'application/vnd.recordare.musicxml+xml', songs: songIds, created: now, blob, kind: 'tab' });
    } catch { /* без сети к своим же файлам — просто без них */ }
  };
  for (let i = 0; i < SONGS.length; i++) {
    const s = SONGS[i];
    if (s.tab) await add(s.tab, s.title + ' — табулатура.musicxml', [songs[i].id]);
    if (s.pdf) await add(s.pdf, s.title + ' — ноты.pdf', [songs[i].id]);
  }
  for (const p of PIECES) await add(p.file, p.name, []);
  return true;
}

// Убрать файлы демо (данные возвращает копия, sandbox.js)
export async function removeDemoFiles(app) {
  const ids = [];
  ['tab', 'audio'].forEach((k) => app.files.list(k).forEach((r) => { if (String(r.id).startsWith(DEMO_PREFIX)) ids.push(r.id); }));
  for (const id of ids) await app.files.remove(id);
}
