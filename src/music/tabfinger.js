// Аппликатура для табулатуры: ноты партии → струна и лад каждой ноты. Как гитарист выбирает позицию: созвучие —
// разные струны, растяжка руки не больше 4–5 ладов, рука меньше ездит по грифу, низкие позиции и открытые струны
// удобнее. Перебор вариантов каждого созвучия + путь наименьшей цены (Витерби) по всей партии. Чистые функции
// (tests/tabfinger.test.js). Строй — MIDI-номера от толстой струны к тонкой.

export const TUNINGS = {
  guitar: [40, 45, 50, 55, 59, 64], // E A D G B E
  bass: [28, 33, 38, 43], // E A D G
  bass5: [23, 28, 33, 38, 43], // B E A D G
};
const MAX_FRET = 19, MAX_SPAN = 4, CAND = 48;

// Варианты созвучия (высоты по убыванию): [{ pos: [{ s, f }], cost }], s — номер струны с толстой (0)
function voicings(ms, tuning, maxFret) {
  const out = [], used = new Array(tuning.length).fill(false), cur = [];
  const go = (i) => {
    if (out.length > 400) return;
    if (i === ms.length) {
      const fr = cur.filter((x) => x.f > 0).map((x) => x.f);
      const lo = fr.length ? Math.min(...fr) : 0, hi = fr.length ? Math.max(...fr) : 0, span = hi - lo;
      if (span > MAX_SPAN + 1) return;
      const cost = span * 0.6 + (span > MAX_SPAN ? 4 : 0) + (fr.length ? (lo + hi) / 2 : 0) * 0.08 - (cur.length - fr.length) * 0.15;
      out.push({ pos: cur.map((x) => ({ ...x })), cost, at: fr.length ? (lo + hi) / 2 : null });
      return;
    }
    for (let s = 0; s < tuning.length; s++) {
      const f = ms[i] - tuning[s];
      if (used[s] || f < 0 || f > maxFret) continue;
      used[s] = true; cur.push({ s, f });
      go(i + 1);
      used[s] = false; cur.pop();
    }
  };
  go(0);
  return out.sort((a, b) => a.cost - b.cost).slice(0, CAND);
}

// notes — [{ t, d, m }] (время в любых единицах, созвучие — одинаковое t) → массив той же длины: { s, f } или null
// (нота вне грифа или лишняя в созвучии — без табулатуры). s здесь — номер струны с ТОНКОЙ (1), как в MusicXML.
export function fretNotes(notes, tuning = TUNINGS.guitar, { maxFret = MAX_FRET } = {}) {
  const idx = notes.map((n, i) => i).sort((a, b) => notes[a].t - notes[b].t || notes[b].m - notes[a].m);
  const groups = [];
  for (const i of idx) { const g = groups[groups.length - 1]; if (g && Math.abs(notes[g[0]].t - notes[i].t) < 1e-6) g.push(i); else groups.push([i]); }
  const res = new Array(notes.length).fill(null);
  // в созвучии не больше нот, чем струн; ноты вне грифа — без табулатуры
  const lo = tuning[0], hi = tuning[tuning.length - 1] + maxFret;
  const G = groups.map((g) => { const ok = g.filter((i) => notes[i].m >= lo && notes[i].m <= hi); return ok.slice(0, tuning.length); });
  const C = G.map((g) => {
    if (!g.length) return [{ pos: [], cost: 0, at: null }];
    let v = voicings(g.map((i) => notes[i].m), tuning, maxFret);
    for (let k = g.length - 1; !v.length && k > 0; k--) v = voicings(g.slice(0, k).map((i) => notes[i].m), tuning, maxFret); // не берётся целиком — верхние ноты
    return v.length ? v : [{ pos: [], cost: 0, at: null }];
  });
  // Витерби: цена перехода — сдвиг руки (середина позиции) между соседними созвучиями с прижатыми нотами
  const move = (a, b) => (a.at == null || b.at == null ? 0 : Math.abs(a.at - b.at) * 0.5 + (Math.abs(a.at - b.at) > 4 ? 1.5 : 0));
  let cost = C[0].map((c) => c.cost), back = [];
  const lastAt = C[0].map((c) => c.at);
  for (let k = 1; k < C.length; k++) {
    const nc = [], nb = [], nat = [];
    for (const c of C[k]) {
      let best = Infinity, bj = 0;
      for (let j = 0; j < C[k - 1].length; j++) {
        const prev = { at: lastAt[j] }, x = cost[j] + move(prev, c);
        if (x < best) { best = x; bj = j; }
      }
      nc.push(best + c.cost); nb.push(bj); nat.push(c.at ?? lastAt[bj]); // открытые струны руку не двигают
    }
    back.push(nb); cost = nc; lastAt.length = 0; lastAt.push(...nat);
  }
  let j = cost.indexOf(Math.min(...cost));
  for (let k = C.length - 1; k >= 0; k--) {
    const c = C[k][j], g = G[k];
    c.pos.forEach((p, q) => { res[g[q]] = { s: tuning.length - p.s, f: p.f }; });
    if (k > 0) j = back[k - 1][j];
  }
  return res;
}

// Строй для партии: гитара; бас — 4 струны, если всё помещается, иначе 5
export function tuningFor(kind, notes) {
  if (kind !== 'bass') return TUNINGS.guitar;
  return notes.some((n) => n.m < TUNINGS.bass[0]) ? TUNINGS.bass5 : TUNINGS.bass;
}
