// «Песни»: список с категориями, поиском, фильтрами и сортировкой; карточка песни; форма песни; метки.
// Перенесено из legacy/practice.html (libraryHTML, songHTML, tempoChart, songForm, libManager, itemEditor, pickHTML).
import { t, tn, getLang } from '../../i18n/index.js';
import { esc, icb, seg, sheet, snav, toast } from '../../ui/index.js';
import { fmtDur } from '../format.js';
import { songStats } from '../stats.js';
import {
  ensureLib, genreOf, catOf, tagOf, textColor, listSongs, countInCat, SORTS, PALETTE, LIB_KINDS,
  newLibItem, saveLibItem, deleteLibItem, getPct, emptySong, saveSong,
} from '../library.js';
import { topbar, relDay, mRing, mBadge, mInput, bindM, BACK, CHEV, IC, PLAY } from './common.js';
import { scaleOf } from '../library.js';
import { songEventsHTML } from './calendar.js';

const chipHTML = (it, cls, attrs) => '<span class="lchip ' + (cls || '') + '" style="--c:' + it.color + ';--t:' + textColor(it) + '" ' + (attrs || '') + '>' + esc(it.name) + '</span>';
const diffLabel = (d) => t('diff.' + d);
const TAG_IC = '<svg viewBox="0 0 16 16"><path d="M2.5 3.5h5l6 6-4 4-6-6z" fill="none"/><circle cx="5.3" cy="6.2" r=".9"/></svg>';
const ADD_IC = '<svg viewBox="0 0 16 16"><path d="M8 2v12M2 8h12"/></svg>';

/* ---------- список ---------- */

export function libraryHTML(app, view) {
  const L = ensureLib(app.store.state, t), songs = app.store.songs(), st = app.store.state.settings;
  let h = topbar('<div class="vrow tight"><button class="addbtn" style="margin:0" data-act="libman" aria-label="' + t('songs.labelsAria') + '">' + TAG_IC + '</button>' +
    '<button class="addbtn" style="margin:0" data-act="addSong" aria-label="' + t('songs.add') + '">' + ADD_IC + '</button></div>') + '<div class="large">' + t('songs.title') + '</div>';
  if (!songs.length) return h + '<div class="empty"><b>' + t('songs.emptyTitle') + '</b>' + t('songs.emptyText') + '<br><button class="btn fill" data-act="addSong">' + t('songs.add') + '</button></div>';
  h += '<div class="hscroll catbar"><button class="catp' + (!view.cat ? ' on' : '') + '" data-cat="" style="--c:var(--ink);--t:var(--bg)">' + t('songs.all') + ' <i>' + songs.length + '</i></button>' +
    L.cats.map((c) => '<button class="catp' + (view.cat === c.id ? ' on' : '') + '" data-cat="' + c.id + '" style="--c:' + c.color + ';--t:' + textColor(c) + '">' + esc(c.name) + ' <i>' + countInCat(songs, c.id) + '</i></button>').join('') +
    (countInCat(songs, '') && L.cats.length ? '<button class="catp' + (view.cat === '_none' ? ' on' : '') + '" data-cat="_none" style="--c:var(--l2);--t:#fff">' + t('songs.noCat') + ' <i>' + countInCat(songs, '') + '</i></button>' : '') + '</div>';
  const { list, usedGenres, usedTags } = listSongs(songs, app.store.sessions(), L, view, getLang());
  h += '<label class="search"><svg viewBox="0 0 16 16"><circle cx="7" cy="7" r="5"/><path d="m11 11 3.5 3.5"/></svg><input type="search" placeholder="' + t('songs.search') + '" aria-label="' + t('songs.searchAria') + '" value="' + esc(view.q) + '" data-input="q"></label>';
  if (usedGenres.length || usedTags.length || view.genre || view.tag) {
    h += '<div class="hscroll fbar">' + usedGenres.map((g) => '<button class="fchip' + (view.genre && view.genre.toLowerCase() === g.name.toLowerCase() ? ' on' : '') + '" data-fg="' + esc(g.name) + '" style="--c:' + g.color + ';--t:' + textColor(g) + '"><i></i>' + esc(g.name) + '</button>').join('') +
      (usedGenres.length && usedTags.length ? '<span class="fsep"></span>' : '') +
      usedTags.map((x) => '<button class="fchip tagf' + (view.tag === x.id ? ' on' : '') + '" data-ft="' + x.id + '" style="--c:' + x.color + ';--t:' + textColor(x) + '">#' + esc(x.name) + '</button>').join('') + '</div>';
  }
  h += '<div style="display:flex;justify-content:space-between;align-items:center;margin:0 6px 8px"><span class="l2" style="font-size:13px">' + tn('songs.count', list.length) +
    (view.genre || view.tag ? ' · <button class="link" data-fclear style="font-size:13px;min-height:0">' + t('songs.clearFilter') + '</button>' : '') +
    '</span><select class="sortsel" data-input="sort" aria-label="' + t('songs.sort') + '">' + SORTS.map((v) => '<option value="' + v + '"' + (view.sort === v ? ' selected' : '') + '>' + t('sort.' + v) + '</option>').join('') + '</select></div>';
  if (!list.length) return h + '<div class="empty">' + t('songs.notFound') + '</div>';
  return h + '<div class="slist">' + list.map(({ s, st: ss }) => {
    const g = genreOf(L, s.genre), c = catOf(L, s.cat), tags = (s.tags || []).map((id) => tagOf(L, id)).filter(Boolean);
    return '<button class="stile3" data-song="' + s.id + '" style="--g:' + (g ? g.color : 'var(--l3)') + '"><div class="grow"><div class="ttl">' +
      (c && !view.cat ? '<i class="cdot" style="background:' + c.color + '" title="' + esc(c.name) + '"></i>' : '') + esc(s.title) + '</div><div class="st">' +
      esc([s.artist, g ? g.name : s.genre].filter(Boolean).join(' · ') || t('songs.noArtist')) + '</div>' +
      (tags.length ? '<div class="tagrow">' + tags.map((x) => chipHTML(x, 'sm')).join('') + '</div>' : '') +
      '</div><div class="val"><div>' + mBadge(getPct(s), st) + '</div><div class="num" style="font-size:12px;margin-top:3px">' + fmtDur(ss.total) + '</div></div></button>';
  }).join('') + '</div>';
}

/* ---------- карточка песни ---------- */

function tempoChart(pts, target) {
  const W = 320, H = 140, p = 26, ys = pts.map((x) => x.bpm).concat(target ? [target] : []);
  let lo = Math.min(...ys), hi = Math.max(...ys);
  if (hi - lo < 10) { hi += 5; lo -= 5; }
  const x = (i) => p + (W - p - 6) * (i / (pts.length - 1)), y = (v) => 10 + (H - 10 - 22) * (1 - (v - lo) / (hi - lo));
  let s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(t('song.tempoAria', { a: pts[0].bpm, b: pts[pts.length - 1].bpm })) + '">';
  [hi, lo].forEach((v) => { s += '<line x1="' + p + '" x2="' + W + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="var(--sep)"/><text x="0" y="' + (y(v) + 4) + '">' + Math.round(v) + '</text>'; });
  if (target) s += '<line x1="' + p + '" x2="' + W + '" y1="' + y(target) + '" y2="' + y(target) + '" stroke="var(--l2)" stroke-dasharray="3 4"/><text x="' + W + '" y="' + (y(target) - 6) + '" text-anchor="end">' + esc(t('song.goal', { n: target })) + '</text>';
  const pl = pts.map((q, i) => x(i) + ',' + y(q.bpm)).join(' ');
  s += '<polygon fill="var(--tint)" opacity=".12" points="' + x(0) + ',' + (H - 22) + ' ' + pl + ' ' + x(pts.length - 1) + ',' + (H - 22) + '"/><polyline fill="none" stroke="var(--tint)" stroke-width="2.5" stroke-linejoin="round" points="' + pl + '"/>';
  pts.forEach((q, i) => { s += '<circle cx="' + x(i) + '" cy="' + y(q.bpm) + '" r="3.5" fill="var(--cell)" stroke="var(--tint)" stroke-width="2"/>'; });
  const f = (d) => { const z = new Date(d); return z.getDate() + '.' + String(z.getMonth() + 1).padStart(2, '0'); };
  return s + '<text x="' + p + '" y="' + (H - 4) + '">' + f(pts[0].t) + '</text><text x="' + W + '" y="' + (H - 4) + '" text-anchor="end">' + f(pts[pts.length - 1].t) + '</text></svg>';
}

export function songHTML(app, id) {
  const s = app.store.songById(id);
  if (!s) return null;
  const L = ensureLib(app.store.state, t), st = songStats(app.store.sessions(), id), p = getPct(s);
  const g = genreOf(L, s.genre), c = catOf(L, s.cat), tg = (s.tags || []).map((x) => tagOf(L, x)).filter(Boolean);
  let h = '<div class="navrow"><button class="link" data-go="library">' + BACK + t('songs.title') + '</button>' + icb('data-edit="' + s.id + '"', IC.pen, t('song.edit'), 'plain') + '</div>' +
    '<div class="large" style="margin:6px 4px 2px">' + esc(s.title) + '</div><p class="sub" style="margin:0 4px 16px">' + esc([s.artist, s.genre].filter(Boolean).join(' · ') || t('songs.noArtist')) + '</p>' +
    (g || c || tg.length ? '<div class="tagrow" style="margin:-8px 4px 14px">' + (c ? chipHTML(c) : '') + (g ? chipHTML(g) : '') + tg.map((x) => chipHTML(x)).join('') + '</div>' : '') +
    '<div class="card shero"><div class="mring">' + mRing(p, 72, scaleOf(app.store.state.settings)) + '</div><div class="grow">' +
    '<div class="srow" title="' + t('song.time') + '">' + IC.clock + '<b class="num">' + fmtDur(st.total) + '</b></div>' +
    '<div class="srow" title="' + t('song.sessions') + '">' + IC.stack + '<b class="num">' + st.count + '</b><span>' + (st.last ? relDay(st.last) : '—') + '</span></div>' +
    '<div class="srow" title="' + t('song.tempo') + '">' + IC.metro + '<b class="num">' + (s.currentBpm || '—') + '</b><span>' + (s.targetBpm ? '→ ' + s.targetBpm : '') + ' bpm</span></div>' +
    '<div class="srow">' + IC.bolt + '<span class="dots" role="img" aria-label="' + esc(t('song.diffAria', { n: s.difficulty })) + '">' + [1, 2, 3, 4, 5].map((i) => '<i class="' + (i <= s.difficulty ? 'on' : '') + '"></i>').join('') + '</span></div></div></div>';
  if (st.tempo.length >= 2) h += '<div class="card">' + tempoChart(st.tempo, s.targetBpm) + '</div>';
  if (s.notes) h += '<div class="group" style="margin-top:12px"><div class="notes">' + esc(s.notes) + '</div></div>';
  h += songEventsHTML(app, s.id);
  h += '<div style="text-align:center;margin-top:28px"><button class="link" data-del="' + s.id + '" style="color:var(--red);font-size:15px">' + t('song.delete') + '</button></div>';
  h += '<div class="fab"><button class="btn fill" data-play="' + s.id + '" aria-label="' + t('song.playAria') + '">' + PLAY + '<span>' + t('song.play') + '</span></button></div>';
  return h;
}

/* ---------- форма песни ---------- */

function pickHTML(L, kind, sel, multi) {
  return '<div class="pickrow" data-pk="' + kind + '">' + (multi ? '' : '<button type="button" class="lchip off' + (!sel ? ' on' : '') + '" data-pv="">' + t('form.none') + '</button>') +
    L[kind].map((it) => {
      const on = multi ? (sel || []).includes(it.id) : kind === 'genres' ? (sel || '').toLowerCase() === it.name.toLowerCase() : sel === it.id;
      return '<button type="button" class="lchip pick' + (on ? ' on' : '') + '" aria-pressed="' + on + '" data-pv="' + (kind === 'genres' ? esc(it.name) : it.id) + '" style="--c:' + it.color + ';--t:' + textColor(it) + '">' + esc(it.name) + '</button>';
    }).join('') + '<button type="button" class="lchip off add" data-pnew="' + kind + '" aria-label="' + t('libm.add.' + kind) + '">＋</button></div>';
}

// onSaved(id) — после сохранения (открыть карточку)
export function songForm(app, id, onSaved) {
  const settings = app.store.state.settings, L = ensureLib(app.store.state, t);
  const s = id ? app.store.songById(id) : emptySong(settings);
  const pick = { difficulty: s.difficulty, cats: s.cat || '', genres: s.genre || '', tags: (s.tags || []).slice() };
  const body = () => '<form id="songForm">' + snav(t(id ? 'form.song' : 'form.new'), { left: '<button type="button" class="link l" data-close>' + t('ui.cancel') + '</button>', right: '<button class="link b r">' + t('ui.done') + '</button>' }) +
    '<div class="group"><label class="cell"><input class="inp left" name="title" required placeholder="' + t('form.title') + '" aria-label="' + t('form.title') + '" value="' + esc(s.title) + '"></label>' +
    '<label class="cell"><input class="inp left" name="artist" placeholder="' + t('form.artist') + '" aria-label="' + t('form.artist') + '" value="' + esc(s.artist) + '"></label></div>' +
    '<div class="hdr">' + t('form.cat') + '</div><div class="group"><div class="cellcol" id="pk-cats">' + pickHTML(L, 'cats', pick.cats) + '</div></div>' +
    '<div class="hdr">' + t('form.genre') + '</div><div class="group"><div class="cellcol" id="pk-genres">' + pickHTML(L, 'genres', pick.genres) + '</div></div>' +
    '<div class="hdr">' + t('form.tags') + '</div><div class="group"><div class="cellcol" id="pk-tags">' + pickHTML(L, 'tags', pick.tags, true) + '</div></div>' +
    '<div class="hdr">' + t('form.difficulty') + '</div><div class="group"><div class="cellcol">' + seg('difficulty', [1, 2, 3, 4, 5].map((i) => [i, i]), pick.difficulty, t('form.difficulty')) +
    '<div class="segcap" data-hint="difficulty">' + diffLabel(pick.difficulty) + '</div></div></div>' +
    '<div class="hdr">' + t('mastery.title') + '</div><div class="group"><div class="cellcol">' + mInput(getPct(s), settings) + '</div></div>' +
    '<div class="hdr">' + t('form.tempo') + '</div><div class="group"><label class="cell"><span>' + t('form.current') + '</span><input class="inp num" name="currentBpm" type="number" inputmode="numeric" min="20" max="300" placeholder="—" value="' + esc(s.currentBpm ?? '') + '"></label>' +
    '<label class="cell"><span>' + t('form.target') + '</span><input class="inp num" name="targetBpm" type="number" inputmode="numeric" min="20" max="300" placeholder="—" value="' + esc(s.targetBpm ?? '') + '"></label></div>' +
    '<div class="hdr">' + t('form.notes') + '</div><div class="group"><textarea class="ta" name="notes" aria-label="' + t('form.notes') + '" placeholder="Am   F   C   G">' + esc(s.notes || '') + '</textarea></div></form>';
  sheet(body, (el, sh) => {
    const f = el.querySelector('#songForm'), readM = bindM(el, settings);
    const rePk = (k) => { const x = el.querySelector('#pk-' + k); if (x) x.innerHTML = pickHTML(ensureLib(app.store.state, t), k, pick[k], k === 'tags'); };
    el.addEventListener('click', (e) => {
      const pv = e.target.closest('[data-pv]'), pn = e.target.closest('[data-pnew]'), dv = e.target.closest('[data-seg="difficulty"] [data-v]');
      if (pn) {
        const k = pn.dataset.pnew;
        itemEditor(app, k, null, (it) => { if (it) { if (k === 'tags') pick.tags.push(it.id); else pick[k] = k === 'genres' ? it.name : it.id; } rePk(k); });
        return;
      }
      if (dv) {
        pick.difficulty = +dv.dataset.v;
        dv.parentNode.querySelectorAll('button').forEach((c) => c.setAttribute('aria-pressed', c === dv));
        el.querySelector('[data-hint="difficulty"]').textContent = diffLabel(pick.difficulty);
        return;
      }
      if (!pv) return;
      const k = pv.closest('[data-pk]').dataset.pk, v = pv.dataset.pv;
      if (k === 'tags') { const i = pick.tags.indexOf(v); if (i >= 0) pick.tags.splice(i, 1); else pick.tags.push(v); }
      else pick[k] = pick[k] === v && v ? '' : v;
      rePk(k);
    });
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(f), pct = readM();
      const nid = saveSong(app.store, id, {
        title: fd.get('title'), artist: fd.get('artist'), genre: pick.genres, cat: pick.cats, tags: pick.tags,
        difficulty: pick.difficulty, masteryPct: pct, targetBpm: fd.get('targetBpm'), currentBpm: fd.get('currentBpm'), notes: fd.get('notes'),
      });
      if (!nid) return;
      sh.close();
      onSaved(nid);
    });
    if (!id) setTimeout(() => f.elements.title.focus(), 80);
  });
}

/* ---------- метки: категории, жанры, теги ---------- */

export function libManager(app, rerender) {
  const body = () => {
    const L = ensureLib(app.store.state, t);
    return snav(t('libm.title')) + LIB_KINDS.map((k) => '<div class="hdr">' + t('libm.' + k) + '</div><div class="group">' +
      L[k].map((it) => '<button class="cell" data-ed="' + k + '" data-id="' + it.id + '">' + chipHTML(it) + '<span class="grow"></span>' + CHEV + '</button>').join('') +
      '<button class="cell act" data-ed="' + k + '" data-id="">' + t('libm.add.' + k) + '</button></div><p class="ftr">' + t('libm.hint.' + k) + '</p>').join('');
  };
  sheet(body, (el, sh) => el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ed]');
    if (b) itemEditor(app, b.dataset.ed, b.dataset.id || null, () => { sh.update(); rerender(); });
  }));
}

// Редактор метки; back(item | undefined) — после сохранения, удаления или «Назад»
export function itemEditor(app, kind, id, back) {
  const L = ensureLib(app.store.state, t), ex = id ? L[kind].find((x) => x.id === id) : null, it = ex ? { ...ex } : newLibItem(L, kind);
  const swatches = (attr, cur, list) => '<div class="swgrid">' + list.map((c) => '<button type="button" class="swc' + (cur === c ? ' on' : '') + '" ' + attr + '="' + c + '" style="background:' + c + '" aria-label="' + esc(t('libm.colorAria', { c })) + '" aria-pressed="' + (cur === c) + '"></button>').join('') +
    '<label class="swc custom" aria-label="' + t('libm.customColor') + '"><input type="color" ' + attr + '-in value="' + (cur && cur[0] === '#' ? cur : '#ff9500') + '"></label></div>';
  const preview = () => '<div class="lprevw">' + chipHTML({ ...it, name: it.name || t('libm.name') }, 'big') +
    (kind === 'genres' ? '<div class="stile3 demo" style="--g:' + it.color + '"><div class="grow"><div class="ttl">' + t('libm.demoTitle') + '</div><div class="st">' + t('libm.demoSub') + '</div></div></div>' : '') + '</div>';
  const body = () => snav(t(ex ? 'libm.one.' + kind : 'libm.new.' + kind), { left: '<button class="link l" data-k="back">' + t('ui.back') + '</button>', right: '<button class="link b r" data-k="save">' + t('libm.save') + '</button>' }) +
    preview() + '<div class="group"><label class="cell"><input class="inp left" id="iname" maxlength="32" placeholder="' + t('libm.name') + '" aria-label="' + t('libm.name') + '" value="' + esc(it.name) + '"></label></div>' +
    '<div class="hdr">' + t('libm.color') + '</div><div class="group"><div class="cellcol">' + swatches('data-col', it.color, PALETTE) + '</div></div>' +
    '<div class="hdr">' + t('libm.textColor') + '</div><div class="group"><div class="cellcol"><div class="seg" role="group" style="margin-bottom:10px">' +
    [['', t('libm.auto')], ['#ffffff', t('libm.white')], ['#1c1c1e', t('libm.black')]].map(([v, n]) => '<button type="button" data-tx="' + v + '" aria-pressed="' + (it.text === v) + '">' + n + '</button>').join('') + '</div>' +
    swatches('data-txc', it.text, ['#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#007AFF', '#5856D6', '#AF52DE', '#FF2D55']) + '</div></div>' +
    (ex ? '<div class="group" style="margin-top:20px"><button class="cell danger center" data-k="del">' + t('libm.delete') + '</button></div>' : '');
  sheet(body, (el, sh) => {
    const name = () => el.querySelector('#iname').value;
    const re = () => { it.name = name(); sh.update(); };
    el.addEventListener('click', (e) => {
      const c = e.target.closest('[data-col]'), tx = e.target.closest('[data-tx]'), tc = e.target.closest('[data-txc]'), k = e.target.closest('[data-k]');
      if (c) { it.color = c.dataset.col; re(); return; }
      if (tx) { it.text = tx.dataset.tx; re(); return; }
      if (tc) { it.text = tc.dataset.txc; re(); return; }
      if (!k) return;
      const a = k.dataset.k;
      if (a === 'back') { sh.close(); back(); return; }
      if (a === 'del') { deleteLibItem(app.store, kind, it.id); sh.close(); back(); return; }
      if (a === 'save') {
        it.name = name().trim();
        if (!it.name) { toast(t('libm.needName')); return; }
        saveLibItem(app.store, kind, it);
        sh.close();
        back(it);
      }
    });
    el.addEventListener('input', (e) => {
      if (e.target.hasAttribute('data-col-in')) { it.color = e.target.value; it.name = name(); el.querySelector('.lprevw').outerHTML = preview(); }
      else if (e.target.hasAttribute('data-txc-in')) it.text = e.target.value;
    });
    el.addEventListener('change', (e) => { if (e.target.hasAttribute('data-col-in') || e.target.hasAttribute('data-txc-in')) re(); });
  });
}
