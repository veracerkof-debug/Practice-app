// Аккордовая дорожка: такты в ряд, в каждом — аккорды (ширина — длительность). Касание пустого места в такте —
// выбор аккорда (ступени тональности, остальные — по корню и виду), касание аккорда — сменить, удержание — убрать.
// Режим дорожки: держать, ритм (по доле), арпеджио (вверх, вниз, туда-обратно; шаг).
import { setChord, chordAt, removeChord, chordName, diatonicChords, MODES, ARP_DIRS, beatsOf } from '../../music/project.js';
import { CHORDS } from '../../music/theory.js';
import { holdMenu } from '../../ui/hold.js';

const NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

export function chordsHTML(ctx, p, tr) {
  const { t, ui } = ctx, bars = [];
  for (let b = 0; b < p.bars; b++) {
    const t0 = b * p.num, cs = tr.chords.filter((c) => c.t >= t0 && c.t < t0 + p.num);
    let cells = '', at = t0;
    cs.forEach((c) => {
      if (c.t > at) cells += '<button class="scgap" data-ct="' + at + '" data-cd="' + (c.t - at) + '" style="flex:' + (c.t - at) + '" aria-label="' + ui.esc(t('ch.add')) + '">+</button>';
      cells += '<button class="scch" data-ct="' + c.t + '" style="flex:' + Math.min(c.d, t0 + p.num - c.t) + ';--c:' + tr.color + '">' + ui.esc(chordName(c.pc, c.type, p.key.minor)) + '</button>';
      at = c.t + c.d;
    });
    if (at < t0 + p.num) cells += '<button class="scgap" data-ct="' + at + '" data-cd="' + (t0 + p.num - at) + '" style="flex:' + (t0 + p.num - at) + '" aria-label="' + ui.esc(t('ch.add')) + '">+</button>';
    bars.push('<div class="scbar" data-bar="' + b + '"><span class="scn num">' + (b + 1) + '</span><div class="sccells">' + cells + '</div></div>');
  }
  const mode = '<div class="scmode">' + ui.seg('scmode', MODES.map((m) => [m, t('mode.' + m)]), tr.mode, t('ch.mode')) +
    (tr.mode === 'arp' ? '<div class="scarp">' + ui.seg('scdir', ARP_DIRS.map((d) => [d, t('arp.' + d)]), tr.arp.dir, t('ch.dir')) + ui.seg('scstep', [['1', '♩'], ['0.5', '♪'], ['0.25', '♬']], String(tr.arp.step), t('ch.step')) + '</div>' : '') + '</div>';
  return '<div class="scwrap">' + mode + '<div class="scbars">' + bars.join('') + '</div><p class="ftr" style="margin:4px 8px">' + ui.esc(t('ch.hint')) + '</p></div>';
}

// Выбор аккорда для доли t длиной d. done() — после правки
export function chordPicker(ctx, p, tr, t, d, done) {
  const { t: T, ui } = ctx, dia = diatonicChords(p.key), cur = chordAt(tr, t);
  let root = cur ? cur.pc : dia[0].pc, type = cur ? cur.type : dia[0].type, len = cur ? cur.d : d;
  const lens = [[1, '1'], [2, '2'], [p.num, T('ch.bar')], [p.num * 2, '2 ' + T('ch.bars2')]].filter(([v], i, a) => a.findIndex(([x]) => x === v) === i);
  const body = () => ui.snav(T('ch.pick')) +
    '<div class="hdr">' + ui.esc(T('ch.inKey')) + '</div><div class="hscroll scdia">' + dia.map((c) => '<button class="pill' + (c.pc === root && c.type === type ? ' on' : '') + '" data-dia="' + c.pc + ':' + c.type + '" aria-pressed="' + (c.pc === root && c.type === type) + '"><small>' + c.rn + '</small>' + ui.esc(c.label) + '</button>').join('') + '</div>' +
    '<div class="hdr">' + ui.esc(T('ch.any')) + '</div><div class="hscroll">' + NAMES.map((n, pc) => '<button class="pill sm" data-root="' + pc + '" aria-pressed="' + (pc === root) + '">' + n + '</button>').join('') + '</div>' +
    '<div class="hscroll">' + CHORDS.map(([id, suf]) => '<button class="pill sm" data-type="' + id + '" aria-pressed="' + (id === type) + '">' + (suf || 'maj') + '</button>').join('') + '</div>' +
    '<div class="hdr">' + ui.esc(T('ch.len')) + '</div><div class="group"><div class="cellcol">' + ui.seg('sclen', lens.map(([v, l]) => [String(v), l]), String(len), T('ch.len')) + '</div></div>' +
    '<div class="group" style="margin-top:14px"><button class="cell act center b" data-ok>' + ui.esc(chordName(root, type, p.key.minor)) + ' · ' + ui.esc(T('ch.set')) + '</button>' + (cur ? '<button class="cell danger center" data-del>' + ui.esc(T('ch.remove')) + '</button>' : '') + '</div>';
  ui.sheet(body, (el, sh) => el.addEventListener('click', (e) => {
    let b;
    if ((b = e.target.closest('[data-dia]'))) { [root, type] = b.dataset.dia.split(':'); root = +root; sh.update(); }
    else if ((b = e.target.closest('[data-root]'))) { root = +b.dataset.root; sh.update(); }
    else if ((b = e.target.closest('[data-type]'))) { type = b.dataset.type; sh.update(); }
    else if ((b = e.target.closest('[data-seg="sclen"] [data-v]'))) { len = +b.dataset.v; sh.update(); }
    else if (e.target.closest('[data-ok]')) { setChord(tr, t, Math.min(len, beatsOf(p) - t), root, type); sh.close(); done(root, type); }
    else if (e.target.closest('[data-del]')) { if (cur) removeChord(tr, cur); sh.close(); done(); }
  }));
}

// Нажатия в редакторе аккордов. → true, если обработано
export function chordsAct(ctx, p, tr, e, done) {
  let b;
  if ((b = e.target.closest('[data-seg="scmode"] [data-v]'))) { tr.mode = b.dataset.v; done(); return true; }
  if ((b = e.target.closest('[data-seg="scdir"] [data-v]'))) { tr.arp.dir = b.dataset.v; done(); return true; }
  if ((b = e.target.closest('[data-seg="scstep"] [data-v]'))) { tr.arp.step = +b.dataset.v; done(); return true; }
  if ((b = e.target.closest('.scgap'))) { chordPicker(ctx, p, tr, +b.dataset.ct, +b.dataset.cd, done); return true; }
  if ((b = e.target.closest('.scch'))) { const c = chordAt(tr, +b.dataset.ct); chordPicker(ctx, p, tr, c.t, c.d, done); return true; }
  return false;
}
// Удержание аккорда — убрать
export function chordHold(ctx, p, tr, el, done) {
  const c = chordAt(tr, +el.dataset.ct);
  if (!c) return;
  holdMenu(el, [{ icon: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>', label: ctx.t('ch.remove'), danger: true, run: () => { removeChord(tr, c); done(); } }], chordName(c.pc, c.type, p.key.minor));
}
