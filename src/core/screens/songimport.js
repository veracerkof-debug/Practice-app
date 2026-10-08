// Импорт песен (раздел «Песни», в церковном режиме): выбор файлов (можно сразу много и zip), разбор
// (src/core/songimport.js), шторка с найденными песнями — галочки, повторы по названию отмечены и сняты,
// категория (по умолчанию «Церковь»), затем запись в библиотеку. Holyrics — по Wi-Fi (src/core/holyrics.js).
import { t, tn } from '../../i18n/index.js';
import { esc, sheet, snav, toast } from '../../ui/index.js';
import { ensureLib, emptySong, saveSong, PALETTE } from '../library.js';
import { parseKey, keyName } from '../songinfo.js';
import { log, logErr } from '../log.js';

// «C#» → «C♯», «Bb» → «B♭», «A#m» → написание приложения по высоте
export function normKey(k) {
  if (!k) return null;
  const s = String(k).trim().replace(/^([A-Ga-g])#/, '$1♯').replace(/^([A-Ga-g])b/, '$1♭').replace(/^[a-g]/, (c) => c.toUpperCase()).replace(/min(or)?$/i, 'm').replace(/maj(or)?$/i, '');
  const p = parseKey(s);
  return p ? keyName(p.pc, p.minor) : null;
}

// Категория для церковных песен: «Церковь» из стандартных меток (или создаётся)
function churchCat(app) {
  const L = ensureLib(app.store.state, t), name = t('lib.cats.church');
  let c = L.cats.find((x) => x.name.toLowerCase() === name.toLowerCase());
  if (!c) { c = { id: 'c' + Date.now().toString(36), name, color: PALETTE[3], text: '' }; L.cats.push(c); app.store.settingsChanged(); }
  return c.id;
}

// Песни → шторка выбора → библиотека. songs — [{ title, artist, key, bpm, notes }]; source — откуда (для журнала)
export function importPreview(app, songs, errors = [], source = 'files', onDone = () => {}) {
  const L = ensureLib(app.store.state, t), have = new Set(app.store.songs().map((s) => s.title.trim().toLowerCase()));
  const items = songs.map((s) => ({ ...s, dup: have.has(s.title.trim().toLowerCase()), on: !have.has(s.title.trim().toLowerCase()) && !!s.title }));
  let cat = churchCat(app);
  log('import', source + ': найдено ' + songs.length + ', повторов ' + items.filter((x) => x.dup).length + ', ошибок ' + errors.length, errors.length ? 'w' : 'i');
  const api = sheet(() => snav(t('imp.title'), { right: '<button class="link b r" data-imp="go">' + t('imp.go', { n: items.filter((x) => x.on).length }) + '</button>' }) +
    (items.length ? '' : '<p class="ftr">' + t('imp.none') + '</p>') +
    (items.length ? '<label class="cell" style="margin-bottom:8px"><span class="grow">' + t('imp.cat') + '</span><select class="sortsel" data-impcat aria-label="' + esc(t('imp.cat')) + '">' +
      L.cats.map((c) => '<option value="' + c.id + '"' + (c.id === cat ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('') + '<option value=""' + (!cat ? ' selected' : '') + '>' + t('songs.noCat') + '</option></select></label>' +
      '<div class="group">' + items.map((x, i) => '<label class="cell"><input type="checkbox" data-impi="' + i + '"' + (x.on ? ' checked' : '') + ' style="width:22px;height:22px;margin-right:12px">' +
        '<span class="grow"><span>' + esc(x.title || '—') + '</span><span class="st l2" style="display:block;font-size:12.5px">' +
        esc([x.artist, normKey(x.key), x.bpm ? x.bpm + ' BPM' : '', tn('imp.lines', x.notes ? x.notes.split('\n').length : 0)].filter(Boolean).join(' · ')) +
        (x.dup ? ' · <b>' + t('imp.dup') + '</b>' : '') + '</span></span></label>').join('') + '</div>' : '') +
    (errors.length ? '<p class="ftr" style="color:var(--red)">' + esc(t('imp.errors', { list: errors.map((e) => e.name).join(', ') })) + '</p>' : '') +
    '<p class="ftr">' + t('imp.hint') + '</p>', (el) => {
    el.addEventListener('change', (e) => {
      if (e.target.dataset.impi != null) { items[+e.target.dataset.impi].on = e.target.checked; el.querySelector('[data-imp="go"]').textContent = t('imp.go', { n: items.filter((x) => x.on).length }); }
      if (e.target.hasAttribute('data-impcat')) cat = e.target.value;
    });
    el.addEventListener('click', (e) => {
      if (!e.target.closest('[data-imp="go"]')) return;
      const st = app.store.state.settings, pick = items.filter((x) => x.on && x.title);
      pick.forEach((x) => saveSong(app.store, null, { ...emptySong(st), title: x.title, artist: x.artist, notes: x.notes, key: normKey(x.key), targetBpm: x.bpm || '', cat: cat || null }));
      log('import', source + ': добавлено ' + pick.length);
      api.close();
      toast(tn('imp.done', pick.length));
      onDone();
    });
  });
}

// Файлы с устройства → разбор → шторка
export function songImport(app, onDone) {
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.accept = '.pro,.pro6,.probundle,.pptx,.db,.ewsx,.xml,.txt,.cho,.chordpro,.chopro,.crd,.onsong,.zip';
  input.addEventListener('change', async () => {
    const list = [...input.files];
    if (!list.length) return;
    toast(t('imp.reading'));
    try {
      const { importSongs } = await import('../songimport.js');
      const files = await Promise.all(list.map(async (f) => ({ name: f.name, u8: new Uint8Array(await f.arrayBuffer()) })));
      const r = await importSongs(files);
      importPreview(app, r.songs, r.errors, 'файлы ×' + list.length, onDone);
    } catch (e) { logErr('import', e); toast(t('imp.fail')); }
  });
  input.click();
}

// Откуда импортировать: файлы или Holyrics по Wi-Fi
export function songImportMenu(app, onDone) {
  const api = sheet(() => snav(t('imp.title')) + '<div class="group"><button class="cell act" data-src="files">' + t('imp.files') + '</button>' +
    '<button class="cell act" data-src="holyrics">' + t('imp.holyrics') + '</button></div><p class="ftr">' + t('imp.formats') + '</p>', (el) => {
    el.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-src]');
      if (!b) return;
      api.close();
      if (b.dataset.src === 'files') songImport(app, onDone);
      else { const { holyricsSheet } = await import('./holyrics.js'); holyricsSheet(app, onDone); }
    });
  });
}
