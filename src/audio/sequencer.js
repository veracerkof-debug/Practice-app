// Проигрыватель проекта студии: ноты дорожек — синтезатором пианино (свой звук у дорожки), по кругу или до конца.
// Планировщик как у метронома: просыпается каждые 25 мс и выставляет всё, что начнётся в ближайшие 150 мс,
// точно по времени контекста. Клик — голосом метронома. Без DOM.
import { getContext } from './context.js';
import { presetOf } from './synth.js';
import { trackNotes, beatsOf, secPerBeat } from '../music/project.js';
import { clickVoice, clickNoise } from './metronome.js';

const TICK = 25, AHEAD = 0.15;

export function createSequencer({ mixer, synth, getProject, onBeat = () => {} }) {
  let c = null, timer = null, t0 = 0, nextBeat = 0, playing = false, noise = null, click = false, seq = 0;
  const live = new Map(); // ключ голоса → таймер выключения
  const cache = { p: null, upd: 0, notes: [] };

  // ноты всех звучащих дорожек (соло — только они), отсортированы по началу; пересчёт при правке проекта
  const notes = (p) => {
    if (cache.p === p && cache.upd === p.updatedAt) return cache.notes;
    const solo = p.tracks.some((t) => t.solo), list = [];
    p.tracks.forEach((tr) => { if (tr.mute || (solo && !tr.solo)) return; trackNotes(tr, p).forEach((n) => list.push({ ...n, tr })); });
    list.sort((a, b) => a.t - b.t);
    cache.p = p; cache.upd = p.updatedAt; cache.notes = list;
    return list;
  };

  function sched() {
    const p = getProject();
    if (!p || !playing) return;
    const spb = secPerBeat(p), total = beatsOf(p), until = c.currentTime + AHEAD;
    while (t0 + nextBeat * spb < until) {
      const beatT = t0 + nextBeat * spb, inLoop = ((nextBeat % total) + total) % total;
      if (!p.loop && nextBeat >= total) { api.stop(); return; }
      if (click) clickVoice(c, mixer.bus('metro'), beatT, inLoop % p.num === 0 ? 3 : 1, 'click', noise || (noise = clickNoise(c)));
      onBeat({ beat: inLoop, bar: Math.floor(inLoop / p.num), ms: (beatT - c.currentTime + (c.outputLatency || 0)) * 1000 });
      // ноты, начинающиеся в этой доле (с сеткой внутри доли)
      notes(p).forEach((n) => {
        if (n.t < inLoop || n.t >= inLoop + 1) return;
        const at = beatT + (n.t - inLoop) * spb, key = 'sq' + seq++, patch = presetOf(n.tr.inst) || presetOf('piano');
        synth.on(n.m, key, { bus: 'theory', patch: { ...patch, gain: (patch.gain || 1) * n.tr.vol }, vel: n.v, at });
        const off = setTimeout(() => { live.delete(key); synth.off(key, false, at + n.d * spb); }, Math.max(0, (at + n.d * spb - c.currentTime) * 1000 - 60));
        live.set(key, off);
      });
      nextBeat++;
    }
  }

  const api = {
    get playing() { return playing; },
    set click(v) { click = !!v; },
    get click() { return click; },
    // где сейчас (доля от начала петли, дробная) или -1
    pos() { const p = getProject(); if (!playing || !p) return -1; const b = (c.currentTime - t0) / secPerBeat(p), total = beatsOf(p); return ((b % total) + total) % total; },
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
      return true;
    },
    stop() {
      clearInterval(timer); timer = null;
      playing = false;
      live.forEach((tm, key) => { clearTimeout(tm); synth.off(key, true); });
      live.clear();
    },
    toggle() { return playing ? (api.stop(), false) : api.start(); },
    // Одна нота сразу (правка в пиано-ролле — услышать, что поставили)
    audition(tr, m) {
      c = getContext(mixer.state.mode);
      if (!c) return;
      const key = 'sqa' + seq++, patch = presetOf(tr.inst) || presetOf('piano');
      synth.on(m, key, { bus: 'theory', patch, vel: 0.7 });
      setTimeout(() => synth.off(key), 350);
    },
  };
  return api;
}
