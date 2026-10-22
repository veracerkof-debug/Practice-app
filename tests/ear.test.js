// Тренажёр слуха: генерация вопросов и план звучания сверяются с прототипом на одинаковых случайных числах.
import { describe, it, expect } from 'vitest';
import { runLegacy } from './legacy.js';
import { normalizeEar, setLevel, generate, playPlan, comparePlan, ntSet, ntProgress, dictationStep, pitchCents, record, normalizeEarData, accuracy, earStreak, toggleInSet, DRILL_IDS } from '../src/music/ear.js';

const seq = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

// Прототип: Math.random подменяется тем же генератором; звук перехватывается в журнал
function legacy(seed, e) {
  const log = [];
  let rnd = seq(seed);
  const MathR = Object.create(Math);
  MathR.random = () => rnd();
  const T = { ear: JSON.parse(JSON.stringify(e)) };
  const P = runLegacy([
    /^const LETTERS=/, /^const SCALES=/,
    /^const EIV=/, /^const ECH=/, /^const EDG=/, /^const ELV=/, /^const ERNG=/, /^const ESEC=/, /^const EAR=/, /^const pick=/,
    /^const ESCL=/, /^const ENT=/, /^ELV\.sc=/, /^function EC\(/, /^function earGen\(/, /^function earPlay\(/, /^function earCompare\(/,
    /^const NTP=/, /^const NTT=/, /^function ntSet\(/, /^function ntGen\(/, /^function ntPlay\(/,
  ], '{earGen,earPlay,earCompare,EC,EAR,ntSet,setR:(f)=>{}}', {
    T, Math: MathR,
    playSeq: (ms, st) => log.push({ seq: [...ms], step: st }), playChord: (ms) => log.push({ chord: [...ms] }),
    earAt: (ms, fn) => { log.push({ at: ms }); fn(); }, earClear: () => {}, earPulse: () => {},
    earNote: (m, d, tim) => log.push({ note: m, dur: d, tim }), earMask: () => log.push({ mask: true }),
  });
  return { P, log, T };
}

// Наш план → тот же вид журнала, что у перехватчиков прототипа
// В прототипе ступени и абсолютный слух ставят звук через таймер даже с задержкой 0
function flatten(plan, sec) {
  const out = [];
  plan.ev.forEach((x) => {
    if (x.at || ((sec === 'dg' || sec === 'nt') && !x.mask)) out.push({ at: x.at });
    if (x.seq) out.push({ seq: x.seq, step: x.step });
    else if (x.chord) out.push({ chord: x.chord });
    else if (x.mask) out.push({ mask: true });
    else if (x.note != null) out.push({ note: x.note, dur: x.dur, tim: x.tim });
  });
  out.push({ at: plan.end });
  return out;
}

const CONFIGS = [];
for (const level of ['easy', 'mid', 'hard']) {
  for (const extra of [{}, { dir: 'mix', arp: false, mode: 'mix', scDir: 'both', ntRange: '1', ntTimbre: 'piano', rng: 'low' }, { dir: 'harm', mode: 'minor', ntMode: 'custom', ntSet: [0, 4, 7, 11], ntLvl: 5 }]) {
    const e = normalizeEar({ level, ...extra });
    setLevel(e, level);
    if (extra.ntSet) e.ntSet = extra.ntSet;
    CONFIGS.push(e);
  }
}

describe('тренажёр слуха — как в прототипе', () => {
  it.each(CONFIGS.map((c, i) => [i, c]))('настройки %i: вопросы и звучание всех упражнений', (_, e) => {
    for (let seed = 1; seed <= 200; seed++) {
      const { P, log } = legacy(seed, e);
      const ours = seq(seed);
      for (const sec of DRILL_IDS) {
        const prev = sec === 'nt' ? P.EAR.q.nt || null : null;
        const a = generate(sec, normalizeEar(JSON.parse(JSON.stringify(e))), ours, prev);
        const b = JSON.parse(JSON.stringify(P.earGen(sec)));
        expect(a, sec + ' seed ' + seed).toEqual(b);
        // звучание: в прототипе «сброс слуха» включается со второго вопроса
        const masked = !!P.EAR.ntPlayed;
        log.length = 0;
        P.earPlay(sec);
        expect(flatten(playPlan(sec, a, e, { masked }), sec), sec).toEqual(JSON.parse(JSON.stringify(log)));
      }
    }
  });

  it('сравнение на слух', () => {
    const e = normalizeEar({ level: 'hard' });
    setLevel(e, 'hard');
    for (const sec of ['iv', 'ch', 'sc', 'dg']) {
      const { P, log } = legacy(7, e);
      const q = P.earGen(sec), opts = { iv: [3, 7], ch: ['min', '7'], sc: ['dorian', 'blues'], dg: [5, 11] }[sec];
      for (const v of opts) {
        log.length = 0;
        P.earCompare(sec, String(v));
        const c = comparePlan(sec, JSON.parse(JSON.stringify(q)), String(v));
        expect([c.seq ? { seq: c.seq, step: c.step } : { chord: c.chord }]).toEqual(JSON.parse(JSON.stringify(log)));
      }
    }
  });
});

describe('тренажёр слуха — учёт', () => {
  it('абсолютный слух: нота добавляется при 18 верных из 20', () => {
    const e = normalizeEar({});
    expect(ntSet(e)).toEqual([0, 6, 9]);
    for (let i = 0; i < 19; i++) expect(ntProgress(e, i !== 3)).toBe(null);
    expect(ntProgress(e, true)).toBe(3);
    expect(ntSet(e)).toEqual([0, 6, 9, 3]);
    expect(e.ntHist).toEqual([]);
  });
  it('диктант', () => {
    const q = { notes: [60, 64, 67], prog: [] };
    expect(dictationStep(q, 64)).toBe('more');
    expect(dictationStep(q, 79)).toBe('done'); // любая октава
    expect(dictationStep({ notes: [60, 64, 67], prog: [] }, 65)).toBe('wrong');
  });
  it('пение: центы и октава', () => {
    expect(pitchCents(440, 69)).toBe(0);
    expect(pitchCents(220, 69)).toBe(0);           // на октаву ниже — засчитано
    expect(pitchCents(220, 69, 440, false)).toBe(-1200);
    expect(pitchCents(440 * 2 ** (10 / 1200), 69)).toBe(10);
  });
  it('статистика, точность, дни подряд, свой набор', () => {
    const E = normalizeEarData({}), sess = {};
    record(E, sess, 'iv', 7, true, '2026-10-07');
    record(E, sess, 'iv', 7, false, '2026-10-07');
    record(E, sess, 'iv', 3, true, '2026-10-06');
    expect(accuracy(E, 'iv')).toEqual({ c: 2, t: 3, p: 2 / 3 });
    expect(sess.iv).toEqual({ c: 2, t: 3, st: 1, best: 1 });
    expect(earStreak(E, (i) => ['2026-10-08', '2026-10-07', '2026-10-06', '2026-10-05'][i])).toBe(2);
    const e = normalizeEar({});
    expect(toggleInSet(e, 'ch', 'maj')).toBe(false); // меньше двух нельзя
    expect(toggleInSet(e, 'ch', '7')).toBe(true);
    expect([e.chSet, e.level]).toEqual([['maj', 'min', '7'], 'custom']);
  });
});

// Ступени: аккорд ступени римской цифрой, цепочка ступеней, лады с характерным оборотом (ночь 22.10.2026)
import { romanOf, dgScale, DG_MODES, DG_KINDS } from '../src/music/ear.js';
describe('ступени: аккорды, цепочки, лады', () => {
  const base = () => normalizeEar({ sec: 'dg', level: 'mid' });
  it('римские цифры с качеством трезвучия', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((d) => romanOf(dgScale('major'), d))).toEqual(['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°']);
    expect([0, 1, 2, 3, 4, 5, 6].map((d) => romanOf(dgScale('minor'), d))).toEqual(['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII']);
    expect(romanOf(dgScale('lydian'), 1)).toBe('II');
    expect(romanOf(dgScale('mixo'), 6)).toBe('VII');
  });
  it('аккорд: оборот, затем трезвучие ступени; сравнение — другой аккорд той же тональности', () => {
    const e = base(); e.dgKind = 'chord';
    const q = generate('dg', e, seq(7));
    expect(q.chord.length).toBe(3); expect(q.ans).toMatch(/^[ivIV]+°?\+?$/);
    const plan = playPlan('dg', q, e);
    expect(plan.ev.filter((x) => x.chord).length).toBe(5); // 4 аккорда оборота + ответ
    expect(plan.ev[4].chord).toEqual(q.chord);
    const c = comparePlan('dg', q, 'V');
    expect(c.chord).toEqual([q.ton + 7, q.ton + 11, q.ton + 14]);
  });
  it('цепочка: две ступени на среднем уровне, три на сложном; ответ через запятую, звучат по очереди', () => {
    const e = base(); e.dgKind = 'chain';
    const q = generate('dg', e, seq(3));
    expect(q.degs.length).toBe(2); expect(q.ans).toBe(q.degs.join(','));
    expect(playPlan('dg', q, e).ev.find((x) => x.seq).seq).toEqual(q.ms);
    setLevel(e, 'hard'); e.dgKind = 'chain';
    expect(generate('dg', e, seq(3)).degs.length).toBe(3);
    expect(comparePlan('dg', q, '4')).toBe(null);
  });
  it('лады: свой оборот (дорийский i–IV–i, лидийский I–II–I, миксолидийский I–♭VII–I)', () => {
    for (const [mode, n, second] of [['dorian', 3, 5], ['lydian', 3, 2], ['mixo', 3, 10]]) {
      const e = base(); e.mode = mode;
      const q = generate('dg', e, seq(11));
      expect(q.mode).toBe(mode);
      const plan = playPlan('dg', q, e), chords = plan.ev.filter((x) => x.chord);
      expect(chords.length).toBe(n);
      expect(chords[1].chord[0] - chords[0].chord[0]).toBe(second);
    }
    expect(DG_MODES.length).toBe(6); expect(DG_KINDS).toEqual(['note', 'chord', 'chain']);
  });
});
