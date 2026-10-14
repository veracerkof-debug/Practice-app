// Экран сессии: заголовок (свернуть, время и пауза, помодоро, завершить), рабочее пространство из окон
// с модулями, нижняя панель инструментов, жесты (перетащить инструмент на окно, поменять окна, двигать границы),
// завершение сессии, вопрос «Ты ещё играешь?», экран не гаснет.
// Перенесено из legacy/practice.html (startSession, openSession, sessionClick, renderWS, classify, paneMenu, layoutSheet,
// жесты DRG, finish, checkIdle, pchipHTML, pomoPanel, rotCheck).
import { mascotSVG } from '../../ui/mascot.js';
import '../../ui/session.css';
import { t } from '../../i18n/index.js';
import { esc, icb, sheet, snav, toast, leave } from '../../ui/index.js';
import { fmtDur, fmtClock } from '../format.js';
import { getPct, ensureLib } from '../library.js';
import { isOn } from '../settings.js';
import {
  createActive, isSameActive, elapsed, togglePause, touch, summarize, buildRecord,
  metroForSession, commitSession, saveActive, FREE_TAGS, trackMode,
} from '../session.js';
import {
  getWS, fixWS, lsizes, lpos, halves, setLayout, closePane, swapHalves, assign, swapPanes, dropTool, addPane, sizeOf, clampFrac, visible,
} from '../workspace.js';
import { modules, moduleById } from '../../modules/index.js';
import { mountModule, moduleName } from '../modules.js';
import { mInput, bindM } from './common.js';
import { freeTagName } from './panel.js';
import { clockNotice } from './clock.js';

const IC = {
  down: '<svg viewBox="0 0 24 24"><path d="M6 9.5l6 6 6-6"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  pomo: '<svg viewBox="0 0 24 24" class="pcico"><circle cx="12" cy="13" r="7.5"/><path d="M12 9.5V13l2.5 1.5M10 3h4"/></svg>',
};

/* ---------- группы окон ---------- */

const inSession = (st, m) => m.session !== false && isOn(st, m.id);
const groupOf = (m) => m.group || m.id;

// Окна сессии по порядку модулей: rhythm, keys, theory, audio, notes
export function sessionGroups(st) {
  const out = [];
  modules.forEach((m) => { if (inSession(st, m) && !out.includes(groupOf(m))) out.push(groupOf(m)); });
  return out.length ? out : ['rhythm'];
}

// Модули группы (окно старой «сессии с инструментом» — сам модуль)
function members(st, g) {
  const list = modules.filter((m) => !m.tab && groupOf(m) === g && inSession(st, m));
  if (list.length) return list;
  const m = moduleById(g);
  return m ? [m] : [];
}

const groupName = (st, g) => {
  const all = modules.filter((m) => !m.tab && groupOf(m) === g);
  return all.length > 1 ? t('group.' + g) : all.length ? moduleName(all[0]) : moduleById(g) ? moduleName(moduleById(g)) : g;
};
// Подпись на переключателе группы: «Пэды», а не «Дрон» (как в прототипе)
const subName = (m) => { const k = 'sub.' + m.id, v = t(k); return v === k ? moduleName(m) : v; };
const groupIcon = (g) => (modules.find((m) => groupOf(m) === g) || moduleById(g) || {}).icon || '';

// Какой модуль группы показать в окне размера size (пианино в четверти и полосе уступает пэдам — как в прототипе)
function pickModule(st, w, g, size) {
  const list = members(st, g);
  let m = list.find((x) => x.id === w.sub?.[g]) || list[0];
  if (m && m.groupSizes && !m.groupSizes.includes(size)) m = list.find((x) => !x.groupSizes || x.groupSizes.includes(size)) || m;
  return m;
}

/* ---------- сессия ---------- */

export function createSessionScreen(app) {
  const { store, device, audio } = app;
  const st = () => store.state.settings;
  let layer = null, wsEl = null, panes = [], w = null, tickT = 0, ro = null, wake = null, prevOpenTool = null;
  let DRG = null, dragSup = false;

  const song = () => (app.active && app.active.songId ? store.songById(app.active.songId) : null);
  const titleOf = (a) => (a.songId && song() ? song().title : a.type === 'tool' ? (moduleById(a.tool) ? moduleName(moduleById(a.tool)) : a.tool) : t('ses.free'));

  /* ---------- экран не гаснет ---------- */
  async function lockWake() { try { if (navigator.wakeLock) wake = await navigator.wakeLock.request('screen'); } catch { /* нет поддержки */ } }
  function releaseWake() { try { if (wake) wake.release(); } catch { /* ignore */ } wake = null; }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && app.active && !wake) lockWake(); });

  /* ---------- старт ---------- */
  function start(type, songId = null, tool = null) {
    const a = app.active;
    if (a) {
      if (!isSameActive(a, type, songId, tool)) toast(t('ses.finishFirst'));
      open();
      return;
    }
    const s = songId ? store.songById(songId) : null;
    if (app.clock && app.clock.bad) clockNotice(app); // занятие при сбитых часах не подтвердится — предупредить
    app.active = createActive({ type, songId, tool, mode: trackMode(st()) });
    audio.metro.cfg = metroForSession(s, st().metro);
    lockWake();
    open();
  }

  // После перезагрузки страницы: метроном песни и открытый экран сессии
  function resume() {
    if (!app.active) return;
    audio.metro.cfg = metroForSession(song(), st().metro);
    lockWake();
    open();
  }

  /* ---------- экран ---------- */
  function open() {
    if (!app.active) return;
    if (layer) return;
    const a = app.active, tm = a.type === 'tool', hide = st().showClock === false || !!st().toolsOnly;
    w = fixWS(getWS(device, a), sessionGroups(st()), a);
    layer = document.createElement('div');
    layer.innerHTML = '<div class="session' + (tm ? ' toolmode' : '') + '" role="dialog" aria-modal="true" aria-label="' + esc(t('ses.aria')) + '"><div class="sin">' +
      '<div class="shd">' + icb('data-s="hide"', IC.down, t('ses.hide'), 'sm') +
      '<button class="stime' + (a.mode === 'strict' ? ' gold' : '') + '" data-s="pause" id="stime" aria-label="' + esc(t('ses.pause')) + '"' + (a.mode === 'strict' ? ' title="' + esc(t('track.strictTitle')) + '"' : '') + '><i class="sdot"></i>' + (hide ? '' : '<span id="clk" class="num">00:00</span>') + '</button>' +
      (tm || !isOn(st(), 'timer') ? '<span></span>' : '<button class="pchip" data-s="pomo" id="pchip" aria-label="' + esc(t('ses.pomo')) + '">' + pchipHTML() + '</button>') +
      '<div class="stitle2">' + esc(titleOf(a)) + '</div>' + icb('data-s="finish"', IC.check, t(st().toolsOnly ? 'ses.close' : 'ses.finish'), 'sm done') + '</div>' +
      '<div class="ws"></div></div>' +
      (tm ? '' : '<div class="sdock"><div class="tbar" id="tpills" role="tablist" aria-label="' + esc(t('ses.tools')) + '">' +
        sessionGroups(st()).map((g) => '<button class="tb" data-pill="' + g + '" role="tab" aria-label="' + esc(groupName(st(), g)) + '" title="' + esc(groupName(st(), g)) + '">' + groupIcon(g) + '</button>').join('') +
        '</div></div>') + '</div>';
    document.body.appendChild(layer);
    wsEl = layer.querySelector('.ws');
    const ses = layer.querySelector('.session');
    ses.addEventListener('pointerdown', (e) => {
      if (app.active) { touch(app.active); saveActive(app.active); }
      const p = e.target.closest('.ws .pane');
      if (p) setFocus(+p.dataset.pane);
    });
    ses.addEventListener('click', onClick);
    prevOpenTool = app.openTool;
    app.openTool = openTool;
    renderWS();
    ro = new ResizeObserver(() => classify());
    ro.observe(wsEl);
    updClock();
    clearInterval(tickT);
    tickT = setInterval(tick, 500);
  }

  function unmountAll() {
    panes.forEach((p) => p.inst && p.inst.unmount());
    panes = [];
  }

  function hide() {
    if (!layer) return;
    unmountAll();
    if (ro) ro.disconnect();
    clearInterval(tickT);
    leave(layer.firstElementChild, 260);
    { const l = layer; setTimeout(() => l.remove(), 280); }
    layer = wsEl = null;
    app.openTool = prevOpenTool;
    app.render();
  }

  /* ---------- рабочее пространство ---------- */
  const saveWS = () => app.saveDevice();
  const GRIP = (i) => '<button class="grip" data-s="pmenu" data-p="' + i + '" aria-label="' + esc(t('ses.grip')) + '"></button>';

  function paneHTML(i, flex) {
    const sz = lsizes(w.layout)[i], multi = lsizes(w.layout).length > 1;
    return '<div class="pane toolhost ' + sz + (multi && w.focus === i ? ' focus' : '') + '" data-pane="' + i + '" data-group="' + w.panes[i] + '" style="flex:' + (flex == null ? 1 : flex) + ' 1 0px">' + GRIP(i) + '</div>';
  }

  // Содержимое окна: переключатель модулей группы (если их два) и место для модуля
  function fillPane(frame, i, size) {
    const g = w.panes[i], m = pickModule(st(), w, g, size), list = members(st(), g), big = size === 'full' || size === 'half';
    frame.querySelectorAll(':scope > :not(.grip)').forEach((x) => x.remove());
    let host;
    if (list.length > 1) {
      const comp = document.createElement('div');
      comp.className = 'comp ' + size;
      comp.innerHTML = '<div class="csw">' + list.map((x) => '<button class="cswb' + (x === m ? ' on' : '') + '" data-csub="' + x.id + '" aria-pressed="' + (x === m) + '" aria-label="' + esc(subName(x)) + '">' +
        x.icon + (big ? '<span>' + esc(subName(x)) + '</span>' : '') + '</button>').join('') + '</div><div class="cbody"></div>';
      frame.appendChild(comp);
      host = comp.querySelector('.cbody');
    } else {
      host = document.createElement('div');
      host.className = 'pbody';
      frame.appendChild(host);
    }
    const prev = panes[i];
    if (prev && prev.inst) prev.inst.unmount();
    panes[i] = { frame, mod: m, size, inst: m ? mountModule(app, m, host, size, frame) : null };
  }

  function renderWS(animIdx) {
    if (!wsEl) return;
    fixWS(w, sessionGroups(st()), app.active);
    unmountAll();
    if (w.layout === 'F') wsEl.innerHTML = paneHTML(0);
    else {
      const tc = w.layout[0] === 'H' ? 1 : 2, bc = w.layout[1] === 'H' ? 1 : 2;
      const dv = (o, d) => '<div class="wsdiv ' + o + '" data-d="' + d + '" role="separator" aria-label="' + esc(t('ses.divider')) + '"><span></span></div>';
      const half = (ch, idx, r, d, f) => '<div class="half ' + (ch === 'Q' ? 'row' : 'col') + '" data-h="' + d + '" style="flex:' + f + ' 1 0px">' +
        (idx.length === 1 ? paneHTML(idx[0]) : paneHTML(idx[0], r) + dv(ch === 'Q' ? 'v' : 'h', d) + paneHTML(idx[1], 1 - r)) + '</div>';
      wsEl.innerHTML = half(w.layout[0], tc === 1 ? [0] : [0, 1], w.rt || 0.5, 't', w.ratio) + dv('h main', 'main') + half(w.layout[1], bc === 1 ? [tc] : [tc, tc + 1], w.rb || 0.5, 'b', 1 - w.ratio);
    }
    const sizes = lsizes(w.layout);
    wsEl.querySelectorAll('.pane').forEach((p) => {
      const i = +p.dataset.pane;
      fillPane(p, i, measure(p) || sizes[i]);
      if (i === animIdx) p.classList.add('enter');
    });
    dockSel();
    rotCheck();
  }

  const measure = (p) => sizeOf(w.layout, p.offsetWidth, p.offsetHeight, wsEl.offsetWidth, wsEl.offsetHeight);

  // Размер окна — по его пикселям: при смене — модуль перерисовывается в новом размере
  function classify() {
    if (!wsEl) return;
    panes.forEach((p, i) => {
      if (!p) return;
      const s = measure(p.frame);
      if (!s || s === p.size) return;
      const want = pickModule(st(), w, w.panes[i], s);
      if (want !== p.mod || (members(st(), w.panes[i]).length > 1)) fillPane(p.frame, i, s);
      else { p.size = s; p.inst && p.inst.resize(s); }
    });
  }

  function setFocus(i) {
    if (w.focus === i) return;
    w.focus = i;
    saveWS();
    wsEl.querySelectorAll('.pane').forEach((p) => p.classList.toggle('focus', lsizes(w.layout).length > 1 && +p.dataset.pane === i));
    dockSel();
  }

  function dockSel() {
    if (!layer) return;
    const vis = visible(w);
    layer.querySelectorAll('#tpills .tb').forEach((b) => {
      const id = b.dataset.pill;
      b.setAttribute('aria-selected', w.panes[w.focus] === id);
      b.classList.toggle('used', vis.includes(id) && w.panes[w.focus] !== id);
    });
  }

  // Повернуть весь экран сессии (пианино: «Поворот — весь экран»)
  function rotCheck() {
    const s = layer && layer.querySelector('.session');
    if (!s) return;
    const dir = panes.map((p) => p && p.inst && p.mod.rotate && p.mod.rotate(p.inst.ctx)).find(Boolean) || null;
    s.classList.toggle('rot', !!dir);
    s.classList.toggle('rotl', dir === 'l');
    s.style.width = dir ? innerHeight + 'px' : '';
    s.style.height = dir ? innerWidth + 'px' : '';
  }

  function relayout(fn, ...args) {
    const idx = fn(w, ...args);
    saveWS();
    renderWS(typeof idx === 'number' ? idx : undefined);
  }

  // Открыть инструмент из модуля или нижней панели: окно с ним получает фокус, иначе он встаёт в окно в фокусе
  function openTool(id) {
    const a = app.active;
    if (a && a.type === 'tool') { if (id !== a.tool) toast(t('ses.toolOutside', { name: moduleById(id) ? moduleName(moduleById(id)) : id })); return; }
    if (id === 'timer') { pomoSheet(); return; }
    const m = moduleById(id);
    if (m && m.session === false) { toast(t('ses.toolOutside', { name: moduleName(m) })); return; }
    const g = m ? groupOf(m) : id;
    if (m && m.group) w.sub[m.group] = m.id;
    const vi = visible(w).indexOf(g);
    if (vi >= 0) { w.focus = vi; saveWS(); renderWS(vi); }
    else relayout(assign, g);
  }

  /* ---------- нажатия ---------- */
  function onClick(e) {
    if (dragSup) { dragSup = false; return; }
    const pill = e.target.closest('[data-pill]');
    if (pill) { openTool(pill.dataset.pill); return; }
    const cs = e.target.closest('.csw [data-csub]');
    if (cs) {
      const i = +cs.closest('.pane').dataset.pane;
      w.sub[w.panes[i]] = cs.dataset.csub;
      saveWS();
      fillPane(panes[i].frame, i, panes[i].size);
      rotCheck();
      return;
    }
    const b = e.target.closest('[data-s]');
    if (!b) return;
    const a = b.dataset.s;
    if (a === 'pmenu') { paneMenu(+b.dataset.p); return; }
    if (a === 'pause') {
      audio.metro.flush(); // темп до паузы засчитан, пауза — нет
      togglePause(app.active);
      saveActive(app.active);
      updClock();
    } else if (a === 'pomo') pomoSheet();
    else if (a === 'hide') hide();
    else if (a === 'finish') finish();
  }

  /* ---------- шторки окон ---------- */
  function paneMenu(i) {
    const sz = lsizes(w.layout)[i], id = w.panes[i], multi = w.layout !== 'F';
    const it = (k, n, cls) => '<button class="cell' + (cls ? ' ' + cls : '') + '" data-pm="' + k + '"><span class="grow">' + n + '</span></button>';
    sheet(() => snav(groupName(st(), id)) + '<div class="group">' +
      (multi ? it('full', t('pm.full')) : '') +
      (sz === 'full' || sz === 'half' ? it('addb', t('pm.addBottom')) + (sz === 'half' ? it('addr', t('pm.addRight')) : '') : '') +
      (multi ? it('swap', t('pm.swap')) : '') + it('schemes', t('pm.schemes')) + (multi ? it('close', t('pm.close'), 'danger') : '') + '</div>' +
      '<p class="ftr">' + t('pm.hint') + '</p>',
    (el, sh) => el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pm]');
      if (!b) return;
      const k = b.dataset.pm;
      sh.close();
      if (k === 'full') relayout(setLayout, 'F', [id]);
      else if (k === 'addb' || k === 'addr') {
        const r = addPane(w, i, k === 'addb' ? 'bottom' : 'right');
        if (r === null) toast(t('pm.allShown'));
        else { saveWS(); renderWS(r); }
      } else if (k === 'close') relayout(closePane, i);
      else if (k === 'swap') relayout(swapHalves);
      else if (k === 'schemes') layoutSheet();
    }));
  }

  function layoutSheet() {
    const prev = (l) => '<div class="lprev2">' + lpos(l).map((g) => '<i style="grid-area:' + g + '"></i>').join('') + '</div>';
    const OPT = [['H', t('lay.half')], ['Q', t('lay.quarters')], ['S', t('lay.strips')]];
    const body = () => {
      const l = w.layout, top = l === 'F' ? null : l[0], bot = l === 'F' ? null : l[1];
      return snav(t('lay.title')) + '<div class="lhead">' + prev(l) + '<button class="lopt' + (l === 'F' ? ' on' : '') + '" data-lf aria-pressed="' + (l === 'F') + '">' + t('lay.full') + '</button></div>' +
        '<div class="hdr">' + t('lay.top') + '</div><div class="group"><div class="cellcol"><div class="seg" role="group" aria-label="' + t('lay.top') + '">' + OPT.map(([k, n]) => '<button data-lt="' + k + '" aria-pressed="' + (top === k) + '">' + n + '</button>').join('') + '</div></div></div>' +
        '<div class="hdr">' + t('lay.bottom') + '</div><div class="group"><div class="cellcol"><div class="seg" role="group" aria-label="' + t('lay.bottom') + '">' + OPT.map(([k, n]) => '<button data-lb="' + k + '" aria-pressed="' + (bot === k) + '">' + n + '</button>').join('') + '</div></div></div>' +
        '<p class="ftr">' + t('lay.hint') + '</p>';
    };
    sheet(body, (el, sh) => el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-lt],[data-lb],[data-lf]');
      if (!b) return;
      let l = w.layout === 'F' ? 'HH' : w.layout;
      if (b.hasAttribute('data-lf')) l = 'F';
      else if (b.dataset.lt) l = b.dataset.lt + l[1];
      else l = l[0] + b.dataset.lb;
      w.layout = l;
      w.focus = 0;
      saveWS();
      sh.update();
      renderWS();
    }));
  }

  /* ---------- помодоро ---------- */
  function pchipHTML() {
    const po = app.pomodoro;
    if (!po.active()) return IC.pomo;
    const tot = po.total(), rem = po.rem(), C = 2 * Math.PI * 8;
    return '<svg viewBox="0 0 20 20" class="pcring"><circle cx="10" cy="10" r="8" fill="none" stroke="var(--fill2)" stroke-width="3"/><circle cx="10" cy="10" r="8" fill="none" stroke="' +
      (po.phase === 'work' ? 'var(--tint)' : '#5F8568') + '" stroke-width="3" stroke-dasharray="' + C * (1 - rem / tot) + ' ' + C + '" transform="rotate(-90 10 10)"/></svg><span class="num">' + fmtClock(rem) + '</span>';
  }

  function pomoSheet() {
    const timer = moduleById('timer');
    if (!timer) return;
    let inst = null;
    sheet(() => snav(moduleName(timer)) + '<div class="toolhost pomohost"></div>', (el) => {
      inst = mountModule(app, timer, el.querySelector('.pomohost'), 'full');
    }, { onClose: () => inst && inst.unmount() });
  }

  /* ---------- время, бездействие ---------- */
  function updClock() {
    const a = app.active;
    if (!a || !layer) return;
    const c = layer.querySelector('#clk');
    if (c) c.textContent = fmtClock(elapsed(a));
    const s = layer.querySelector('#stime');
    if (s) { s.classList.toggle('paused', !!a.pausedAt); s.setAttribute('aria-label', t(a.pausedAt ? 'ses.resume' : 'ses.pause')); }
  }

  function tick() {
    updClock();
    const pc = layer && layer.querySelector('#pchip');
    if (pc) { const h = pchipHTML(); if (pc.dataset.h !== h) { pc.dataset.h = h; pc.innerHTML = h; } }
    rotCheck();
  }

  // Завершение по бездействию без ответа: сессия сохраняется сама, время — до последнего действия
  function autoEnd(endAt) {
    const a = app.active;
    if (!a) return;
    if (audio.metro.running) audio.metro.stop();
    audio.metro.flush();
    const sum = summarize(a, { endAt, mic: app.activity.listening });
    if (!sum.short) commitSession(store, buildRecord(a, { dur: sum.dur, best: sum.best, quiet: sum.quiet, endAt }));
    app.pomodoro.reset();
    end();
    toast(sum.short ? t('idle.ended0') : t('idle.ended', { d: fmtDur(sum.dur) }));
  }

  /* ---------- завершение ---------- */
  function end() {
    hide();
    app.active = null;
    audio.metro.cfg = st().metro;
    releaseWake();
    app.render();
  }

  function finish(endAt = null) {
    const a = app.active;
    if (!a) return;
    if (audio.metro.running) audio.metro.stop();
    audio.metro.flush();
    // «Только инструменты»: рабочее место просто закрывается, в статистику ничего не пишется
    if (st().toolsOnly) { end(); return; }
    const sum = summarize(a, { endAt, mic: app.activity.listening }), s = song();
    if (sum.short) {
      sheet(() => snav(t('fin.shortTitle'), { right: '<span></span>' }) + '<p style="text-align:center;margin:8px 8px 20px" class="l2">' + t('fin.shortText') + '</p>' +
        '<button class="btn fill block" data-k="back">' + t('fin.continue') + '</button><button class="btn block" data-k="drop" style="margin-top:10px;color:var(--red)">' + t('fin.drop') + '</button>',
      (el, sh) => el.addEventListener('click', (e) => {
        const k = e.target.closest('[data-k]');
        if (!k) return;
        sh.close();
        if (k.dataset.k === 'drop') end();
      }));
      return;
    }
    let tag = '', readM = null;
    sheet(() => snav(t('fin.title'), { left: '<button class="link l" data-k="back">' + t('ui.back') + '</button>', right: '<button class="link b r" data-k="save">' + t('fin.save') + '</button>' }) +
      // Мелета радуется занятию (выключается вместе со словом дня)
      (isOn(st(), 'quote') ? '<div style="display:flex;justify-content:center;margin:2px 0 -6px">' + mascotSVG(sum.dur >= 1200 ? 'happy' : 'glad', { size: 64 }) + '</div>' : '') +
      '<div style="text-align:center;margin:4px 0 18px"><div class="num' + (a.mode === 'strict' ? ' gold' : '') + '" style="font-size:44px;font-weight:300;letter-spacing:-.03em">' + fmtDur(sum.dur) + '</div><div class="l2" style="font-size:15px">' +
      esc(titleOf(a)) + (sum.best ? t('fin.upTo', { bpm: sum.best }) : '') + '</div></div>' +
      (s ? '<div class="hdr">' + t('fin.songNow') + '</div><div class="group"><div class="cellcol">' + mInput(getPct(s), st()) + '</div><label class="cell"><span class="grow">' + t('fin.confident') +
        '</span><input class="inp num" id="cb" type="number" inputmode="numeric" min="20" max="300" placeholder="bpm" aria-label="' + t('fin.confident') + '" value="' + (sum.best || s.currentBpm || '') + '"></label></div>'
        : a.type === 'tool' ? '' : '<div class="hdr">' + t('fin.what') + '</div><div class="group"><div class="cellcol"><div class="hscroll" style="padding:0;flex-wrap:wrap" id="tg">' +
          FREE_TAGS.map((x) => '<button type="button" class="pill" aria-pressed="false" data-t="' + x + '">' + esc(freeTagName(x)) + '</button>').join('') + '</div></div></div>') +
      '<div class="hdr">' + t('fin.note') + '</div><div class="group"><textarea class="ta" id="nt" style="min-height:80px;font-family:var(--font);font-size:16px" aria-label="' + t('fin.note') + '" placeholder="' + t('fin.notePh') + '"></textarea></div>',
    (el, sh) => {
      if (s) readM = bindM(el, st());
      el.addEventListener('click', (e) => {
        const tg = e.target.closest('[data-t]');
        if (tg) { tag = tag === tg.dataset.t ? '' : tg.dataset.t; el.querySelectorAll('[data-t]').forEach((c) => c.setAttribute('aria-pressed', c.dataset.t === tag)); return; }
        const k = e.target.closest('[data-k]');
        if (!k) return;
        if (k.dataset.k === 'back') { sh.close(); return; }
        // сессию уже завершило бездействие, пока окно было открыто
        if (app.active !== a) { sh.close(); return; }
        const rec = buildRecord(a, { dur: sum.dur, best: sum.best, quiet: sum.quiet, endAt, tag, note: el.querySelector('#nt').value });
        commitSession(store, rec, s ? { masteryPct: readM(), confidentBpm: parseInt((el.querySelector('#cb') || {}).value, 10), metro: audio.metro.cfg } : null);
        app.pomodoro.reset();
        sh.close();
        end();
        toast(t('fin.saved', { d: fmtDur(rec.dur) }));
      });
    });
  }

  /* ---------- жесты: инструмент из панели на окно, окно на окно, границы ---------- */
  const zoneOf = (p, x, y, kind) => {
    const r = p.getBoundingClientRect(), rx = (x - r.left) / r.width, ry = (y - r.top) / r.height, sz = p.dataset.size;
    if (kind === 'pane' || sz === 'quarter' || sz === 'strip') return 'center';
    if (ry < 0.32) return 'top';
    if (ry > 0.68) return 'bottom';
    if (sz === 'half') { if (rx < 0.3) return 'left'; if (rx > 0.7) return 'right'; }
    return 'center';
  };
  const clearDrop = () => wsEl && wsEl.querySelectorAll('.pane[data-drop]').forEach((p) => p.removeAttribute('data-drop'));
  const divFrac = (d, x, y) => {
    if (d.d === 'main') { const r = wsEl.getBoundingClientRect(); return (y - r.top) / r.height; }
    const hf = d.el.parentNode, r = hf.getBoundingClientRect();
    return hf.classList.contains('row') ? (x - r.left) / r.width : (y - r.top) / r.height;
  };
  const applyFrac = (d, f) => {
    const c = clampFrac(f), set = (els) => { if (els[0]) els[0].style.flex = c + ' 1 0px'; if (els[1]) els[1].style.flex = 1 - c + ' 1 0px'; };
    if (d.d === 'main') set(wsEl.querySelectorAll(':scope>.half'));
    else set(d.el.parentNode.querySelectorAll(':scope>.pane'));
  };

  document.addEventListener('pointerdown', (e) => {
    if (!layer || !e.target.closest) return;
    const dv = e.target.closest('.wsdiv');
    if (dv) { e.preventDefault(); DRG = { kind: 'div', d: dv.dataset.d, pid: e.pointerId, x0: e.clientX, y0: e.clientY, on: false, el: dv }; return; }
    const tb = e.target.closest('.sdock .tb[data-pill]'), gp = e.target.closest('.ws .grip');
    if (!tb && !gp) return;
    DRG = { kind: tb ? 'tool' : 'pane', id: tb ? tb.dataset.pill : null, src: gp ? +gp.dataset.p : null, x0: e.clientX, y0: e.clientY, pid: e.pointerId, on: false };
  }, true);

  document.addEventListener('pointermove', (e) => {
    if (!DRG || e.pointerId !== DRG.pid) return;
    const dx = e.clientX - DRG.x0, dy = e.clientY - DRG.y0;
    if (DRG.kind === 'div') {
      if (!DRG.on && Math.hypot(dx, dy) < 6) return;
      DRG.on = true;
      DRG.el.classList.add('active');
      DRG.f = divFrac(DRG, e.clientX, e.clientY);
      applyFrac(DRG, DRG.f);
      return;
    }
    if (!DRG.on) {
      if (Math.hypot(dx, dy) < 12) return;
      if (DRG.kind === 'tool' && !(dy < -10 && Math.abs(dy) > Math.abs(dx))) return; // инструмент тянется вверх, вбок — прокрутка панели
      DRG.on = true;
      const g = document.createElement('div');
      g.className = 'dghost';
      const id = DRG.kind === 'tool' ? DRG.id : w.panes[DRG.src];
      g.innerHTML = (DRG.kind === 'tool' ? groupIcon(id) : '') + '<span>' + esc(groupName(st(), id)) + '</span>';
      document.body.appendChild(g);
      DRG.g = g;
    }
    DRG.g.style.left = e.clientX + 'px';
    DRG.g.style.top = e.clientY + 'px';
    clearDrop();
    const el = document.elementFromPoint(e.clientX, e.clientY), p = el && el.closest ? el.closest('.ws .pane') : null;
    DRG.target = null;
    if (p && !(DRG.kind === 'pane' && +p.dataset.pane === DRG.src)) {
      const z = zoneOf(p, e.clientX, e.clientY, DRG.kind);
      p.setAttribute('data-drop', z);
      DRG.target = { i: +p.dataset.pane, z };
    }
  }, { passive: true });

  function endDrag(e) {
    if (!DRG || e.pointerId !== DRG.pid) return;
    const d = DRG;
    DRG = null;
    if (d.kind === 'div') {
      d.el.classList.remove('active');
      const H = halves(w);
      if (!H) return;
      // Нажатие без движения — поменять местами половины или окна в половине
      if (!d.on) {
        if (d.d === 'main') relayout(swapHalves);
        else {
          const isT = d.d === 't', arr = (isT ? H.top : H.bot).slice().reverse();
          relayout(setLayout, H.t + H.b, isT ? arr.concat(H.bot) : H.top.concat(arr));
        }
        return;
      }
      const f = d.f;
      if (d.d === 'main') {
        if (f < 0.1) relayout(setLayout, H.bot.length === 1 ? 'F' : 'HH', H.bot);
        else if (f > 0.9) relayout(setLayout, H.top.length === 1 ? 'F' : 'HH', H.top);
        else { w.ratio = clampFrac(f); saveWS(); classify(); }
        return;
      }
      const isT = d.d === 't', arr = isT ? H.top : H.bot;
      if (f < 0.1 || f > 0.9) {
        const keep = [arr[f < 0.1 ? 1 : 0]];
        relayout(setLayout, isT ? 'H' + H.b : H.t + 'H', isT ? keep.concat(H.bot) : H.top.concat(keep));
        return;
      }
      w[isT ? 'rt' : 'rb'] = clampFrac(f);
      saveWS();
      classify();
      return;
    }
    if (!d.on) return;
    dragSup = true;
    setTimeout(() => { dragSup = false; }, 60);
    if (d.g) d.g.remove();
    clearDrop();
    if (!d.target) return;
    if (d.kind === 'tool') relayout(dropTool, d.id, d.target.i, d.target.z);
    else { swapPanes(w, d.src, d.target.i); w.focus = d.target.i; saveWS(); renderWS(d.target.i); }
  }
  document.addEventListener('pointerup', endDrag, true);
  document.addEventListener('pointercancel', endDrag, true);

  ensureLib(store.state, t);
  return { start, resume, open, hide, finish, autoEnd, get isOpen() { return !!layer; } };
}
