// Holyrics по Wi-Fi (API Server программы Holyrics: Файл → Настройки → API Server). Только по нажатию кнопки и только
// к адресу, который вписал человек (компьютер с Holyrics в той же сети). Запрос: POST http://IP:порт/api/GetSongs?token=…
// с JSON — в ответе песни с текстом по слайдам, тональностью, темпом и размером.
// На Android — нативный HTTP Capacitor: страница приложения открыта по https, а Holyrics в сети — по http
// (WebView такой запрос не пропустит); в браузере — обычный fetch (сработает, только если страница сама по http).
import { Capacitor, CapacitorHttp } from '@capacitor/core';

export const FIELDS = 'id,title,artist,author,key,bpm,time_sig,slides,archived';

// Адрес «192.168.1.5:8091» или «http://…» → { base }; ошибка — null. Частые опечатки с телефона исправляются:
// запятые вместо точек («192,168,1,5»), пробелы, вставленный путь «/api/…»
export function apiBase(addr, port) {
  let s = String(addr || '').trim().replace(/\s+/g, '').replace(/,/g, '.').replace(/\/api\/.*$/i, '').replace(/\/+$/, '');
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = 'http://' + s;
  const p = String(port || '').replace(/\D/g, '');
  try {
    const u = new URL(s);
    if (p && !u.port) u.port = p;
    return u.origin;
  } catch { return null; }
}

// Песня Holyrics → песня приложения: слайды по порядку, описание слайда («Verse 1») — заголовком части
export function toSong(h) {
  const parts = [];
  (h.slides || []).forEach((sl) => {
    const text = String(sl.text || '').replace(/\r\n?/g, '\n').trim();
    if (!text) return;
    const name = String(sl.slide_description || '').trim();
    const last = parts.at(-1);
    if (last && (!name || name === last.name)) last.text += '\n\n' + text;
    else parts.push({ name, text });
  });
  return {
    title: String(h.title || '').trim(), artist: String(h.artist || h.author || '').trim(),
    key: h.key || null, bpm: h.bpm ? Math.round(+h.bpm) || null : null, time: h.time_sig || null,
    notes: parts.map((p) => (p.name ? p.name + '\n' : '') + p.text).join('\n\n'),
  };
}

// Ответ — текстом и разбирается здесь: Holyrics отвечает то JSON, то текстом (а при ошибке сервера — страницей)
async function post(url, data) {
  if (Capacitor.isNativePlatform()) {
    const r = await CapacitorHttp.request({ method: 'POST', url, headers: { 'Content-Type': 'application/json' }, data, responseType: 'text', connectTimeout: 8000, readTimeout: 60000 });
    return { status: r.status, body: parse(r.data) };
  }
  const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 30000);
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), signal: ctl.signal });
    return { status: r.status, body: parse(await r.text()) };
  } finally { clearTimeout(tm); }
}
function parse(x) {
  if (x && typeof x === 'object') return x;
  try { return JSON.parse(String(x || '').replace(/^\uFEFF/, '') || '{}'); } catch { return { raw: String(x || '').slice(0, 120) }; }
}
// Текст ошибки Holyrics: { error: 'invalid token' } или { error: { code, key, message } }
const errText = (b) => { const e = b && b.error; return !e ? '' : typeof e === 'string' ? e : [e.key, e.message].filter(Boolean).join(': '); };

// Вызов действия API Server. Ошибки — с причиной (reason) и подробностью (detail) для окна и журнала:
// 'addr' — адрес не разобран; 'net' — нет соединения (detail — текст системы); 'token' — токен не принят;
// 'perm' — у токена нет права на это действие; 'old' — действия нет (старая версия или не тот порт); 'answer' — ответ непонятен
export async function holyricsCall({ addr, port, token }, action, data = {}) {
  const base = apiBase(addr, port);
  if (!base) throw Object.assign(new Error('addr'), { reason: 'addr', detail: String(addr || '') });
  let r;
  try { r = await post(base + '/api/' + action + '?token=' + encodeURIComponent(String(token || '').trim()), data); }
  catch (e) { throw Object.assign(new Error('net'), { reason: 'net', detail: String((e && e.message) || e).slice(0, 200), base }); }
  const b = r.body || {}, et = errText(b), detail = 'HTTP ' + r.status + (et ? ' · ' + et : b.raw ? ' · ' + b.raw : '');
  if (b.status === 'ok') return b;
  if (/permission|not allowed|forbidden/i.test(et)) throw Object.assign(new Error('perm'), { reason: 'perm', detail, base });
  if (r.status === 401 || r.status === 403 || /token|api.?key|unauthori/i.test(et)) throw Object.assign(new Error('token'), { reason: 'token', detail, base });
  if (r.status === 404 || /action|not found|unknown/i.test(et)) throw Object.assign(new Error('old'), { reason: 'old', detail, base });
  throw Object.assign(new Error('answer'), { reason: 'answer', detail, base });
}

// Проверка: есть ли связь, принят ли токен, какая версия и какие права (GetTokenInfo — с 2.25; в старых — пропуск)
export async function holyricsCheck(cfg) {
  try {
    const b = await holyricsCall(cfg, 'GetTokenInfo');
    const d = b.data || {}, perms = String(d.permissions || '').split(',').map((x) => x.trim()).filter(Boolean);
    return { version: d.version || '', perms, songs: !perms.length || perms.includes('GetSongs') };
  } catch (e) {
    if (e.reason === 'old') return { version: '', perms: [], songs: true }; // GetTokenInfo нет — проверим уже песнями
    throw e;
  }
}

// Все песни Holyrics (без архивных)
export async function holyricsSongs(cfg) {
  const b = await holyricsCall(cfg, 'GetSongs', { fields: FIELDS });
  if (!Array.isArray(b.data)) throw Object.assign(new Error('answer'), { reason: 'answer', detail: 'нет списка песен' });
  return b.data.filter((h) => !h.archived).map(toSong).filter((s) => s.title);
}
