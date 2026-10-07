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
      if (k && k.dataset.k === 'yes') reportSheet(app);
    });
  }, 2500);
}
