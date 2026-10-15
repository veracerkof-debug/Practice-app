// Пресеты звука: ряд кнопок (встроенные + свои), сохранение, переименование, удаление.
// Перенесено из legacy/practice.html (presetRow, presetManager, promptName). api — ctx.presets(kind).
import { t } from '../i18n/index.js';
import { esc, sheet, snav, toast, icons } from './index.js';

const MINUS = '<svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg>';

// builtins: [[id, подпись]]; cur — id текущего пресета
export function presetRow(api, cur, builtins = []) {
  const L = api.list();
  return '<div class="hscroll prow">' +
    builtins.map(([k, n]) => '<button class="pill" data-bpre="' + k + '" aria-pressed="' + (cur === k) + '">' + esc(n) + '</button>').join('') +
    L.map((p) => '<button class="pill upre" data-upre="' + p.id + '" aria-pressed="' + (cur === p.id) + '">★ ' + esc(p.name) + '</button>').join('') +
    '<button class="pill padd" data-psave>＋ ' + esc(t('preset.save')) + '</button>' +
    (L.length ? '<button class="pill padd" data-pman aria-label="' + esc(t('preset.mine')) + '">⋯</button>' : '') + '</div>';
}

// Спросить название; cb(name)
export function promptName(title, def, cb) {
  sheet(() => snav(title, { left: '<button class="link l" data-close>' + esc(t('ui.cancel')) + '</button>', right: '<button class="link b r" id="pnok">' + esc(t('preset.saveBtn')) + '</button>' }) +
    '<div class="group"><label class="cell"><input class="inp left" id="pnv" maxlength="28" placeholder="' + esc(t('preset.name')) + '" aria-label="' + esc(t('preset.name')) + '" value="' + esc(def || '') + '"></label></div>',
  (el, sh) => {
    const i = el.querySelector('#pnv');
    setTimeout(() => { i.focus(); i.select(); }, 80);
    const ok = () => {
      const v = i.value.trim();
      if (!v) { toast(t('preset.needName')); return; }
      sh.close();
      cb(v);
    };
    el.querySelector('#pnok').addEventListener('click', ok);
    i.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
  });
}

// Список своих пресетов: переименовать, удалить
export function presetManager(api, back) {
  const body = () => {
    const L = api.list();
    return snav(t('preset.mine'), { left: '<button class="ic sm plain" data-back aria-label="' + esc(t('ui.back')) + '">' + icons.back + '</button>', right: '<span></span>' }) + '<div class="group">' +
      (L.length ? L.map((p) => '<div class="cell"><span class="grow">' + esc(p.name) + '</span><button class="link" data-ren="' + p.id + '" style="font-size:14px">' +
        esc(t('preset.rename')) + '</button><button class="ic sm plain" data-del="' + p.id + '" style="color:var(--red)" aria-label="' + esc(t('preset.delete')) + ' «' + esc(p.name) + '»">' + MINUS + '</button></div>').join('')
        : '<div class="cell l2">' + esc(t('preset.empty')) + '</div>') + '</div>';
  };
  sheet(body, (el, sh) => el.addEventListener('click', (e) => {
    const g = (s) => e.target.closest(s);
    let b;
    if (g('[data-back]')) { sh.close(); if (back) back(); return; }
    if ((b = g('[data-del]'))) { api.remove(b.dataset.del); sh.update(); }
    else if ((b = g('[data-ren]'))) {
      const p = api.get(b.dataset.ren);
      promptName(t('preset.name'), p.name, (v) => { api.rename(p.id, v); sh.update(); });
    }
  }));
}


