// «Что нового» после обновления (данные — whatsnew.js): одна шторка с новыми записями, один раз. Первый запуск
// приложения — ничего не показывает (человек и так всё видит впервые), только запоминает. Ждёт, пока закроются
// регистрация и другие окна
import { t, getLang } from '../../i18n/index.js';
import { esc, sheet, snav } from '../../ui/index.js';
import { unseen, lastNews } from '../whatsnew.js';

const KEY = 'melete.news';
const read = () => { try { const v = localStorage.getItem(KEY); return v == null ? null : +v; } catch { return null; } };
const write = (n) => { try { localStorage.setItem(KEY, String(n)); } catch { /* память недоступна */ } };

export function initWhatsNew(app) {
  const seen = read(), list = unseen(seen);
  if (seen == null || !list.length) { write(lastNews()); return; }
  const show = () => {
    if (!app.store.state.settings.configured || document.querySelector('#onboard, .askname, .ask, #sheetLayer .sheet, .pane')) { setTimeout(show, 3000); return; }
    write(lastNews());
    const lang = getLang(), fmt = (d) => new Date(d + 'T12:00').toLocaleDateString(lang === 'uz' ? 'uz-Latn' : lang, { day: 'numeric', month: 'long' });
    sheet(() => snav(t('news.title')) + list.map((e) => '<div class="hdr">' + esc(fmt(e.d)) + '</div><div class="group">' +
      (e[lang] || e.en).map((x) => '<div class="cell"><span class="grow">' + esc(x) + '</span></div>').join('') + '</div>').join('') +
      '<div class="group" style="margin-top:16px"><button class="cell act center" data-close>' + t('news.ok') + '</button></div>');
  };
  setTimeout(show, 1500);
}
