// «Сообщить о проблеме»: человек пишет, что случилось (можно не писать), может посмотреть весь отчёт и
// отправляет его сам — через системное «Поделиться» (Telegram, почта…). После неожиданного закрытия
// приложение один раз предлагает отправить отчёт; без согласия ничего не происходит.
import { t } from '../../i18n/index.js';
import { esc, sheet, snav, sw, toast, leave } from '../../ui/index.js';
import { reportText, sendReport, REPORT_EMAIL } from '../report.js';
import { log, logErr, crashedLast, crashSeen } from '../log.js';

export function reportSheet(app) {
  let withLog = true, shown = false;
  const api = sheet(() => snav(t('report.title')) +
    '<p class="l2" style="margin:4px 4px 14px;font-size:15px;line-height:1.45">' + t('report.intro') + '</p>' +
    '<div class="group"><div class="cellcol"><textarea class="inp rptwhat" rows="4" maxlength="2000" placeholder="' + esc(t('report.ph')) + '" aria-label="' + esc(t('report.what')) + '"></textarea></div>' +
    '<div class="cell"><span class="grow">' + t('report.withLog') + '</span>' + sw('rptlog', true, t('report.withLog')) + '</div>' +
    '<button class="cell act" data-rpt="show">' + t('report.show') + '</button></div>' +
    '<pre class="rptpre" hidden></pre>' +
    '<button class="btn fill rptsend" data-rpt="send" style="width:100%;margin-top:16px">' + t('report.send') + '</button>' +
    '<button class="btn rptcopy" data-rpt="copy" style="width:100%;margin-top:8px">' + t('report.copy') + '</button>' +
    '<p class="ftr">' + t('report.how', { email: REPORT_EMAIL }) + '</p>');
  const el = api.el, what = el.querySelector('.rptwhat'), pre = el.querySelector('.rptpre');
  const text = () => reportText(app, what.value, withLog);
  const refresh = async () => { if (shown) pre.textContent = await text(); };
  el.querySelector('[data-sw="rptlog"]').addEventListener('change', (e) => { withLog = e.target.checked; refresh(); });
  what.addEventListener('input', () => { clearTimeout(what._t); what._t = setTimeout(refresh, 400); });
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-rpt]');
    if (!b) return;
    if (b.dataset.rpt === 'show') {
      shown = !shown;
      pre.hidden = !shown;
      b.textContent = t(shown ? 'report.hide' : 'report.show');
      await refresh();
      if (shown) pre.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      return;
    }
    if (b.dataset.rpt === 'copy') { // текст целиком в буфер обмена — вставить в чат или письмо без файла
      b.disabled = true;
      try { await copyText(await text()); toast(t('report.copied')); } catch (err) { logErr('report', err); toast(t('report.copyFail')); } finally { b.disabled = false; }
      return;
    }
    b.disabled = true;
    try {
      log('report', 'отправка отчёта' + (withLog ? ' с журналом' : ''));
      const r = await sendReport(await text(), { title: t('report.subject'), caption: t('report.caption') + (what.value.trim() ? ': ' + what.value.trim().slice(0, 300) : '') });
      if (r === 'saved') toast(t('report.saved'));
      if (r !== 'cancel') api.close();
    } catch (err) {
      logErr('report', err);
      toast(t('report.fail'));
    } finally { b.disabled = false; }
  });
}

// В буфер обмена: navigator.clipboard, если нет (старый WebView, нет разрешения) — скрытое поле и execCommand
async function copyText(txt) {
  try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(txt); return; } } catch { /* запасной путь */ }
  const ta = document.createElement('textarea');
  ta.value = txt; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
  document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, txt.length);
  const ok = document.execCommand('copy'); ta.remove();
  if (!ok) throw new Error('copy');
}

// Отчёт о падении одним касанием: текст уже собран (что было — «закрылось неожиданно», журнал, устройство), сразу
// «Поделиться» — выбрать Telegram или почту
async function sendCrash(app) {
  try {
    log('report', 'отчёт о падении — одним касанием');
    const r = await sendReport(await reportText(app, t('report.crashWhat'), true), { title: t('report.subject'), caption: t('report.crashWhat') });
    if (r === 'saved') toast(t('report.saved'));
  } catch (err) { logErr('report', err); toast(t('report.fail')); }
}

// Идея: короткий текст — через «Поделиться» (подпись сообщения — сама идея, в файле — версия и устройство, без журнала)
export function ideaSheet(app) {
  const api = sheet(() => snav(t('idea.title')) +
    '<p class="l2" style="margin:4px 4px 14px;font-size:15px;line-height:1.45">' + t('idea.intro') + '</p>' +
    '<div class="group"><div class="cellcol"><textarea class="inp ideatext" rows="5" maxlength="2000" placeholder="' + esc(t('idea.ph')) + '" aria-label="' + esc(t('idea.title')) + '"></textarea></div></div>' +
    '<button class="btn fill" data-idea style="width:100%;margin-top:16px">' + t('idea.send') + '</button>');
  const el = api.el, ta = el.querySelector('.ideatext');
  setTimeout(() => ta.focus(), 120);
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-idea]'); if (!b) return;
    const v = ta.value.trim(); if (!v) { ta.focus(); return; }
    b.disabled = true;
    try {
      const r = await sendReport(await reportText(app, t('idea.label') + ': ' + v, false), { title: t('idea.subject'), caption: t('idea.label') + ': ' + v.slice(0, 900) });
      if (r === 'saved') toast(t('report.saved'));
      if (r !== 'cancel') { toast(t('idea.thanks')); api.close(); }
    } catch (err) { logErr('report', err); toast(t('report.fail')); } finally { b.disabled = false; }
  });
}

// После неожиданного закрытия — одно предложение отправить отчёт (через пару секунд после запуска)
export function crashOffer(app) {
  if (!crashedLast()) return;
  crashSeen();
  setTimeout(() => {
    if (document.querySelector('.ask, .tosbox')) return; // поверх соглашения и других окон — не предлагать
    const d = document.createElement('div');
    d.className = 'ask';
    d.innerHTML = '<div class="alert" role="alertdialog" aria-label="' + esc(t('report.crashTitle')) + '"><div class="ab"><h3>' + t('report.crashTitle') + '</h3><p>' + t('report.crashText') + '</p></div>' +
      '<div class="abtns"><button data-k="no">' + t('report.later') + '</button><button data-k="yes">' + t('report.toReport') + '</button></div></div>';
    document.body.appendChild(d);
    d.addEventListener('click', (e) => {
      const k = e.target.closest('[data-k]');
      if (!k && e.target !== d) return;
      leave(d, 160);
      if (k && k.dataset.k === 'yes') sendCrash(app);
    });
  }, 2500);
}
