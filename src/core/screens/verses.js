// Стихи названий в виде «Минимал» (язык el): касание заголовка раздела, окна инструмента или эпиграфа — его стих
// (греческий, русский, ссылка); в «Оформлении» — список всех названий со стихами (src/core/verses.js).
import { t, getLang, MONO_LANG } from '../../i18n/index.js';
import { esc, sheet, snav } from '../../ui/index.js';
import { verseOf, verseByKey, verseList } from '../verses.js';

const card = (v) => '<div class="bvcard"><div class="bvname" lang="el">' + esc(v.name) + '</div><blockquote class="bvgr" lang="el">' + esc(v.gr) + '</blockquote>' +
  '<p class="bvru">' + esc(v.ru) + '</p><p class="bvref">' + esc(v.ref) + '</p></div>';

export function verseSheet(v) { sheet(() => snav(v.ref) + card(v)); }
export function verseListSheet() { sheet(() => snav(t('verses.title')) + '<p class="ftr" style="margin-top:0">' + t('verses.hint') + '</p>' + verseList().map(card).join('')); }

// Где названия: заголовки экранов и разделов, заголовок окна инструмента, шапки шторок, эпиграф
const SEL = '.large, .stitle2, .snav b, .snav h2, .hdr, .mhd h2, .mverse, [data-verses]';
export function bindVerses() {
  if (getLang() !== MONO_LANG) return;
  addEventListener('click', (e) => {
    const el = e.target.closest && e.target.closest(SEL);
    if (!el) return;
    if (el.hasAttribute('data-verses')) { verseListSheet(); return; }
    const v = el.classList.contains('mverse') ? { name: 'Ἐξαριθμήσασθαι', ...verseByKey('ps89_12') } : verseOf(el.childNodes[0] && el.childNodes[0].nodeType === 3 ? el.childNodes[0].textContent : el.textContent);
    if (v) verseSheet(v);
  });
}
