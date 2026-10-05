// Модули: строи тюнера сверяются с прототипом, расчёт показаний, полнота переводов.
import { describe, it, expect } from 'vitest';
import { runLegacy } from './legacy.js';
import { TUNINGS, parseN, mName, curTuning, reading, normalizeTuner } from '../src/music/tuning.js';
import ruCore from '../src/i18n/ru.json';
import uzCore from '../src/i18n/uz.json';
import enCore from '../src/i18n/en.json';
import metroRu from '../src/modules/metro/i18n/ru.json';
import metroUz from '../src/modules/metro/i18n/uz.json';
import metroEn from '../src/modules/metro/i18n/en.json';
import tunerRu from '../src/modules/tuner/i18n/ru.json';
import tunerUz from '../src/modules/tuner/i18n/uz.json';
import tunerEn from '../src/modules/tuner/i18n/en.json';
import { pluralForm } from '../src/i18n/index.js';
import pianoRu from '../src/modules/piano/i18n/ru.json';
import pianoUz from '../src/modules/piano/i18n/uz.json';
import pianoEn from '../src/modules/piano/i18n/en.json';
import droneRu from '../src/modules/drone/i18n/ru.json';
import droneUz from '../src/modules/drone/i18n/uz.json';
import droneEn from '../src/modules/drone/i18n/en.json';
import theoryRu from '../src/modules/theory/i18n/ru.json';
import theoryUz from '../src/modules/theory/i18n/uz.json';
import theoryEn from '../src/modules/theory/i18n/en.json';
import timerRu from '../src/modules/timer/i18n/ru.json';
import timerUz from '../src/modules/timer/i18n/uz.json';
import timerEn from '../src/modules/timer/i18n/en.json';
import audioRu from '../src/modules/audio/i18n/ru.json';
import audioUz from '../src/modules/audio/i18n/uz.json';
import audioEn from '../src/modules/audio/i18n/en.json';
import spRu from '../src/modules/spectrum/i18n/ru.json';
import spUz from '../src/modules/spectrum/i18n/uz.json';
import spEn from '../src/modules/spectrum/i18n/en.json';
import notesRu from '../src/modules/notes/i18n/ru.json';
import notesUz from '../src/modules/notes/i18n/uz.json';
import notesEn from '../src/modules/notes/i18n/en.json';

const L = runLegacy([/^const SH=/, /^const LETTERS=/, /^const accOf=/, /^const TUNINGS=/, /^const parseN=/, /^const mName=/, /^const splitN=/],
  '{TUNINGS,parseN,mName}');

describe('тюнер', () => {
  it('строи и ноты — как в прототипе', () => {
    const ours = TUNINGS.flatMap(([, ls]) => ls.map(([id, ns]) => [id, ns]));
    const proto = L.TUNINGS.flatMap(([, ls]) => ls.map(([id, , ns]) => [id, ns]));
    expect(ours).toEqual(proto);
    for (const [, ns] of ours) for (const n of ns.split(' ')) expect(parseN(n)).toBe(L.parseN(n));
    for (let m = 12; m <= 108; m++) expect(mName(m)).toBe(L.mName(m));
  });

  it('хроматический режим: ближайшая нота и центы', () => {
    const r = reading(440 * Math.pow(2, 7 / 1200), {});
    expect([r.note, r.oct, Math.round(r.cents), r.ok]).toEqual(['A', '4', 7, false]);
    expect(reading(440 * Math.pow(2, 4 / 1200), { tol: 5 }).ok).toBe(true);
    expect(reading(261.63, {}).note).toBe('C');
  });

  it('по строю: ближайшая струна, закреплённая струна, свой строй', () => {
    const s = normalizeTuner({ a4: 440, tuning: 'g_std', useTuning: true });
    const tn = curTuning(s);
    expect(tn.midis).toEqual([40, 45, 50, 55, 59, 64]);
    const r = reading(112, { tuning: tn });           // чуть выше A2
    expect([r.si, r.note, r.oct, r.cents > 0]).toEqual([1, 'A', '2', true]);
    const locked = reading(112, { tuning: tn, lock: 0 }); // закреплена E2 — далеко ниже
    expect([locked.si, Math.round(locked.cents / 100)]).toEqual([0, 5]);
    expect(curTuning({ ...s, useTuning: false })).toBe(null);
    const c = curTuning({ useTuning: true, tuning: 'c_1', customs: [{ id: 'c_1', name: 'X', midis: [38, 45] }] });
    expect([c.custom, c.names]).toEqual([true, ['D2', 'A2']]);
    expect(reading(110, { a4: 442 }).cents).toBeCloseTo(-7.85, 1);
  });
});

describe('переводы', () => {
  const sets = { core: [ruCore, uzCore, enCore], metro: [metroRu, metroUz, metroEn], tuner: [tunerRu, tunerUz, tunerEn],
    piano: [pianoRu, pianoUz, pianoEn], drone: [droneRu, droneUz, droneEn], theory: [theoryRu, theoryUz, theoryEn], timer: [timerRu, timerUz, timerEn], audio: [audioRu, audioUz, audioEn], notes: [notesRu, notesUz, notesEn], spectrum: [spRu, spUz, spEn] };
  it.each(Object.keys(sets))('%s: все ключи есть в uz и en, подстановки совпадают', (k) => {
    const [ru, uz, en] = sets[k];
    for (const d of [uz, en]) {
      expect(Object.keys(d).sort()).toEqual(Object.keys(ru).sort());
      for (const key of Object.keys(ru)) {
        const vars = (v) => [...new Set(String(v).match(/\{\w+\}/g) || [])].sort();
        expect(vars(d[key]), key).toEqual(vars(ru[key]));
      }
    }
  });
  it('склонение по числу', () => {
    const f = ['цент', 'цента', 'центов'];
    expect([1, 2, 5, 11, 21, 22, 25, 111].map((n) => pluralForm(n, f, 'ru'))).toEqual(['цент', 'цента', 'центов', 'центов', 'цент', 'цента', 'центов', 'центов']);
    expect([1, 2].map((n) => pluralForm(n, ['bar', 'bars'], 'en'))).toEqual(['bar', 'bars']);
    expect(pluralForm(5, ['takt'], 'uz')).toBe('takt');
  });
});
