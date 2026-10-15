// Кнопка записи в окне инструмента и лист записи. Источники — звук приложения (баланс инструментов — в микшере)
// и микрофон: каждый включается отдельно и регулируется громче-тише, в том числе во время записи. Мониторинг —
// микрофон в наушники через гейт (уровень и порог видны на шкале). У модуля с видео — «только звук» или «звук и видео».
// Во время записи кнопка красная, со временем; нажатие открывает лист: «Остановить и сохранить» и те же регулировки.
// Запись — recorder.js. MIDI (у инструментов с midiIn): записывается сама игра; здесь же — записи MIDI этого
// инструмента (воспроизведение в нём, «Поделиться» файлом .mid, удаление), открытие чужого .mid и MIDI-клавиатура.
// Пока запись играет, кнопка записи — «стоп».
import { t } from '../../i18n/index.js';
import { sheet, snav, seg, sw, toast, icb, esc, icons, confirm } from '../../ui/index.js';
import { fmtClock } from '../format.js';
import { VOL_MAX, GATE_MIN, GATE_MAX } from '../recorder.js';
import { devKind } from '../../audio/voiceengine.js';
import { canPickOutput } from '../../audio/livefx.js';
import { readMidi, takeDur } from '../../music/midi.js';
import { SPEEDS } from '../midi.js';
import { sendFile, SHARE_IC } from './share.js';

export const REC_ICON = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4" fill="currentColor" stroke="none"/></svg>';

export const recButtonHTML = (cls = '') => icb('data-tv="rec"', REC_ICON, t('rec.start'), 'sm tvrec ' + cls);

const pct = (v) => Math.round(v * 100) + '%';
const slider = (k, v, min, max, step, label, txt) => '<label class="recsl"><span>' + label + '</span><input type="range" min="' + min + '" max="' + max + '" step="' + step + '" value="' + v + '" data-rsl="' + k + '" aria-label="' + label + '"><b class="num" data-rslv="' + k + '">' + txt + '</b></label>';
// шкала уровня микрофона: −70…0 дБ, отметка — порог гейта
const toPos = (db) => Math.max(0, Math.min(100, ((db - GATE_MIN) / -GATE_MIN) * 100));

// Подпись устройства: вид (микрофон телефона, USB, Bluetooth…) и имя
const devName = (d, list) => {
  const k = devKind(d), nm = d.name && d.name !== 'null' ? d.name : '';
  const many = list.filter((x) => devKind(x) === k).length > 1; // несколько одного вида — с именем, иначе не различить
  return t('recdev.' + k) + (nm && (many || !['phone', 'speaker', 'earpiece'].includes(k)) ? ': ' + nm : '');
};
const devSel = (k, list, cur, label) => '<select class="sortsel" data-rdev="' + k + '" aria-label="' + esc(label) + '"><option value="">' + esc(t('rec.auto')) + '</option>' +
  list.map((d) => '<option value="' + esc(d.id) + '"' + (String(d.id) === String(cur) ? ' selected' : '') + '>' + esc(devName(d, list)) + '</option>').join('') + '</select>';

const TRASH = '<svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13"/></svg>';
const dur = (s) => fmtClock(Math.max(0, Math.round(s || 0)));

// Записи MIDI инструмента, скорость воспроизведения, «Открыть .mid» и клавиатура
function midiHTML(app, mod) {
  const M = app.midi, list = app.files.list('midi').filter((r) => r.tool === mod.id).sort((a, b) => b.created - a.created), pl = M.playing, sp = app.store.state.settings.midiSpeed || 1;
  const row = (r) => { const on = pl && pl.id === r.id; return '<div class="cell">' + icb('data-mplay="' + esc(r.id) + '"', on ? icons.stop : icons.play, t(on ? 'midi.stop' : 'midi.play'), 'sm plain') +
    '<span class="grow">' + esc(r.name.replace(/\.midi?$/i, '')) + '<span class="psub num">' + dur(r.dur) + '</span></span>' +
    icb('data-mshare="' + esc(r.id) + '"', SHARE_IC, t('midi.share'), 'sm plain') + icb('data-mdel="' + esc(r.id) + '"', TRASH, t('midi.del'), 'sm plain') + '</div>'; };
  const I = M.input;
  return '<div class="hdr">' + t('midi.takes') + '</div><div class="group">' + (list.length ? list.map(row).join('') : '<div class="cell"><span class="grow l2">' + t('midi.none') + '</span></div>') +
    '<div class="cellcol">' + seg('mspeed', SPEEDS.map((v) => [String(v), Math.round(v * 100) + '%']), String(sp), t('midi.speed')) + '</div>' +
    '<label class="cell act">' + t('midi.open') + '<input type="file" accept=".mid,.midi,audio/midi,audio/x-midi" data-mopen hidden></label></div>' +
    (I.supported ? '<div class="hdr">' + t('midi.kbd') + '</div><div class="group"><div class="cell"><span class="grow">' + t('midi.kbdOn') +
      (I.on ? '<span class="psub">' + esc(I.devices.length ? I.devices.join(', ') : t('midi.kbdNone')) + '</span>' : '') + '</span>' + sw('mkbd', I.on, t('midi.kbdOn')) + '</div></div><p class="ftr">' + t('midi.kbdHint') + '</p>' : '');
}

function recSheet(app, mod, host, name) {
  const R = app.rec, hasVideo = typeof mod.recordVideo === 'function', hasMidi = typeof mod.midiIn === 'function' && !!app.midi;
  let raf = 0, devs = { inputs: [], outputs: [], native: false };
  const fmt = () => { const p = R.prefs; return hasMidi && p.midi ? 'midi' : hasVideo && p.video ? 'video' : 'audio'; };
  const body = () => {
    const p = R.prefs, on = R.active;
    const stopBtn = on ? '<button class="btn fill recstop" data-rstop>' + REC_ICON + '<span>' + t('rec.stopSave') + '</span><b class="num" data-rtm>' + fmtClock((Date.now() - R.state.t0) / 1000) + '</b></button>' : '';
    const fmtSeg = (hasVideo || hasMidi) && !on ? '<div class="hdr">' + t('rec.fmt') + '</div><div class="group"><div class="cellcol">' +
      seg('rfmt', [['audio', t('rec.fmt.audio')], ...(hasVideo ? [['video', t('rec.fmt.video')]] : []), ...(hasMidi ? [['midi', t('rec.fmt.midi')]] : [])], fmt(), t('rec.fmt')) +
      '<div class="segcap">' + t('rec.fmt.' + fmt() + 'Hint') + '</div></div></div>' : '';
    // MIDI: только сама игра — без источников звука
    if (on ? R.state.midi : fmt() === 'midi') {
      return snav(t('rec.title')) + stopBtn + fmtSeg + (on ? '<p class="ftr">' + t('rec.fmt.midiHint') + '</p>' : '<button class="btn fill recgo" data-rgo>' + REC_ICON + '<span>' + t('rec.go') + '</span></button>' + midiHTML(app, mod));
    }
    return snav(t('rec.title')) + stopBtn +
      // звук приложения
      '<div class="hdr">' + t('rec.app') + '</div><div class="group"><div class="cell"><span class="grow">' + t('rec.appOn') + '</span>' + sw('rapp', p.app, t('rec.appOn')) + '</div>' +
      (p.app ? '<div class="cellcol">' + slider('appVol', p.appVol, 0, VOL_MAX, 0.05, t('rec.vol'), pct(p.appVol)) + '</div>' : '') +
      (app.openMixer ? '<button class="cell act" data-rmix>' + t('rec.mixer') + '</button>' : '') + '</div><p class="ftr">' + t('rec.appHint') + '</p>' +
      // микрофон
      '<div class="hdr">' + t('rec.mic') + '</div><div class="group"><div class="cell"><span class="grow">' + t('rec.micOn') + '</span>' + sw('rmic', p.mic, t('rec.micOn')) + '</div>' +
      (p.mic ? '<div class="cellcol">' + slider('micVol', p.micVol, 0, VOL_MAX, 0.05, t('rec.vol'), pct(p.micVol)) +
        '<div class="recmeter" aria-hidden="true"><i data-rlev></i><s style="left:' + toPos(p.gate) + '%"></s></div></div>' +
        // вход и выход — как в диктофоне: телефон, проводная гарнитура, USB, Bluetooth
        '<label class="cell"><span class="grow">' + t('rec.in') + '</span>' + devSel('in', devs.inputs, p.in, t('rec.in')) + '</label>' +
        '<label class="cell"><span class="grow">' + t('rec.out') + '</span>' + (!devs.native && canPickOutput() && devs.outputs.length ? devSel('out', devs.outputs, p.out, t('rec.out')) : '<span class="l2">' + t('rec.outAuto') + '</span>') + '</label>' +
        // мониторинг через гейт
        '<div class="cell"><span class="grow">' + t('rec.mon') + '</span>' + sw('rmon', p.mon, t('rec.mon')) + '</div>' +
        (p.mon ? '<div class="cellcol">' + slider('monVol', p.monVol, 0, 1.5, 0.05, t('rec.vol'), pct(p.monVol)) +
          slider('gate', p.gate, GATE_MIN, GATE_MAX, 1, t('rec.gate'), p.gate + ' ' + t('rec.db')) + '</div>' : '') : '') +
      '</div><p class="ftr">' + t(p.mic ? (p.mon ? 'rec.monHint' : 'rec.micHint') : 'rec.micOffHint') + (p.mic && devKind(devs.inputs.find((d) => String(d.id) === String(p.in))) === 'bt' ? ' ' + t('rec.btHint') : '') + '</p>' +
      fmtSeg +
      (on ? '' : '<button class="btn fill recgo" data-rgo>' + REC_ICON + '<span>' + t('rec.go') + '</span></button><p class="ftr">' + t('rec.hint') + '</p>');
  };
  const arm = async () => { const r = await R.arm(); if (r === 'mic') { R.prefs.mic = false; app.store.settingsChanged(); toast(t('rec.micDenied')); } return r; };
  R.meter.howl = () => toast(t('rec.howl'));
  sheet(body, (el, sh) => {
    if (fmt() !== 'midi') arm().then(() => sh.update());
    const offMidi = hasMidi ? app.midi.subscribe(() => { if (el.isConnected) sh.update(); }) : () => {};
    R.devices().then((d) => { devs = d; sh.update(); });
    // уровень микрофона и гейт — на шкале; время записи — на кнопке
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (!el.isConnected) { cancelAnimationFrame(raf); offMidi(); if (!R.active) R.disarm(); R.meter.howl = null; return; }
      const lev = el.querySelector('[data-rlev]');
      if (lev) { lev.style.width = toPos(R.meter.db) + '%'; lev.classList.toggle('open', R.meter.open); }
      const tm = el.querySelector('[data-rtm]');
      if (tm && R.state) tm.textContent = fmtClock((Date.now() - R.state.t0) / 1000);
      const mon = el.querySelector('[data-sw="rmon"]');
      if (mon && mon.checked !== R.prefs.mon) sh.update(); // мониторинг выключился сам (обратная связь)
    };
    loop();
    const save = () => app.store.settingsChanged();
    el.addEventListener('input', (e) => {
      const k = e.target.dataset.rsl;
      if (!k) return;
      R.prefs[k] = +e.target.value;
      R.apply();
      const v = el.querySelector('[data-rslv="' + k + '"]');
      if (v) v.textContent = k === 'gate' ? e.target.value + ' ' + t('rec.db') : pct(+e.target.value);
      if (k === 'gate') { const m = el.querySelector('.recmeter s'); if (m) m.style.left = toPos(+e.target.value) + '%'; }
    });
    el.addEventListener('change', async (e) => {
      if (e.target.dataset.rsl) { save(); return; }
      // чужой файл .mid → в записи этого инструмента
      if (e.target.hasAttribute('data-mopen')) {
        const f = e.target.files && e.target.files[0];
        e.target.value = '';
        if (!f) return;
        try {
          const u8 = new Uint8Array(await f.arrayBuffer()), r = readMidi(u8);
          if (!r.ev.some((x) => x.k === 'on')) throw new Error('empty');
          const blob = new Blob([u8], { type: 'audio/midi' });
          await app.files.add({ id: 'm' + Date.now().toString(36), name: f.name, size: blob.size, type: 'audio/midi', songs: [], created: Date.now(), blob, kind: 'midi', tool: mod.id, take: { v: 1, ev: r.ev }, dur: takeDur(r.ev) });
          toast(t('midi.added', { name: f.name.replace(/\.midi?$/i, '') }));
        } catch { toast(t('midi.bad')); }
        sh.update();
        return;
      }
      if (e.target.dataset.sw === 'mkbd') {
        const ok = await app.midi.input.set(e.target.checked);
        if (!ok) toast(t(app.midi.input.err === 'denied' ? 'midi.kbdDenied' : 'midi.kbdErr'));
        sh.update();
        return;
      }
      const dv = e.target.dataset.rdev;
      if (dv) {
        R.prefs[dv] = e.target.value || null;
        save();
        if (dv === 'in') { const r = await R.reopen(); if (r === 'mic') toast(t('rec.micDenied')); } else R.setOut(R.prefs.out);
        sh.update();
        return;
      }
      const k = e.target.dataset.sw, p = R.prefs;
      if (k === 'rapp') p.app = e.target.checked;
      else if (k === 'rmic') { p.mic = e.target.checked; if (!p.mic) p.mon = false; }
      else if (k === 'rmon') p.mon = e.target.checked;
      else return;
      save();
      R.apply();
      if (k === 'rmic') await arm();
      sh.update();
    });
    el.addEventListener('click', async (e) => {
      const g = (q) => e.target.closest(q);
      let b;
      if ((b = g('[data-seg="rfmt"] [data-v]'))) {
        const v = b.dataset.v;
        R.prefs.video = v === 'video'; R.prefs.midi = v === 'midi'; save();
        if (v === 'midi') R.disarm(); else await arm();
        sh.update();
        return;
      }
      if ((b = g('[data-seg="mspeed"] [data-v]'))) { app.store.state.settings.midiSpeed = +b.dataset.v; save(); sh.update(); return; }
      if ((b = g('[data-mplay]'))) {
        const id = b.dataset.mplay, pl = app.midi.playing;
        if (pl && pl.id === id) { app.midi.stop(); return; }
        const r = app.files.get(id);
        if (r && app.midi.play(r, { tool: mod.id, speed: app.store.state.settings.midiSpeed || 1 })) { sh.close(); toast(t('midi.playing')); } else toast(t('midi.bad'));
        return;
      }
      if ((b = g('[data-mshare]'))) {
        const r = app.files.get(b.dataset.mshare);
        if (r && r.blob) { try { await sendFile(new Uint8Array(await r.blob.arrayBuffer()), /\.midi?$/i.test(r.name) ? r.name : r.name + '.mid', r.name, 'audio/midi'); } catch { toast(t('midi.bad')); } }
        return;
      }
      if ((b = g('[data-mdel]'))) {
        const r = app.files.get(b.dataset.mdel);
        if (!r) return;
        if (await confirm(t('midi.delTitle'), r.name.replace(/\.midi?$/i, ''), t('midi.del'))) {
          if (app.midi.playing && app.midi.playing.id === r.id) app.midi.stop();
          await app.files.remove(r.id);
          sh.update();
        }
        return;
      }
      if (g('[data-rmix]')) { sh.close(); app.openMixer(); return; }
      if (g('[data-rstop]')) {
        sh.close();
        const r = await R.stop();
        if (r) toast(t(r.kind === 'midi' ? 'midi.saved' : 'rec.saved', { name: r.name.replace(/\.[a-z0-9]+$/, '') }));
        return;
      }
      if (!g('[data-rgo]')) return;
      if (fmt() === 'midi') {
        await R.start({ tool: name, midi: mod.id });
        sh.close();
        return;
      }
      let video = null;
      if (hasVideo && R.prefs.video) {
        video = mod.recordVideo(host);
        if (!video) toast(t('rec.noVideo'));
      }
      const r = await R.start({ tool: name, video });
      if (r === 'empty') { if (video) video.stop(); toast(t('rec.empty')); return; }
      sh.close();
      if (r === 'unsupported') toast(t('rec.unsupported'));
      else if (r === 'nosound') toast(t('rec.nosound'));
      else if (r === 'mic') toast(t('rec.micDenied'));
    });
  });
}

// Подключить кнопку записи в окне инструмента: layer — окно, host — место модуля. → stop() при закрытии окна
export function bindRec(app, layer, mod, host, name) {
  const btn = () => layer.querySelector('[data-tv="rec"]');
  let timer = 0;
  const paint = (st) => {
    const b = btn();
    if (!b) return;
    b.classList.toggle('on', !!st);
    b.setAttribute('aria-label', t(st ? 'rec.open' : 'rec.start'));
    let tm = b.querySelector('.rectm');
    if (st) {
      if (!tm) { tm = document.createElement('span'); tm.className = 'rectm num'; b.appendChild(tm); }
      tm.textContent = fmtClock((Date.now() - st.t0) / 1000);
    } else if (tm) tm.remove();
  };
  const tick = () => paint(app.rec.state);
  const off = app.rec.subscribe((cur) => {
    clearInterval(timer);
    tick();
    if (cur) timer = setInterval(tick, 500);
  });
  tick();
  if (app.rec.active) timer = setInterval(tick, 500);
  // воспроизведение MIDI-записи: кнопка — «стоп»
  const paintPlay = () => {
    const b = btn(), on = !!(app.midi && app.midi.playing);
    if (!b || b.classList.contains('play') === on) return;
    b.classList.toggle('play', on);
    b.innerHTML = on ? icons.stop : REC_ICON;
    if (on) b.setAttribute('aria-label', t('midi.stop')); else paint(app.rec.state);
  };
  const offPlay = app.midi ? app.midi.subscribe(paintPlay) : () => {};
  layer.addEventListener('click', (e) => {
    if (!e.target.closest('[data-tv="rec"]')) return;
    if (app.midi && app.midi.playing && !app.rec.active) { app.midi.stop(); return; }
    recSheet(app, mod, host, name);
  });
  // окно закрывается — запись сохраняется
  return () => {
    off(); offPlay(); clearInterval(timer);
    if (app.rec.active) app.rec.stop().then((r) => { if (r) toast(t(r.kind === 'midi' ? 'midi.saved' : 'rec.saved', { name: r.name.replace(/\.[a-z0-9]+$/, '') })); });
  };
}
