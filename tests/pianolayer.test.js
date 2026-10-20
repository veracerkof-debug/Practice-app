import { describe, it, expect } from 'vitest';
import { PRESETS, PRESET_ALIAS, presetOf, pianoPatch, pianoLayer, applyPreset, knobsOf, knobVal, PATCH_RANGE, MIX_KNOBS } from '../src/audio/synth.js';
import { ROOTS, rootOf } from '../src/audio/grand.js';
import { existsSync } from 'node:fs';

describe('звуки пианино', () => {
  it('убранные звуки ведут к оставшимся; прежнее «Пианино» — рояль', () => {
    Object.values(PRESET_ALIAS).forEach((id) => expect(PRESETS[id]).toBeTruthy());
    expect(presetOf('epiano')).toBe(PRESETS.fmep);
    const piano = { syn: { preset: 'piano', kind: 'piano', tone: 0.7 } };
    expect(pianoPatch(piano).kind).toBe('grand');
    const p2 = { syn: { preset: 'strings', kind: 'saw', vol: 0.8 } };
    expect(pianoPatch(p2).preset).toBe('wwarm');
    expect(p2.syn.vol).toBe(0.8); // громкость слоя остаётся
    expect(pianoLayer({ layer: { preset: 'wkeys' } }).preset).toBe('wkpad');
    expect(pianoLayer({})).toBe(null);
  });
  it('у каждого звука — свои ручки, все в своих диапазонах', () => {
    const sets = new Set();
    for (const id of Object.keys(PRESETS)) {
      const s = applyPreset({}, id), ks = knobsOf(s);
      sets.add(ks.join());
      [...ks, ...MIX_KNOBS].forEach((k) => {
        const [lo, hi] = PATCH_RANGE[k], v = knobVal(s, k);
        expect(v, id + ' ' + k).toBeGreaterThanOrEqual(lo);
        expect(v, id + ' ' + k).toBeLessThanOrEqual(hi);
      });
    }
    expect(sets.size).toBeGreaterThanOrEqual(8);
    expect(knobsOf(PRESETS.piano)).toEqual(['bright', 'touch', 'rel', 'rev']);
  });
  it('смена звука не трогает громкость и эквалайзер слоя', () => {
    const s = applyPreset({ vol: 0.6, eqlo: -3 }, 'organ');
    applyPreset(s, 'wair');
    expect([s.vol, s.eqlo, s.preset, s.kind]).toEqual([0.6, -3, 'wair', 'soft']);
    expect(s.partials).toBeUndefined();
  });
  it('записи рояля: все ноты A0–C8 рядом, файлы на месте', () => {
    for (let m = 21; m <= 108; m++) expect(Math.abs(rootOf(m) - m)).toBeLessThanOrEqual(1);
    ROOTS.forEach((r) => expect(existsSync('public/piano/' + r + '.mp3'), r).toBe(true));
  });
});
