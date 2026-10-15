// Свой план чтения Библии: название, книги (готовые наборы — вся Библия, Заветы, Евангелия, Псалтирь… — или по одной)
// и за сколько дней. Главы выбранных книг идут по порядку, поровну на дни; план начинается сегодня.
// Свои планы можно изменить и удалить. Состояние — src/core/reading.js (settings.bible.custom).
import { t } from '../../i18n/index.js';
import { esc, sheet, snav, toast, confirm } from '../../ui/index.js';
import { BOOKS } from '../bible.js';
import { BOOK_SETS, chaptersIn, dayKeyOf } from '../reading.js';

const SETS = ['all', 'ot', 'nt', 'gospels', 'epistles', 'torah', 'psa', 'pro'];
const DAYS = [7, 30, 90, 180, 365];

// id — изменить свой план (иначе новый); done() — после сохранения или удаления
export function planSheet(app, done, id = null) {
  const old = id ? app.bible.customs().find((x) => x.id === id) : null;
  const S = { name: old ? old.name : t('bplan.defName'), books: new Set(old ? old.books : BOOK_SETS.nt), days: old ? old.days : 90 };
  const per = () => { const n = chaptersIn([...S.books]); return { n, d: n ? Math.max(1, Math.min(S.days, n)) : 0 }; };
  const sum = () => { const { n, d } = per(); return n ? t('bplan.sum', { n, d, per: (n / d).toFixed(n / d < 10 ? 1 : 0).replace('.0', '') }) : t('bplan.none'); };
  const has = (k) => BOOK_SETS[k].every((c) => S.books.has(c));
  const body = () => snav(t(old ? 'bplan.edit' : 'bplan.title')) +
    '<div class="group"><label class="cellcol"><span>' + t('bplan.name') + '</span><input class="inp" data-bp="name" maxlength="60" value="' + esc(S.name) + '" style="margin-top:6px"></label></div>' +
    // книги: наборы и по одной
    '<div class="hdr">' + t('bplan.books') + '</div><div class="pickrow">' + SETS.map((k) => '<button type="button" class="lchip pick' + (has(k) ? ' on' : '') + '" data-bpset="' + k + '" style="--c:var(--tint);--t:var(--on-tint)">' + t('bplan.set.' + k) + '</button>').join('') + '</div>' +
    ['ot', 'nt'].map((part) => '<div class="segcap" style="margin:10px 4px 4px">' + t('bplan.set.' + part) + '</div><div class="bpbooks">' +
      BOOKS.filter((b) => (part === 'nt') === b.nt).map((b) => '<button type="button" class="bpb' + (S.books.has(b.code) ? ' on' : '') + '" data-bpbook="' + b.code + '" aria-pressed="' + S.books.has(b.code) + '" title="' + esc(b.name) + '">' + esc(b.abbr) + '</button>').join('') + '</div>').join('') +
    // дни
    '<div class="hdr">' + t('bplan.days') + '</div><div class="group"><div class="cellcol"><div class="pickrow">' + DAYS.map((d) => '<button type="button" class="lchip pick' + (S.days === d ? ' on' : '') + '" data-bpdays="' + d + '" style="--c:var(--tint);--t:var(--on-tint)">' + d + '</button>').join('') +
    '<input class="inp num" type="number" min="1" max="3650" data-bp="days" value="' + S.days + '" aria-label="' + esc(t('bplan.days')) + '" style="width:5.5em"></div>' +
    '<div class="segcap" data-bpsum>' + esc(sum()) + '</div></div></div>' +
    '<div class="group" style="margin-top:14px"><button class="cell act center" data-bpsave>' + t(old ? 'bplan.saveEdit' : 'bplan.save') + '</button>' +
    (old ? '<button class="cell act danger center" data-bpdel>' + t('bplan.del') + '</button>' : '') + '</div><p class="ftr">' + t('bplan.hint') + '</p>';
  const api = sheet(body, (el, sh) => {
    const upd = () => { const s = el.querySelector('[data-bpsum]'); if (s) s.textContent = sum(); };
    el.addEventListener('input', (e) => {
      const k = e.target.dataset.bp;
      if (k === 'name') S.name = e.target.value;
      if (k === 'days') { S.days = Math.max(1, Math.min(3650, Math.round(+e.target.value) || 1)); upd(); el.querySelectorAll('[data-bpdays]').forEach((b) => b.classList.toggle('on', +b.dataset.bpdays === S.days)); }
    });
    el.addEventListener('click', (e) => {
      const g = (q) => e.target.closest(q);
      let b;
      if ((b = g('[data-bpset]'))) { const k = b.dataset.bpset, on = has(k); BOOK_SETS[k].forEach((c) => (on ? S.books.delete(c) : S.books.add(c))); sh.update(); }
      else if ((b = g('[data-bpbook]'))) { const c = b.dataset.bpbook; if (S.books.has(c)) S.books.delete(c); else S.books.add(c); sh.update(); }
      else if ((b = g('[data-bpdays]'))) { S.days = +b.dataset.bpdays; sh.update(); }
      else if (g('[data-bpsave]')) {
        if (!S.books.size) { toast(t('bplan.none')); return; }
        app.bible.saveCustom({ id: old && old.id, name: S.name, books: [...S.books], days: S.days }, dayKeyOf(Date.now()));
        sh.close(); toast(t('bplan.saved')); done && done();
      } else if (g('[data-bpdel]')) {
        confirm(t('bplan.delTitle', { name: old.name }), t('bplan.delText'), t('bplan.del')).then((ok) => { if (!ok) return; app.bible.removeCustom(old.id); sh.close(); done && done(); });
      }
    });
  });
  return api;
}
