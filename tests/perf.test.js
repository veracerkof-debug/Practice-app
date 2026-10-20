import { describe, it, expect } from 'vitest';
import { autoPerf, resolvePerf, setPerf, eco, maxVoices, uniCap, spaceOf, latencyFor } from '../src/audio/perf.js';
import { normalizeMix } from '../src/audio/mixer.js';

describe('режим ресурсов звука', () => {
  it('авто: слабый телефон — мало памяти или ядер', () => {
    expect(autoPerf({ deviceMemory: 8, hardwareConcurrency: 8 })).toBe('full');
    expect(autoPerf({ deviceMemory: 2, hardwareConcurrency: 8 })).toBe('eco');
    expect(autoPerf({ deviceMemory: 8, hardwareConcurrency: 4 })).toBe('eco');
    expect(autoPerf({})).toBe('full'); // браузер не говорит — считаем нормальным
    expect(resolvePerf('eco')).toBe('eco');
    expect(resolvePerf('auto')).toBe('full'); // по умолчанию всегда полный, автоподбора нет
  });
  it('облегчённый: меньше голосов, пэды без унисона, одна реверберация, большой буфер', () => {
    setPerf('full');
    expect([eco(), maxVoices(), uniCap(3), spaceOf('plate'), latencyFor('fast')]).toEqual([false, 22, 3, 'plate', 'fast']);
    setPerf('eco');
    expect([eco(), maxVoices(), uniCap(3), spaceOf('plate'), spaceOf('cathedral'), latencyFor('fast')]).toEqual([true, 10, 1, 'hall', 'hall', 'smooth']);
    setPerf('full');
  });
  it('микшер: старый «баланс» один раз становится «без треска», режим качества — полный', () => {
    const mx = normalizeMix({ mode: 'bal' });
    expect([mx.mode, mx.v2, mx.perf]).toEqual(['smooth', 1, 'full']);
    expect(normalizeMix({ perf: 'auto' }).perf).toBe('full');
    expect(normalizeMix({ mode: 'bal', v2: 1 }).mode).toBe('bal'); // человек сам выбрал потом — не трогаем
    expect(normalizeMix({}).mode).toBe('smooth');
  });
});
