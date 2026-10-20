// Проигрыватель проекта студии: ноты клипов — синтезатором пианино (свой звук у дорожки), ударные — drums.js,
// клипы-записи — записью из медиатеки с нужной секунды. Два режима: песня целиком по кругу и один клип по кругу
// (правка в редакторе). Планировщик как у метронома: просыпается каждые 25 мс и выставляет всё, что начнётся в
// ближайшие 300 мс, точно по времени контекста. Свинг — задержка слабых восьмых. Без DOM.
import { getContext } from './context.js';
import { presetOf } from './synth.js';
import { songNotes, songBeats, secPerBeat, clipById, trackOf } from '../music/project.js';
import { clickVoice, clickNoise } from './metronome.js';
import { drumHit } from './drums.js';
import { createFxChain } from './fx.js';

const TICK = 25, AHEAD = 0.3, AHEAD_HIDDEN = 1.6; // 0,3 с — запас на задержки главного потока под нагрузкой; свёрнуто: таймеры будят редко — планируем дальше вперёд
const ahead = () => (typeof document !== 'undefined' && document.visibilityState === 'hidden' ? AHEAD_HIDDEN : AHEAD);

// getFile(id) → запись медиатеки с blob (клипы-записи) или null
export function createSequencer({ mixer, synth, getProject, getFile = () => null, onBeat = () => {} }) {
  let c = null, timer = null, t0 = 0, nextBeat = 0, playing = false, noise = null, click = false, seq = 0, focus = null;
  const live = new Map(); // ключ голоса → таймер выключения
  const cache = { key: '', notes: [], total: 0 };
  const bufs = new Map(); // fileId → AudioBuffer | Promise
  let audioSrcs = [];
  // Цепочка эффектов на каждую дорожку (fx.js): создаётся один раз и живёт, пока дорожка есть в проекте;
  // ноты и удары дорожки идут в неё, она — в шину теории (записи — в шину медиа)
  const chains = new Map(); // trackId → { chain, fx }
  let chainsFor = null;
  function trackOut(p, tr) {
    if (chainsFor !== p.id) { // другой проект — старые цепочки освобождаем
      chains.forEach((x) => x.chain.dispose()); chains.clear(); chainsFor = p.id;
    }
    let x = chains.get(tr.id);
    if (!x || x.c !== c) {
      if (x) x.chain.dispose();
      const chain = createFxChain(c, tr.fx);
      chain.output.connect(mixer.bus(tr.kind === 'audio' ? 'media' : 'theory'));
      chains.set(tr.id, (x = { chain, fx: tr.fx, c }));
    } else if (x.fx !== tr.fx) { x.fx = tr.fx; x.chain.set(tr.fx); } // правка в шторке дорожки — новый объект
    return x.chain.input;
  }

  // что играть: песня или клип; соло — только оно; пересчёт при правке проекта
  const focusClip = (p) => (focus ? clipById(p, focus) : null);
  const plan = (p) => {
    const fc = focusClip(p), key = [p.updatedAt, fc ? fc.id : 'song'].join('|');
    if (cache.key === key) return cache;
    const solo = p.tracks.some((t) => t.solo);
    cache.key = key;
    cache.notes = songNotes(p, fc).filter((n) => !n.tr.mute && (!solo || n.tr.solo));
    cache.total = fc ? fc.len : songBeats(p);
    return cache;
  };
  const swingOf = (p, t) => (Math.abs(t % 1 - 0.5) < 1e-6 ? p.swing * (1 / 3) : 0); // слабая восьмая — позже, до триольной

  function sched() {
    const p = getProject();
    if (!p || !playing) return;
    // свёрнуто → развёрнуто: планировать сразу (таймер мог проспать)
    if (!sched.vis) { sched.vis = true; document.addEventListener('visibilitychange', () => { if (playing && document.visibilityState === 'visible') sched(); }); }
    const spb = secPerBeat(p), { notes, total } = plan(p), until = c.currentTime + ahead();
    while (t0 + nextBeat * spb < until) {
      const beatT = t0 + nextBeat * spb, inLoop = ((nextBeat % total) + total) % total;
      if (click) clickVoice(c, mixer.bus('metro'), beatT, inLoop % p.num === 0 ? 3 : 1, 'click', noise || (noise = clickNoise(c)));
      onBeat({ beat: inLoop, bar: Math.floor(inLoop / p.num), ms: (beatT - c.currentTime + (c.outputLatency || 0)) * 1000 });
      for (const n of notes) {
        if (n.t < inLoop) continue;
        if (n.t >= inLoop + 1) break;
        const at = beatT + (n.t - inLoop + swingOf(p, n.t)) * spb, out = trackOut(p, n.tr);
        if (n.drum) { drumHit(c, out, n.drum, at, n.v * n.tr.vol); continue; }
        const key = 'sq' + seq++, patch = presetOf(n.tr.inst) || presetOf('piano');
        synth.on(n.m, key, { bus: 'theory', out, patch: { ...patch, gain: (patch.gain || 1) * n.tr.vol }, vel: n.v, at });
        live.set(key, setTimeout(() => { live.delete(key); synth.off(key, false, at + n.d * spb); }, Math.max(0, (at + n.d * spb - c.currentTime) * 1000 - 60)));
      }
      nextBeat++;
    }
  }

  // Клипы-записи: запись раскодируется один раз; клип звучит с секунды off по кругу длиной клипа, в такт нотам.
  // Каждый клип — свой источник: старт в своей доле, остановка в конце; по кругу песни — заново
  async function startAudio(p) {
    const solo = p.tracks.some((t) => t.solo), fc = focusClip(p), { total } = plan(p), spb = secPerBeat(p), myT0 = t0;
    const clips = (fc ? [fc] : p.clips).filter((cl) => { const tr = trackOf(p, cl); return tr && tr.kind === 'audio' && cl.data.fileId && !tr.mute && (!solo || tr.solo); });
    for (const cl of clips) {
      const tr = trackOf(p, cl);
      let b = bufs.get(cl.data.fileId);
      if (!b) { const r = getFile(cl.data.fileId); if (!r || !r.blob) continue; b = r.blob.arrayBuffer().then((ab) => c.decodeAudioData(ab)).catch(() => null); bufs.set(cl.data.fileId, b); }
      b = await b;
      if (!b || !playing || t0 !== myT0) continue;
      const at = fc ? 0 : cl.at, len = cl.len * spb, loopSec = total * spb, out = trackOut(p, tr);
      // ближайшие проходы песни: текущий и следующие (планируем на 4 круга вперёд, дальше перезапуск по кругу)
      for (let k = 0; k < 4; k++) {
        const start = t0 + at * spb + k * loopSec, end = start + len;
        if (end <= c.currentTime) continue;
        const src = c.createBufferSource(), g = c.createGain();
        src.buffer = b; src.loop = true; src.loopStart = Math.min(cl.data.off || 0, b.duration - 0.01); src.loopEnd = b.duration;
        g.gain.value = tr.vol;
        src.connect(g).connect(out);
        const now = c.currentTime, late = Math.max(0, now - start);
        src.start(Math.max(now, start), Math.min(b.duration - 0.01, (cl.data.off || 0) + (late % Math.max(0.01, b.duration - (cl.data.off || 0)))));
        src.stop(end);
        audioSrcs.push(src);
      }
    }
  }
  const stopAudio = () => { audioSrcs.forEach((s) => { try { s.stop(); s.disconnect(); } catch { /* */ } }); audioSrcs = []; };
  // записи спланированы на 4 круга: по истечении — заново (таймер по кругу)
  let audioTm = 0;
  const scheduleAudio = (p) => { clearTimeout(audioTm); startAudio(p); const loopMs = plan(p).total * secPerBeat(p) * 1000; audioTm = setTimeout(() => { if (playing) { stopAudioLater(); scheduleAudio(p); } }, loopMs * 3); };
  const stopAudioLater = () => { const old = audioSrcs; audioSrcs = []; old.forEach((s) => { try { s.stop(c.currentTime + plan(getProject()).total * secPerBeat(getProject())); } catch { /* */ } }); };

  const api = {
    get playing() { return playing; },
    // что по кругу: id клипа (редактор) или null — вся песня
    get focus() { return focus; },
    set focus(id) { const was = playing; if (was) api.stop(); focus = id || null; if (was) api.start(); },
    set click(v) { click = !!v; },
    get click() { return click; },
    // где сейчас: доля от начала (песни или клипа) или -1
    pos() { const p = getProject(); if (!playing || !p) return -1; const total = plan(p).total, b = (c.currentTime - t0) / secPerBeat(p); return ((b % total) + total) % total; },
    start(fromBeat = 0) {
      c = getContext(mixer.state.mode);
      if (!c) return false;
      api.stop();
      const p = getProject();
      if (!p) return false;
      t0 = c.currentTime + 0.05 - fromBeat * secPerBeat(p);
      nextBeat = Math.floor(fromBeat);
      playing = true;
      sched();
      timer = setInterval(sched, TICK);
      scheduleAudio(p);
      return true;
    },
    stop() {
      clearInterval(timer); timer = null; clearTimeout(audioTm);
      playing = false;
      stopAudio();
      live.forEach((tm, key) => { clearTimeout(tm); synth.off(key, true); });
      live.clear();
    },
    toggle(fromBeat = 0) { return playing ? (api.stop(), false) : api.start(fromBeat); },
    // Одна нота или удар сразу (правка — услышать, что поставили)
    audition(tr, m) {
      c = getContext(mixer.state.mode);
      if (!c) return;
      const p = getProject(), out = p ? trackOut(p, tr) : mixer.bus('theory');
      if (tr.kind === 'drums') { drumHit(c, out, m, c.currentTime, 0.8); return; }
      const key = 'sqa' + seq++, patch = presetOf(tr.inst) || presetOf('piano');
      synth.on(m, key, { bus: 'theory', out, patch, vel: 0.7 });
      setTimeout(() => synth.off(key), 350);
    },
    // Эффекты дорожки изменены (шторка дорожки): применить к живой цепочке сразу
    setTrackFx(tr, fx) { tr.fx = fx; const x = chains.get(tr.id); if (x) { x.fx = fx; x.chain.set(fx); } },
    dispose() { api.stop(); chains.forEach((x) => x.chain.dispose()); chains.clear(); chainsFor = null; },
  };
  return api;
}
