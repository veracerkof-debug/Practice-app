// Выбор лада в настройках глайдера и терменвокса: обычные лады, народные (с микроинтервалами) по традициям
// и свой лад — ступени в центах. attr — атрибут списка (data-gsc / data-tsc): модуль сам ставит s.scale по change.
import { SCALE_TYPES } from '../music/theory.js';
import { FOLK, folkCents, cleanCustom, folkId } from '../music/folk.js';
import { esc } from './index.js';

// Название лада для подписей
export const scaleLabel = (t, id) => (id === 'custom' ? t('folk.custom') : folkCents(id) ? t('folk.' + folkId(id)) : t('scale.' + id));

export function scaleSelectHTML(t, s, attr) {
  const cur = folkId(s.scale), o = (v, n) => '<option value="' + v + '"' + (cur === v ? ' selected' : '') + '>' + esc(n) + '</option>';
  return '<select class="sortsel glsel" ' + attr + ' aria-label="' + esc(t('notes')) + '">' + o('chrom', t('chrom')) +
    '<optgroup label="' + esc(t('folkg.west')) + '">' + SCALE_TYPES.map((k) => o(k, t('scale.' + k))).join('') + '</optgroup>' +
    FOLK.map(([g, list]) => '<optgroup label="' + esc(t('folkg.' + g)) + '">' + list.map(([id]) => o(id, t('folk.' + id))).join('') + '</optgroup>').join('') +
    '<optgroup label="' + esc(t('folkg.own')) + '">' + o('custom', t('folk.custom')) + '</optgroup></select>';
}

// Ступени выбранного народного или своего лада — строкой чисел; у своего — правка каждой ступени
export function folkInfoHTML(t, s, ui) {
  const c = folkCents(s.scale, s);
  if (!c) return '';
  if (s.scale !== 'custom') return '<div class="segcap num">' + c.join(' · ') + ' ¢</div>';
  const row = (v, i) => '<div class="fcrow"><span class="grow num">' + (i + 1) + '</span>' + (i ? ui.icb('data-fcs="' + i + '" data-d="-10"', '−', t('folk.down'), 'sm txt') +
    '<input type="number" class="fcinp num" min="1" max="1199" step="1" value="' + v + '" data-fci="' + i + '" aria-label="' + esc(t('folk.step', { n: i + 1 })) + '">' +
    ui.icb('data-fcs="' + i + '" data-d="10"', '+', t('folk.up'), 'sm txt') + ui.icb('data-fcdel="' + i + '"', '×', t('folk.del'), 'sm txt') : '<b class="num fcinp">0</b>') + '</div>';
  return '<div class="segcap">' + t('folk.customHint') + '</div><div class="fclist">' + c.map(row).join('') + '</div><div class="fcacts">' +
    (c.length < 12 ? '<button class="lchip pick" data-fcadd style="--c:var(--tint);--t:var(--on-tint)">' + t('folk.add') + '</button>' : '') +
    '<button class="lchip pick" data-fcfrom style="--c:var(--tint);--t:var(--on-tint)">' + t('folk.fromRast') + '</button></div>';
}

// Нажатия и правка своего лада. → true, если лад изменился (модуль сохраняет и перерисовывает)
export function folkAct(e, s) {
  const c = cleanCustom(s.custom), b = e.target.closest('[data-fcs], [data-fcdel], [data-fcadd], [data-fcfrom]');
  if (e.type === 'change' && e.target.matches('[data-fci]')) {
    c[+e.target.dataset.fci] = Math.max(1, Math.min(1199, Math.round(+e.target.value || 0)));
    s.custom = cleanCustom(c);
    return true;
  }
  if (!b) return false;
  if (b.dataset.fcs != null) c[+b.dataset.fcs] = Math.max(1, Math.min(1199, c[+b.dataset.fcs] + +b.dataset.d));
  else if (b.dataset.fcdel != null) c.splice(+b.dataset.fcdel, 1);
  else if (b.hasAttribute('data-fcadd')) c.push(Math.min(1199, Math.round((c[c.length - 1] + 1200) / 2)));
  else c.splice(0, c.length, ...folkCents('rast'));
  s.custom = cleanCustom(c);
  return true;
}
