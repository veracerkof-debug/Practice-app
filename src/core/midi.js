// MIDI в приложении: воспроизведение записанной игры в самом инструменте и приём с MIDI-клавиатуры.
// Инструмент, который понимает MIDI, отдаёт ядру midiIn(событие) и midiStop() (src/music/midi.js — формат событий).
// Пока окно инструмента открыто, он «слушает»: последний открытый получает клавиатуру; запись играет в своём инструменте.
// Клавиатура: Android — свой плагин (MidiPlugin.java: USB и Bluetooth MIDI через android.media.midi), веб — Web MIDI.
// Игра с клавиатуры записывается, как игра пальцами (recorder.js: midiEv). Воспроизведение в статистику не идёт:
// пока оно звучит, приложение не считает звук игрой (index.js: sounding).
import { Capacitor, registerPlugin } from '@capacitor/core';
import { createDecoder, takeDur } from '../music/midi.js';
import { log } from './log.js';

const Native = Capacitor.isNativePlatform() ? registerPlugin('Midi') : null;
export const SPEEDS = [0.5, 0.75, 1];

// Поток байтов (бывает несколько сообщений подряд, с бегущим статусом) → сообщения [статус, d1, d2]
export function splitBytes(bytes, state = { run: 0 }) {
  const out = [];
  let i = 0;
  while (i < bytes.length) {
    let st = bytes[i];
    if (st >= 0xf8) { i++; continue; }                      // такт, старт-стоп — не нужны
    if (st === 0xf0) { while (i < bytes.length && bytes[i] !== 0xf7) i++; i++; continue; } // SysEx
    if (st >= 0xf0) { i++; state.run = 0; continue; }
    if (st & 0x80) i++; else if (state.run) st = state.run; else { i++; continue; }
    state.run = st;
    const n = (st & 0xf0) === 0xc0 || (st & 0xf0) === 0xd0 ? 1 : 2;
    out.push([st, ...Array.from(bytes.slice(i, i + n))]);
    i += n;
  }
  return out;
}

export function createMidi(app) {
  const targets = [];   // открытые инструменты: { id, mod }
  const subs = new Set();
  const emit = () => subs.forEach((fn) => fn());
  let play = null;      // { rec, t, ev, i, p0, speed, ids, timer }
  const inp = { on: false, devices: [], err: null, web: null, dec: createDecoder({ prefix: 'k' }), state: { run: 0 } };

  const target = (id) => (id ? [...targets].reverse().find((x) => x.id === id) : targets.at(-1)) || null;

  function stop() {
    const P = play;
    if (!P) return;
    play = null;
    clearInterval(P.timer);
    P.ids.forEach((id) => { try { P.t.mod.midiIn({ t: 0, k: 'off', id }); } catch { /* окно закрыто */ } });
    try { P.t.mod.midiStop && P.t.mod.midiStop(); } catch { /* окно закрыто */ }
    emit();
  }

  // Сообщения с клавиатуры → инструмент (и в запись, если она идёт)
  function onBytes(bytes) {
    const tg = target();
    if (!tg) return;
    const now = performance.now() / 1000;
    for (const m of splitBytes(bytes, inp.state)) {
      for (const e of inp.dec.msg(now, m)) {
        try { tg.mod.midiIn(e); } catch (err) { log('midi', 'ошибка инструмента: ' + (err && err.message)); }
        app.rec && app.rec.midiEv(tg.id, e);
      }
    }
  }

  const listDevices = (list) => { inp.devices = list; emit(); };

  async function inputOn() {
    inp.err = null;
    if (Native) {
      try {
        const r = await Native.start();
        if (!inp.nativeSub) {
          inp.nativeSub = await Native.addListener('midi', ({ data }) => onBytes(data || []));
          await Native.addListener('devices', ({ devices }) => listDevices(devices || []));
        }
        listDevices((r && r.devices) || []);
        inp.on = true;
      } catch (e) { inp.err = 'unsupported'; log('midi', 'клавиатура: ' + (e && e.message)); }
    } else if (navigator.requestMIDIAccess) {
      try {
        const acc = await navigator.requestMIDIAccess();
        const hook = () => {
          const list = [];
          acc.inputs.forEach((p) => { p.onmidimessage = (e) => onBytes(e.data); list.push(p.name || 'MIDI'); });
          listDevices(list);
        };
        acc.onstatechange = hook;
        inp.web = acc;
        hook();
        inp.on = true;
      } catch (e) { inp.err = e && e.name === 'SecurityError' ? 'denied' : 'unsupported'; }
    } else inp.err = 'unsupported';
    emit();
    return !inp.err;
  }

  async function inputOff() {
    inp.on = false;
    if (Native) { try { await Native.stop(); } catch { /* уже */ } }
    if (inp.web) { inp.web.inputs.forEach((p) => { p.onmidimessage = null; }); inp.web.onstatechange = null; inp.web = null; }
    const tg = target();
    inp.dec.flush(0).forEach((e) => { try { tg && tg.mod.midiIn(e); } catch { /* ignore */ } });
    inp.devices = [];
    emit();
  }

  const api = {
    // Инструмент открыт (mountModule); → закрыть
    attach(id, mod) {
      const t = { id, mod };
      targets.push(t);
      return () => {
        const i = targets.indexOf(t);
        if (i >= 0) targets.splice(i, 1);
        if (play && play.t === t) stop();
      };
    },
    get playing() { return play && { id: play.rec.id, tool: play.t.id, p0: play.p0, dur: play.dur / play.speed }; },
    // Сыграть запись (kind 'midi': take.ev) в открытом инструменте tool. → false, если инструмент не открыт
    play(rec, { tool = rec.tool, speed = 1 } = {}) {
      stop();
      const t = target(tool), ev = rec && rec.take && rec.take.ev;
      if (!t || !ev || !ev.length) return false;
      const P = { rec, t, ev: [...ev].sort((a, b) => a.t - b.t), i: 0, p0: performance.now(), speed, ids: new Set(), dur: takeDur(ev) };
      play = P;
      const step = () => {
        if (play !== P) return;
        const now = ((performance.now() - P.p0) / 1000) * P.speed;
        while (P.i < P.ev.length && P.ev[P.i].t <= now) {
          const e = P.ev[P.i++], id = e.id != null ? 'pb' + e.id : e.id;
          if (e.k === 'on') P.ids.add(id); else if (e.k === 'off') P.ids.delete(id);
          try { P.t.mod.midiIn({ ...e, id }); } catch (err) { log('midi', 'воспроизведение: ' + (err && err.message)); }
        }
        if (P.i >= P.ev.length) stop();
      };
      P.timer = setInterval(step, 6);
      step();
      emit();
      return true;
    },
    stop,
    input: {
      get on() { return inp.on; },
      get devices() { return inp.devices; },
      get err() { return inp.err; },
      get supported() { return !!Native || !!navigator.requestMIDIAccess; },
      async set(on) {
        const st = app.store.state.settings;
        st.midiIn = !!on;
        app.store.settingsChanged();
        return on ? inputOn() : (inputOff(), true);
      },
      // при запуске приложения — если клавиатура была включена (на Android разрешение не нужно; в браузере
      // запрос только по нажатию, поэтому здесь — лишь там, где доступ уже выдан)
      async resume() {
        if (!app.store.state.settings.midiIn) return;
        if (Native) { inputOn(); return; }
        try { const p = await navigator.permissions.query({ name: 'midi' }); if (p.state === 'granted') inputOn(); } catch { /* браузер не умеет */ }
      },
    },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
  return api;
}
