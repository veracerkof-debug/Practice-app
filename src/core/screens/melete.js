// Характер Мелеты: режим (классика / навязчивая / без уведомлений), время занятий, «напомнить за», обращение по имени,
// наборы слов. Один и тот же блок — при регистрации (src/core/screens/onboard.js) и в «Уведомлениях» (panel.js).
import { t } from '../../i18n/index.js';
import { esc, seg, toast } from '../../ui/index.js';
import { STYLES, LEADS, OFFSETS, TONES, CUSTOM_MAX, remindOf, setRemind, remindAvailable, remindPermission, remindTest } from '../reminders.js';
import { remindText, remindCtx } from '../remindtexts.js';
import { QSETS, setsOf } from '../quotes.js';
import { mascotSVG } from '../../ui/mascot.js';
import { tamaOf } from '../tama.js';

const DEL = '<svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg>';
const FACE = { classic: 'glad', pushy: 'wait', custom: 'wink', quiet: 'sleep' };
const offName = (m) => (m === 0 ? t('rem.offStart') : m < 0 ? leadName(-m) : t(m < 60 ? 'rem.afterM' : 'rem.afterH', { n: m < 60 ? m : m / 60 }));
const leadName = (m) => (m < 60 ? t('rem.leadM', { n: m }) : t('rem.leadH', { n: m / 60 }));

// Образец уведомления — как оно будет выглядеть
function preview(st, mode) {
  if (mode === 'quiet') return '<p class="ftr" style="margin:10px 0 0">' + t('rem.quietNote') + '</p>';
  const ctx = remindCtx(st), r = remindOf(st), d0 = new Date(); d0.setHours(0, 0, 0, 0);
  const items = mode === 'pushy' ? ['morning', 'lunch', 'lead:5'].map((slot) => ({ slot })) : mode === 'custom'
    ? r.custom.map((x) => (x.at ? { slot: 'abs', tone: x.tone, ts: d0.getTime() + (+x.at.slice(0, 2) * 60 + +x.at.slice(3)) * 60000 } : { slot: 'rel:' + x.min, tone: x.tone }))
    : r.leads.map((m) => ({ slot: 'lead:' + m }));
  return '<div class="rprev">' + items.slice(0, 3).map((it) => { const x = remindText({ ts: Date.now(), ...it, mode }, ctx); return '<div class="rpn"><b>' + esc(x.title) + '</b><span>' + esc(x.body) + '</span></div>'; }).join('') + '</div>';
}

// sets — показать выбор наборов слов (при регистрации); test — кнопка проверки (в «Уведомлениях»)
export function meleteHTML(st, { sets = false, test = false } = {}) {
  const r = remindOf(st), mode = r.mode;
  const tm = '<input type="time" class="inp" data-ml="time" value="' + esc(r.time) + '" aria-label="' + esc(t('rem.time')) + '">';
  let h = '<div class="group"><div class="cellcol"><div class="mlhead">' + mascotSVG(FACE[mode], { size: 52, ring: st.uiStyle !== 'mono' }) +
    seg('mlmode', STYLES.map((k) => [k, t('rem.' + k)]), mode, t('rem.style')) + '</div><div class="segcap">' + t('rem.' + mode + 'Hint') + '</div>' + preview(st, mode) + '</div>';
  if (mode !== 'quiet') {
    h += '<label class="cell"><span class="grow">' + t('rem.time') + '</span>' + tm + '</label>';
    // своё: список — когда (до/после занятия или точное время) и в каком стиле
    if (mode === 'custom') {
      h += r.custom.map((x, i) => '<div class="cell mlrow"><select class="sortsel" data-mlwhen="' + i + '" aria-label="' + esc(t('rem.when')) + '">' +
        OFFSETS.map((m) => '<option value="' + m + '"' + (!x.at && x.min === m ? ' selected' : '') + '>' + offName(m) + '</option>').join('') +
        (!x.at && !OFFSETS.includes(x.min) ? '<option value="' + x.min + '" selected>' + offName(x.min) + '</option>' : '') +
        '<option value="abs"' + (x.at ? ' selected' : '') + '>' + t('rem.atTime') + '</option></select>' +
        (x.at ? '<input type="time" class="inp" data-mlat="' + i + '" value="' + esc(x.at) + '" aria-label="' + esc(t('rem.atTime')) + '">' : '') +
        '<select class="sortsel" data-mltone="' + i + '" aria-label="' + esc(t('rem.tone')) + '">' + TONES.map((k) => '<option value="' + k + '"' + (x.tone === k ? ' selected' : '') + '>' + t('rem.tone.' + k) + '</option>').join('') + '</select>' +
        '<button class="ic sm" data-mldel="' + i + '" aria-label="' + esc(t('rem.del')) + '">' + DEL + '</button></div>').join('') +
        (r.custom.length < CUSTOM_MAX ? '<button class="cell act" data-mladd>' + t('rem.add') + '</button>' : '');
    }
    if (mode === 'classic') h += '<div class="cellcol"><span>' + t('rem.lead') + '</span><div class="pickrow" style="margin-top:8px">' + LEADS.slice().reverse().map((m) =>
      '<button type="button" class="lchip pick' + (r.leads.includes(m) ? ' on' : '') + '" data-mllead="' + m + '" aria-pressed="' + r.leads.includes(m) + '" style="--c:var(--tint);--t:var(--on-tint)">' + leadName(m) + '</button>').join('') + '</div></div>';
    h += '<div class="cell"><span class="grow"><span>' + t('rem.byName') + '</span><span class="st l2" style="display:block;font-size:13px">' + t('rem.byNameHint') + '</span></span>' +
      '<label class="sw"><input type="checkbox" data-ml="byName"' + (r.byName ? ' checked' : '') + ' aria-label="' + esc(t('rem.byName')) + '"><i></i></label></div>';
    if (test && remindAvailable()) h += '<button class="cell act" data-mltest>' + t('rem.test') + '</button>';
  }
  h += '</div><p class="ftr">' + (mode === 'quiet' ? t('rem.quietHint') : t('rem.hint', { from: r.quietFrom, to: r.quietTo })) + (remindAvailable() || mode === 'quiet' ? '' : ' ' + t('rem.webOnly')) + '</p>';
  // Мелета-тамагочи: рядом на занятии, по желанию слушает и говорит, как идёт (src/core/tama.js)
  const tmc = tamaOf(st), tsw = (k, on, label, hint = '') => '<div class="cell"><span class="grow"><span>' + label + '</span>' + (hint ? '<span class="st l2" style="display:block;font-size:13px;white-space:normal">' + hint + '</span>' : '') + '</span>' +
    '<label class="sw"><input type="checkbox" data-mltama="' + k + '"' + (on ? ' checked' : '') + ' aria-label="' + esc(label) + '"><i></i></label></div>';
  h += '<div class="hdr">' + t('tama.title') + '</div><div class="group">' + tsw('on', tmc.on, t('tama.on'), t('tama.onHint')) +
    (tmc.on ? tsw('listen', tmc.listen, t('tama.listen'), t('tama.listenHint')) + '<div class="cellcol"><span>' + t('tama.chat') + '</span><div style="margin-top:8px">' +
      seg('mltchat', [['normal', t('tama.chat.normal')], ['rare', t('tama.chat.rare')]], tmc.chat, t('tama.chat')) + '</div></div>' : '') +
    '</div><p class="ftr">' + t('tama.hint') + '</p>';
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
    } else if ((b = g('[data-seg="mltchat"] [data-v]'))) {
      st.tama = { ...tamaOf(st), chat: b.dataset.v }; save(); rerender();
    } else if ((b = g('[data-mllead]'))) {
      const m = +b.dataset.mllead, s = new Set(remindOf(st).leads);
      if (s.has(m) && s.size > 1) s.delete(m); else s.add(m);
      setRemind(st, { leads: LEADS.filter((x) => s.has(x)) });
      save(); rerender();
    } else if (g('[data-mltest]')) {
      const r = remindOf(st), c = r.custom[0] || { min: -60, tone: 'classic' };
      remindTest((x) => remindText(x, remindCtx(st)), r.mode, r.mode === 'pushy' ? 'morning' : r.mode === 'custom' ? (c.at ? 'abs' : 'rel:' + c.min) : 'lead:' + r.leads[0], c.tone).then((ok) => toast(t(ok ? 'rem.testSent' : 'rem.denied')));
    } else if (g('[data-mladd]')) {
      const r = remindOf(st);
      setRemind(st, { custom: [...r.custom, { min: -30, tone: 'classic' }] }); save(); rerender();
    } else if ((b = g('[data-mldel]'))) {
      const r = remindOf(st);
      setRemind(st, { custom: r.custom.filter((_, i) => i !== +b.dataset.mldel) }); save(); rerender();
    }
  });
  el.addEventListener('change', (e) => {
    const st = S(), d = e.target.dataset;
    if (d.ml === 'time' && e.target.value) { setRemind(st, { time: e.target.value }); save(); }
    else if (d.mltama) { st.tama = { ...tamaOf(st), [d.mltama]: e.target.checked }; save(); rerender(); }
    else if (d.ml === 'byName') { setRemind(st, { byName: e.target.checked }); save(); rerender(); }
    else if (d.mlwhen != null || d.mlat != null || d.mltone != null) {
      const r = remindOf(st), c = r.custom.map((x) => ({ ...x })), i = +(d.mlwhen ?? d.mlat ?? d.mltone), x = c[i];
      if (!x) return;
      if (d.mlwhen != null) { if (e.target.value === 'abs') { delete x.min; x.at = r.time; } else { delete x.at; x.min = +e.target.value; } }
      else if (d.mlat != null && e.target.value) x.at = e.target.value;
      else if (d.mltone != null) x.tone = e.target.value;
      setRemind(st, { custom: c }); save(); rerender();
    }
    else if (d.mlset) {
      const s = new Set(setsOf(st));
      if (e.target.checked) s.add(d.mlset); else if (s.size > 1) s.delete(d.mlset); else { e.target.checked = true; return; }
      st.qsets = [...QSETS, ...(st.quoteBooks || []).map((x) => 'own:' + x.id)].filter((k) => s.has(k));
      save();
    }
  });
}
