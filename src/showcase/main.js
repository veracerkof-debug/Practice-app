// Демонстрация Melete (отдельная веб-сборка, режим showcase): без регистрации, с выдуманным музыкантом — его песнями,
// табами, нотами, записями, видео, календарём и историей занятий почти за два года, — чтобы посмотреть, как приложение
// выглядит в работе. В APK и в обычную веб-версию не попадает (vite.config.js, .github/workflows/web.yml), данные —
// отдельно от настоящих (ns.js), всё помечено как демонстрация. Решение автора — DECISIONS.md, 2026-10.
import './ns.js';
import '../styles/tokens.css';
import '../styles/base.css';
import '../ui/session.css';
import { boot } from '../core/index.js';
import '../styles/motion.css';
import '../styles/mono.css';
import { TOS_VER } from '../core/legal.js';
import { profileSeal, seal, EARLIEST } from '../core/integrity.js';
import { uid } from '../core/time.js';
import { DEMO_PREFIX, DEMO_SONGS, isDemo, addDemo } from '../core/demo.js';
import { t } from '../i18n/index.js';
import { toast } from '../ui/index.js';

const LS = 'practice.v1', DONE = 'showcase.seeded.v1';
const lang = (() => { const l = (navigator.language || 'ru').slice(0, 2); return l === 'uz' ? 'uz' : l === 'en' ? 'en' : 'ru'; })();
const NAME = { ru: 'Анна', en: 'Anna', uz: 'Anna' };

// До запуска: музыкант уже «зарегистрирован» — сразу главный экран, без вопросов
function preseed() {
  if (localStorage.getItem(LS)) return;
  const createdAt = new Date(2025, 0, 2).getTime();
  const profile = { name: NAME[lang], instruments: ['guitar', 'vocal'], level: 'amateur', priorHours: 420, createdAt };
  profile.sig = profileSeal(profile);
  localStorage.setItem(LS, JSON.stringify({ version: 1, songs: [], sessions: [], updatedAt: 0, settings: { configured: true, tosOk: TOS_VER, lang, webHello: true, upOk: 1, profile, goalMin: 300, showcase: true } }));
}

/* ---------- история занятий (выдуманная, но живая на вид) ---------- */

// Повторяемый случайный ряд: одна и та же история при каждой загрузке
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const DAY = 86400000;
const TOOLS = [['metro', 5], ['tuner', 3], ['piano', 2], ['theory', 2], ['drone', 1], ['glider', 1]];
const pick = (r, list) => { const tot = list.reduce((a, x) => a + x[1], 0); let v = r() * tot; for (const x of list) { v -= x[1]; if (v <= 0) return x[0]; } return list[0][0]; };

// Сессии с from по to (мс). songs — [{ id, since (доля пути, когда начали учить), weight, targetBpm, currentBpm }]
function demoSessions(songs, from, to, seed = 7) {
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

// Видео к «Amazing Grace»: астронавт NASA Челл Линдгрен играет её на волынке на борту МКС (NASA, общественное достояние)
// и звук из него отдельной записью. Файлы — только в этой сборке (media/)
const MEDIA = [
  { file: 'media/amazing-grace-iss.mp4', type: 'video/mp4', video: true, name: { ru: 'Amazing Grace — волынка на МКС (NASA)', en: 'Amazing Grace — bagpipes on the ISS (NASA)', uz: 'Amazing Grace — XKSdagi volinka (NASA)' } },
  { file: 'media/amazing-grace-iss.m4a', type: 'audio/mp4', video: false, name: { ru: 'Amazing Grace — волынка, звук', en: 'Amazing Grace — bagpipes, audio', uz: 'Amazing Grace — volinka, tovush' } },
];

// Длительность файла (для подписи в медиатеке); не узнать за 4 с — без неё
function durationOf(blob, video) {
  return new Promise((res) => {
    const el = document.createElement(video ? 'video' : 'audio'), url = URL.createObjectURL(blob);
    const done = (d) => { URL.revokeObjectURL(url); res(Number.isFinite(d) && d > 0 ? d : 0); };
    el.preload = 'metadata';
    el.onloadedmetadata = () => done(el.duration);
    el.onerror = () => done(0);
    setTimeout(() => done(0), 4000);
    el.src = url;
  });
}

async function seed(app) {
  const store = app.store, st = store.state, now = Date.now();
  await addDemo(app, t);
  const songs = st.songs.filter((s) => isDemo(s.id) && !s.deleted);
  const from = Math.max(EARLIEST + DAY, new Date(2025, 0, 3).getTime());
  if (songs.length && !st.sessions.some((x) => isDemo(x.id))) {
    st.sessions.push(...demoSessions(songs.map((s, i) => ({ id: s.id, since: (DEMO_SONGS[i] || {}).since ?? 0.5, weight: (DEMO_SONGS[i] || {}).weight ?? 1, targetBpm: s.targetBpm, currentBpm: s.currentBpm })), from, now - 3600000));
    songs.forEach((s, i) => { s.createdAt = from + ((DEMO_SONGS[i] || {}).since ?? 0.5) * (now - from); });
  }
  const grace = songs.find((s) => s.title === 'Amazing Grace');
  for (const m of MEDIA) {
    try {
      const res = await fetch(new URL(m.file, document.baseURI));
      if (!res.ok) continue;
      const blob = await res.blob(), dur = await durationOf(blob, m.video);
      await app.files.add({ id: DEMO_PREFIX + uid(), kind: 'audio', name: m.name[lang], size: blob.size, type: m.type, video: m.video, songs: grace ? [grace.id] : [], created: now, blob, ...(dur ? { dur } : {}) });
    } catch { /* без файла — просто без него */ }
  }
  store.save();
  if (store.settingsChanged) store.settingsChanged();
}

preseed();
const app = boot(document.getElementById('app'));
if (!localStorage.getItem(DONE)) {
  // первый заход: песни, файлы и история — один раз, затем перезапуск с готовыми данными
  seed(app).finally(() => { localStorage.setItem(DONE, '1'); location.reload(); });
} else setTimeout(() => toast(t('show.hello')), 1200);
