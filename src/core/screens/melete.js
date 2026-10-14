// Характер Мелеты: режим (классика / навязчивая / без уведомлений), время занятий, «напомнить за», обращение по имени,
// наборы слов. Один и тот же блок — при регистрации (src/core/screens/onboard.js) и в «Уведомлениях» (panel.js).
import { t } from '../../i18n/index.js';
import { esc, seg, toast } from '../../ui/index.js';
import { STYLES, LEADS, remindOf, setRemind, remindAvailable, remindPermission, remindTest } from '../reminders.js';
import { remindText, remindCtx } from '../remindtexts.js';
import { QSETS, setsOf } from '../quotes.js';
import { mascotSVG } from '../../ui/mascot.js';

const FACE = { classic: 'glad', pushy: 'wait', quiet: 'sleep' };
const leadName = (m) => (m < 60 ? t('rem.leadM', { n: m }) : t('rem.leadH', { n: m / 60 }));

// Образец уведомления — как оно будет выглядеть
function preview(st, mode) {
  if (mode === 'quiet') return '<p class="ftr" style="margin:10px 0 0">' + t('rem.quietNote') + '</p>';
  const ctx = remindCtx(st), slots = mode === 'pushy' ? ['morning', 'lunch', 'lead:5'] : remindOf(st).leads.map((m) => 'lead:' + m);
  return '<div class="rprev">' + slots.slice(0, 3).map((slot) => { const x = remindText({ slot, mode, ts: Date.now() }, ctx); return '<div class="rpn"><b>' + esc(x.title) + '</b><span>' + esc(x.body) + '</span></div>'; }).join('') + '</div>';
}

// sets — показать выбор наборов слов (при регистрации); test — кнопка проверки (в «Уведомлениях»)
export function meleteHTML(st, { sets = false, test = false } = {}) {
  const r = remindOf(st), mode = r.mode;
  const tm = '<input type="time" class="inp" data-ml="time" value="' + esc(r.time) + '" aria-label="' + esc(t('rem.time')) + '">';
  let h = '<div class="group"><div class="cellcol"><div class="mlhead">' + mascotSVG(FACE[mode], { size: 52, ring: st.uiStyle !== 'mono' }) +
    seg('mlmode', STYLES.map((k) => [k, t('rem.' + k)]), mode, t('rem.style')) + '</div><div class="segcap">' + t('rem.' + mode + 'Hint') + '</div>' + preview(st, mode) + '</div>';
  if (mode !== 'quiet') {
    h += '<label class="cell"><span class="grow">' + t('rem.time') + '</span>' + tm + '</label>';
    if (mode === 'classic') h += '<div class="cellcol"><span>' + t('rem.lead') + '</span><div class="pickrow" style="margin-top:8px">' + LEADS.slice().reverse().map((m) =>
      '<button type="button" class="lchip pick' + (r.leads.includes(m) ? ' on' : '') + '" data-mllead="' + m + '" aria-pressed="' + r.leads.includes(m) + '" style="--c:var(--tint);--t:var(--on-tint)">' + leadName(m) + '</button>').join('') + '</div></div>';
    h += '<div class="cell"><span class="grow"><span>' + t('rem.byName') + '</span><span class="st l2" style="display:block;font-size:13px">' + t('rem.byNameHint') + '</span></span>' +
      '<label class="sw"><input type="checkbox" data-ml="byName"' + (r.byName ? ' checked' : '') + ' aria-label="' + esc(t('rem.byName')) + '"><i></i></label></div>';
    if (test && remindAvailable()) h += '<button class="cell act" data-mltest>' + t('rem.test') + '</button>';
  }
  h += '</div><p class="ftr">' + (mode === 'quiet' ? t('rem.quietHint') : t('rem.hint', { from: r.quietFrom, to: r.quietTo })) + (remindAvailable() || mode === 'quiet' ? '' : ' ' + t('rem.webOnly')) + '</p>';
  if (sets) {
    const on = setsOf(st);
    h += '<div class="hdr">' + t('qset.title') + '</div><div class="group">' + QSETS.map((k) => '<label class="cell"><span class="grow">' + t('qset.' + k) + '</span>' +
      '<input type="checkbox" data-mlset="' + k + '"' + (on.includes(k) ? ' checked' : '') + ' style="width:22px;height:22px"></label>').join('') + '</div><p class="ftr">' + t('qset.hint') + '</p>';
  }
  return h;
}

// Обработчики блока: el — корень (панель или регистрация), save() — сохранить настройки, rerender() — перерисовать
export function bindMelete(el, getSt, { save, rerender, ask = true }) {
  const S = typeof getSt === 'function' ? getSt : () => getSt;
  el.addEventListener('click', (e) => {
    const st = S(), g = (s) => e.target.closest(s);
    let b;
    if ((b = g('[data-seg="mlmode"] [data-v]'))) {
      const mode = b.dataset.v;
      setRemind(st, { mode });
      save(); rerender();
      // разрешение на уведомления — сразу при выборе (в регистрации — в конце)
      if (ask && mode !== 'quiet' && remindAvailable()) remindPermission().then((ok) => { if (!ok) toast(t('rem.denied')); });
    } else if ((b = g('[data-mllead]'))) {
      const m = +b.dataset.mllead, s = new Set(remindOf(st).leads);
      if (s.has(m) && s.size > 1) s.delete(m); else s.add(m);
      setRemind(st, { leads: LEADS.filter((x) => s.has(x)) });
      save(); rerender();
    } else if (g('[data-mltest]')) {
      const r = remindOf(st);
      remindTest((x) => remindText(x, remindCtx(st)), r.mode, r.mode === 'pushy' ? 'morning' : 'lead:' + r.leads[0]).then((ok) => toast(t(ok ? 'rem.testSent' : 'rem.denied')));
    }
  });
  el.addEventListener('change', (e) => {
    const st = S(), d = e.target.dataset;
    if (d.ml === 'time' && e.target.value) { setRemind(st, { time: e.target.value }); save(); }
    else if (d.ml === 'byName') { setRemind(st, { byName: e.target.checked }); save(); rerender(); }
    else if (d.mlset) {
      const s = new Set(setsOf(st));
      if (e.target.checked) s.add(d.mlset); else if (s.size > 1) s.delete(d.mlset); else { e.target.checked = true; return; }
      st.qsets = [...QSETS, ...(st.quoteBooks || []).map((x) => 'own:' + x.id)].filter((k) => s.has(k));
      save();
    }
  });
}
