// Сет-лист и сцена: логика без DOM. Сет-лист — событие календаря с песнями (ev.songs — порядок), у каждого пункта
// свои настройки (ev.stage[songId]): темп и клик, отсчёт такта перед минусовкой, пэд в тональности песни,
// минусовка (запись песни), сдвиг тональности, текст с аккордами. Чего человек не задал — берётся из песни:
// темп — целевой (или из настроек метронома песни), пэд — если тональность известна, минусовка — первая запись песни.
import { chordsIn, degreesIn } from '../music/lyrics.js';
import { tonicIsMinor } from '../music/degrees.js';
import { detectKey, parseNote, shiftKey } from '../music/transpose.js';
import { fileSongs } from './files.js';

// Тональность песни { pc, minor, sharp } — указанная, по аккордам текста или по ступеням; null — неизвестна
export function songKey(song) {
  if (!song) return null;
  const k = song.key && parseNote(song.key);
  if (k) return { pc: k.pc, minor: /m$/.test(song.key), sharp: k.acc > 0 ? true : k.acc < 0 ? false : null, given: true };
  const det = song.notes ? detectKey(chordsIn(song.notes)) : null;
  if (det) return det;
  const d = song.notes ? degreesIn(song.notes) : [];
  return d.length ? (tonicIsMinor(d) ? { pc: 9, minor: true, sharp: null, assumed: true } : { pc: 0, minor: false, sharp: null, assumed: true }) : null;
}

const clampBpm = (v) => Math.max(20, Math.min(300, Math.round(+v || 0)));
export const TR_MAX = 6;
// Капо: аккорды показываются формами на capo ладов ниже, звучит та же тональность (у песни — song.capo, в сет-листе — своё)
export const CAPO_MAX = 7;
export const capoClamp = (v) => Math.max(0, Math.min(CAPO_MAX, Math.round(+v || 0)));

// Записи песни, подходящие для минусовки (аудио)
export const tracksOf = (files, songId) => (files || []).filter((r) => (!r.kind || r.kind === 'audio') && fileSongs(r).includes(songId));

// Пункт сет-листа с настройками по умолчанию. files — аудиозаписи (app.files.list('audio'))
export function itemOf(ev, song, files = []) {
  const o = ((ev && ev.stage) || {})[song.id] || {}, key = songKey(song);
  const bpm0 = +song.targetBpm || (song.metro && +song.metro.bpm) || +song.currentBpm || 0;
  const tracks = tracksOf(files, song.id), track = o.track === '' ? '' : o.track && tracks.some((r) => r.id === o.track) ? o.track : tracks[0] ? tracks[0].id : '';
  const tr = Math.max(-TR_MAX, Math.min(TR_MAX, Math.round(+o.tr || 0)));
  return {
    songId: song.id,
    bpm: o.bpm ? clampBpm(o.bpm) : bpm0 ? clampBpm(bpm0) : 0,
    click: o.click != null ? !!o.click : !!bpm0 && !track, // с минусовкой клик по умолчанию не нужен
    count: o.count != null ? !!o.count : !!track && !!bpm0, // отсчёт такта перед минусовкой
    pad: o.pad != null ? !!o.pad && !!key : !!key && !track,
    track,
    tr,
    capo: o.capo != null ? capoClamp(o.capo) : capoClamp(song.capo),
    text: o.text != null ? !!o.text : !!song.notes,
    key: key ? shiftKey(key, tr) : null,
    srcKey: key,
  };
}

// Изменить настройки пункта (только заданные поля)
export function setItem(ev, songId, patch) {
  const all = (ev.stage ||= {}), cur = { ...(all[songId] || {}) };
  Object.entries(patch).forEach(([k, v]) => { if (v == null) delete cur[k]; else cur[k] = v; });
  if (cur.bpm != null) cur.bpm = clampBpm(cur.bpm);
  if (cur.tr != null) cur.tr = Math.max(-TR_MAX, Math.min(TR_MAX, Math.round(cur.tr)));
  if (cur.capo != null) cur.capo = capoClamp(cur.capo);
  all[songId] = cur;
  return ev;
}

// Переставить песню: i — откуда, d — на сколько (−1 вверх, +1 вниз)
export function moveSong(ev, i, d) {
  const L = ev.songs || [], j = i + d;
  if (i < 0 || i >= L.length || j < 0 || j >= L.length) return ev;
  [L[i], L[j]] = [L[j], L[i]];
  return ev;
}

// Песни сет-листа, которые ещё есть в библиотеке (по порядку)
export const setSongs = (ev, songById) => (ev.songs || []).map((id) => songById(id)).filter(Boolean);

// Длина такта в секундах (отсчёт перед минусовкой)
export const barSec = (bpm, num = 4) => (bpm > 0 ? (60 / bpm) * Math.max(1, num) : 0);

// Последнее место на сцене (sessionStorage): продолжить после сбоя или перезапуска, если прошло не больше 6 часов
export const RESUME_MS = 6 * 3600000;
export const resumeOk = (r, now = Date.now()) => !!r && typeof r.ev === 'string' && Number.isInteger(r.i) && r.i >= 0 && now - (+r.at || 0) < RESUME_MS;

// Аккорды над словами: строка «[G]О Господь мой [C]Бог» → строка аккордов и строка текста (моноширинный шрифт —
// аккорд стоит над своим слогом). Строки без квадратных скобок — как есть
export function chordsAbove(txt) {
  return String(txt || '').split('\n').map((line) => {
    if (!/\[[^\]]+\]/.test(line)) return line;
    let ch = '', tx = '';
    line.split(/(\[[^\]]+\])/).forEach((part) => {
      const m = /^\[([^\]]+)\]$/.exec(part);
      if (m) {
        if (ch.length > tx.length) tx += ' '.repeat(ch.length - tx.length); // два аккорда подряд — не слипаются
        ch += ' '.repeat(Math.max(0, tx.length - ch.length)) + m[1] + ' ';
      } else tx += part;
    });
    return ch.trimEnd() + '\n' + tx;
  }).join('\n');
}
