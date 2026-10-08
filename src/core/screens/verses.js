// Стихи разделов — в обоих видах (src/core/verses.js). Касание заголовка экрана, раздела, окна инструмента
// или эпиграфа — его стих: греческий текст, русский перевод, ссылка. В «Оформлении» — все подряд.
// Греческие названия разделов — только в «Минимале» (i18n/el.json): в окне стиха — название так, как оно на экране.
import { t, makeT, getLang, MONO_LANG } from '../../i18n/index.js';
import { esc, sheet, snav } from '../../ui/index.js';
import { modules } from '../../modules/index.js';
import { moduleName } from '../modules.js';
import { CORE, MODS, TIMER, EPIGRAPH, verseByKey } from '../verses.js';

// Названия на текущем языке → стих
function entries() {
  const out = Object.entries(CORE).map(([k, v]) => ({ title: t(k), v }));
  modules.forEach((m) => {
    if (!MODS[m.id]) return;
    out.push({ title: moduleName(m), v: MODS[m.id] });
    if (m.id === 'timer') { const mt = makeT(m.i18n || {}); Object.entries(TIMER).forEach(([k, v]) => out.push({ title: mt(k), v })); }
  });
  return out;
}
const find = (text) => { const s = String(text || '').trim(); return s ? entries().find((e) => e.title === s) : null; };

const card = (title, v) => '<div class="bvcard"><div class="bvname">' + esc(title) + '</div>' +
  '<blockquote class="bvgr" lang="el">' + esc(v.gr) + '</blockquote><p class="bvru">' + esc(v.ru) + '</p><p class="bvref">' + esc(v.ref) + '</p></div>';

export function verseSheet(title, v) { sheet(() => snav(v.ref) + card(title, v)); }
export function verseListSheet() {
  const seen = new Set();
  sheet(() => snav(t('verses.title')) + '<p class="ftr" style="margin-top:0">' + t('verses.hint') + '</p>' +
    entries().filter((e) => { const k = e.title + '|' + e.v; if (seen.has(k)) return false; seen.add(k); return true; })
      .map((e) => card(e.title, verseByKey(e.v))).join(''));
}

// Эпиграф (Пс 89:12) — в помодоро, секундомере и календаре; ссылка в «Минимале» — греческими числами
export function epigraphHTML() {
  const v = verseByKey(EPIGRAPH), ref = getLang() === MONO_LANG ? 'Ψαλμὸς πθʹ, ιβʹ' : v.ref;
  return '<p class="mverse" lang="el" data-verse="' + EPIGRAPH + '" role="button" tabindex="0">' + esc(v.gr) + '<span lang="ru">' + esc(ref) + '</span></p>';
}

const SEL = '.large, .stitle2, .snav b, .snav h2, .hdr, .mhd h2, [data-verse], [data-verses]';
export function bindVerses() {
  addEventListener('click', (e) => {
    const el2 = e.target.closest && e.target.closest(SEL);
    if (!el2) return;
    if (el2.hasAttribute('data-verses')) { verseListSheet(); return; }
    if (el2.dataset.verse) { const v = verseByKey(el2.dataset.verse); verseSheet(v.ref, v); return; }
    const own = el2.childNodes[0] && el2.childNodes[0].nodeType === 3 ? el2.childNodes[0].textContent : el2.textContent;
    const f = find(own);
    if (f) verseSheet(f.title, verseByKey(f.v));
  });
}
