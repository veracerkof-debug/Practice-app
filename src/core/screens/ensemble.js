// «Ансамбль» (src/core/ensemble.js): компьютер ведёт дубль — список телефонов, «Запись»/«Стоп», сборка проекта;
// телефон — своя партия, счёт «3, 2, 1», запись и отправка. Счёт и время записи обновляются сами, без перерисовки шторки.
import { t } from '../../i18n/index.js';
import { esc, sheet, snav, seg, sw, toast } from '../../ui/index.js';
import { PARTS, countNum } from '../ensemble.js';
import { pcOf } from '../sync.js';

const mmss = (s) => { s = Math.max(0, Math.floor(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const partSeg = (cur) => seg('enspart', PARTS.map((p) => [p, t('ens.part.' + p)]), cur, t('ens.partLbl'));

export function ensembleSheet(app) {
  return app.ens ? hostSheet(app) : clientSheet(app);
}

/* ---------- компьютер ---------- */
function hostSheet(app) {
  const E = app.ens, S = app.syncSrv;
  E.open();
  const big = () => {
    const ph = E.phase;
    if (ph === 'count') { const n = countNum(E.goAt - Date.now()); return n == null ? '' : n === 0 ? t('ens.go') : String(n); }
    if (ph === 'rec' || ph === 'end') return mmss((Date.now() - E.goAt) / 1000);
    return '';
  };
  const status = () => {
    const ph = E.phase, w = E.work, T = E.takes[E.take];
    if (ph === 'arm') return t('ens.arming');
    if (ph === 'count') return t('ens.counting');
    if (ph === 'rec' || ph === 'end') return t('ens.recording');
    if (w) return t(w.stage === 'clean' ? 'ens.cleaning' : 'ens.aligning', { n: w.done, m: w.total });
    if (ph === 'collect' && T) {
      if (T.err) return t('ens.failed');
      if (T.project) return t('ens.done') + (T.clean ? ' ' + t('ens.cleanDone') : '') + (T.approx && T.approx.length ? ' ' + t('ens.approx', { who: T.approx.join(', ') }) : '');
      const all = E.members().filter((m) => m.takes.includes(E.take)), got = all.filter((m) => m.got[E.take]);
      return t('ens.collecting', { n: got.length, m: all.length });
    }
    return E.members().length ? t('ens.ready') : t('ens.waitPhones');
  };
  const row = (m) => '<div class="cell"><span class="grow">' + esc(m.name) + '<span class="enssub">' + esc(t('ens.part.' + m.part)) + '</span></span><span class="ensst" data-st="' + m.st + '">' + esc(t('ens.st.' + m.st)) + '</span></div>';
  const api = sheet(() => {
    const st = S.state, ph = E.phase, T = E.takes[E.take], on = st.on, recOn = ph === 'count' || ph === 'rec' || ph === 'arm' || ph === 'end';
    const members = E.members(), waiting = ph === 'collect' && T && !T.project && !E.work && members.some((m) => m.got[E.take]) && members.some((m) => m.takes.includes(E.take) && !m.got[E.take]);
    return snav(t('ens.title')) +
      (!on ? '<p class="l2 ensp">' + t('ens.hostOff') + '</p><button class="btn fill wide" data-ens="srv">' + t('ens.srvOn') + '</button>'
        : '<p class="l2 ensp">' + t('ens.hostHint', { addr: esc(st.ips[0] || '—'), code: esc(st.code.slice(0, 3) + ' ' + st.code.slice(3)) }) + '</p>' +
          '<div class="ensbig num" data-ensbig aria-live="polite">' + esc(big()) + '</div><p class="ensstat" data-ensstat>' + esc(status()) + '</p>' +
          (recOn ? '<button class="btn ensstop wide ensbtn" data-ens="stop">' + t('ens.stop') + '</button>'
            : '<button class="btn fill wide ensbtn" data-ens="rec"' + (E.work || !members.some((m) => m.st !== 'lost') ? ' disabled' : '') + '>' + t('ens.rec') + '</button>') +
          (waiting ? '<button class="btn wide" data-ens="now" style="margin-top:8px">' + t('ens.buildNow') + '</button>' : '') +
          (T && T.err && !E.work ? '<button class="btn wide" data-ens="now" style="margin-top:8px">' + t('ens.retry') + '</button>' : '') +
          (T && T.project && !T.clean && !E.work && app.jobs.supported() ? '<button class="btn wide" data-ens="clean" style="margin-top:8px">' + t('ens.cleanNow') + '</button>' : '') +
          '<div class="hdr">' + t('ens.phones') + '</div><div class="group">' + (members.length ? members.map(row).join('') : '<div class="cell l2">' + t('ens.none') + '</div>') + '</div>' +
          (app.jobs.supported() ? '<div class="group"><div class="cell"><span class="grow">' + t('ens.clean') + '<span class="enssub">' + t('ens.cleanHint') + '</span></span>' + sw('ensclean', app.store.state.settings.ensClean !== false, t('ens.clean')) + '</div></div>' : '') +
          '<p class="ftr">' + t('ens.hostFtr') + '</p>');
  }, null, { onClose: () => { un(); cancelAnimationFrame(raf); if (!(E.phase === 'arm' || E.phase === 'count' || E.phase === 'rec' || E.phase === 'end') && !E.work) E.close(); } });
  const un = E.subscribe(() => api.update()), un2 = S.subscribe(() => api.update());
  let raf = 0;
  const live = () => { const b = api.el.querySelector('[data-ensbig]'); if (b) { const v = big(); if (b.textContent !== v) b.textContent = v; } raf = requestAnimationFrame(live); };
  live();
  api.el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ens]');
    if (!b) return;
    const a = b.dataset.ens;
    if (a === 'srv') S.start().then(() => api.update()).catch(() => toast(t('sy.err.port')));
    else if (a === 'rec') E.record();
    else if (a === 'stop') E.stop();
    else if (a === 'now') E.assemble().catch(() => toast(t('ens.failed')));
    else if (a === 'clean') E.clean().catch(() => {});
  });
  api.el.addEventListener('change', (e) => { if (e.target.dataset.sw === 'ensclean') { app.store.state.settings.ensClean = e.target.checked; app.store.settingsChanged(); } });
  const unAll = () => { un2(); };
  const prevClose = api.close; api.close = () => { unAll(); prevClose(); };
  return api;
}

/* ---------- телефон ---------- */
function clientSheet(app) {
  const C = app.ensCli, S = C.S;
  const big = () => {
    if (S.recording && (S.phase === 'count')) { const n = countNum(C.left()); return n == null ? '' : n === 0 ? t('ens.go') : String(n); }
    if (S.recording) { const l = C.left(); return l != null && l < 0 ? mmss(-l / 1000) : ''; }
    if (S.up != null) return Math.round(S.up * 100) + ' %';
    return '';
  };
  const status = () => {
    if (!pcOf()) return t('ens.noPc');
    if (S.err === 'mic') return t('ens.err.mic');
    if (S.err === 'send') return t('ens.err.send');
    if (!S.conn) return t(S.err === 'hostoff' ? 'ens.err.hostoff' : 'ens.err.conn');
    if (S.recording) return S.phase === 'count' ? t('ens.counting') : t('ens.recording');
    if (S.up != null) return t('ens.sending');
    if (S.sent && S.sent === S.saved) return t('ens.sent');
    return t('ens.waitStart');
  };
  const api = sheet(() => snav(t('ens.title')) +
    (pcOf() ? '<p class="l2 ensp">' + t('ens.pcName', { name: esc(pcOf().name) }) + '</p>' : '') +
    '<div class="ensbig num" data-ensbig aria-live="polite">' + esc(big()) + '</div><p class="ensstat" data-ensstat>' + esc(status()) + '</p>' +
    (S.recording && !S.conn ? '<button class="btn ensstop wide ensbtn" data-ens="stop">' + t('ens.stopHere') + '</button>' : '') +
    (S.err === 'send' && S.unsent ? '<button class="btn wide ensbtn" data-ens="resend">' + t('ens.resend') + '</button>' : '') +
    '<div class="hdr">' + t('ens.partLbl') + '</div>' + partSeg(C.part()) +
    '<p class="ftr">' + t('ens.phoneFtr') + '</p>', null, { onClose: () => { un(); cancelAnimationFrame(raf); C.leave(); } });
  const un = C.subscribe(() => {
    // часто: только число и строка состояния; остальное — когда меняется вид
    const key = [S.conn, S.recording, S.err, S.up != null, S.sent, S.unsent, C.part()].join('|');
    if (key !== api._k) { api._k = key; api.update(); return; }
    const s = api.el.querySelector('[data-ensstat]'); if (s) s.textContent = status();
  });
  let raf = 0;
  const live = () => { const b = api.el.querySelector('[data-ensbig]'); if (b) { const v = big(); if (b.textContent !== v) b.textContent = v; } raf = requestAnimationFrame(live); };
  live();
  api.el.addEventListener('click', (e) => {
    const p = e.target.closest('[data-seg="enspart"] button');
    if (p) { if (!S.recording) C.setPart(p.dataset.v); return; }
    const b = e.target.closest('[data-ens]');
    if (!b) return;
    if (b.dataset.ens === 'stop') C.stopNow();
    if (b.dataset.ens === 'resend') C.resend();
  });
  C.join();
  return api;
}
