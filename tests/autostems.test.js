// Фоновая очередь и связь с компьютером: режим записи с телефона (rec.want) и «посчитает компьютер»
import { describe, it, expect } from 'vitest';
import { createAutoStems } from '../src/core/autostems.js';

function mkApp(settings, waits = () => false) {
  const all = [];
  const files = { list: (k) => all.filter((r) => k === 'audio' && (!r.kind || r.kind === 'audio')), subscribe: () => {}, add: (r) => all.push(r) };
  const jobs = { supported: () => true, lyricsSupported: () => false, busy: () => false, current: null };
  return { files, jobs, all, store: { state: { settings } }, device: {}, audio: {}, soundingAudio: () => false, syncCli: { waits } };
}
const rec = (id, extra = {}) => ({ id, kind: 'audio', blob: {}, created: Date.now(), ...extra });
const stem = (src, mode) => ({ id: src + mode, kind: 'audio', stem: { src, part: 'vocals', mode } });

describe('фоновая очередь и компьютер', () => {
  it('запись с телефона делится в режиме, который просил телефон', () => {
    const app = mkApp({ autoStems: '4', autoAna: false });
    const A = createAutoStems(app);
    app.files.add(rec('r', { want: { stems: '6' } }));
    expect(A.pending).toBe(1);
    app.files.add(stem('r', '4'));
    expect(A.pending).toBe(1); // обычные 4 дорожки не то, что просили
    app.files.add(stem('r', '6'));
    expect(A.pending).toBe(0);
  });
  it('своё разделение выключено — просьба телефона не считается', () => {
    const app = mkApp({ autoStems: 'off', autoAna: false });
    const A = createAutoStems(app);
    app.files.add(rec('r', { want: { stems: '6' } }));
    expect(A.pending).toBe(0);
    expect(A.caps().stems).toBe('off');
  });
  it('на телефоне то, что посчитает компьютер, не считается', () => {
    const app = mkApp({ autoStems: '4', autoAna: true }, () => true);
    const A = createAutoStems(app);
    app.files.add(rec('r'));
    expect(A.pending).toBe(0);
    expect(A.waitsPc(app.files.list('audio')[0])).toBe(true);
    expect(A.want()).toEqual({ stems: '4', hq: false });
  });
});
