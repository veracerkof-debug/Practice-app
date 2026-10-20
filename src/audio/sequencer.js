// Проигрыватель проекта студии: ноты клипов — синтезатором пианино (свой звук у дорожки) или сэмплером (запись из
// медиатеки по нотам — скорость воспроизведения от ноты root; записи раскодируются заранее), ударные — drums.js,
// клипы-записи — записью из медиатеки с нужной секунды. Режимы: песня по кругу (вся или петля region), один клип по
// кругу (правка в редакторе), один проход (сведение). Планировщик как у метронома: просыпается каждые 25 мс и
// выставляет всё, что начнётся в ближайшие 300 мс, точно по времени контекста. Свинг — задержка слабых восьмых.
// Отсчёт перед стартом (такты клика), уровни дорожек для микшера (анализаторы только пока микшер открыт). Без DOM.
import { after, every, cancel } from './clock.js';
import { getContext } from './context.js';
import { presetOf } from './synth.js';
import { songNotes, secPerBeat, clipById, trackOf, loopOf, autoAt } from '../music/project.js';
import { clickVoice, clickNoise } from './metronome.js';
import { drumHit } from './drums.js';
import { createFxChain } from './fx.js';

const TICK = 25, AHEAD = 0.3, AHEAD_HIDDEN = 1.6; // 0,3 с — запас на задержки главного потока под нагрузкой; свёрнуто: таймеры будят редко — планируем дальше вперёд
const ahead = () => (typeof document !== 'undefined' && document.visibilityState === 'hidden' ? AHEAD_HIDDEN : AHEAD);
const PASSES = 4; // записи планируются на столько кругов вперёд, дальше — перезапуск по кругу

// getFile(id) → запись медиатеки с blob (клипы-записи) или null
export function createSequencer({ mixer, synth, getProject, getFile = () => null, onBeat = () => {} }) {
  let c = null, timer = null, t0 = 0, nextBeat = 0, playing = false, noise = null, click = false, seq = 0, focus = null;
  let mode = { once: false, whole: false, from: 0, onEnd: null, endTm: 0 }, lead = 0; // lead — отсчёт перед стартом, в долях
  const live = new Map(); // ключ голоса → таймер выключения
  const cache = { key: '', notes: [], loop: { a: 0, b: 1 } };
  const bufs = new Map(); // fileId → AudioBuffer | Promise
  let audioSrcs = [];
  // Запись из медиатеки — буфером (один раз); сразу — если уже раскодирована, иначе обещание
  const bufOf = (fileId) => {
    let b = bufs.get(fileId);
    if (b === undefined) { const r = getFile(fileId); if (!r || !r.blob) return null; b = r.blob.arrayBuffer().then((ab) => c.decodeAudioData(ab)).then((ab) => { bufs.set(fileId, ab); return ab; }).catch(() => null); bufs.set(fileId, b); }
    return b;
  };
  const readyBuf = (fileId) => { const b = bufOf(fileId); return b && !(b instanceof Promise) ? b : null; };
  // Сэмплер: нота — запись со скоростью по высоте; огибающая 5 мс / 30 мс; стоп в конце ноты (или в конце записи)
  function sampleNote(buf, out, tr, m, at, dur, v) {
    const src = c.createBufferSource(), g = c.createGain(), root = (tr.sample && tr.sample.root) || 60;
    src.buffer = buf; src.playbackRate.value = Math.pow(2, (m - root) / 12);
    const end = at + Math.min(dur, buf.duration / src.playbackRate.value);
    g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(v, at + 0.005);
    g.gain.setValueAtTime(v, Math.max(at + 0.005, end - 0.03)); g.gain.linearRampToValueAtTime(0, end);
    src.connect(g).connect(out);
    src.start(at); src.stop(end + 0.01);
    audioSrcs.push(src);
    return src;
  }
  // Записи сэмплеров проекта — раскодировать заранее (к старту и к пробе)
  const prime = (p) => p.tracks.forEach((tr) => { if (tr.inst === 'sample' && tr.sample && tr.sample.fileId) bufOf(tr.sample.fileId); if (tr.kit) Object.values(tr.kit).forEach(bufOf); });
  // Удар: своя запись ряда (как есть, до 4 с) или синтез
  const hit = (tr, lane, out, at, v) => { const id = tr.kit && tr.kit[lane], buf = id && readyBuf(id); if (buf) sampleNote(buf, out, { sample: { root: 60 } }, 60, at, 4, v); else drumHit(c, out, lane, at, v); };
  // Цепочка эффектов и панорама на каждую дорожку (fx.js): создаются один раз и живут, пока дорожка есть в проекте;
  // ноты и удары дорожки идут в цепочку, она — в панораму — в шину теории (записи — в шину медиа)
  const chains = new Map(); // trackId → { chain, fx, pan, an, c }
  let chainsFor = null, metersOn = false;
  function trackOut(p, tr) {
    if (chainsFor !== p.id) { // другой проект — старые цепочки освобождаем
      chains.forEach((x) => x.chain.dispose()); chains.clear(); chainsFor = p.id;
    }
    let x = chains.get(tr.id);
    if (!x || x.c !== c) {
      if (x) x.chain.dispose();
      const chain = createFxChain(c, tr.fx), pan = c.createStereoPanner ? c.createStereoPanner() : c.createGain(), auto = c.createGain();
      if (pan.pan) pan.pan.value = tr.pan || 0;
      chain.output.connect(auto).connect(pan).connect(mixer.bus(tr.kind === 'audio' ? 'media' : 'theory'));
      chains.set(tr.id, (x = { chain, fx: tr.fx, pan, auto, an: null, c }));
      if (metersOn) meterOn(x);
    } else if (x.fx !== tr.fx) { x.fx = tr.fx; x.chain.set(tr.fx); } // правка в шторке дорожки — новый объект
    return x.chain.input;
  }
  const meterOn = (x) => { if (x.an) return; const an = x.c.createAnalyser(); an.fftSize = 512; an.smoothingTimeConstant = 0.5; x.pan.connect(an); x.an = an; x.buf = new Float32Array(an.fftSize); };
  const meterOff = (x) => { if (!x.an) return; try { x.pan.disconnect(x.an); } catch { /* */ } x.an = null; };

  // что играть: песня (или петля) либо клип; соло — только оно; пересчёт при правке проекта
  const focusClip = (p) => (focus ? clipById(p, focus) : null);
  const plan = (p) => {
    const fc = focusClip(p), key = [p.updatedAt, fc ? fc.id : 'song', p.region && !mode.whole ? p.region.a + '-' + p.region.b : ''].join('|');
    if (cache.key === key) return cache;
    const solo = p.tracks.some((t) => t.solo);
    cache.key = key;
    cache.notes = songNotes(p, fc).filter((n) => !n.tr.mute && (!solo || n.tr.solo));
    cache.loop = mode.whole && !fc ? loopOf({ ...p, region: null }) : loopOf(p, fc);
    return cache;
  };
  const swingOf = (p, t) => (Math.abs(t % 1 - 0.5) < 1e-6 ? p.swing * (1 / 3) : 0); // слабая восьмая — позже, до триольной
  // Счётчик долей от старта → доля песни: до петли — как есть, дальше — по кругу петли
  const songBeat = (n, { a, b }) => { const L = b - a; return n < a ? n : a + (((n - a) % L) + L) % L; };

  function sched() {
    const p = getProject();
    if (!p || !playing) return;
    // свёрнуто → развёрнуто: планировать сразу (таймер мог проспать)
    if (!sched.vis) { sched.vis = true; document.addEventListener('visibilitychange', () => { if (playing && document.visibilityState === 'visible') sched(); }); }
    const spb = secPerBeat(p), { notes, loop } = plan(p), until = c.currentTime + ahead();
    while (t0 + nextBeat * spb < until) {
      if (mode.once && nextBeat >= loop.b) { // один проход: конец петли — хвост и стоп
        if (!mode.endTm) { const end = t0 + nextBeat * spb + 2.5; mode.endTm = after(Math.max(0, (end - c.currentTime) * 1000), () => { const fn = mode.onEnd; api.stop(); if (fn) fn(); }); }
        return;
      }
      const beatT = t0 + nextBeat * spb, inLoop = songBeat(nextBeat, loop);
      if (click) clickVoice(c, mixer.bus('metro'), beatT, inLoop % p.num === 0 ? 3 : 1, 'click', noise || (noise = clickNoise(c)));
      onBeat({ beat: inLoop, bar: Math.floor(inLoop / p.num), ms: (beatT - c.currentTime + (c.outputLatency || 0)) * 1000 });
      for (const n of notes) {
        if (n.t < inLoop) continue;
        if (n.t >= inLoop + 1 || n.t >= loop.b) break;
        const at = beatT + (n.t - inLoop + swingOf(p, n.t)) * spb, out = trackOut(p, n.tr), g = n.tr.vol * (n.gain || 1);
        if (n.drum) { hit(n.tr, n.drum, out, at, n.v * g); continue; }
        if (n.tr.inst === 'sample') { const buf = n.tr.sample && n.tr.sample.fileId && readyBuf(n.tr.sample.fileId); if (buf) sampleNote(buf, out, n.tr, n.m, at, n.d * spb, n.v * g); continue; }
        const key = 'sq' + seq++, patch = presetOf(n.tr.inst) || presetOf('piano');
        synth.on(n.m, key, { bus: 'theory', out, patch: { ...patch, gain: (patch.gain || 1) * g }, vel: n.v, at });
        live.set(key, after(Math.max(0, (at + n.d * spb - c.currentTime) * 1000 - 60), () => { live.delete(key); synth.off(key, false, at + n.d * spb); }));
      }
      nextBeat++;
    }
  }

  // Клипы-записи: запись раскодируется один раз; клип звучит с секунды off по кругу длиной клипа, в такт нотам.
  // Окна проигрывания: до петли (если старт раньше неё) и круги петли; в каждом окне — кусок клипа, что в него попал
  function windows(p) {
    const { loop } = plan(p), fc = focusClip(p), out = [];
    const from = mode.from;
    if (!fc && from < loop.a) out.push({ s0: from, s1: loop.a, at: from });
    for (let k = 0; k < (mode.once ? 1 : PASSES); k++) out.push({ s0: fc ? fc.at : loop.a, s1: fc ? fc.at + fc.len : loop.b, at: loop.a + k * (loop.b - loop.a) });
    return out;
  }
  async function startAudio(p) {
    const solo = p.tracks.some((t) => t.solo), fc = focusClip(p), spb = secPerBeat(p), myT0 = t0;
    const clips = (fc ? [fc] : p.clips).filter((cl) => { const tr = trackOf(p, cl); return tr && tr.kind === 'audio' && cl.data.fileId && !tr.mute && (!solo || tr.solo) && (!cl.mute || fc); });
    for (const cl of clips) {
      const tr = trackOf(p, cl);
      let b = bufOf(cl.data.fileId);
      if (!b) continue;
      b = await b;
      if (!b || !playing || t0 !== myT0) continue;
      const out = trackOut(p, tr), off = Math.min(cl.data.off || 0, b.duration - 0.01), span = Math.max(0.01, b.duration - off), vol = tr.vol * (cl.gain == null ? 1 : cl.gain);
      for (const w of windows(p)) {
        const s0 = Math.max(cl.at, w.s0), s1 = Math.min(cl.at + cl.len, w.s1);
        if (s1 - s0 < 1e-6) continue;
        const start = t0 + (w.at + (s0 - w.s0)) * spb, end = start + (s1 - s0) * spb;
        if (end <= c.currentTime) continue;
        const src = c.createBufferSource(), g = c.createGain();
        src.buffer = b; src.loop = true; src.loopStart = off; src.loopEnd = b.duration;
        const now = c.currentTime, late = Math.max(0, now - start), t1 = Math.max(now, start);
        // затухания клипа (в долях): в начале и в конце клипа, если это окно их захватывает
        const fi = (cl.data.fadeIn || 0) * spb, fo = (cl.data.fadeOut || 0) * spb;
        g.gain.setValueAtTime(vol, t1);
        if (fi > 0 && s0 === cl.at) { g.gain.setValueAtTime(0, t1); g.gain.linearRampToValueAtTime(vol, Math.max(t1 + 0.005, start + fi)); }
        if (fo > 0 && Math.abs(s1 - (cl.at + cl.len)) < 1e-6 && end - fo > t1) { g.gain.setValueAtTime(vol, end - fo); g.gain.linearRampToValueAtTime(0, end); }
        src.connect(g).connect(out);
        src.start(t1, off + (((s0 - cl.at) * spb + late) % span));
        src.stop(end);
        audioSrcs.push(src);
      }
    }
  }
  const stopAudio = () => { audioSrcs.forEach((s) => { try { s.stop(); s.disconnect(); } catch { /* */ } }); audioSrcs = []; };
  // Автоматизация: огибающие громкости (множитель) и панорамы дорожки — прямыми между точками, по окнам петли;
  // от текущего места — значение сейчас, дальше — точки. Без точек — как ручки
  function scheduleAuto(p) {
    const spb = secPerBeat(p), now = c.currentTime, b0 = Math.max(0, (now - t0) / spb), ws = windows(p);
    p.tracks.forEach((tr) => {
      const x = chains.get(tr.id) || (trackOut(p, tr), chains.get(tr.id)), a = tr.auto || {};
      [['vol', x.auto.gain, 1], ['pan', x.pan.pan, tr.pan || 0]].forEach(([k, param, def]) => {
        if (!param) return;
        param.cancelScheduledValues(now);
        const pts = a[k];
        if (!pts || !pts.length) { param.setValueAtTime(def, now); return; }
        param.setValueAtTime(autoAt(pts, songBeat(b0, plan(p).loop), def), now);
        ws.forEach((w) => {
          const tw = (sb) => t0 + (w.at + (sb - w.s0)) * spb; // время доли песни sb в этом окне
          if (tw(w.s0) > now) param.setValueAtTime(autoAt(pts, w.s0, def), tw(w.s0));
          pts.forEach((q) => { if (q.t > w.s0 && q.t < w.s1 && tw(q.t) > now) param.linearRampToValueAtTime(q.v, tw(q.t)); });
          if (tw(w.s1) > now) param.linearRampToValueAtTime(autoAt(pts, w.s1, def), tw(w.s1));
        });
      });
    });
  }
  const resetAuto = () => chains.forEach((x) => { const now = x.c.currentTime; x.auto.gain.cancelScheduledValues(now); x.auto.gain.setValueAtTime(1, now); if (x.pan.pan) { x.pan.pan.cancelScheduledValues(now); } });
  // записи спланированы на несколько кругов: по истечении — заново (таймер по кругу)
  let audioTm = 0;
  const loopSec = (p) => { const { loop } = plan(p); return (loop.b - loop.a) * secPerBeat(p); };
  const scheduleAudio = (p) => { cancel(audioTm); startAudio(p); scheduleAuto(p); if (mode.once) return; const ms = loopSec(p) * 1000; audioTm = after(ms * (PASSES - 1), () => { if (playing) { stopAudioLater(); mode.from = plan(p).loop.a; scheduleAudio(p); } }); };
  const stopAudioLater = () => { const old = audioSrcs; audioSrcs = []; old.forEach((s) => { try { s.stop(c.currentTime + loopSec(getProject())); } catch { /* */ } }); };

  const api = {
    get playing() { return playing; },
    // что по кругу: id клипа (редактор) или null — вся песня
    get focus() { return focus; },
    set focus(id) { const was = playing; if (was) api.stop(); focus = id || null; if (was) api.start(); },
    set click(v) { click = !!v; },
    get click() { return click; },
    get context() { return c; },
    // время старта (часы контекста) — доля 0 песни; до него идёт отсчёт
    get t0() { return t0; },
    // где сейчас: доля от начала (песни или клипа) или -1; во время отсчёта — отрицательная доля (−4 … 0)
    pos() {
      const p = getProject(); if (!playing || !p) return -1;
      const b = (c.currentTime - t0) / secPerBeat(p);
      if (b < mode.from) return Math.max(-lead, b - mode.from) - (b < mode.from - 1e-3 ? 0 : 0);
      return songBeat(b, plan(p).loop);
    },
    // opts: countIn — тактов отсчёта кликом до старта; once — один проход до конца петли (сведение), onEnd — по концу;
    //       whole — вся песня, петля не в счёт (сведение)
    start(fromBeat = 0, { countIn = 0, once = false, whole = false, onEnd = null } = {}) {
      c = getContext(mixer.state.mode);
      if (!c) return false;
      api.stop();
      const p = getProject();
      if (!p) return false;
      mode = { once: !!once, whole: !!whole, from: 0, onEnd, endTm: 0 };
      cache.key = '';
      const spb = secPerBeat(p), { loop } = plan(p);
      let from = Math.max(0, fromBeat);
      if (!focusClip(p) && from >= loop.b) from = loop.a;
      lead = Math.max(0, Math.round(countIn)) * p.num;
      mode.from = from;
      t0 = c.currentTime + 0.05 + lead * spb - from * spb;
      nextBeat = Math.floor(from);
      playing = true;
      prime(p);
      if (lead) for (let i = 0; i < lead; i++) clickVoice(c, mixer.bus('metro'), t0 + (from - lead + i) * spb, i % p.num === 0 ? 3 : 1, 'click', noise || (noise = clickNoise(c)));
      sched();
      timer = every(TICK, sched);
      scheduleAudio(p);
      return true;
    },
    stop() {
      cancel(timer); timer = null; cancel(audioTm); cancel(mode.endTm); mode.endTm = 0;
      if (mode.whole) { mode.whole = false; cache.key = ''; }
      playing = false;
      stopAudio();
      resetAuto();
      { const p = getProject(); if (p) p.tracks.forEach((tr) => { const x = chains.get(tr.id); if (x && x.pan.pan) x.pan.pan.setValueAtTime(tr.pan || 0, x.c.currentTime); }); }
      live.forEach((tm, key) => { if (tm && tm.stop) { try { tm.stop(); } catch { /* */ } } else { cancel(tm); synth.off(key, true); } });
      live.clear();
    },
    toggle(fromBeat = 0) { return playing ? (api.stop(), false) : api.start(fromBeat); },
    // Одна нота или удар сразу (правка — услышать, что поставили); hold — держать, пока не отпустят (клавиши, пэды)
    audition(tr, m, { hold = false, vel = 0.7 } = {}) {
      c = getContext(mixer.state.mode);
      if (!c) return null;
      const p = getProject(), out = p ? trackOut(p, tr) : mixer.bus('theory');
      if (tr.kind === 'drums') { const id = tr.kit && tr.kit[m]; if (id && !readyBuf(id)) { const b = bufOf(id); if (b instanceof Promise) b.then(() => hit(tr, m, out, c.currentTime, vel + 0.1)); } else hit(tr, m, out, c.currentTime, vel + 0.1); return null; }
      if (tr.inst === 'sample') { // сэмплер: сразу, если запись готова; иначе раскодировать и сыграть, когда будет
        const id = tr.sample && tr.sample.fileId; if (!id) return null;
        const play = (buf) => { if (!buf) return; const src = sampleNote(buf, out, tr, m, c.currentTime, hold ? 60 : 0.6, vel); if (hold) { const k = 'sqs' + seq++; live.set(k, src); return k; } };
        const b = bufOf(id);
        if (!b) return null;
        if (b instanceof Promise) { b.then(play); return null; }
        return play(b);
      }
      const key = 'sqa' + seq++, patch = presetOf(tr.inst) || presetOf('piano');
      synth.on(m, key, { bus: 'theory', out, patch, vel });
      if (!hold) after(350, () => synth.off(key));
      return key;
    },
    release(key) {
      if (!key) return;
      const src = live.get(key);
      if (src && src.stop) { live.delete(key); try { src.stop(c.currentTime + 0.03); } catch { /* */ } return; } // нота сэмплера
      synth.off(key);
    },
    // Эффекты и панорама дорожки изменены (шторка, микшер): применить к живой цепочке сразу
    setTrackFx(tr, fx) { tr.fx = fx; const x = chains.get(tr.id); if (x) { x.fx = fx; x.chain.set(fx); } },
    setTrackPan(tr, v) { tr.pan = v; const x = chains.get(tr.id); if (x && x.pan.pan && !(playing && tr.auto && tr.auto.pan)) x.pan.pan.setTargetAtTime(v, x.c.currentTime, 0.02); },
    // Точки автоматизации изменились (плейлист): пересчитать огибающие на ходу
    autoChanged() { if (playing) scheduleAuto(getProject()); },
    // Уровни дорожек для микшера: включить анализаторы (только пока микшер открыт), level(trId) → 0…1 (пик)
    meters(on) { metersOn = !!on; chains.forEach((x) => (on ? meterOn(x) : meterOff(x))); },
    level(trId) {
      const x = chains.get(trId); if (!x || !x.an) return 0;
      x.an.getFloatTimeDomainData(x.buf);
      let m = 0; for (let i = 0; i < x.buf.length; i++) { const v = Math.abs(x.buf[i]); if (v > m) m = v; }
      return Math.min(1, m);
    },
    dispose() { api.stop(); chains.forEach((x) => x.chain.dispose()); chains.clear(); chainsFor = null; },
  };
  return api;
}
