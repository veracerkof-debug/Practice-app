// Мелодия по подсказке — общая для глайдера и терменвокса: полоса нот поверх поверхности (сыгранная, нужная
// крупно, следующие) со слогами песни и лист выбора мелодии. Касания полоса не перехватывает — только свои кнопки.
import { mName } from '../../music/notes.js';
import { MELODIES, melodyName, melodyWindow } from '../../music/melodies.js';

const PLAY = '<svg viewBox="0 0 24 24"><path d="M8 5.5v13l10-6.5z" fill="currentColor"/></svg>';
const STOP = '<svg viewBox="0 0 24 24"><rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor"/></svg>';
const CLOSE = '<svg viewBox="0 0 24 24"><path d="M7 7l10 10M17 7L7 17"/></svg>';
export const NOTE_ICON = '<svg viewBox="0 0 24 24"><path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/></svg>';

// Полоса: название, ноты окна (текущая — крупно, со слогом), кнопки «послушать» (если есть) и «убрать мелодию»
export function melStrip(ctx, mel, i, { listen = true, playing = false } = {}) {
  const { t, ui } = ctx, lang = (typeof ctx.lang === 'function' ? ctx.lang() : ctx.lang) || 'ru';
  const notes = melodyWindow(mel, i).map((n) => '<span class="mln ' + n.k + '"><b>' + mName(n.m) + '</b><i>' + ui.esc(n.w || '·') + '</i></span>').join('');
  return '<div class="glmel" aria-live="polite"><div class="mlhead"><span class="mlname">' + ui.esc(melodyName(mel, lang)) + '</span><span class="mlpos num">' + (i + 1) + '/' + mel.notes.length + '</span>' +
    (listen ? '<button class="mlbtn" data-x="mlisten" aria-label="' + ui.esc(t(playing ? 'mel.stop' : 'mel.listen')) + '">' + (playing ? STOP : PLAY) + '</button>' : '') +
    '<button class="mlbtn" data-x="mloff" aria-label="' + ui.esc(t('mel.off')) + '">' + CLOSE + '</button></div><div class="mlnotes">' + notes + '</div></div>';
}

// Лист выбора: «без мелодии» и список (название, авторы, диапазон)
export function melSheet(ctx, cur, onPick) {
  const { t, ui } = ctx, lang = (typeof ctx.lang === 'function' ? ctx.lang() : ctx.lang) || 'ru';
  ui.sheet(() => ui.snav(t('mel.title')) + '<p class="ftr" style="margin-top:0">' + t('mel.hint') + '</p><div class="group">' +
    '<button class="cell" data-mel=""><span class="grow">' + t('mel.none') + '</span>' + (!cur ? ui.icons.check : '') + '</button>' +
    MELODIES.map((m) => '<button class="cell" data-mel="' + m.id + '"><span class="grow"><span>' + ui.esc(melodyName(m, lang)) + '</span><span class="psub">' + ui.esc(m.by) + '</span></span>' +
      (cur === m.id ? ui.icons.check : '') + '</button>').join('') + '</div>', (el, sh) => {
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-mel]');
      if (!b) return;
      sh.close();
      onPick(b.dataset.mel || null);
    });
  });
}
