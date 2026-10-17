// Демо-набор: показать, как устроено приложение, пока своего ещё нет. Пять песен (народные и духовная — духовная только
// в церковном режиме;
// общественное достояние; аккорды подобраны примерно) с аккордами и словами, табулатуры и ноты (public/demo/: ноты —
// Mutopia Project, общественное достояние; табулатуры набраны заново), две записи в медиатеке (demoaudio.js)
// и события календаря. Добавляется и убирается одной кнопкой («Данные и копии»); у всех записей — приставка DEMO_PREFIX.
// Занятий набор не добавляет: время и статистика — только настоящие (история занятий для проверки — demostats.js).
import { uid, dayStart, DAY } from './time.js';
import { deleteSong } from './library.js';
import { newEvent } from './calendar.js';
import { demoTracks } from './demoaudio.js';

export const DEMO_PREFIX = 'demo-';
export const isDemo = (id) => String(id || '').startsWith(DEMO_PREFIX);
export const hasDemo = (state) => !!(state.songs || []).some((s) => isDemo(s.id) && !s.deleted) || !!(state.events || []).some((e) => isDemo(e.id) && !e.deleted);

/* ---------- песни ---------- */

// Песни набора: духовные (church: true) — только в церковном режиме; без него приложение светское
export const demoSongs = (church) => DEMO_SONGS.filter((s) => church || !s.church);

// since и weight — только для истории занятий при проверке (demostats.js): когда песню начали учить и как часто играют
export const DEMO_SONGS = [
  { title: 'Amazing Grace', church: true, by: 'newton', genre: 'gospel', key: 'G', difficulty: 2, masteryPct: 92, targetBpm: 80, currentBpm: 78,
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
  { title: 'Greensleeves', by: 'england16', genre: 'classic', key: 'Am', difficulty: 3, masteryPct: 74, targetBpm: 96, currentBpm: 84,
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
  { title: 'The House of the Rising Sun', by: 'usa', genre: 'blues', key: 'Am', difficulty: 3, masteryPct: 81, targetBpm: 116, currentBpm: 108,
    tab: 'rising-sun.musicxml', since: 0.3, weight: 1,
    notes: `Am      C         D           F
There is a house in New Orleans
Am       C        E
They call the Rising Sun
Am        C        D          F
And it's been the ruin of many a poor boy
Am        E         Am
And God, I know I'm one` },
  { title: 'Scarborough Fair', by: 'ballad', genre: 'folk', key: 'Dm', difficulty: 2, masteryPct: 58, targetBpm: 88, currentBpm: 70,
    tab: 'scarborough-fair.musicxml', since: 0.55, weight: 0.9,
    notes: `Dm          C        Dm
Are you going to Scarborough Fair?
F       Dm    G      Dm
Parsley, sage, rosemary and thyme
Dm              F           C
Remember me to one who lives there
Dm         C          Dm
She once was a true love of mine` },
  { title: 'Калинка', by: 'larionov', genre: 'folk', key: 'Am', difficulty: 4, masteryPct: 33, targetBpm: 160, currentBpm: 118,
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
  { file: 'bach-menuet-g-tab.pdf', key: 'menuet' },
  { file: 'bach-prelude-bwv999.pdf', key: 'prelude' },
  { file: 'carcassi-etude-op60-3.pdf', key: 'carcassi' },
];

/* ---------- календарь ---------- */

// События вокруг сегодняшнего дня: урок и репетиция каждую неделю, запись, концерт, срок и цель по песням
function demoEvents(t, songs, now) {
  const day = (d, h, m = 0) => dayStart(now + d * DAY) + (h * 60 + m) * 60000;
  const nextWd = (wd) => { const d = new Date(now).getDay(); return ((wd - d + 7) % 7) || 7; };
  const id = () => DEMO_PREFIX + uid();
  const ev = (d, h, len, patch) => newEvent(now + d * DAY, now, { id: id(), start: day(d, h), end: day(d, h) + len * 3600000, ...patch });
  const allDay = (d, patch) => newEvent(now + d * DAY, now, { id: id(), allDay: true, start: day(d, 0), end: day(d, 0) + DAY, ...patch });
  const S = (i) => songs[Math.min(i, songs.length - 1)].id;
  return [
    ev(nextWd(2) - 7, 18, 1, { kind: 'lesson', title: t('demo.ev.lesson'), place: t('demo.ev.lessonPlace'), repeat: 'weekly', songs: [S(1)] }),
    ev(nextWd(6) - 7, 12, 2, { kind: 'rehearsal', title: t('demo.ev.rehearsal'), place: t('demo.ev.rehearsalPlace'), repeat: 'weekly', songs: [S(1), S(2), S(3)] }),
    ev(9, 15, 2, { kind: 'recording', title: t('demo.ev.recording'), songs: [S(0)], note: t('demo.ev.recordingNote') }),
    ev(18, 19, 2, { kind: 'concert', title: t('demo.ev.concert'), place: t('demo.ev.concertPlace'), songs: [S(0), S(1), S(2)], note: t('demo.ev.concertNote') }),
    allDay(12, { kind: 'deadline', title: t('demo.ev.deadline', { song: songs[1].title, bpm: songs[1].targetBpm }), songs: [S(1)] }),
    allDay(30, { kind: 'goal', title: t('demo.ev.goal', { song: songs.at(-1).title }), songs: [S(songs.length - 1)] }),
  ].map((e) => ({ ...e, updatedAt: now }));
}

/* ---------- добавить и убрать ---------- */

// Добавить демо-набор. t — переводы ядра (названия жанров, авторов, файлов и событий — на языке человека);
// base — адрес папки demo/ рядом с приложением. → новые песни (или null, если набор уже есть)
export async function addDemo(app, t, base = new URL('demo/', document.baseURI).href) {
  const store = app.store, st = store.state, now = Date.now();
  if (hasDemo(st)) return null;
  const L = st.settings.lib || {};
  const tag = (i) => (L.tags && L.tags[i] ? [L.tags[i].id] : []);
  const church = !!st.settings.church, list = demoSongs(church);
  const songs = list.map((s, i) => ({
    id: DEMO_PREFIX + uid(), title: s.title, artist: t('demo.by.' + s.by), genre: t('demo.genre.' + s.genre), cat: L.cats && L.cats[i % 3] ? L.cats[i % 3].id : null, tags: tag(i % 5),
    difficulty: s.difficulty, masteryPct: s.masteryPct, mastery: Math.max(1, Math.round(s.masteryPct / 20)),
    targetBpm: s.targetBpm, currentBpm: s.currentBpm, notes: s.notes, key: s.key, createdAt: now - (list.length - i) * 60000, updatedAt: now,
  }));
  st.songs.push(...songs);
  (st.events || (st.events = [])).push(...demoEvents(t, songs, now));
  st.settings.demo = true;
  store.save();
  if (store.settingsChanged) store.settingsChanged();
  // файлы: табулатуры и ноты к песням, отдельные пьесы, записи к «Amazing Grace»
  const add = async (rec) => { try { await app.files.add({ id: DEMO_PREFIX + uid(), created: now, ...rec }); } catch { /* без места — без файла */ } };
  const fetchAdd = async (file, name, songIds) => {
    try {
      const res = await fetch(base + file);
      if (!res.ok) return;
      const blob = await res.blob(), pdf = file.endsWith('.pdf');
      await add({ name, size: blob.size, type: pdf ? 'application/pdf' : 'application/vnd.recordare.musicxml+xml', songs: songIds, blob, kind: 'tab' });
    } catch { /* без своих файлов — просто без них */ }
  };
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    if (s.tab) await fetchAdd(s.tab, s.title + ' — ' + t('demo.file.tab') + '.musicxml', [songs[i].id]);
    if (s.pdf) await fetchAdd(s.pdf, s.title + ' — ' + t('demo.file.score') + '.pdf', [songs[i].id]);
  }
  for (const p of PIECES) await fetchAdd(p.file, t('demo.piece.' + p.key) + '.pdf', []);
  // записи — к первой песне набора: «Amazing Grace» в церковном режиме, иначе «Greensleeves»
  const first = list[0], mel = first.title === 'Amazing Grace' ? 'grace' : 'green';
  for (const tr of await demoTracks(mel)) await add({ name: first.title + ' — ' + t('demo.track.' + tr.key) + '.wav', size: tr.blob.size, type: 'audio/wav', songs: [songs[0].id], blob: tr.blob, kind: 'audio', dur: tr.dur });
  return songs;
}

// Убрать файлы демо-набора (записи, табулатуры, ноты) — и их копии в папке Melete
export async function removeDemoFiles(app) {
  const ids = [];
  ['tab', 'audio'].forEach((k) => app.files.list(k).forEach((r) => { if (isDemo(r.id)) ids.push(r.id); }));
  for (const id of ids) await app.files.remove(id);
  if (app.folder && app.folder.drop) await app.folder.drop({ files: ids });
}

// Остались ли следы демо-набора: песни (и удалённые, но не стёртые), события, файлы
export const demoLeft = (app) => !!((app.store.state.songs || []).some((s) => isDemo(s.id)) || (app.store.state.events || []).some((e) => isDemo(e.id)) ||
  (app.files && ['tab', 'audio'].some((k) => app.files.list(k).some((r) => isDemo(r.id)))));

// Убрать демо-набор целиком: песни стираются совсем (с ними — их тексты в папке), события и файлы — тоже.
// Песня, по которой уже были занятия, только помечается удалённой: время занятий остаётся в статистике
export async function removeDemo(app) {
  const store = app.store, st = store.state, played = new Set((st.sessions || []).map((x) => x.songId).filter(Boolean));
  const ids = st.songs.filter((s) => isDemo(s.id)).map((s) => s.id);
  ids.filter((id) => played.has(id)).forEach((id) => deleteSong(store, id));
  st.songs = st.songs.filter((s) => !isDemo(s.id) || played.has(s.id));
  st.events = (st.events || []).filter((e) => !isDemo(e.id));
  st.settings.demo = false;
  store.save();
  if (store.settingsChanged) store.settingsChanged();
  await removeDemoFiles(app);
  if (app.folder && app.folder.drop) await app.folder.drop({ songs: ids });
}
