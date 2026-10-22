// «Самопроверка»: шторка запускает проверки устройства (src/core/selfcheck.js) и показывает итог строка за строкой;
// результат уже в журнале — кнопка «Отправить отчёт» открывает «Сообщить о проблеме» с ним.
import { t } from '../../i18n/index.js';
import { esc, sheet, snav } from '../../ui/index.js';
import { CHECKS, runChecks, counts } from '../selfcheck.js';
import { reportSheet } from './report.js';

const MARK = { ok: '✓', warn: '!', fail: '✗', skip: '–' };
// «9 в порядке, 1 с замечанием, 1 не прошло» — на языке интерфейса
const sumText = (res) => { const n = counts(res); return ['ok', 'warn', 'fail', 'skip'].filter((k) => n[k]).map((k) => n[k] + ' ' + t('check.st.' + k)).join(', '); };

export function checkSheet(app) {
  let res = {}, running = false, done = false;
  const row = (id) => {
    const r = res[id];
    return '<div class="ckrow" data-ck="' + id + '" data-st="' + (r ? r.st : running ? 'run' : '') + '"><span class="ckst" aria-label="' + esc(t(r ? 'check.st.' + r.st : 'check.wait')) + '">' + (r ? MARK[r.st] : '') + '</span>' +
      '<span class="grow"><b>' + esc(t('check.' + id)) + '</b>' + (r ? '<span class="psub">' + esc(r.info) + '</span>' : '') + '</span></div>';
  };
  const api = sheet(() => snav(t('check.title')) +
    '<p class="l2" style="margin:4px 4px 14px;font-size:15px;line-height:1.45">' + t('check.intro') + '</p>' +
    '<div class="group cklist">' + CHECKS.map(row).join('') + '</div>' +
    '<p class="ftr cksum" aria-live="polite">' + esc(done ? sumText(Object.values(res)) : running ? t('check.running') : '') + '</p>' +
    '<button class="btn fill" data-ck-act="run"' + (running ? ' disabled' : '') + ' style="width:100%;margin-top:12px">' + t(done ? 'check.again' : 'check.run') + '</button>' +
    '<button class="btn" data-ck-act="report"' + (done ? '' : ' disabled') + ' style="width:100%;margin-top:8px">' + t('check.report') + '</button>');
  const run = async () => {
    if (running) return;
    running = true; done = false; res = {}; api.update();
    const all = await runChecks(app, (id, r) => { res[id] = r; const el = api.el.querySelector('[data-ck="' + id + '"]'); if (el) el.outerHTML = row(id); });
    running = false; done = true; res = Object.fromEntries(all.map((r) => [r.id, r]));
    api.update();
  };
  api.el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ck-act]');
    if (!b) return;
    if (b.dataset.ckAct === 'run') run();
    else if (b.dataset.ckAct === 'report') { api.close(); reportSheet(app); }
  });
  run();
  return api;
}
