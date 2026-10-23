// Windows-версия: каждая своя команда из generate_handler! (lib.rs) разрешена окну — в build.rs и capabilities.
// Без этого invoke получает отказ, а человек видит чужую ошибку (так было с «порт занят»).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../src-tauri/' + p, import.meta.url), 'utf8');
const handler = read('src/lib.rs').match(/generate_handler!\[([\s\S]*?)\]/)[1].split(',').map((s) => s.trim().split('::').pop()).filter(Boolean);
const manifest = [...read('build.rs').matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
const perms = JSON.parse(read('capabilities/default.json')).permissions.filter((p) => typeof p === 'string');

describe('Tauri: права на свои команды', () => {
  it('команды найдены', () => expect(handler.length).toBeGreaterThan(10));
  for (const c of handler) {
    it(c, () => {
      expect(manifest, 'build.rs').toContain(c);
      expect(perms, 'capabilities').toContain('allow-' + c.replace(/_/g, '-'));
    });
  }
});
