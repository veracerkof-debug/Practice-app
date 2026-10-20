// Проигрыватель проекта студии: ноты дорожек — синтезатором пианино (свой звук у дорожки), ударные — drums.js,
// дорожки-петли — записью из медиатеки. Два режима, как в FL Studio: паттерн по кругу (правка) и песня —
// плейлист целиком (по кругу). Планировщик как у метронома: просыпается каждые 25 мс и выставляет всё, что
// начнётся в ближайшие 150 мс, точно по времени контекста. Свинг — задержка слабых восьмых. Без DOM.
import { getContext } from './context.js';
import { presetOf } from './synth.js';
import { songNotes, songBeats, patBeats, secPerBeat, curPattern } from '../music/project.js';
import { clickVoice, clickNoise } from './metronome.js';
import { drumHit } from './drums.js';

const TICK = 25, AHEAD = 0.15;

// getFile(id) → запись медиатеки с blob (дорожки-петли) или null
export function createSequencer({ mixer, synth, getProject, getFile = () => null, onBeat = () => {} }) {
  let c = null, timer = null, t0 = 0, nextBeat = 0, playing = false, noise = null, click = false, seq = 0, mode = 'pattern';
  const live = new Map(); // ключ голоса → таймер выключения
  const cache = { key: '', notes: [], total: 0 };
  const bufs = new Map(); // fileId → AudioBuffer | Promise
  let audioSrcs = [];

  // что играть: паттерн или песня; соло — только оно; пересчёт при правке проекта
  const plan = (p) => {
    const pat = curPattern(p), key = [p.updatedAt, mode, pat.id].join('|');
    if (cache.key === key) return cache;
    const solo = p.tracks.some((t) => t.solo);
    cache.key = key;
    cache.notes = songNotes(p, mode === 'pattern' ? pat : null).filter((n) => !n.tr.mute && (!solo || n.tr.solo));
    cache.total = mode === 'pattern' ? patBeats(p, pat) : songBeats(p);
    return cache;
  };
  const swingOf = (p, t) => (Math.abs(t % 1 - 0.5) < 1e-6 ? p.swing * (1 / 3) : 0); // слабая восьмая — позже, до триольной

  function sched() {
    const p = getProject();
    if (!p || !playing) return;
    const spb = secPerBeat(p), { notes, total } = plan(p), until = c.currentTime + AHEAD, bus = mixer.bus('theory');
    while (t0 + nextBeat * spb < until) {
      const beatT = t0 + nextBeat * spb, inLoop = ((nextBeat % total) + total) % total;
      if (click) clickVoice(c, mixer.bus('metro'), beatT, inLoop % p.num === 0 ? 3 : 1, 'click', noise || (noise = clickNoise(c)));
      onBeat({ beat: inLoop, bar: Math.floor(inLoop / p.num), ms: (beatT - c.currentTime + (c.outputLatency || 0)) * 1000 });
      for (const n of notes) {
        if (n.t < inLoop) continue;
        if (n.t >= inLoop + 1) break;
        const at = beatT + (n.t - inLoop + swingOf(p, n.t)) * spb;
        if (n.drum) { drumHit(c, bus, n.drum, at, n.v * n.tr.vol); continue; }
        const key = 'sq' + seq++, patch = presetOf(n.tr.inst) || presetOf('piano');
        synth.on(n.m, key, { bus: 'theory', patch: { ...patch, gain: (patch.gain || 1) * n.tr.vol }, vel: n.v, at });
        live.set(key, setTimeout(() => { live.delete(key); synth.off(key, false, at + n.d * spb); }, Math.max(0, (at + n.d * spb - c.currentTime) * 1000 - 60)));
      }
      nextBeat++;
    }
  }

  // Дорожки-петли: записи раскодируются один раз, звучат по кругу длиной песни или паттерна, в такт с нотами
  async function startAudio(p) {
    const solo = p.tracks.some((t) => t.solo), total = plan(p).total * secPerBeat(p), myT0 = t0;
    for (const tr of p.tracks) {
      if (tr.kind !== 'audio' || !tr.fileId || tr.mute || (solo && !tr.solo)) continue;
      let b = bufs.get(tr.fileId);
      if (!b) { const r = getFile(tr.fileId); if (!r || !r.blob) continue; b = r.blob.arrayBuffer().then((ab) => c.decodeAudioData(ab)).catch(() => null); bufs.set(tr.fileId, b); }
      b = await b;
      if (!b || !playing || t0 !== myT0) continue;
      const src = c.createBufferSource(), g = c.createGain();
      src.buffer = b; src.loop = true; src.loopStart = 0; src.loopEnd = Math.min(b.duration, total);
      g.gain.value = tr.vol;
      src.connect(g).connect(mixer.bus('media'));
      const now = c.currentTime, off = ((now - t0) % src.loopEnd + src.loopEnd) % src.loopEnd;
      src.start(Math.max(now, t0), t0 > now ? 0 : off);
      audioSrcs.push(src);
    }
  }
  const stopAudio = () => { audioSrcs.forEach((s) => { try { s.stop(); s.disconnect(); } catch { /* */ } }); audioSrcs = []; };

  const api = {
    get playing() { return playing; },
    get mode() { return mode; },
    set mode(v) { const was = playing; if (was) api.stop(); mode = v === 'song' ? 'song' : 'pattern'; if (was) api.start(); },
    set click(v) { click = !!v; },
    get click() { return click; },
    // где сейчас: доля от начала (паттерна или песни) или -1
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
      startAudio(p);
      return true;
    },
    stop() {
      clearInterval(timer); timer = null;
      playing = false;
      stopAudio();
      live.forEach((tm, key) => { clearTimeout(tm); synth.off(key, true); });
      live.clear();
    },
    toggle() { return playing ? (api.stop(), false) : api.start(); },
    // Одна нота или удар сразу (правка — услышать, что поставили)
    audition(tr, m) {
      c = getContext(mixer.state.mode);
      if (!c) return;
      if (tr.kind === 'drums') { drumHit(c, mixer.bus('theory'), m, c.currentTime, 0.8); return; }
      const key = 'sqa' + seq++, patch = presetOf(tr.inst) || presetOf('piano');
      synth.on(m, key, { bus: 'theory', patch, vel: 0.7 });
      setTimeout(() => synth.off(key), 350);
    },
  };
  return api;
}
