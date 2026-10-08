// Holyrics по Wi-Fi (API Server программы Holyrics: Файл → Настройки → API Server). Только по нажатию кнопки и только
// к адресу, который вписал человек (компьютер с Holyrics в той же сети). Запрос: POST http://IP:порт/api/GetSongs?token=…
// с JSON — в ответе песни с текстом по слайдам, тональностью, темпом и размером.
// На Android — нативный HTTP Capacitor: страница приложения открыта по https, а Holyrics в сети — по http
// (WebView такой запрос не пропустит); в браузере — обычный fetch (сработает, только если страница сама по http).
import { Capacitor, CapacitorHttp } from '@capacitor/core';

export const FIELDS = 'id,title,artist,author,key,bpm,time_sig,slides,archived';

// Адрес «192.168.1.5:8091» или «http://…» → { base }; ошибка — null
export function apiBase(addr, port) {
  let s = String(addr || '').trim().replace(/\/+$/, '');
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = 'http://' + s;
  try {
    const u = new URL(s);
    if (port && !u.port) u.port = String(port);
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

async function post(url, data) {
  if (Capacitor.isNativePlatform()) {
    const r = await CapacitorHttp.request({ method: 'POST', url, headers: { 'Content-Type': 'application/json' }, data, connectTimeout: 6000, readTimeout: 30000 });
    return { status: r.status, body: typeof r.data === 'string' ? JSON.parse(r.data || '{}') : r.data };
  }
  const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 30000);
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), signal: ctl.signal });
    return { status: r.status, body: await r.json() };
  } finally { clearTimeout(tm); }
}

// Все песни Holyrics (без архивных). Ошибки — словами: 'addr' | 'token' | 'net' | 'answer'
export async function holyricsSongs({ addr, port, token }) {
  const base = apiBase(addr, port);
  if (!base) throw Object.assign(new Error('addr'), { reason: 'addr' });
  let r;
  try { r = await post(base + '/api/GetSongs?token=' + encodeURIComponent(String(token || '').trim()), { fields: FIELDS }); }
  catch (e) { throw Object.assign(new Error(String((e && e.message) || e)), { reason: 'net' }); }
  const b = r.body || {};
  if (r.status === 401 || /token/i.test(String(b.error || ''))) throw Object.assign(new Error(String(b.error || r.status)), { reason: 'token' });
  if (b.status !== 'ok' || !Array.isArray(b.data)) throw Object.assign(new Error(String(b.error || r.status)), { reason: 'answer' });
  return b.data.filter((h) => !h.archived).map(toSong).filter((s) => s.title);
}
