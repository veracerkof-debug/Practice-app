import { describe, it, expect } from 'vitest';

describe('демо-набор для всех', async () => {
  const { addDemo, removeDemo, hasDemo } = await import('../src/core/demo.js');
  const fakeApp = (church = false) => {
    const files = [];
    const state = { songs: [], sessions: [], events: [], settings: { church } };
    return {
      files: { add: async (r) => files.push(r), list: () => files, remove: async (id) => files.splice(files.findIndex((f) => f.id === id), 1) },
      store: { state, save() {}, now: () => Date.now(), songById: (id) => state.songs.find((s) => s.id === id) },
      _files: files,
    };
  };
  it('добавляет песни и события без занятий и убирается целиком', async () => {
    const app = fakeApp(), t = (k, p) => k + (p ? JSON.stringify(p) : '');
    globalThis.fetch = async () => ({ ok: true, blob: async () => new Blob(['x']) });
    const songs = await addDemo(app, t, 'http://x/demo/');
    // приложение светское: без церковного режима духовной песни («Amazing Grace») в наборе нет
    expect(songs.length).toBe(4);
    expect(songs.map((x) => x.title)).not.toContain('Amazing Grace');
    expect(app.store.state.events.length).toBe(6);
    expect(app.store.state.sessions.length).toBe(0);
    expect(app._files.length).toBe(7); // 3 табулатуры, 4 PDF (записей без звукового движка нет)
    expect(hasDemo(app.store.state)).toBe(true);
    expect(await addDemo(app, t, 'http://x/demo/')).toBe(null); // второй раз — ничего
    await removeDemo(app);
    expect(hasDemo(app.store.state)).toBe(false);
    expect(app.store.state.events.length).toBe(0);
    expect(app._files.length).toBe(0);
  });
  it('в церковном режиме — и духовная песня', async () => {
    const app = fakeApp(true), t = (k, p) => k + (p ? JSON.stringify(p) : '');
    globalThis.fetch = async () => ({ ok: true, blob: async () => new Blob(['x']) });
    const songs = await addDemo(app, t, 'http://x/demo/');
    expect(songs.length).toBe(5);
    expect(songs[0].title).toBe('Amazing Grace');
    expect(app._files.length).toBe(8); // 4 табулатуры, 4 PDF
  });
});
