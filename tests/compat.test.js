// Данные прошлых версий открываются новым кодом (страховка обновлений): слепки в tests/fixtures/data-*.json —
// настоящие копии данных, сделанные кодом своего времени. Каждый выпуск с новым форматом добавляет слепок сюда;
// старые не меняются. Проверяется: приложение запускается на этих данных (localStorage), загрузка копии (слиянием
// и по частям) ничего не теряет, занятия остаются подтверждёнными, старые проекты студии переезжают.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { createStore, LS, isBackup } from '../src/core/store.js';
import { applyParts, partsOf, PARTS } from '../src/core/backupparts.js';
import { normalizeProject } from '../src/music/project.js';

const dir = new URL('./fixtures/', import.meta.url);
const files = readdirSync(dir).filter((f) => /^data-\d{4}-\d\d-\d\d\.json$/.test(f));
const memStore = (raw) => { const m = new Map(raw ? [[LS, raw]] : []); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };

describe('совместимость данных прошлых версий', () => {
  it('слепки есть', () => expect(files.length).toBeGreaterThan(0));
  for (const f of files) {
    const raw = readFileSync(new URL(f, dir), 'utf8'), src = JSON.parse(raw);
    const songs = src.songs.filter((s) => !s.deleted).length, sess = src.sessions.filter((s) => !s.deleted).length;
    it(f + ': запуск на этих данных — всё на месте, занятия подтверждены', () => {
      const s = createStore({ storage: memStore(raw) });
      expect(s.songs().length).toBe(songs);
      expect(s.allSessions().length).toBe(sess);
      expect(s.sessions().length).toBe(sess); // печати не сломались
      expect(s.state.settings.profile && s.state.settings.profile.name).toBe(src.settings.profile && src.settings.profile.name);
      for (const x of src.songs) expect(s.state.songs.find((y) => y.id === x.id), x.id).toMatchObject({ title: x.title });
    });
    it(f + ': загрузка копии слиянием и по частям', () => {
      expect(isBackup(src)).toBe(true);
      const a = createStore({ storage: memStore() });
      expect(a.importBackup(src)).toBe(sess);
      expect(a.songs().length).toBe(songs);
      const b = createStore({ storage: memStore() });
      b.replaceState(applyParts(b.state, src, partsOf(src).filter((k) => PARTS.includes(k))));
      expect(b.songs().length).toBe(songs);
      expect(b.allSessions().length).toBe(sess);
    });
    it(f + ': проекты студии открываются', () => {
      for (const p of src.projects || []) {
        const n = normalizeProject(JSON.parse(JSON.stringify(p)));
        expect(Array.isArray(n.tracks) && Array.isArray(n.clips)).toBe(true);
        expect(n.patterns).toBeUndefined();
        expect(JSON.stringify(normalizeProject(JSON.parse(JSON.stringify(n))))).toBe(JSON.stringify(n)); // повторная нормализация ничего не меняет
      }
    });
  }
});
