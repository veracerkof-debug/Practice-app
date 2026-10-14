// Обмен с командой: «Отправить» (песни, их табы и ноты, по желанию записи; сет-лист репетиции) и «Принять» файл .melete.
// Логика и формат — src/core/share.js; отправка — системное «Поделиться» (Android) или «Поделиться»/сохранение (веб).
import { Capacitor, registerPlugin } from '@capacitor/core';
import { t, tn, getLang } from '../../i18n/index.js';
import { esc, sheet, snav, toast, seg } from '../../ui/index.js';
import { emptySong } from '../library.js';
import { log, logErr } from '../log.js';
import { weekdays } from './common.js';
import { coreHelp } from '../help.js';

const Share = Capacitor.isNativePlatform() ? registerPlugin('Share') : null;
export const SHARE_IC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V4M8 7.5 12 3.5l4 4M6 11H5v9h14v-9h-1"/></svg>';

const mb = (n) => (n < 1048576 ? Math.max(1, Math.round(n / 1024)) + ' KB' : (n / 1048576).toFixed(1) + ' MB');
const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s) => { const b = atob(s), u8 = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u8[i] = b.charCodeAt(i); return u8; };
const when = (ts) => new Date(ts).toLocaleString(getLang() === 'uz' ? 'uz-Latn' : getLang(), { weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
const chk = (attrs, on) => '<input type="checkbox" ' + attrs + (on ? ' checked' : '') + ' style="width:22px;height:22px;margin-right:12px;flex:none">';

// Отправить готовый файл: Android — выбор приложения; веб — «Поделиться» браузера или сохранение
async function sendFile(u8, name, title, type = 'application/octet-stream') {
  if (Share) { await Share.send({ name, data: b64(u8), title, text: title, mime: type }); return 'shared'; }
  const file = new File([u8], name, { type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title }); return 'shared'; } catch (e) { if (e && e.name === 'AbortError') return 'cancel'; }
  }
  const url = URL.createObjectURL(file), a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'saved';
}

// Шторка «Отправить команде». songIds — отмеченные сразу; ev — событие календаря (сет-лист) или null;
// all — показать все песни для выбора (из списка песен)
export function shareSheet(app, { songIds = [], ev = null, all = false } = {}) {
  const S = () => app.store.songs();
  const order = ev ? (ev.songs || []) : songIds;
  const list = (all ? [...order.map((id) => app.store.songById(id)).filter(Boolean), ...S().filter((s) => !order.includes(s.id)).sort((a, b) => a.title.localeCompare(b.title))] : order.map((id) => app.store.songById(id)).filter(Boolean));
  const on = new Set(order.filter((id) => app.store.songById(id)));
  const o = { tabs: true, audio: false, set: !!ev };
  coreHelp(app, 'share');
  let busy = false;
  const fl = async () => (await import('../share.js')).filesFor(app.files ? [...app.files.list('tab'), ...app.files.list('audio')] : [], [...on], o);
  let size = 0;
  const upd = () => fl().then((f) => { size = f.reduce((x, r) => x + (r.size || (r.blob && r.blob.size) || 0), 0); const z = api.el.querySelector('[data-shsize]'); if (z) z.textContent = sizeTxt(f.length); });
  const sizeTxt = (n) => (n ? tn('share.files', n) + ' · ' + mb(size) : t('share.noFiles'));
  const api = sheet(() => snav(t('share.title'), { left: '<button class="link l" data-close>' + t('ui.cancel') + '</button>', right: '<button class="link b r" data-sh="go"' + (on.size ? '' : ' disabled') + '>' + t('share.send') + '</button>' }) +
    (ev ? '<div class="hdr">' + t('share.setlist') + '</div><div class="group"><label class="cell">' + chk('data-sho="set"', o.set) + '<span class="grow"><span>' + esc(ev.title || t('cal.kind.rehearsal')) + '</span><span class="st l2" style="display:block;font-size:12.5px">' + esc(when(ev.start) + (ev.place ? ' · ' + ev.place : '')) + '</span></span></label></div>' : '') +
    '<div class="hdr">' + tn('share.songs', on.size) + (all && list.length > 1 ? ' · <button class="link" data-sh="allsel" style="min-height:0;font-size:inherit">' + t(on.size === list.length ? 'share.none' : 'share.all') + '</button>' : '') + '</div>' +
    (list.length ? '<div class="group">' + list.map((s, i) => '<label class="cell">' + chk('data-shs="' + s.id + '"', on.has(s.id)) + '<span class="grow"><span>' + (ev ? (i + 1) + '. ' : '') + esc(s.title) + '</span><span class="st l2" style="display:block;font-size:12.5px">' +
      esc([s.artist, s.key, s.targetBpm ? s.targetBpm + ' BPM' : '', s.notes ? t('share.hasText') : ''].filter(Boolean).join(' · ')) + '</span></span></label>').join('') + '</div>' : '<p class="ftr">' + t('share.empty') + '</p>') +
    '<div class="hdr">' + t('share.with') + '</div><div class="group"><label class="cell">' + chk('data-sho="tabs"', o.tabs) + '<span class="grow">' + t('share.tabs') + '</span></label>' +
    '<label class="cell">' + chk('data-sho="audio"', o.audio) + '<span class="grow">' + t('share.audio') + '</span></label>' +
    '<div class="cell"><span class="grow l2" data-shsize>…</span></div></div>' +
    '<p class="ftr">' + t('share.hint') + '</p>', (el) => {
    el.addEventListener('change', (e) => {
      const d = e.target.dataset;
      if (d.shs) { e.target.checked ? on.add(d.shs) : on.delete(d.shs); api.update(); upd(); }
      else if (d.sho) { o[d.sho] = e.target.checked; upd(); }
    });
    el.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-sh]');
      if (!b) return;
      if (b.dataset.sh === 'allsel') { if (on.size === list.length) on.clear(); else list.forEach((s) => on.add(s.id)); api.update(); upd(); return; }
      if (busy || !on.size) return;
      busy = true;
      try {
        const { pack, shareName } = await import('../share.js');
        const songs = list.filter((s) => on.has(s.id)), files = await fl();
        const set = ev && o.set ? ev : null, title = set ? set.title || t('cal.kind.rehearsal') : songs.length === 1 ? songs[0].title : '';
        const u8 = await pack({ songs, files, set, title });
        log('share', 'отправка: песен ' + songs.length + ', файлов ' + files.length + ', ' + mb(u8.length) + (set ? ', с сет-листом' : ''));
        const r = await sendFile(u8, shareName(set ? set.title || 'setlist' : songs.length === 1 ? songs[0].title : 'songs'), title || tn('share.songs', songs.length));
        if (r !== 'cancel') { api.close(); if (r === 'saved') toast(t('share.saved')); }
      } catch (err) { logErr('share', err); toast(t('share.fail')); }
      busy = false;
    });
    upd();
  });
  return api;
}

// Шторка «Принять»: что в файле и что с этим сделать (добавить, обновить, пропустить), сет-лист — в календарь
export async function receive(app, u8, name = '', onDone = null) {
  const S = await import('../share.js');
  let un;
  try { un = S.unpack(u8); } catch (e) { toast(t(e.message === 'newer' ? 'share.newer' : e.message === 'empty' ? 'share.empty2' : 'share.notMelete')); return; }
  const m = un.manifest, plan = S.planImport(app.store.songs(), m);
  plan.forEach((p) => { if (p.match && !S.differs(p.match, p.x)) p.same = true; });
  let withSet = !!(m.set && m.set.start), withQuotes = m.quotes.length > 0, withProfile = !!m.profile;
  const pf = m.profile, WD = weekdays();
  const pfLine = pf ? [pf.name, pf.instruments && pf.instruments.map((k) => t('inst.' + k)).join(', '), pf.level && t('level.' + pf.level),
    pf.days && pf.days.map((d, i) => (d ? WD[i] : '')).filter(Boolean).join(' '), pf.goalMin && t('share.goal', { m: Math.round(pf.goalMin / 6) / 10 })].filter(Boolean).join(' · ') : '';
  log('share', 'приём: песен ' + m.songs.length + ', файлов ' + m.files.length + (m.set ? ', с сет-листом' : ''));
  const opts = (p) => (p.match ? [['update', t('share.update')], ['add', t('share.copy')], ['skip', t('share.skip')]] : [['add', t('share.add')], ['skip', t('share.skip')]]);
  const api = sheet(() => snav(t('share.inTitle'), { left: '<button class="link l" data-close>' + t('ui.cancel') + '</button>', right: '<button class="link b r" data-rc="go">' + t('share.accept') + '</button>' }) +
    '<p class="ftr" style="margin-top:0">' + esc(m.title || name.replace(/\.melete$/i, '')) + (m.created ? ' · ' + esc(new Date(m.created).toLocaleDateString(getLang())) : '') + '</p>' +
    (m.set && m.set.start ? '<div class="hdr">' + t('share.setlist') + '</div><div class="group"><label class="cell">' + chk('data-rcset', withSet) + '<span class="grow"><span>' + esc(m.set.title || t('cal.kind.rehearsal')) + '</span><span class="st l2" style="display:block;font-size:12.5px">' +
      esc(when(m.set.start) + (m.set.place ? ' · ' + m.set.place : '')) + '</span><span class="st l2" style="display:block;font-size:12.5px">' + t('share.toCal') + '</span></span></label></div>' : '') +
    // сборники цитат → свои наборы Мелеты; профиль — без часов
    (m.quotes.length ? '<div class="hdr">' + t('share.quotes') + '</div><div class="group"><label class="cell">' + chk('data-rcq', withQuotes) + '<span class="grow">' +
      m.quotes.map((b) => '<span style="display:block">' + esc(b.title) + ' <span class="l2">· ' + tn('share.nq', b.items.length) + '</span></span>').join('') + '</span></label></div>' : '') +
    (pf ? '<div class="hdr">' + t('share.profile') + '</div><div class="group"><label class="cell">' + chk('data-rcp', withProfile) + '<span class="grow"><span>' + esc(pfLine) + '</span>' +
      '<span class="st l2" style="display:block;font-size:12.5px">' + t('share.noHours') + '</span></span></label></div>' : '') +
    (m.songs.length ? '<div class="hdr">' + tn('share.songs', m.songs.length) + '</div><div class="group">' + plan.map((p, i) => {
      const nf = m.files.filter((f) => (f.songs || []).includes(p.x.ref)).length;
      return '<div class="cellcol" style="padding:10px 14px"><div><b>' + esc(p.x.title) + '</b><span class="st l2" style="display:block;font-size:12.5px">' +
        esc([p.x.artist, p.x.key, p.x.targetBpm ? p.x.targetBpm + ' BPM' : '', p.x.notes ? t('share.hasText') : '', nf ? tn('share.files', nf) : ''].filter(Boolean).join(' · ')) + '</span>' +
        (p.match ? '<span class="st" style="display:block;font-size:12.5px;color:var(--tint)">' + t(p.same ? 'share.same' : 'share.exists') + '</span>' : '') + '</div>' +
        seg('rc' + i, opts(p), p.action, p.x.title) + '</div>';
    }).join('') + '</div>' : '') +
    '<p class="ftr">' + t('share.inHint') + '</p>', (el) => {
    el.addEventListener('change', (e) => {
      if (e.target.hasAttribute('data-rcset')) withSet = e.target.checked;
      if (e.target.hasAttribute('data-rcq')) withQuotes = e.target.checked;
      if (e.target.hasAttribute('data-rcp')) withProfile = e.target.checked;
    });
    el.addEventListener('click', async (e) => {
      const sb = e.target.closest('[data-seg] [data-v]');
      if (sb) { const i = +sb.closest('[data-seg]').dataset.seg.slice(2); plan[i].action = sb.dataset.v; api.update(); return; }
      if (!e.target.closest('[data-rc="go"]')) return;
      try {
        const r = await S.applyImport({ store: app.store, files: app.files, unpacked: un, plan, set: withSet, quotes: withQuotes, profile: withProfile, base: emptySong(app.store.state.settings) });
        log('share', 'принято: новых ' + r.added + ', обновлено ' + r.updated + ', файлов ' + r.files + (r.event ? ', событие' : '') + (r.books ? ', сборников ' + r.books : '') + (r.profile ? ', профиль' : ''));
        api.close();
        toast([m.songs.length ? t('share.done', { a: r.added, u: r.updated, f: r.files }) : '', r.books ? tn('share.booksDone', r.books) : '', r.profile ? t('share.profileDone') : ''].filter(Boolean).join(' · '));
        if (app.render) app.render();
        if (onDone) onDone(r);
      } catch (err) { logErr('share', err); toast(t('share.fail')); }
    });
  });
}

// «Принять файл»: выбрать .melete на устройстве
export function pickFile(app, onDone = null) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.melete,.json,application/json,application/octet-stream,application/zip';
  input.addEventListener('change', async () => {
    const f = input.files[0];
    if (!f) return;
    receive(app, new Uint8Array(await f.arrayBuffer()), f.name, onDone);
  });
  input.click();
}

// Инструкция для нейросети (src/core/aidoc.js): показать, скопировать, отправить файлом
export async function aiDocSheet(app, onDone = null) {
  const { aiDoc } = await import('../aidoc.js');
  const text = aiDoc();
  coreHelp(app, 'owndata');
  sheet(() => snav(t('ai.short')) + '<p class="ftr" style="margin-top:0">' + t('ai.how') + '</p>' +
    '<div class="group"><button class="cell act" data-ai="copy">' + t('ai.copy') + '</button><button class="cell act" data-ai="send">' + t('ai.send') + '</button>' +
    '<button class="cell act" data-ai="load">' + t('ai.load') + '</button></div>' +
    '<pre class="aidoc">' + esc(text) + '</pre>', (el, sh) => {
    el.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-ai]');
      if (!b) return;
      if (b.dataset.ai === 'copy') {
        try { await navigator.clipboard.writeText(text); toast(t('ai.copied')); } catch { toast(t('share.fail')); }
      } else if (b.dataset.ai === 'send') {
        const r = await sendFile(new TextEncoder().encode(text), 'melete-ai-format.md', t('ai.title'), 'text/markdown');
        if (r === 'saved') toast(t('share.saved'));
      } else { sh.close(); pickFile(app, onDone); }
    });
  });
}

// Меню из списка песен: отправить или принять
export function shareMenu(app) {
  coreHelp(app, 'share');
  const api = sheet(() => snav(t('share.team')) + '<div class="group"><button class="cell act" data-sm="send">' + t('share.sendSongs') + '</button>' +
    '<button class="cell act" data-sm="get">' + t('share.get') + '</button></div><p class="ftr">' + t('share.about') + '</p>', (el) => {
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-sm]');
      if (!b) return;
      api.close();
      if (b.dataset.sm === 'send') shareSheet(app, { all: true });
      else pickFile(app);
    });
  });
}

// Файл .melete, открытый в Melete на Android (из Telegram, почты, файлов)
export function initShareIn(app) {
  if (!Share) return;
  Share.addListener('file', ({ name, data }) => {
    if (!data) return;
    try { receive(app, unb64(data), name); } catch (err) { logErr('share', err); toast(t('share.notMelete')); }
  });
}
