// Пэды и дрон: 12 нот, слои по октавам, тембры, созвучия, характер звука, плавная смена нот, пресеты.
// Перенесено из legacy/practice.html (droneHTML, droneSheet, обработчики dpad/dstop/dlayer).
import './drone.css';
import ru from './i18n/ru.json';
import uz from './i18n/uz.json';
import en from './i18n/en.json';
import el from './i18n/el.json';
import { SOUNDS, CHORDS, LAYERS, normalizeDrone } from '../../audio/drone.js';
import { presetRow, promptName, presetManager } from '../../ui/presets.js';

const ICON = '<svg viewBox="0 0 24 24"><path d="M3 12h3l2-5 3 10 3-8 2 5 2-2h3"/></svg>';
const NOTE_ICON = '<svg viewBox="0 0 24 24"><path d="M9 18V6l11-2.5V15.5"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="15.5" r="2.5"/></svg>';
const SH = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
// Что сохраняется в пресет пэдов
const PRESET_KEYS = ['sound', 'chord', 'bright', 'move', 'width', 'fade', 'rev', 'vol', 'layers', 'xfade'];

let host = null, ctx = null, size = 'full';
let onClick = null;

const D = () => normalizeDrone(ctx.store.all());
const DR = () => ctx.audio.drone;

/* ---------- разметка ---------- */

function view() {
  const { t, ui } = ctx, d = D(), on = DR().on;
  const grid = (cls) => '<div class="dgrid ' + cls + '" role="group" aria-label="' + t('notes') + '">' + SH.map((n, i) => {
    const act = on && d.pc === i;
    return '<button class="dtile' + (n.length > 1 ? ' sh' : '') + (act ? ' on' : '') + '" data-x="dpad" data-v="' + i + '" aria-pressed="' + act + '" aria-label="' +
      t('pad', { n }) + '">' + n.replace('♯', '<span class="acc">♯</span>') + '</button>';
  }).join('') + '</div>';
  const stop = '<button class="dstop' + (on ? ' live' : '') + '" data-x="dstop" aria-label="' + t('stop') + '"' + (on ? '' : ' disabled') + '><span></span></button>';
  const layers = '<div class="layers" role="group" aria-label="' + t('layers') + '">' + LAYERS.map((o) => '<button class="lay' + (d.layers[o] ? ' on' : '') +
    '" data-x="dlayer" data-v="' + o + '" aria-pressed="' + !!d.layers[o] + '" aria-label="' + t('layer.' + o + '.full') + '">' + t('layer.' + o) + '</button>').join('') + '</div>';
  const snd = ui.icb('data-x="dsndsheet"', NOTE_ICON, t('timbreBtn'), 'plain');
  if (size === 'quarter') return '<div class="dwrap">' + grid('g3') + '<div class="dbar q">' + stop + '</div></div>';
  if (size === 'strip') return '<div class="srow2 dstrip">' + grid('g6') + stop + '</div>';
  return '<div class="dwrap">' + grid(size === 'half' ? 'g4' : 'g3') + '<div class="dbar">' + ui.icb('data-x="dset"', ui.icons.gear, t('settings'), 'plain') + layers + stop + snd + '</div></div>';
}

function render() {
  if (host) host.innerHTML = view();
}

/* ---------- настройки пэдов ---------- */

function droneSheet() {
  const { t, ui } = ctx, d = D(), api = ctx.presets('drone');
  const P = (v) => Math.round(v * 100) + '%', SF = (v) => t('u.s', { n: ctx.num(+v, 1) });
  const sl = (k, min, max, step, f) => '<div class="sslider"><div class="ssl"><span>' + t('k.' + k) + '</span><b class="num" id="dv-' + k + '">' + f(d[k]) +
    '</b></div><input type="range" class="range" data-dk="' + k + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + d[k] + '" aria-label="' + t('k.' + k) + '"></div>';
  const body = () => ui.snav(t('set.title')) + presetRow(api, d.preset, []) +
    '<div class="hdr" style="margin-top:4px">' + t('timbre') + '</div><div class="dsnd" role="group" aria-label="' + t('timbre') + '">' + Object.keys(SOUNDS).map((k) => '<button class="dsb' +
      (d.sound === k ? ' on' : '') + '" data-ds="' + k + '" aria-pressed="' + (d.sound === k) + '"><b>' + t('snd.' + k) + '</b><span>' + t('snd.' + k + '.d') + '</span></button>').join('') + '</div>' +
    '<div class="hdr">' + t('chord') + '</div><div class="group"><div class="cellcol">' + ui.seg('dch', Object.keys(CHORDS).map((k) => [k, t('ch.' + k)]), d.chord, t('chord')) +
    '</div></div><p class="ftr">' + t('chord.ftr') + '</p>' +
    '<div class="hdr">' + t('character') + '</div><div class="group sgroup">' + sl('bright', 0, 1, 0.01, P) + sl('move', 0, 1, 0.01, P) + sl('width', 0, 1, 0.01, P) + '</div>' +
    '<div class="hdr">' + t('space') + '</div><div class="group sgroup">' + sl('fade', 0.2, 6, 0.1, SF) + sl('rev', 0, 1, 0.01, P) + sl('vol', 0, 1, 0.01, P) + '</div>' +
    '<div class="group" style="margin-top:12px"><div class="cell"><span class="grow">' + t('xfade') + '</span>' + ui.sw('dxf', d.xfade, t('xfade')) + '</div></div>';
  ui.sheet(body, (el, sh) => {
    let rt = 0;
    const later = () => { clearTimeout(rt); rt = setTimeout(() => DR().retune(), 350); };
    const changed = () => { ctx.store.save(); sh.update(); render(); };
    el.addEventListener('click', (e) => {
      const g = (s) => e.target.closest(s);
      let b;
      if (g('[data-psave]')) {
        promptName(t('pre.new'), d.pname ? d.pname + ' 2' : t('pre.default'), (v) => {
          const id = api.add(v, PRESET_KEYS.reduce((o, k) => ((o[k] = d[k]), o), {}));
          d.preset = id;
          d.pname = v;
          changed();
          ui.toast(t('preset.saved'));
        });
        return;
      }
      if (g('[data-pman]')) { presetManager(api, () => sh.update()); return; }
      if ((b = g('[data-upre]'))) {
        const p = api.get(b.dataset.upre);
        if (p) { Object.assign(d, JSON.parse(JSON.stringify(p.data)), { preset: p.id, pname: p.name }); changed(); DR().retune(); }
        return;
      }
      if ((b = g('[data-ds]'))) { d.preset = null; d.sound = b.dataset.ds; d.bright = SOUNDS[d.sound]; changed(); DR().retune(); }
      else if ((b = g('[data-seg="dch"] [data-v]'))) { d.chord = b.dataset.v; d.fifth = d.chord !== 'root'; changed(); DR().retune(); }
    });
    el.addEventListener('input', (e) => {
      const k = e.target.dataset.dk;
      if (!k) return;
      d[k] = +e.target.value;
      const v = el.querySelector('#dv-' + k);
      if (v) v.textContent = (k === 'fade' ? SF : P)(d[k]);
      ctx.store.save();
      if (k === 'vol') DR().vol();
      else if (k === 'rev') DR().setReverb(d.rev);
      else if (k !== 'fade') later();
    });
    el.addEventListener('change', (e) => { if (e.target.dataset.sw === 'dxf') { d.xfade = e.target.checked; ctx.store.save(); } });
  });
}

/* ---------- жесты ---------- */

function bind() {
  onClick = (e) => {
    const x = e.target.closest('[data-x]');
    if (!x) return;
    const d = D(), a = x.dataset.x;
    if (a === 'dpad') {
      const i = +x.dataset.v;
      if (DR().on && d.pc === i) DR().stop();
      else {
        if (!ctx.audio.unlock()) { ctx.ui.toast(ctx.t('noAudio')); return; }
        d.pc = i;
        ctx.store.save();
        DR().on ? DR().swap() : DR().start();
      }
      render();
    } else if (a === 'dstop') { DR().stop(); render(); }
    else if (a === 'dlayer') {
      const o = +x.dataset.v, L = d.layers;
      if (L[o] && LAYERS.filter((y) => L[y]).length === 1) { ctx.ui.toast(ctx.t('needLayer')); return; }
      L[o] = !L[o];
      ctx.store.save();
      DR().retune();
      render();
    } else if (a === 'dset' || a === 'dsndsheet') droneSheet();
  };
  host.addEventListener('click', onClick);
}

export default {
  id: 'drone',
  order: 40,
  name: { ru: ru.name, uz: uz.name, en: en.name, el: el.name },
  i18n: { ru, uz, en, el },
  icon: ICON,
  color: '#30B0C7',
  sizes: ['full', 'half', 'quarter', 'strip'],
  group: 'keys',
  status: (c) => { const d = c.store.all(); return c.t('status', { note: SH[d.pc], sound: c.t('snd.' + (SOUNDS[d.sound] != null ? d.sound : 'soft') + '.s') }); },
  mount(el, c, sz = 'full') {
    host = el; ctx = c; size = sz;
    render();
    bind();
  },
  resize(sz) { size = sz; render(); },
  unmount() {
    if (host && onClick) host.removeEventListener('click', onClick);
    if (!ctx.session) DR().stop();
    host = null;
  },
};
