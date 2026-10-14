// Диктофон: запись с выбранного входа (микрофон телефона, гарнитура, Bluetooth, USB — и приёмники петличек
// Hollyland, DJI и других), воспроизведение на выбранный выход, простая обработка: обрезка, срез низа, шумоподавление,
// гейт, компрессия, усиление и нормализация, лёгкая реверберация. Готовая запись — в медиатеку (WAV).
// До записи: вход слушается сразу — мини-окно спектра и уровня, обработка (усиление, эквалайзер, срез низа,
// компрессия, реверберация) звучит вживую в наушниках; в файл пишется исходник, обработка с теми же настройками
// применяется при сохранении. Кнопка записи — внизу, под рукой.
// Звук не покидает устройство. Движок — src/audio/voiceengine.js, обработка — src/audio/voicefx.js и livefx.js.
import ru from './i18n/ru.json';
import uz from './i18n/uz.json';
import en from './i18n/en.json';
import el from './i18n/el.json';
import './voice.css';
import { engine, isLav, KIND } from '../../audio/voiceengine.js';
import { decodeWav, encodeWav, process, peaks, spectrumDb, eqResponse, EQ_BANDS, EQ_PRESETS } from '../../audio/voicefx.js';
import { createLiveFx, openInput, setOutput, levelOf } from '../../audio/livefx.js';

const ICON = '<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/></svg>';
const I = {
  rec: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7" fill="currentColor" stroke="none"/></svg>',
  stop: '<svg viewBox="0 0 24 24"><rect x="6.5" y="6.5" width="11" height="11" rx="2" fill="currentColor" stroke="none"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><rect x="6" y="5" width="4.2" height="14" rx="1.4" fill="currentColor" stroke="none"/><rect x="13.8" y="5" width="4.2" height="14" rx="1.4" fill="currentColor" stroke="none"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M7 4.8v14.4c0 .8.9 1.3 1.6.9l11.3-7.2c.6-.4.6-1.4 0-1.8L8.6 3.9C7.9 3.5 7 4 7 4.8z" fill="currentColor" stroke="none"/></svg>',
  ear: '<svg viewBox="0 0 24 24"><path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="13.5" width="4.5" height="7" rx="1.8"/><rect x="16.5" y="13.5" width="4.5" height="7" rx="1.8"/></svg>',
  wave: '<svg viewBox="0 0 24 24"><path d="M3 12h2M7 8v8M11 5v14M15 9v6M19 11v2"/></svg>',
  save: '<svg viewBox="0 0 24 24"><path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19h14"/></svg>',
};
const FX_DEF = { lowcut: true, eq: [0, 0, 0, 0, 0], denoise: 0, gate: -90, comp: 'off', gain: 0, normalize: true, reverb: 0 };
// Окно уровня: что показывать (настраивается — шестерёнка в окне)
const METER_DEF = { spec: true, style: 'bars', mode: 'both', clip: -0.3, hold: 2, range: 60, smooth: 'mid' };

let host = null, ctx = null, size = 'full', offs = [], onClick = null, onChange = null, onPtr = null, onInput = null;
const S = { phase: 'idle', sec: 0, peak: 0, rms: 0, paused: false, clip: 0, take: null, sel: [0, 1], playing: false, pos: 0, mode: 'proc', busy: false, devs: { inputs: [], outputs: [] }, err: null, proc: null };

const st = () => { const s = ctx.store.all(); s.fx = { ...FX_DEF, ...(s.fx || {}) }; s.meter = { ...METER_DEF, ...(s.meter || {}) }; s.in ??= null; s.out ??= null; s.stereo ??= false; s.raw ??= true; s.live ??= true; s.hear ??= false; return s; };
const big = () => size === 'full' || size === 'half';
const esc = (s) => ctx.ui.esc(s);
const t = (k, v) => ctx.t(k, v);
const fmt = (sec) => { sec = Math.max(0, sec || 0); const m = Math.floor(sec / 60), s = sec - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1); };

/* ---------- устройства ---------- */

function devName(d) {
  const k = KIND[d.type] || 'other', nm = d.name && d.name !== 'null' ? d.name : '';
  const base = t('dev.' + k);
  if (k === 'phone' || k === 'speaker' || k === 'earpiece') return base + (S.devs.inputs.filter((x) => x.type === d.type).length > 1 && nm ? ' · ' + nm : '');
  return base + (nm ? ': ' + nm : '');
}
async function loadDevices() {
  try { S.devs = await engine().devices(); } catch { S.devs = { inputs: [], outputs: [] }; }
  // одинаковые встроенные микрофоны (низ/верх/камера) — оставить первый: выбирать между ними на практике нечего
  const seen = new Set();
  S.devs.inputs = S.devs.inputs.filter((d) => { const k = d.type === 'builtin_mic' ? 'b' : d.id; if (seen.has(k)) return false; seen.add(k); return true; });
  render();
}
const curIn = () => S.devs.inputs.find((d) => String(d.id) === String(st().in)) || null;

function devHTML() {
  const s = st(), sel = (k, list, cur, def) => '<select class="sortsel" data-v="' + k + '" aria-label="' + esc(t(k === 'in' ? 'in' : 'out')) + '"><option value="">' + esc(def) + '</option>' +
    list.map((d) => '<option value="' + esc(d.id) + '"' + (String(d.id) === String(cur) ? ' selected' : '') + '>' + esc(devName(d)) + (isLav(d) ? ' · ' + esc(t('lav')) : '') + '</option>').join('') + '</select>';
  const lav = curIn() && isLav(curIn());
  return '<div class="group vc-dev"><label class="cell"><span class="vc-lbl">' + t('in') + '</span>' + sel('in', S.devs.inputs, s.in, t('auto')) + '</label>' +
    '<label class="cell"><span class="vc-lbl">' + t('out') + '</span>' + (S.devs.outputs.length ? sel('out', S.devs.outputs, s.out, t('auto')) : '<span class="l2 vc-note">' + t('outAuto') + '</span>') + '</label>' +
    (big() ? '<div class="cell"><span class="grow">' + t('stereo') + '</span>' + sw('stereo', s.stereo) + '</div><div class="cell"><span class="grow"><span>' + t('raw') + '</span><span class="st l2">' + t('rawHint') + '</span></span>' + sw('raw', s.raw) + '</div>' : '') + '</div>' +
    (lav ? '<p class="ftr">' + t('lavHint') + '</p>' : curIn() && KIND[curIn().type] === 'bt' ? '<p class="ftr">' + t('btHint') + '</p>' : '');
}
const sw = (k, on) => '<label class="sw"><input type="checkbox" data-v="' + k + '"' + (on ? ' checked' : '') + '><i></i></label>';

/* ---------- запись ---------- */

// Вход до записи: слушать и обрабатывать вживую (livefx) — мини-окно спектра и уровня после обработки,
// в наушниках (если включено) — звук с обработкой. Ничего не пишется. Android: вход направляется маршрутом.
let L = null; // { c, inp, fx, an, mon, raf, buf }
async function liveStart() {
  if (L || !host || !big() || S.phase !== 'idle') return;
  const s = st(), dev = curIn(), E = engine();
  L = { pending: true };
  try {
    const C = window.AudioContext || window.webkitAudioContext, c = new C({ latencyHint: 'interactive' });
    if (E.native) await E.route(dev ? dev.id : -1);
    const inp = await openInput(c, !E.native && dev ? dev.id : null);
    if (!L || !L.pending) { inp.stop(); c.close(); if (E.native) E.unroute(); return; } // успели закрыть
    const fx = createLiveFx(c, s.fx), an = c.createAnalyser(), mon = c.createGain();
    an.fftSize = 2048;
    inp.src.connect(fx.input); fx.output.connect(an); fx.output.connect(mon).connect(c.destination);
    mon.gain.value = s.hear ? 1 : 0;
    if (!E.native && s.out) setOutput(c, s.out);
    L = { c, inp, fx, an, mon, buf: new Float32Array(an.fftSize), raf: 0 };
    Object.assign(M, { hold: -120, clipAt: 0, spec: null, rate: c.sampleRate });
    S.err = null;
    const loop = () => { if (!L || !L.an) return; L.raf = requestAnimationFrame(loop); meterUpdate(levelOf(L.an, L.buf)); };
    loop();
  } catch (e) { L = null; S.err = e && e.reason === 'denied' ? 'denied' : 'unavailable'; if (E.native) E.unroute(); }
  render();
}
async function liveStop() {
  const l = L; L = null;
  if (!l || l.pending) return;
  cancelAnimationFrame(l.raf);
  l.fx.disconnect(); l.inp.stop();
  try { await l.c.close(); } catch { /* уже */ }
  if (engine().native) await engine().unroute();
}
const liveFx = () => { if (L && L.fx) L.fx.update(st().fx); };
const liveHear = () => { if (L && L.mon) L.mon.gain.setTargetAtTime(st().hear ? 1 : 0, L.c.currentTime, 0.03); };
const liveRestart = async () => { await liveStop(); if (st().live) liveStart(); };
async function startRec() {
  await liveStop();
  if (S.take && !S.take.saved && !(await ctx.ui.confirm(t('discardTitle'), t('discardText'), t('discardYes')))) return;
  await dropTake();
  const s = st(), dev = curIn();
  try {
    const r = await engine().start({ deviceId: dev ? dev.id : -1, stereo: s.stereo, raw: s.raw });
    Object.assign(S, { phase: 'rec', sec: 0, peak: 0, rms: 0, paused: false, clip: 0, err: null, rate: r.rate, bt: r.bt });
    Object.assign(M, { hold: -120, clipAt: 0, spec: null, rate: r.rate || 48000 });
    ctx.log('запись: вход ' + (dev ? dev.type : 'авто') + ', ' + r.rate + ' Гц, каналов ' + r.channels);
  } catch (e) {
    S.err = String(e && e.message) === 'denied' ? 'denied' : 'unavailable';
    ctx.log('запись не началась: ' + S.err, 'w');
  }
  render();
}
async function stopRec() {
  try {
    const r = await engine().stop(), u8 = await engine().read(r.path), w = decodeWav(u8);
    if (!w || !w.ch[0].length) throw new Error('empty');
    S.take = { path: r.path, ch: w.ch, sr: w.sr, sec: w.ch[0].length / w.sr, peaks: peaks(w.ch, 600), saved: false };
    Object.assign(S, { phase: 'take', sel: [0, 1], pos: 0, mode: 'proc', proc: null });
    ctx.log('записано ' + S.take.sec.toFixed(1) + ' с');
  } catch (e) { ctx.logErr(e); S.phase = 'idle'; ctx.ui.toast(t('recFail')); }
  render();
}
async function dropTake() {
  await stopPlay();
  if (S.take) { engine().remove(S.take.path); if (S.proc) engine().remove(S.proc.path); }
  S.take = null; S.proc = null; S.phase = 'idle';
}

/* ---------- обработка и воспроизведение ---------- */

const selSec = () => [S.sel[0] * S.take.sec, S.sel[1] * S.take.sec];
const fxKey = () => JSON.stringify([st().fx, S.sel]);
async function processed() {
  if (S.proc && S.proc.key === fxKey()) return S.proc;
  S.busy = true; render();
  await new Promise((r) => setTimeout(r, 30)); // дать экрану обновиться
  const out = process(S.take.ch, S.take.sr, { ...st().fx, trim: selSec() }), path = 'proc-' + Date.now() + '.wav';
  if (S.proc) engine().remove(S.proc.path);
  await engine().write(path, encodeWav(out, S.take.sr));
  S.proc = { path, key: fxKey(), ch: out, sec: out[0].length / S.take.sr };
  S.busy = false;
  return S.proc;
}
async function play() {
  if (S.playing) { await stopPlay(); render(); return; }
  try {
    const out = st().out ? (S.devs.outputs.find((d) => String(d.id) === String(st().out)) || {}).id : -1;
    if (S.mode === 'proc') { const p = await processed(); S.offset = selSec()[0]; await engine().play(p.path, out, 0); }
    else { S.offset = 0; await engine().play(S.take.path, out, selSec()[0]); }
    S.playing = true;
  } catch (e) { ctx.logErr(e); S.busy = false; ctx.ui.toast(t('playFail')); }
  render();
}
async function stopPlay() { if (S.playing) { S.playing = false; try { await engine().stopPlay(); } catch { /* уже */ } } }

async function save() {
  try {
    const p = await processed(), wav = encodeWav(p.ch, S.take.sr), d = new Date(), pad = (n) => String(n).padStart(2, '0');
    const name = t('fileName', { d: pad(d.getDate()) + '.' + pad(d.getMonth() + 1), t: pad(d.getHours()) + '-' + pad(d.getMinutes()) }) + '.wav';
    const song = ctx.session && ctx.session.songId;
    await ctx.files.add({ id: 'vc' + Date.now().toString(36), name, size: wav.length, type: 'audio/wav', kind: 'audio', songs: song ? [song] : [], created: Date.now(), blob: new Blob([wav], { type: 'audio/wav' }), dur: p.sec });
    S.take.saved = true;
    ctx.ui.toast(t('saved'));
    ctx.log('сохранено в медиатеку: ' + p.sec.toFixed(1) + ' с');
  } catch (e) { ctx.logErr(e); S.busy = false; ctx.ui.toast(t('saveFail')); }
  render();
}

/* ---------- экран ---------- */

// Окно уровня: дБ (пик и/или RMS), шкала с удержанием пика, лампочка перегруза, спектр
const M = { hold: -120, holdAt: 0, clipAt: 0, spec: null, rate: 48000 };
function meterHTML(live = false) {
  const m = st().meter, ticks = [-60, -40, -30, -20, -12, -6, -3, 0].filter((d) => d >= -m.range), s = st();
  return '<div class="vc-mon' + (live ? ' mini' : '') + '"><div class="vc-monh">' +
    '<span class="vc-dbs"><b class="num" id="vc-db">−∞</b><span class="vc-dbu">' + t(m.mode === 'rms' ? 'm.rmsU' : 'm.peakU') + '</span>' +
    (m.mode === 'both' ? '<span class="num l2" id="vc-db2"></span>' : '') + '</span>' +
    '<button class="vc-clip" id="vc-clip" data-x="clipreset" aria-label="' + esc(t('m.clipAria')) + '"><i></i>CLIP</button>' +
    // до записи: слушать вход и слышать себя в наушниках (с обработкой)
    (live ? '<button class="ic sm' + (s.live ? ' on' : '') + '" data-x="live" aria-pressed="' + !!s.live + '" aria-label="' + esc(t('live.on')) + '">' + I.wave + '</button>' +
      '<button class="ic sm' + (s.hear ? ' on' : '') + '" data-x="hear" aria-pressed="' + !!s.hear + '" aria-label="' + esc(t('live.hear')) + '"' + (s.live ? '' : ' disabled') + '>' + I.ear + '</button>' : '') +
    '<button class="ic sm" data-x="mset" aria-label="' + esc(t('m.set')) + '">' + GEAR + '</button></div>' +
    '<div class="vc-bar vcled" aria-hidden="true"><i id="vc-barr"></i><i id="vc-barp"></i><b id="vc-hold"></b></div>' +
    '<div class="vc-ticks num" aria-hidden="true">' + ticks.map((d) => '<span style="left:' + ((d + m.range) / m.range) * 100 + '%">' + (d ? d : '0') + '</span>').join('') + '</div>' +
    (m.spec && big() ? '<canvas id="vc-spec" class="vc-spec" aria-hidden="true"></canvas>' : '') +
    (live && !s.live ? '<p class="l2 vc-off">' + t('live.off') + '</p>' : '') + '</div>';
}
const GEAR = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2.5v2.6M12 18.9v2.6M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M2.5 12h2.6M18.9 12h2.6M4.6 19.4l1.8-1.8M17.6 6.4l1.8-1.8"/></svg>';
const pctOf = (db) => Math.max(0, Math.min(100, ((db + st().meter.range) / st().meter.range) * 100));
const dbOf = (x) => (x > 1e-6 ? 20 * Math.log10(x) : -120);
function meterUpdate(e) {
  if (!host) return;
  const m = st().meter, now = performance.now(), q = (s) => host.querySelector(s);
  const pk = dbOf(e.peak), rm = dbOf(e.rms);
  if (pk >= m.clip) M.clipAt = now;
  if (pk > M.hold || (m.hold > 0 && now - M.holdAt > m.hold * 1000) || m.hold === 0) { M.hold = pk; M.holdAt = now; }
  const shown = m.mode === 'rms' ? rm : pk, fmtDb = (d) => (d <= -90 ? '−∞' : (d > -0.05 ? '0.0' : d.toFixed(1)).replace('-', '−'));
  const a = q('#vc-db'); if (a) { a.textContent = fmtDb(shown); a.classList.toggle('hot', pk >= m.clip); }
  const b = q('#vc-db2'); if (b) b.textContent = 'RMS ' + fmtDb(rm);
  // полоса из «огоньков»: заливка во всю ширину, видна до уровня (цвета зелёный → жёлтый → красный стоят на месте)
  const cut = (x) => 'inset(0 ' + (100 - x).toFixed(1) + '% 0 0)';
  const r = q('#vc-barr'); if (r) r.style.clipPath = cut(m.mode === 'peak' ? 0 : pctOf(rm));
  const p = q('#vc-barp'); if (p) p.style.clipPath = cut(m.mode === 'rms' ? 0 : pctOf(pk));
  const bar = q('.vc-bar'); if (bar) bar.classList.toggle('hot', pk > -6);
  const h = q('#vc-hold'); if (h) h.style.left = pctOf(M.hold) + '%';
  const c = q('#vc-clip'); if (c) c.classList.toggle('on', !!M.clipAt && (m.hold === -1 || now - M.clipAt < Math.max(1, m.hold || 1) * 1000));
  if (e.samples && m.spec) drawSpec(e.samples, e.rate || M.rate);
}
// Спектр: логарифмическая шкала 40 Гц…16 кГц, столбики или линия, сглаживание по времени
function drawSpec(x, rate) {
  const cv = host && host.querySelector('#vc-spec');
  if (!cv) return;
  const m = st().meter, dpr = Math.min(2, devicePixelRatio || 1), W = cv.clientWidth, H = cv.clientHeight;
  if (!W || !H) return;
  if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const s = spectrumDb(x, 1024), NB = m.style === 'bars' ? 40 : 96, lo = Math.log10(40), hi = Math.log10(Math.min(16000, rate / 2));
  const bands = new Float32Array(NB);
  for (let b = 0; b < NB; b++) {
    const f0 = Math.pow(10, lo + ((hi - lo) * b) / NB), f1 = Math.pow(10, lo + ((hi - lo) * (b + 1)) / NB);
    let k0 = Math.floor((f0 * 1024) / rate), k1 = Math.max(k0 + 1, Math.ceil((f1 * 1024) / rate)), v = -120;
    for (let k = k0; k < k1 && k < s.length; k++) v = Math.max(v, s[k]);
    bands[b] = v;
  }
  const a = { fast: 0.7, mid: 0.4, slow: 0.18 }[m.smooth] || 0.4;
  if (!M.spec || M.spec.length !== NB) M.spec = bands; else for (let b = 0; b < NB; b++) M.spec[b] = bands[b] > M.spec[b] ? bands[b] : M.spec[b] + (bands[b] - M.spec[b]) * a;
  const g = cv.getContext('2d'), cs = getComputedStyle(host), tint = cs.getPropertyValue('--tint').trim() || '#9C7242', l3 = cs.getPropertyValue('--l3').trim() || '#ccc';
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
  const y = (d) => H - (Math.max(0, Math.min(1, (d + 90) / 90)) * (H - 2));
  // сетка: 100 Гц, 1 кГц, 10 кГц
  g.fillStyle = l3; [100, 1000, 10000].forEach((f) => { const xx = ((Math.log10(f) - lo) / (hi - lo)) * W; if (xx > 0 && xx < W) g.fillRect(xx, 0, 1, H); });
  if (m.style === 'bars') {
    const bw = W / NB;
    for (let b = 0; b < NB; b++) { const yy = y(M.spec[b]); g.fillStyle = M.spec[b] > -6 ? '#D2463F' : tint; g.fillRect(b * bw + 1, yy, Math.max(1, bw - 2), H - yy); }
  } else {
    g.beginPath(); for (let b = 0; b < NB; b++) { const xx = (b + 0.5) * (W / NB); b ? g.lineTo(xx, y(M.spec[b])) : g.moveTo(xx, y(M.spec[b])); }
    g.strokeStyle = tint; g.lineWidth = 1.8; g.stroke(); g.lineTo(W, H); g.lineTo(0, H); g.closePath(); g.globalAlpha = 0.18; g.fillStyle = tint; g.fill(); g.globalAlpha = 1;
  }
}
// Настройки окна уровня
function meterSheet() {
  const { ui } = ctx, m = () => st().meter;
  const row = (k, opts, label) => '<div class="hdr">' + label + '</div><div class="group"><div class="cellcol">' + ui.seg('m-' + k, opts, String(m()[k]), label) + '</div></div>';
  ui.sheet(() => ui.snav(t('m.set')) +
    row('mode', [['both', t('m.both')], ['peak', t('m.peak')], ['rms', 'RMS']], t('m.mode')) +
    row('spec', [['true', t('m.on')], ['false', t('m.off')]], t('m.spec')) +
    row('style', [['bars', t('m.bars')], ['line', t('m.line')]], t('m.style')) +
    row('smooth', [['fast', t('m.fast')], ['mid', t('m.mid')], ['slow', t('m.slow')]], t('m.smooth')) +
    row('clip', [['-0.3', '−0,3'], ['-1', '−1'], ['-3', '−3'], ['-6', '−6']], t('m.clip')) +
    row('hold', [['0', t('m.off')], ['1', '1 ' + t('m.s')], ['2', '2 ' + t('m.s')], ['5', '5 ' + t('m.s')], ['-1', '∞']], t('m.hold')) +
    row('range', [['48', '48'], ['60', '60'], ['90', '90']], t('m.range')) +
    '<p class="ftr">' + t('m.hint') + '</p>',
  (el, sh) => el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-seg] [data-v]');
    if (!b) return;
    const k = b.closest('[data-seg]').dataset.seg.slice(2), v = b.dataset.v;
    st().meter[k] = k === 'style' || k === 'mode' || k === 'smooth' ? v : v === 'true' ? true : v === 'false' ? false : +v;
    ctx.store.save(); sh.update(); render();
  }));
}
function fxHTML(pre = false) {
  const f = st().fx, rng = (k, min, max, step, val, label, txt) => '<label class="cellcol vc-fx"><span class="vc-fxh"><span>' + label + '</span><b class="num" id="vfx-' + k + '">' + txt + '</b></span>' +
    '<input type="range" min="' + min + '" max="' + max + '" step="' + step + '" value="' + val + '" data-fx="' + k + '" aria-label="' + esc(label) + '"></label>';
  return '<div class="hdr">' + t(pre ? 'live.title' : 'fx') + '</div><div class="group">' +
    '<div class="cell"><span class="grow"><span>' + t('fx.lowcut') + '</span><span class="st l2">' + t('fx.lowcutHint') + '</span></span><label class="sw"><input type="checkbox" data-fx="lowcut"' + (f.lowcut ? ' checked' : '') + '><i></i></label></div>' +
    // эквалайзер: пресеты, кривая и 5 полос
    '<div class="cellcol vc-eq"><span class="vc-fxh"><span>' + t('fx.eq') + '</span></span><div class="pickrow" style="margin:6px 0 2px">' + Object.keys(EQ_PRESETS).map((k) =>
      '<button type="button" class="lchip pick' + (JSON.stringify(EQ_PRESETS[k]) === JSON.stringify(f.eq) ? ' on' : '') + '" data-eqp="' + k + '" style="--c:var(--tint);--t:var(--on-tint)">' + t('eq.' + k) + '</button>').join('') + '</div>' +
      '<canvas id="vc-eqc" class="vc-eqc" aria-hidden="true"></canvas><div class="vc-eqb">' + EQ_BANDS.map((b, i) => '<label><b class="num" id="veq-' + i + '">' + eqTxt(f.eq[i]) + '</b>' +
      '<input type="range" min="-12" max="12" step="0.5" value="' + f.eq[i] + '" data-eq="' + i + '" aria-label="' + esc(t('fx.eq') + ' ' + hz(b.f)) + '"><span class="num">' + hz(b.f) + '</span></label>').join('') + '</div></div>' +
    rng('denoise', 0, 1, 0.05, f.denoise, t('fx.denoise'), fxTxt('denoise', f.denoise)) +
    rng('gate', -90, -25, 1, f.gate, t('fx.gate'), fxTxt('gate', f.gate)) +
    '<div class="cellcol"><span>' + t('fx.comp') + '</span>' + ctx.ui.seg('vcomp', ['off', 'light', 'mid', 'strong'].map((k) => [k, t('comp.' + k)]), f.comp, t('fx.comp')) + '</div>' +
    rng('gain', -12, 18, 1, f.gain, t('fx.gain'), fxTxt('gain', f.gain)) +
    '<div class="cell"><span class="grow">' + t('fx.normalize') + '</span><label class="sw"><input type="checkbox" data-fx="normalize"' + (f.normalize ? ' checked' : '') + '><i></i></label></div>' +
    rng('reverb', 0, 0.6, 0.05, f.reverb, t('fx.reverb'), fxTxt('reverb', f.reverb)) + '</div>' +
    '<p class="ftr">' + t(pre ? 'live.hint' : 'fxHint') + '</p>';
}
const hz = (f) => (f >= 1000 ? f / 1000 + 'k' : String(f));
const eqTxt = (v) => (v > 0 ? '+' : '') + (+v).toFixed(v % 1 ? 1 : 0);
function drawEq() {
  const cv = host && host.querySelector('#vc-eqc');
  if (!cv) return;
  const dpr = Math.min(2, devicePixelRatio || 1), W = cv.clientWidth, H = cv.clientHeight;
  if (!W || !H) return;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  const g = cv.getContext('2d'), cs = getComputedStyle(host), tint = cs.getPropertyValue('--tint').trim() || '#9C7242', l3 = cs.getPropertyValue('--l3').trim() || '#ccc', gains = st().fx.eq;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const lo = Math.log10(30), hi = Math.log10(18000), y = (d) => H / 2 - (d / 15) * (H / 2 - 4);
  g.fillStyle = l3; g.fillRect(0, H / 2, W, 1);
  [100, 1000, 10000].forEach((f) => g.fillRect(((Math.log10(f) - lo) / (hi - lo)) * W, 0, 1, H));
  g.beginPath();
  for (let i = 0; i <= 120; i++) { const f = Math.pow(10, lo + ((hi - lo) * i) / 120), d = eqResponse(gains, f); i ? g.lineTo((i / 120) * W, y(d)) : g.moveTo(0, y(d)); }
  g.strokeStyle = tint; g.lineWidth = 2; g.stroke();
  g.lineTo(W, H / 2); g.lineTo(0, H / 2); g.closePath(); g.globalAlpha = 0.15; g.fillStyle = tint; g.fill(); g.globalAlpha = 1;
}
function fxTxt(k, v) {
  if (k === 'gate') return v <= -90 ? t('off') : v + ' ' + t('db');
  if (k === 'gain') return (v > 0 ? '+' : '') + v + ' ' + t('db');
  return v > 0 ? Math.round(v * 100) + '%' : t('off');
}

// Нижняя полоса — главная кнопка под большим пальцем: запись, стоп, пауза, прослушать, сохранить
const bottom = (inner) => '<div class="vc-bot">' + inner + '</div>';
function html() {
  const err = S.err ? '<p class="ftr" style="color:var(--red)">' + t(S.err === 'denied' ? 'micDenied' : 'micNone') + '</p>' : '';
  if (S.phase === 'rec') {
    if (!big()) return '<div class="vc-rec ' + size + '"><div class="vc-time num" id="vc-time">' + fmt(S.sec) + '</div><div class="vc-bar vcled mini" aria-hidden="true"><i id="vc-barr"></i><i id="vc-barp"></i><b id="vc-hold"></b></div>' +
      '<div class="vc-btns"><button class="vc-btn sec" data-x="pause" aria-label="' + t(S.paused ? 'resume' : 'pause') + '">' + (S.paused ? I.rec : I.pause) + '</button>' +
      '<button class="vc-btn main stop" data-x="stop" aria-label="' + t('stop') + '">' + I.stop + '</button></div></div>';
    return '<div class="vc-top">' + meterHTML() + '</div><div class="vc-mid vc-center"><div class="vc-time num" id="vc-time">' + fmt(S.sec) + '</div>' +
      '<p class="l2 vc-state">' + (S.paused ? t('paused') : esc(curIn() ? devName(curIn()) : t('auto'))) + '</p></div>' +
      bottom('<button class="vc-btn sec" data-x="pause" aria-label="' + t(S.paused ? 'resume' : 'pause') + '">' + (S.paused ? I.rec : I.pause) + '</button>' +
        '<button class="vc-btn main stop" data-x="stop" aria-label="' + t('stop') + '">' + I.stop + '</button><span class="vc-btn ghost"></span>');
  }
  if (S.phase === 'take' && S.take) {
    const [a, b] = selSec();
    if (!big()) return '<div class="vc-rec ' + size + '"><div class="vc-time num">' + fmt(b - a) + '</div><div class="vc-btns"><button class="vc-btn sec" data-x="play" aria-label="' + t(S.playing ? 'stop' : 'play') + '">' + (S.playing ? I.stop : I.play) + '</button><button class="vc-btn main" data-x="rec" aria-label="' + t('record') + '">' + I.rec + '</button></div></div>';
    return '<div class="vc-mid"><div class="vc-take"><canvas id="vc-wave" class="vc-wave" aria-label="' + esc(t('waveAria')) + '"></canvas>' +
      '<div class="vc-sel num"><span>' + fmt(a) + '</span><b>' + fmt(b - a) + '</b><span>' + fmt(b) + '</span></div>' +
      '<div class="vc-tools">' + ctx.ui.seg('vmode', [['orig', t('orig')], ['proc', t('proc')]], S.mode, t('listen')) + '</div>' +
      fxHTML() +
      '<div class="group"><button class="cell act danger" data-x="drop">' + t('drop') + '</button></div>' +
      '<div class="hdr">' + t('devices') + '</div>' + devHTML() + '</div></div>' +
      bottom('<button class="vc-btn sec" data-x="play" aria-label="' + t(S.playing ? 'stop' : 'play') + '">' + (S.busy ? '…' : S.playing ? I.stop : I.play) + '</button>' +
        '<button class="vc-btn main" data-x="rec" aria-label="' + t('newRec') + '">' + I.rec + '</button>' +
        '<button class="vc-btn sec' + (S.take.saved ? ' done' : '') + '" data-x="save"' + (S.busy ? ' disabled' : '') + ' aria-label="' + t(S.take.saved ? 'savedAgain' : 'save') + '">' + I.save + '</button>');
  }
  // ожидание
  if (!big()) return '<div class="vc-rec ' + size + '"><div class="vc-btns"><button class="vc-btn main" data-x="rec" aria-label="' + t('record') + '">' + I.rec + '</button></div>' + err + '</div>';
  // сверху — мини-окно (спектр и уровень), посередине — звук до записи и устройства, внизу — кнопка записи
  return '<div class="vc-top">' + meterHTML(true) + '</div>' +
    '<div class="vc-mid">' + err + fxHTML(true) + '<div class="hdr">' + t('devices') + '</div>' + devHTML() + '<p class="ftr">' + t(engine().native ? 'devHint' : 'devHintWeb') + '</p></div>' +
    bottom('<span class="vc-btn ghost"></span><button class="vc-btn main" data-x="rec" aria-label="' + t('record') + '">' + I.rec + '</button><span class="vc-btn ghost"></span>');
}

function render() {
  if (!host) return;
  host.innerHTML = '<div class="voice ' + size + (big() ? ' big' : '') + '">' + html() + '</div>';
  // вход до записи слушается только в ожидании и в большом окне (ошибка — до явного нажатия)
  if (S.phase === 'idle' && big() && st().live && !L && !S.err) liveStart();
  else if (L && (S.phase !== 'idle' || !big())) liveStop();
  drawWave();
  drawEq();
}

function drawWave() {
  const cv = host && host.querySelector('#vc-wave');
  if (!cv || !S.take) return;
  const dpr = Math.min(2, devicePixelRatio || 1), W = cv.clientWidth, H = cv.clientHeight;
  if (!W || !H) return;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  const g = cv.getContext('2d'), cs = getComputedStyle(host), tint = cs.getPropertyValue('--tint').trim() || '#9C7242', l3 = cs.getPropertyValue('--l3').trim() || '#ccc';
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const p = S.take.peaks, n = p.length, bw = W / n, [a, b] = S.sel;
  for (let i = 0; i < n; i++) {
    const x = i * bw, f = i / n, h = Math.max(1, p[i] * (H - 8));
    g.fillStyle = f >= a && f <= b ? tint : l3;
    g.fillRect(x, (H - h) / 2, Math.max(1, bw - 0.6), h);
  }
  // ручки обрезки
  g.fillStyle = tint;
  [a, b].forEach((f) => { const x = f * W; g.fillRect(x - 1.5, 0, 3, H); g.beginPath(); g.arc(x, H / 2, 7, 0, 2 * Math.PI); g.fill(); });
  // где играет
  if (S.playing) { const x = ((S.offset + S.pos) / S.take.sec) * W; g.fillStyle = cs.getPropertyValue('--ink').trim(); g.fillRect(x - 1, 0, 2, H); }
}

// Обновление без перерисовки: время и уровень при записи, позиция при воспроизведении
function onLevel(e) {
  if (e.rate) M.rate = e.rate;
  if (S.phase !== 'rec' || !host) return;
  meterUpdate(e);
  S.sec = e.sec; S.paused = !!e.paused;
  if (e.peak > 0.98) S.clip = performance.now();
  const q = (s) => host.querySelector(s), db = (x) => Math.max(0, Math.min(100, ((20 * Math.log10(Math.max(1e-5, x)) + 60) / 60) * 100));
  const tm = q('#vc-time'); if (tm) tm.textContent = fmt(e.sec);
}
function onPos(e) {
  if (!S.playing || !S.take) return;
  S.pos = S.mode === 'orig' ? e.sec - S.offset : e.sec;
  if (S.mode === 'orig' && e.sec >= selSec()[1]) { stopPlay().then(render); return; }
  drawWave();
}
function onEnd() { if (S.playing) { S.playing = false; render(); } }

/* ---------- модуль ---------- */

export default {
  id: 'voice',
  order: 96,
  name: { ru: ru.name, uz: uz.name, en: en.name, el: el.name },
  i18n: { ru, uz, en, el },
  icon: ICON,
  color: '#B0585C',
  sizes: ['full', 'half', 'quarter', 'strip'],
  record: false, // сам себе запись: общая кнопка записи не нужна
  status: (c) => c.t(S.phase === 'rec' ? 'st.rec' : S.take && !S.take.saved ? 'st.take' : 'st.idle'),
  mount(el, c, sz = 'full') {
    host = el; ctx = c; size = sz;
    const E = engine();
    offs = [E.on('level', onLevel), E.on('pos', onPos), E.on('end', onEnd), E.on('devices', loadDevices)];
    onClick = (e) => {
      const sg = e.target.closest('[data-seg] [data-v]');
      if (sg) {
        const k = sg.closest('[data-seg]').dataset.seg;
        if (k === 'vmode') { stopPlay(); S.mode = sg.dataset.v; render(); }
        if (k === 'vcomp') { st().fx.comp = sg.dataset.v; ctx.store.save(); liveFx(); render(); }
        return;
      }
      const ep = e.target.closest('[data-eqp]');
      if (ep) { st().fx.eq = EQ_PRESETS[ep.dataset.eqp].slice(); ctx.store.save(); liveFx(); render(); return; }
      const x = e.target.closest('[data-x]');
      if (!x || S.busy) return;
      const a = x.dataset.x;
      if (a === 'rec') startRec();
      else if (a === 'stop') stopRec();
      else if (a === 'pause') { S.paused = !S.paused; engine().pause(S.paused); render(); }
      else if (a === 'play') play();
      else if (a === 'save') save();
      else if (a === 'live') { const s = st(); s.live = !s.live; ctx.store.save(); if (s.live) liveStart(); else liveStop().then(render); }
      else if (a === 'hear') { const s = st(); s.hear = !s.hear; ctx.store.save(); liveHear(); x.classList.toggle('on', s.hear); x.setAttribute('aria-pressed', String(s.hear)); }
      else if (a === 'mset') meterSheet();
      else if (a === 'clipreset') { M.clipAt = 0; M.hold = -120; const c = host.querySelector('#vc-clip'); if (c) c.classList.remove('on'); }
      else if (a === 'drop') ctx.ui.confirm(t('discardTitle'), t('discardText'), t('discardYes')).then((ok) => ok && dropTake().then(render));
    };
    onChange = (e) => {
      const d = e.target.dataset, s = st();
      if (d.v === 'in' || d.v === 'out') { s[d.v] = e.target.value || null; ctx.store.save(); render(); if (S.phase === 'idle') { S.err = null; liveRestart(); } }
      else if (d.v === 'stereo' || d.v === 'raw') { s[d.v] = e.target.checked; ctx.store.save(); }
      else if (d.eq != null) { s.fx.eq[+d.eq] = +e.target.value; s.fx.eq = s.fx.eq.slice(); ctx.store.save(); liveFx(); render(); }
      else if (d.fx) {
        const v = e.target.type === 'checkbox' ? e.target.checked : +e.target.value;
        s.fx[d.fx] = v; ctx.store.save(); liveFx();
        const lb = host.querySelector('#vfx-' + d.fx); if (lb) lb.textContent = fxTxt(d.fx, v);
      }
    };
    // ручки обрезки: перетаскивание ближайшей
    onPtr = (e) => {
      const cv = e.target.closest('#vc-wave');
      if (!cv || !S.take) return;
      stopPlay();
      const r = cv.getBoundingClientRect(), f = (ev) => Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
      const k = Math.abs(f(e) - S.sel[0]) < Math.abs(f(e) - S.sel[1]) ? 0 : 1;
      const move = (ev) => { const v = f(ev); S.sel[k] = k ? Math.max(v, S.sel[0] + 0.01) : Math.min(v, S.sel[1] - 0.01); drawWave(); const sel = host.querySelector('.vc-sel'); if (sel) { const [a, b] = selSec(); sel.innerHTML = '<span>' + fmt(a) + '</span><b>' + fmt(b - a) + '</b><span>' + fmt(b) + '</span>'; } };
      const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); };
      move(e);
      addEventListener('pointermove', move); addEventListener('pointerup', up);
    };
    host.addEventListener('click', onClick);
    host.addEventListener('change', onChange);
    host.addEventListener('pointerdown', onPtr);
    // эквалайзер: подпись и кривая — пока тянут ползунок
    // ползунки обработки: подпись, кривая и звук до записи — пока тянут
    onInput = (e) => {
      const d = e.target.dataset;
      if (d.fx && e.target.type === 'range') { st().fx[d.fx] = +e.target.value; liveFx(); const lb = host.querySelector('#vfx-' + d.fx); if (lb) lb.textContent = fxTxt(d.fx, +e.target.value); return; }
      const i = d.eq; if (i == null) return;
      st().fx.eq[+i] = +e.target.value; liveFx(); const l = host.querySelector('#veq-' + i); if (l) l.textContent = eqTxt(+e.target.value); drawEq();
    };
    host.addEventListener('input', onInput);
    render();
    loadDevices();
  },
  resize(sz) { size = sz; render(); },
  unmount() {
    offs.forEach((f) => f()); offs = [];
    if (host) { host.removeEventListener('click', onClick); host.removeEventListener('change', onChange); host.removeEventListener('pointerdown', onPtr); host.removeEventListener('input', onInput); }
    liveStop();
    stopPlay();
    // запись не прерывается молча: остановить и оставить дубль до следующего открытия
    if (S.phase === 'rec') stopRec();
    host = null;
  },
};
