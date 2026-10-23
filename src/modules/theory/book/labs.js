// Учебник: интерактивные схемы глав («лаборатории»). Каждая — { st, render(st) → HTML, on(st, действие) }; действие —
// data-a у кнопки, выбор — data-seg / data-sel, поле — data-in; set(st, ключ) — после выбора. Строки — из языкового
// файла (T — строка по ключу с подстановкой {x}; L — таблицы названий), звук — snd (draw.js: createSound).
import {
  NAT, N, pcOf, nm, parseNote, IV, EXT, up, midiOf, MAJ_ROOTS, MIN_ROOTS, rootN, ALL12, INTERVALS, ivByKey, degLabel, CHORDS, chordById, chordName,
  parseChord, FAM_DEGS, SCALES, scaleById, harmonize, roman, funcOf, CIRCLE, REL_MIN, SIG, iiVI,
} from './engine.js';
import { keyboardSVG, marksOf, staffSVG, fretSVG, circleSVG, esc, seg, sel, playBtn, simp } from './draw.js';

IV['#1'] = [0, 1];

export function createLabs({ T, L, snd }) {
  const LABS = {};
  const deg = (d) => degLabel(d);
  const ROOT_OPTS = MAJ_ROOTS.map((r) => [r, r]), MIN_OPTS = MIN_ROOTS.map((r) => [r, r]), ALL_OPTS = ALL12.map((r) => [r, r]);
  const ivName = (k) => (L.IV[k] || [k, k])[0], ivAbbr = (k) => (L.IV[k] || [k, k])[1];
  const chName = (id) => L.CHN[id] || id, scName = (id) => L.SCN[id] || id;
  const sigText = (k) => (k === 0 ? T('sig.none') : k > 0 ? k + '♯' : -k + '♭') + (Math.abs(k) === 6 ? ' ' + T('sig.gflat') : '');
  const notesFor = (root, degs, base = 48) => degs.map((d, i) => { const n = simp(up(root, d)); return { n, m: midiOf(root, d, base), t: deg(d), c: i === 0 ? 'root' : 'on', d }; });
  // гамма в пределах октавы (9, ♯11 — без переноса вверх)
  const scaleMidi = (root, d, base = 60) => midiOf(root, '1', base) + IV[d][1];
  const scaleNotes = (root, degs, base = 60) => degs.map((d, i) => ({ n: simp(up(root, d)), m: scaleMidi(root, d, base), c: i === 0 ? 'root' : 'on', d }));
  const minorRoot = (x) => ({ 'D♯': 'E♭' }[x] || x);
  const rootSel = (k, cur, opts = ALL_OPTS) => sel(k, opts, cur, T('ui.root'));
  // простое звучание {r, id}: бас + аккорд без корня в средней октаве
  function voiceSimple(x) {
    const c = chordById(x.id) || chordById('7'), p = pcOf(x.r);
    const tones = c.f.slice(1).map((d) => midiOf(x.r, d, 48)).map((m) => { while (m < 53) m += 12; while (m > 72) m -= 12; return m; });
    return [36 + p, ...tones];
  }
  const normId = (q) => { let x = q.replace(/b/g, '♭').replace(/#/g, '♯').replace(/^-/, 'm').replace(/^M7/, 'maj7').replace(/^Δ7?/, 'maj7').replace(/^ø7?/, 'm7♭5').replace(/^(dim7|o7)/, '°7').replace(/^min/, 'm').replace(/^dim$/, '°').replace(/^aug/, '+'); return x === 'maj' ? '' : x; };
  const FAM_ID = { maj: 'maj7', dom: '7', min: 'm7', hdim: 'm7♭5', dim: '°7', sus: '7sus4', aug: '+' };
  const chordOf = (c) => chordById(normId(c.q)) || chordById(FAM_ID[c.fam] || '7');
  const voiceSym = (sym) => { const c = parseChord(sym); return c ? voiceSimple({ r: c.root, id: chordOf(c).id }) : []; };
  const fact = (dt, dd) => '<dt>' + dt + '</dt><dd>' + dd + '</dd>';
  const sp = (k) => '<span class="bkhint">' + T(k) + '</span>';

  /* ---------- 1. Интервалы ---------- */
  LABS.iv = {
    st: { root: 'C', k: '3' },
    render(s) {
      const r = rootN(s.root), iv = ivByKey(s.k), top = simp(up(r, s.k)), m0 = 60 + pcOf(r), m1 = m0 + iv.s, inv = iv.inv ? ivByKey(iv.inv) : null;
      return '<div class="bkctl">' + rootSel('root', s.root) + sel('k', INTERVALS.map((x) => [x.k, ivName(x.k)]), s.k, T('ui.interval')) + '</div>' +
        '<div class="bktwo"><div>' + staffSVG([{ n: r, m: m0, c: 'root' }, { n: top, m: m1 }], { mode: 'seq' }) + '</div><div class="bkfacts">' +
        '<div class="bkbig">' + nm(r) + ' → ' + nm(top) + '</div><dl>' + fact(T('iv.abbr'), ivAbbr(s.k)) + fact(T('iv.semis'), iv.s) + fact(T('iv.sound'), L.CONS[iv.cons]) +
        (inv ? fact(T('iv.inv'), ivName(inv.k).toLowerCase() + ' (' + inv.s + ')') : '') + '</dl>' +
        '<div class="bkrow">' + playBtn('data-a="mel"', T('iv.mel')) + playBtn('data-a="harm"', T('iv.harm')) + '</div></div></div>' +
        keyboardSVG(marksOf([{ m: m0, c: 'root', t: nm(r) }, { m: m1, t: nm(top) }]), { lo: 48, hi: 84 });
    },
    on(s, a) {
      const m0 = 60 + pcOf(rootN(s.root)), iv = ivByKey(s.k);
      if (a === 'mel') snd.seq([m0, m0 + iv.s], 0.6, 0.9);
      if (a === 'harm') snd.chord([m0, m0 + iv.s], { dur: 1.6 });
    },
  };
  LABS.ivtable = {
    st: { root: 'C' },
    render(s) {
      const r = rootN(s.root);
      return '<div class="bkctl">' + rootSel('root', s.root) + '</div><div class="bktw"><table><thead><tr><th>' + T('ui.interval') + '</th><th>' + T('iv.abbr') + '</th><th>' + T('iv.semisShort') + '</th><th>' + T('iv.from', { n: nm(r) }) + '</th><th>' + T('iv.sound') + '</th><th></th></tr></thead><tbody>' +
        INTERVALS.map((x) => '<tr><td>' + ivName(x.k) + '</td><td>' + ivAbbr(x.k) + '</td><td class="num">' + x.s + '</td><td><b>' + nm(simp(up(r, x.k))) + '</b></td><td>' + L.CONS[x.cons] + '</td><td><button class="ib" data-a="p:' + x.k + '" aria-label="' + T('ui.play') + '">▶</button></td></tr>').join('') + '</tbody></table></div>';
    },
    on(s, a) { if (a.startsWith('p:')) { const iv = ivByKey(a.slice(2)), m0 = 60 + pcOf(rootN(s.root)); snd.seq([m0, m0 + iv.s, [m0, m0 + iv.s]], 0.55, 0.9); } },
  };

  /* ---------- 2. Аккорды ---------- */
  LABS.chord = {
    st: { root: 'C', id: 'maj7', inv: 0 },
    midis(s) { const r = rootN(s.root), c = chordById(s.id); const ms = c.f.map((d) => midiOf(r, d, 48)); for (let i = 0; i < s.inv && i < ms.length - 1; i++) ms[i] += 12; return ms.sort((a, b) => a - b); },
    render(s) {
      const r = rootN(s.root), c = chordById(s.id) || CHORDS[0], k = Math.min(s.inv, Math.min(3, c.f.length - 1));
      let ns = notesFor(r, c.f, 48);
      for (let i = 0; i < k; i++) ns[i] = { ...ns[i], m: ns[i].m + 12 };
      ns = ns.slice().sort((a, b) => a.m - b.m);
      return '<div class="bkctl">' + rootSel('root', s.root) + sel('id', CHORDS.map((x) => [x.id, (x.id || 'maj') + ' · ' + chName(x.id)]), s.id, T('ui.chord')) +
        seg('inv', [0, 1, 2, 3].slice(0, Math.min(4, c.f.length)).map((i) => [i, T('ch.inv' + i)]), k) + '</div>' +
        '<div class="bktwo"><div>' + staffSVG(ns) + '</div><div class="bkfacts"><div class="bkbig">' + chordName(r, c) + '</div><dl>' +
        fact(T('ch.name'), chName(c.id)) + fact(T('ch.degs'), c.f.map(deg).join(' – ')) + fact(T('ch.notes'), c.f.map((d) => nm(simp(up(r, d)))).join(' ')) +
        fact(T('ch.alt'), esc(c.alt.replace(/C/g, nm(r)))) + fact(T('ch.bass'), nm(ns[0].n) + ' — ' + T('ch.invLong' + k)) + '</dl>' +
        '<div class="bkrow">' + playBtn('data-a="blk"', T('ch.block')) + playBtn('data-a="arp"', T('ch.arp')) + '</div></div></div>' +
        keyboardSVG(marksOf(ns.map((x) => ({ m: x.m, c: x.d === '1' ? 'root' : EXT.has(x.d) ? 'alt' : 'on', t: deg(x.d) }))), { lo: 48, hi: 84 });
    },
    on(s, a) { const ms = this.midis(s); if (a === 'blk') snd.chord(ms, { dur: 2 }); if (a === 'arp') snd.seq([...ms, ms], 0.28, 0.9); },
  };
  LABS.seventh = {
    st: { root: 'C' },
    render(s) {
      const r = rootN(s.root);
      return '<div class="bkctl">' + rootSel('root', s.root) + '</div><div class="cards7">' + ['maj7', 'm(maj7)', 'm7', 'm7♭5', '°7', '7', '7sus4'].map((id) => {
        const c = chordById(id);
        return '<button class="c7" data-a="p:' + id + '"><b>' + chordName(r, c) + '</b><span>' + chName(id) + '</span><small>' + c.f.map(deg).join(' ') + '</small><em>' + c.f.map((d) => nm(simp(up(r, d)))).join(' ') + '</em></button>';
      }).join('') + '</div>';
    },
    on(s, a) { if (a.startsWith('p:')) snd.chord(chordById(a.slice(2)).f.map((d) => midiOf(rootN(s.root), d, 48)), { dur: 1.8 }); },
  };
  // верхние структуры: 24 трезвучия над доминантой
  const TENS = { 0: '1', 1: '♭9', 2: '9', 3: '♯9', 4: '3', 5: '11', 6: '♯11', 7: '5', 8: '♭13', 9: '13', 10: '♭7', 11: 'maj7' };
  const fitPc = (n, pc) => { let a = pc - NAT[n.l]; a = ((a + 6) % 12 + 12) % 12 - 6; return simp(N(n.l, a)); };
  const ustMs = (s) => {
    const rp = pcOf(rootN(s.root)), off = parseInt(s.pick, 10), q = s.pick.replace(/\d+/, '');
    const lh = [36 + rp, 36 + rp + 16, 36 + rp + 22].map((m) => (m < 40 ? m + 12 : m)), rh = [0, q === 'M' ? 4 : 3, 7].map((x) => 60 + ((rp + off + x) % 12)).sort((a, b) => a - b);
    return { lh, rh, rp, ivs: [0, q === 'M' ? 4 : 3, 7].map((x) => (off + x) % 12) };
  };
  LABS.ust = {
    st: { root: 'G', pick: '2M' },
    render(s) {
      const r = rootN(s.root), rp = pcOf(r);
      const cells = [];
      for (let off = 0; off < 12; off++) for (const q of ['M', 'm']) {
        const ivs = [0, q === 'M' ? 4 : 3, 7].map((x) => (off + x) % 12), bad = ivs.some((x) => x === 5 || x === 11);
        const tr = fitPc(N((r.l + [0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6][off]) % 7, 0), (rp + off) % 12), id = off + q;
        cells.push('<button class="us' + (bad ? ' bad' : '') + (s.pick === id ? ' on' : '') + '" data-a="u:' + id + '"><b>' + nm(tr) + (q === 'm' ? 'm' : '') + '</b><small>' + ivs.map((x) => TENS[x]).join(' ') + '</small></button>');
      }
      const { lh, rh, ivs } = ustMs(s), bad = ivs.some((x) => x === 5 || x === 11), marks = {};
      lh.forEach((m, i) => { marks[m] = { c: i ? 'on' : 'root', t: ['1', '3', '♭7'][i] }; });
      rh.forEach((m) => { marks[m] = { c: bad ? 'bad' : 'alt', t: TENS[(m - rp + 120) % 12] }; });
      return '<div class="bkctl">' + rootSel('root', s.root) + '<span class="bkhint">' + T('ust.lh', { c: nm(r) + '7' }) + '</span></div><div class="usgrid">' + cells.join('') + '</div>' +
        '<p class="bknote">' + (bad ? T('ust.bad') : T('ust.ok', { t: ivs.map((x) => TENS[x]).join(', ') })) + '</p>' + keyboardSVG(marks, { lo: 36, hi: 84 }) + '<div class="bkrow">' + playBtn('data-a="play"') + '</div>';
    },
    on(s, a) { if (a.startsWith('u:')) s.pick = a.slice(2); if (a === 'play' || a.startsWith('u:')) { const { lh, rh } = ustMs(s); snd.chord([...lh, ...rh], { dur: 2 }); } },
  };

  /* ---------- 3. Гаммы ---------- */
  const SG = [...new Set(SCALES.map((x) => x.g))];
  LABS.scale = {
    st: { root: 'C', id: 'dorian', view: 'kb' },
    render(s) {
      const r = rootN(s.root), sc = scaleById(s.id), ns = scaleNotes(r, sc.f, 60), pm = {};
      sc.f.forEach((d) => { pm[pcOf(up(r, d))] = deg(d); });
      const marks = marksOf(ns.map((x) => ({ m: x.m, c: x.d === '1' ? 'root' : x.d === sc.ch ? 'alt' : 'on', t: nm(x.n) })));
      marks[72 + pcOf(r)] = { c: 'root', t: nm(r) };
      const harm = sc.f.length === 7 ? harmonize(r, sc) : null;
      const opts = SG.map((g) => ({ group: L.SG[g], items: SCALES.filter((x) => x.g === g).map((x) => [x.id, scName(x.id)]) }));
      let note = '';
      if (sc.ch) note = T('sc.char', { d: deg(sc.ch) }) + (sc.chord ? T('sc.chord', { c: nm(r) + sc.chord }) : '') + (sc.avoid ? T('sc.avoid', { d: sc.avoid.map(deg).join(', ') }) : '') + '.';
      return '<div class="bkctl">' + rootSel('root', s.root) + sel('id', opts, s.id, T('ui.scale')) + seg('view', [['kb', T('sc.kb')], ['fret', T('sc.fret')], ['staff', T('sc.staff')]], s.view) + '</div>' +
        '<div class="bkfacts wide"><div class="bkbig">' + nm(r) + ' · ' + scName(sc.id) + '</div>' +
        '<div class="degs">' + sc.f.map((d) => '<span class="dg' + (d === '1' ? ' r' : d === sc.ch ? ' ch' : '') + '"><b>' + nm(simp(up(r, d))) + '</b><small>' + deg(d) + '</small></span>').join('') + '</div>' +
        (note ? '<p class="bknote">' + note + '</p>' : '') + '</div>' +
        (s.view === 'kb' ? keyboardSVG(marks, { lo: 55, hi: 84 }) : s.view === 'fret' ? fretSVG(pm, { root: pcOf(r) }) : staffSVG([...ns, { n: r, m: 72 + pcOf(r), c: 'root' }], { mode: 'seq' })) +
        '<div class="bkrow">' + playBtn('data-a="up"', T('sc.up')) + playBtn('data-a="down"', T('sc.down')) + playBtn('data-a="over"', T('sc.over')) + '</div>' +
        (harm ? '<h4>' + T('sc.harm') + '</h4><div class="bkchips">' + harm.map((h, i) => '<button class="chipc" data-a="h:' + i + '"><b>' + nm(simp(h.root)) + h.q + '</b><small>' + (i + 1) + '</small></button>').join('') + '</div>' : '');
    },
    on(s, a) {
      const r = rootN(s.root), sc = scaleById(s.id), ms = sc.f.map((d) => scaleMidi(r, d, 60)).concat([midiOf(r, '1', 60) + 12]);
      if (a === 'up') snd.seq(ms, 0.24, 0.45);
      if (a === 'down') snd.seq(ms.slice().reverse(), 0.24, 0.45);
      if (a === 'over') { const c = chordById(sc.chord) || chordById('maj7'), line = ms.concat(ms.slice(0, -1).reverse()); snd.over(c.f.slice(0, 4).map((d) => midiOf(r, d, 48)), line.length * 0.2 + 0.5, line, 0.2, 0.35); }
      if (a.startsWith('h:')) { const h = harmonize(r, sc)[+a.slice(2)]; snd.chord(voiceSimple({ r: h.root, id: chordById(h.q) ? h.q : 'm7' }), { dur: 1.4 }); }
    },
  };
  const ORDER = ['lydian', 'ionian', 'mixolydian', 'dorian', 'aeolian', 'phrygian', 'locrian'];
  LABS.bright = {
    st: { root: 'C', i: 3 },
    render(s) {
      const r = rootN(s.root), cur = scaleById(ORDER[s.i]);
      const rows = ORDER.map((id, i) => {
        const sc = scaleById(id), prev = i ? scaleById(ORDER[i - 1]) : null, changed = prev ? sc.f.filter((d, k) => d !== prev.f[k]) : [];
        return '<button class="brow' + (i === s.i ? ' on' : '') + '" data-a="b:' + i + '"><span class="bn">' + scName(id) + '</span><span class="bd">' + sc.f.map((d) => '<i class="' + (changed.includes(d) ? 'chg' : /^[b#]/.test(d) ? 'alt' : '') + '">' + deg(d) + '</i>').join('') + '</span></button>';
      }).join('');
      return '<div class="bkctl">' + rootSel('root', s.root) + sp('br.hint') + '</div><div class="bright">' + rows + '</div>' +
        keyboardSVG(marksOf(scaleNotes(r, cur.f, 60).map((x) => ({ m: x.m, c: x.d === '1' ? 'root' : x.d === cur.ch ? 'alt' : 'on', t: nm(x.n) }))), { lo: 59, hi: 84 });
    },
    on(s, a) {
      if (a.startsWith('b:')) s.i = +a.slice(2);
      const sc = scaleById(ORDER[s.i]), r = rootN(s.root), ms = sc.f.map((d) => scaleMidi(r, d, 60)).concat([midiOf(r, '1', 72)]);
      snd.over([midiOf(r, '1', 36), midiOf(r, '5', 36)], 2.6, ms, 0.22, 0.4);
    },
  };
  LABS.dimeq = {
    st: { g: 0 },
    render(s) {
      const G = [['C', 'E♭', 'G♭', 'A'], ['D♭', 'E', 'G', 'B♭'], ['D', 'F', 'A♭', 'B']][s.g], r = rootN(G[0]), sc = scaleById('dimwh');
      const hw = G.map((x) => nm(simp(up(rootN(x), '7')))).join(', '), pcs = G.map((y) => pcOf(rootN(y)));
      return '<div class="bkctl">' + seg('g', [[0, 'C°'], [1, 'D♭°'], [2, 'D°']], s.g) + '</div><p>' + T('dim.text', { wh: G.join(', '), hw }) + '</p>' +
        keyboardSVG(marksOf(scaleNotes(r, sc.f, 60).map((x) => ({ m: x.m, c: pcs.includes(pcOf(x.n)) ? 'root' : 'on', t: nm(x.n) }))), { lo: 59, hi: 84 }) + '<div class="bkrow">' + playBtn('data-a="p"') + '</div>';
    },
    on(s) { const r = rootN(['C', 'D♭', 'D'][s.g]); snd.seq(scaleById('dimwh').f.map((d) => scaleMidi(r, d, 60)).concat([midiOf(r, '1', 72)]), 0.2, 0.4); },
  };

  /* ---------- 4. Тональность ---------- */
  const MODE_SC = { major: 'ionian', natural: 'aeolian', harmonic: 'harmmin', melodic: 'melmin' };
  const keyMs = (c) => voiceSimple({ r: c.root, id: chordById(c.q) ? c.q : 'm7' });
  LABS.key = {
    st: { root: 'C', mode: 'major' },
    render(s) {
      const minor = s.mode !== 'major', r = rootN(s.root), h = harmonize(r, scaleById(MODE_SC[s.mode]));
      return '<div class="bkctl">' + rootSel('root', s.root, minor ? MIN_OPTS : ROOT_OPTS) + seg('mode', [['major', T('key.major')], ['natural', T('key.natural')], ['harmonic', T('key.harmonic')], ['melodic', T('key.melodic')]], s.mode) + '</div>' +
        '<div class="dia">' + h.map((x, i) => { const f = funcOf(i, minor); return '<button class="dc f' + f + '" data-a="c:' + i + '"><small>' + roman(r, x.root, x.q) + '</small><b>' + nm(simp(x.root)) + x.q + '</b><span>' + T('fn.' + f) + '</span></button>'; }).join('') + '</div>' +
        '<h4>' + T('key.cad') + '</h4><div class="bkchips">' + ['auth', 'plag', 'dec', 'iivi', 'full'].map((k) => '<button class="chipc wide" data-a="k:' + k + '">' + T('cad.' + k) + '</button>').join('') + '</div>';
    },
    on(s, a) {
      const h = harmonize(rootN(s.root), scaleById(MODE_SC[s.mode])), C = (i) => keyMs(h[i]);
      if (a.startsWith('c:')) snd.chord(C(+a.slice(2)), { dur: 1.6 });
      const seqs = { auth: [4, 0], plag: [3, 0], dec: [4, 5], iivi: [1, 4, 0], full: [0, 3, 4, 0] };
      if (a.startsWith('k:')) snd.prog(seqs[a.slice(2)].map(C), 1.1);
    },
  };
  const iiviName = (x) => nm(simp(x.r)) + x.id;
  LABS.circle = {
    st: { i: 0, minor: false },
    render(s) {
      const maj = CIRCLE[s.i], min = REL_MIN[s.i], a = iiVI(maj), b = iiVI(minorRoot(min), true);
      return '<div class="bktwo"><div class="bkcircbox">' + circleSVG(s.i, { minorSel: s.minor }) + '</div><div class="bkfacts">' +
        '<div class="bkbig">' + (s.minor ? T('key.minOf', { k: min }) : T('key.majOf', { k: maj })) + '</div><dl>' + fact(T('key.sig'), sigText(SIG[s.i])) +
        fact(T('key.rel'), s.minor ? T('key.majOf', { k: maj }) : T('key.minOf', { k: min })) + fact(T('key.near'), CIRCLE[(s.i + 11) % 12] + ' · ' + CIRCLE[(s.i + 1) % 12]) +
        fact('ii–V–I', a.map(iiviName).join(' → ')) + fact('ii–V–i', b.map(iiviName).join(' → ')) + '</dl>' +
        '<div class="bkrow">' + playBtn('data-a="maj"', 'ii–V–I') + playBtn('data-a="min"', 'ii–V–i') + '</div></div></div><p class="bknote">' + T('circ.note') + '</p>';
    },
    on(s, a) {
      if (a.startsWith('ci:')) { const [, i, m] = a.split(':'); s.i = +i; s.minor = m === 'm'; snd.chord(voiceSimple(s.minor ? { r: rootN(minorRoot(REL_MIN[s.i])), id: 'm7' } : { r: rootN(CIRCLE[s.i]), id: 'maj7' }), { dur: 1.4 }); return; }
      if (a === 'maj') snd.prog(iiVI(CIRCLE[s.i]).map(voiceSimple), 1.1);
      if (a === 'min') snd.prog(iiVI(minorRoot(REL_MIN[s.i]), true).map(voiceSimple), 1.1);
    },
  };

  /* ---------- 5. II–V–I ---------- */
  function guidePath(q) {
    const t3 = q === 'm7' ? 'b3' : '3', t7 = q === 'maj7' ? '7' : 'b7', roots = [];
    let r = rootN('C'); for (let i = 0; i < 12; i++) { roots.push(r); r = simp(up(r, '4')); }
    let prev = null;
    return roots.map((rt) => {
      const a = midiOf(rt, t3, 52), b = midiOf(rt, t7, 52);
      const opts = [[a, b], [a + 12, b]].map(([x, y]) => [Math.min(x, y), Math.max(x, y)]).filter(([x, y]) => x >= 52 && y <= 72);
      let best = opts[0] || [Math.min(a, b), Math.max(a, b)];
      if (prev && opts.length) best = opts.slice().sort((u, v) => Math.abs(u[0] - prev[0]) + Math.abs(u[1] - prev[1]) - (Math.abs(v[0] - prev[0]) + Math.abs(v[1] - prev[1])))[0];
      let [lo, hi] = best; if (hi - lo > 12) hi -= 12;
      prev = [lo, hi];
      const top3 = (hi - pcOf(rt) + 120) % 12 === (t3 === '3' ? 4 : 3);
      return { r: rt, ms: [lo, hi], hi: top3 ? t3 : t7, lo: top3 ? t7 : t3 };
    });
  }
  LABS.guide = {
    st: { kind: 'dom' },
    q: (s) => (s.kind === 'dom' ? '7' : s.kind === 'maj' ? 'maj7' : 'm7'),
    render(s) {
      const q = this.q(s), cell = (x, d) => '<span class="' + (/3/.test(d) ? 't3' : 't7') + '">' + nm(simp(up(x.r, d))) + '<small>' + deg(d) + '</small></span>';
      return '<div class="bkctl">' + seg('kind', [['dom', T('gd.dom')], ['min', T('gd.min')], ['maj', T('gd.maj')]], s.kind) + '</div>' +
        '<div class="guide">' + guidePath(q).map((x) => '<div class="gc"><b>' + nm(x.r) + q + '</b>' + cell(x, x.hi) + cell(x, x.lo) + '</div>').join('') + '</div>' +
        '<p class="bknote">' + T('gd.note') + '</p><div class="bkrow">' + playBtn('data-a="p"') + '</div>';
    },
    on(s) { snd.prog(guidePath(this.q(s)).map((x) => [36 + pcOf(x.r), ...x.ms]), 0.9); },
  };
  const TURNS = [
    ['t1', [['1', 'maj7'], ['6', 'm7'], ['2', 'm7'], ['5', '7']]], ['t2', [['3', 'm7'], ['6', 'm7'], ['2', 'm7'], ['5', '7']]],
    ['t3', [['1', 'maj7'], ['6', '7alt'], ['2', 'm7'], ['5', '7']]], ['t4', [['3', 'm7♭5'], ['6', '7alt'], ['2', 'm7'], ['5', '7']]],
    ['t5', [['1', 'maj7'], ['#1', '°7'], ['2', 'm7'], ['5', '7']]], ['t6', [['1', 'maj7'], ['6', '7'], ['2', '7'], ['5', '7']]],
    ['t7', [['1', 'maj7'], ['b3', '7'], ['b6', '7'], ['b2', '7']]], ['t8', [['1', 'maj7'], ['b3', 'maj7'], ['b6', 'maj7'], ['b2', 'maj7']]],
    ['t9', [['1', 'm6'], ['b6', 'm7♭5'], ['2', 'm7♭5'], ['5', '7alt']], true],
  ];
  const turnChords = (r, t) => t[1].map(([d, q]) => ({ r: simp(up(r, t[2] && d === '6' ? 'b6' : d)), id: q }));
  LABS.turn = {
    st: { root: 'C', i: 0 },
    render(s) {
      const r = rootN(s.root);
      return '<div class="bkctl">' + rootSel('root', s.root, ROOT_OPTS) + '</div><div class="bklist">' + TURNS.map((t, i) => '<button class="bkli' + (i === s.i ? ' on' : '') + '" data-a="t:' + i + '"><b>' + T('turn.' + t[0]) + '</b><span>' + turnChords(r, t).map(iiviName).join(' · ') + '</span></button>').join('') + '</div>';
    },
    on(s, a) {
      if (a.startsWith('t:')) s.i = +a.slice(2);
      const r = rootN(s.root), t = TURNS[s.i], ch = turnChords(r, t);
      snd.prog([...ch, ...ch, { r, id: t[2] ? 'm6' : 'maj7' }].map(voiceSimple), 0.85);
    },
  };
  const STEPS = { '-2': -2, '+2': 2, '-1': -1, '+1': 1, '-3': -3, '+3': 3, '-4': -4, '+4': 4 };
  const chainOf = (rootStr, d) => { const out = []; let pc = pcOf(rootN(rootStr)); for (let i = 0; i < 4; i++) { const key = rootN(MAJ_ROOTS[pc]); out.push([{ r: simp(up(key, '2')), id: 'm7' }, { r: simp(up(key, '5')), id: '7' }]); pc = (pc + d + 12) % 12; } return out; };
  LABS.chain = {
    st: { root: 'D', step: '-2' },
    render(s) {
      return '<div class="bkctl">' + rootSel('root', s.root, ROOT_OPTS) + sel('step', Object.keys(STEPS).map((k) => [k, T('step.' + k)]), s.step, T('ui.step')) + '</div>' +
        '<div class="bkbars">' + chainOf(s.root, STEPS[s.step]).map((p) => '<div class="bkbar"><b>' + p.map(iiviName).join(' ') + '</b></div>').join('') + '</div><p class="bknote">' + T('chain.note') + '</p><div class="bkrow">' + playBtn('data-a="p"') + '</div>';
    },
    on(s) { snd.prog(chainOf(s.root, STEPS[s.step]).flat().map(voiceSimple), 0.7); },
  };
  LABS.iivitable = {
    st: { mode: 'maj' },
    render(s) {
      const minor = s.mode === 'min', roots = CIRCLE.map((x, i) => (minor ? minorRoot(REL_MIN[i]) : x));
      return '<div class="bkctl">' + seg('mode', [['maj', T('key.major')], ['min', T('key.minor')]], s.mode) + sp('tbl.hint') + '</div><div class="bktw"><table class="t3"><tbody>' +
        roots.map((r, i) => '<tr data-a="r:' + i + '" class="click"><th>' + (minor ? T('key.minOf', { k: r }) : r) + '</th>' + iiVI(r, minor).map((x) => '<td>' + iiviName(x) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';
    },
    on(s, a) { if (a.startsWith('r:')) { const i = +a.slice(2), minor = s.mode === 'min'; snd.prog(iiVI(minor ? minorRoot(REL_MIN[i]) : CIRCLE[i], minor).map(voiceSimple), 1); } },
  };

  /* ---------- 6. Анализ ---------- */
  const ANA = [
    ['a1', 'C', 'Cmaj7 A7 | Dm7 G7 | Em7 A7 | Dm7 G7 | Cmaj7'], ['a2', 'C', 'Em7 A7 | Dm7 G7 | Cm7 F7 | B♭maj7 | Bm7♭5 E7 | Am7'],
    ['a3', 'F', 'Fmaj7 | E♭7 D7 | D♭7 C7 | Fmaj7'], ['a4', 'Cm', 'Cm6 | Dm7♭5 G7♭9 | Cm6 A♭7 | Dm7♭5 G7alt | Cm6'],
    ['a5', 'C', 'Cmaj7 C♯°7 | Dm7 D♯°7 | Em7 A7 | Dm7 G7'], ['a6', 'F', 'F7 | B♭7 | F7 | Cm7 F7 | B♭7 | B°7 | F7 | Am7 D7 | Gm7 | C7 | F7 D7 | Gm7 C7'],
    ['a7', 'C', 'Cmaj7 | Fmaj7 | Fm7 B♭7 | Cmaj7 | A♭maj7 D♭maj7 | Cmaj7'],
  ];
  function analyze(text, keyStr) {
    const minor = /m$/.test(keyStr.trim()), kp = parseNote(keyStr) || { n: N(0, 0) }, key = kp.n, kpc = pcOf(key), toks = [];
    let bar = 0;
    String(text).split('|').forEach((b) => { b.trim().split(/\s+/).filter(Boolean).forEach((t) => { const c = parseChord(t); if (c) toks.push({ ...c, sym: t, bar }); }); bar++; });
    toks.forEach((c, i) => {
      const nx = toks[i + 1], pc = pcOf(c.root), d = nx ? (pcOf(nx.root) - pc + 12) % 12 : -1;
      c.rn = roman(key, c.root, c.fam === 'dom' ? '7' : c.fam === 'min' ? 'm' : c.fam === 'hdim' ? 'ø' : c.fam === 'dim' ? '°7' : c.fam === 'sus' ? '7sus4' : '').replace(/m$/, '');
      const tgt = nx ? (pcOf(nx.root) === kpc ? (minor ? 'i' : 'I') : roman(key, nx.root, ['min', 'hdim', 'dim'].includes(nx.fam) ? 'm' : '').replace(/[^IViv♭♯𝄫]/g, '')) : '';
      if (c.fam === 'dom' && nx) {
        if (d === 5) { c.arrow = 's'; c.fn = pc === kpc ? (minor ? 'i7' : 'I7') + ' → IV' : pcOf(nx.root) === kpc ? 'V7' : 'V7/' + tgt; }
        else if (d === 11) { c.arrow = 'd'; c.fn = pcOf(nx.root) === kpc ? 'SubV7' : 'SubV7/' + tgt; }
        else if (d === 2 && pcOf(nx.root) === kpc) c.fn = '♭VII7 · ' + T('ana.backdoor');
      }
      if (c.fam === 'dim' && nx && d === 1) c.fn = '°7 → ' + tgt;
      if ((c.fam === 'min' || c.fam === 'hdim') && nx && nx.fam === 'dom' && d === 5) c.br = true;
      if ((c.fam === 'min' || c.fam === 'hdim') && nx && nx.fam === 'dom' && d === 6) c.br = 'sub';
    });
    const dia = harmonize(key, scaleById('ionian')).map((h) => pcOf(h.root) + ':' + h.q);
    toks.forEach((c) => { if (!minor && !c.fn && !c.br && c.fam !== 'dom' && c.fam !== 'dim' && !dia.includes(pcOf(c.root) + ':' + ({ maj: 'maj7', min: 'm7', hdim: 'm7♭5' }[c.fam] || '')) && pcOf(c.root) !== kpc) c.mi = true; });
    return toks;
  }
  function anaSVG(toks) {
    if (!toks.length) return '<p class="bkhint">' + T('ana.none') + '</p>';
    const PER = 8, rows = [];
    for (let i = 0; i < toks.length; i += PER) rows.push(toks.slice(i, i + PER));
    return rows.map((row, ri) => {
      const cw = 100 / PER;
      let s = '<svg class="anasvg" viewBox="0 0 100 26" preserveAspectRatio="xMinYMin meet"><defs><marker id="bkah' + ri + '" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="4" markerHeight="4" orient="auto"><path d="M0 0L6 3L0 6z" class="ahd"/></marker></defs>';
      row.forEach((c, i) => {
        const x = i * cw + cw / 2, prevBar = i ? row[i - 1].bar : ri ? toks[ri * PER - 1].bar : -1;
        if (c.bar !== prevBar) s += '<line class="bl" x1="' + (i * cw + 0.2) + '" x2="' + (i * cw + 0.2) + '" y1="7.5" y2="14"/>';
        s += '<text class="cs" x="' + x + '" y="12.4">' + esc(c.sym) + '</text><text class="rn' + (c.fn ? ' fn' : c.mi ? ' mi' : '') + '" x="' + x + '" y="23.6">' + esc(c.fn || c.rn + (c.mi ? ' *' : '')) + '</text>';
        if (c.arrow) s += '<path class="ar ' + c.arrow + '" d="M' + (x + 2.5) + ' 6 Q' + (x + cw / 2) + ' 1.2 ' + (x + cw - 2.5) + ' 6"' + (i < row.length - 1 ? ' marker-end="url(#bkah' + ri + ')"' : '') + '/>';
        if (c.br) s += '<path class="brk' + (c.br === 'sub' ? ' d' : '') + '" d="M' + (x - 3) + ' 15 V17 H' + Math.min(x + cw + 3, 100) + ' V15"/>';
      });
      return s + '</svg>';
    }).join('') + (toks.some((c) => c.mi) ? '<p class="bkhint">' + T('ana.borrow') + '</p>' : '');
  }
  LABS.ana = {
    st: { key: 'C', text: ANA[0][2], p: 0 },
    render(s) {
      return '<div class="bkctl">' + sel('p', ANA.map((x, i) => [i, T('ana.' + x[0])]), s.p, T('ui.example')) + '<label class="bkfld">' + T('ui.key') + ' <input data-in="key" value="' + esc(s.key) + '" size="4"></label></div>' +
        '<textarea data-in="text" rows="2" spellcheck="false" aria-label="' + T('ui.chords') + '">' + esc(s.text) + '</textarea><div class="bkana">' + anaSVG(analyze(s.text, s.key)) + '</div>' +
        '<div class="bklegend"><span><i class="ar s"></i> ' + T('ana.lgS') + '</span><span><i class="ar d"></i> ' + T('ana.lgD') + '</span><span><i class="br"></i> ' + T('ana.lgB') + '</span></div>' +
        '<div class="bkrow">' + playBtn('data-a="play"') + sp('ana.hint') + '</div>';
    },
    set(s, k) { if (k === 'p') { s.key = ANA[s.p][1]; s.text = ANA[s.p][2]; } },
    on(s, a) { if (a === 'play') snd.prog(analyze(s.text, s.key).map((x) => voiceSym(x.sym)), 1.0); },
  };

  /* ---------- 7. Голоса ---------- */
  const RL = {
    maj7: { A: ['3', '5', '7', '9'], B: ['7', '9', '3', '5'], three: ['3', '7', '9'] },
    m7: { A: ['b3', '5', 'b7', '9'], B: ['b7', '9', 'b3', '5'], three: ['b3', 'b7', '9'] },
    7: { A: ['3', '13', 'b7', '9'], B: ['b7', '9', '3', '13'], three: ['3', 'b7', '13'] },
    '7alt': { A: ['3', 'b13', 'b7', '#9'], B: ['b7', '#9', '3', 'b13'], three: ['3', 'b7', '#9'] },
    'm7♭5': { A: ['b3', 'b5', 'b7', '1'], B: ['b7', '1', 'b3', 'b5'], three: ['b3', 'b7', 'b5'] },
    m6: { A: ['b3', '5', '6', '9'], B: ['6', '9', 'b3', '5'], three: ['b3', '6', '9'] },
  };
  const isMin = (id) => /^m/.test(id) && !/^maj/.test(id);
  const T3 = (id) => (isMin(id) ? 'b3' : '3'), T7 = (id) => (id === 'maj7' ? '7' : /6/.test(id) ? '6' : 'b7');
  const degOf = (id, s) => ({ 0: '1', 1: '♭9', 2: '9', 3: isMin(id) ? '♭3' : '♯9', 4: '3', 5: '11', 6: id === 'm7♭5' ? '♭5' : '♯11', 7: '5', 8: '♭13', 9: /6/.test(id) ? '6' : '13', 10: '♭7', 11: '7' })[s];
  function voicing(r, id, type) {
    const pc = pcOf(r), base = RL[id] || RL['7'];
    const place = (degs, lo = 50) => { const out = []; let prev = null; degs.forEach((d) => { let m = 48 + ((pc + IV[d][1]) % 12); if (prev == null) { while (m < lo) m += 12; while (m >= lo + 12) m -= 12; } else while (m <= prev) m += 12; out.push(m); prev = m; }); return out; };
    const bassOf = () => { let m = 36 + pc; if (m > 43) m -= 12; return m; };
    let up7 = [], bass = null;
    switch (type) {
      case 'shellA': bass = bassOf(); up7 = place([T3(id), T7(id)], 50); break;
      case 'shellB': bass = bassOf(); up7 = place([T7(id), T3(id)], 50); break;
      case 'guide': up7 = place([T3(id), T7(id)], 52); break;
      case 'three': up7 = place(base.three, 50); break;
      case 'B': up7 = place(base.B, 50); break;
      case 'drop2': { const cl = place(base.B, 58); up7 = [cl[2] - 12, cl[0], cl[1], cl[3]].sort((a, b) => a - b); break; }
      case 'drop24': { const cl = place(base.A, 62); up7 = [cl[0] - 12, cl[2] - 12, cl[1], cl[3]].sort((a, b) => a - b); break; }
      case 'quart': bass = bassOf(); up7 = place(isMin(id) ? ['1', '4', 'b7', 'b3', '5'] : id === '7' ? ['b7', '3', '13', '9'] : ['3', '6', '9', '5'], 50); break;
      case 'ust': bass = bassOf(); up7 = [...place([T3(id), T7(id)], 50), ...place(id === '7alt' ? ['b13', '1', '3'] : isMin(id) ? ['9', '11', '13'] : ['9', '#11', '13'], 62)]; break;
      default: up7 = place(base.A, 50);
    }
    return (bass != null ? [{ m: bass, d: '1', bass: true }] : []).concat(up7.map((m) => ({ m, d: degOf(id, (m - pc + 120) % 12) })));
  }
  function smooth(prev, cur) {
    if (!prev) return cur;
    const top = (v) => v.filter((x) => !x.bass), avg = (v) => v.reduce((a, x) => a + x.m, 0) / v.length, p = top(prev);
    let best = cur, bd = 1e9;
    for (const k of [-12, 0, 12]) {
      const sh = cur.map((x) => (x.bass ? x : { ...x, m: x.m + k })), t = top(sh);
      if (!t.length || t[0].m < 45 || t[t.length - 1].m > 81) continue;
      const dd = Math.abs(avg(t) - avg(p)); if (dd < bd) { bd = dd; best = sh; }
    }
    return best;
  }
  const spellPc = (r, m) => simp(up(r, ['1', 'b2', '2', 'b3', '3', '4', 'b5', '5', 'b6', '6', 'b7', '7'][((m - pcOf(r)) % 12 + 12) % 12]));
  const VTYPES = ['shellA', 'shellB', 'guide', 'three', 'A', 'B', 'drop2', 'drop24', 'quart', 'ust'];
  LABS.voice = {
    st: { key: 'C', prog: 'iivi', type: 'A' },
    chords(s) {
      const k = rootN(s.key);
      if (s.prog === 'iivi') return [[up(k, '2'), 'm7'], [up(k, '5'), '7'], [k, 'maj7']];
      if (s.prog === 'iivim') return [[up(k, '2'), 'm7♭5'], [up(k, '5'), '7alt'], [k, 'm6']];
      if (s.prog === 'turn') return [[k, 'maj7'], [up(k, '6'), '7'], [up(k, '2'), 'm7'], [up(k, '5'), '7']];
      return [[k, 'maj7'], [k, 'm7'], [k, '7'], [k, 'm7♭5']];
    },
    build(s) {
      let prev = null; const alt = s.type === 'A' || s.type === 'B';
      return this.chords(s).map(([r, id], i) => {
        const t = alt && s.prog !== 'qual' ? (i % 2 ? (s.type === 'A' ? 'B' : 'A') : s.type) : s.type;
        let v = voicing(r, id, t); if (s.prog !== 'qual') v = smooth(prev, v); prev = v;
        return { r: simp(r), id, v, t };
      });
    },
    render(s) {
      const vs = this.build(s), cls = (d) => (d === '1' ? 'root' : /9|11|13/.test(d) ? 'alt' : 'on'), marks = {};
      vs[vs.length - 1].v.forEach((y) => { marks[y.m] = { c: cls(y.d), t: y.d }; });
      return '<div class="bkctl">' + rootSel('key', s.key, ROOT_OPTS) + seg('prog', [['iivi', 'ii–V–I'], ['iivim', 'ii–V–i'], ['turn', 'I–VI–ii–V'], ['qual', T('vc.qual')]], s.prog) + '</div>' +
        '<div class="bkctl">' + sel('type', VTYPES.map((k) => [k, T('vt.' + k)]), s.type, T('ui.voicing')) + (s.type === 'A' || s.type === 'B' ? sp('vc.ab') : '') + '</div>' +
        staffSVG(vs.map((x) => x.v.map((y) => ({ n: spellPc(x.r, y.m), m: y.m, c: cls(y.d) }))), { mode: 'chords', labels: vs.map((x) => nm(x.r) + x.id) }) +
        '<div class="bkvrow">' + vs.map((x, i) => '<button class="vc" data-a="c:' + i + '"><b>' + nm(x.r) + x.id + '</b><small>' + x.v.map((y) => y.d).join(' · ') + '</small>' + (s.type === 'A' || s.type === 'B' ? '<em>' + T('vc.type', { t: x.t }) + '</em>' : '') + '</button>').join('') + '</div>' +
        keyboardSVG(marks, { lo: 36, hi: 84 }) + '<div class="bkrow">' + playBtn('data-a="play"', T('vc.play')) + '</div>';
    },
    on(s, a) { const vs = this.build(s); if (a === 'play') snd.prog(vs.map((x) => x.v.map((y) => y.m)), 1.3); if (a.startsWith('c:')) snd.chord(vs[+a.slice(2)].v.map((y) => y.m), { dur: 1.8 }); },
  };

  /* ---------- 8. Модуляция и заимствование ---------- */
  const MI = [['ii', 'm7♭5', '2'], ['♭III', 'maj7', 'b3'], ['iv', 'm7', '4'], ['iv6', 'm6', '4'], ['v', 'm7', '5'], ['♭VI', 'maj7', 'b6'], ['♭VII', '7', 'b7'], ['♭II', 'maj7', 'b2'], ['i', 'm7', '1']];
  LABS.mi = {
    st: { key: 'C' },
    render(s) {
      const k = rootN(s.key);
      return '<div class="bkctl">' + rootSel('key', s.key, ROOT_OPTS) + sp('mi.hint') + '</div><div class="bkchips">' + MI.map(([rn, q, d], i) => '<button class="chipc" data-a="m:' + i + '"><b>' + nm(simp(up(k, d))) + q + '</b><small>' + rn + '</small></button>').join('') + '</div><p class="bknote">' + T('mi.note') + '</p>';
    },
    on(s, a) { const k = rootN(s.key), [, q, d] = MI[+a.slice(2)], I = voiceSimple({ r: k, id: 'maj7' }); snd.prog([I, voiceSimple({ r: simp(up(k, d)), id: q }), I], 1.2); },
  };

  /* ---------- 9. Реармонизация ---------- */
  LABS.tritone = {
    st: { root: 'G' },
    render(s) {
      const r = rootN(s.root), sub = simp(up(r, 'b5')), rp = pcOf(r), spc = pcOf(sub), tgt = simp(up(r, '4'));
      const shared = new Set([(rp + 4) % 12, (rp + 10) % 12]), marks = {};
      [0, 4, 7, 10].forEach((x) => { const m = 48 + ((rp + x) % 12); marks[m] = { c: shared.has(m % 12) ? 'alt' : m % 12 === rp ? 'root' : 'on', t: nm(spellPc(r, m)) }; });
      [0, 4, 7, 10].forEach((x) => { const m = 60 + ((spc + x) % 12); marks[m] = { c: shared.has(m % 12) ? 'alt' : m % 12 === spc ? 'root' : 'b', t: nm(spellPc(sub, m)) }; });
      return '<div class="bkctl">' + rootSel('root', s.root) + '</div><p>' + T('tt.text', { a: nm(r) + '7', b: nm(sub) + '7', x: nm(simp(up(r, '3'))), y: nm(simp(up(r, 'b7'))), t: nm(tgt) }) + '</p>' +
        keyboardSVG(marks, { lo: 48, hi: 74 }) + '<div class="bkrow">' + playBtn('data-a="v"', nm(r) + '7 → ' + nm(tgt)) + playBtn('data-a="s"', nm(sub) + '7 → ' + nm(tgt)) + playBtn('data-a="ii"', 'ii–SubV–I') + '</div>' +
        '<p class="bknote">' + T('tt.note', { a: nm(sub), b: nm(r) }) + '</p>';
    },
    on(s, a) {
      const r = rootN(s.root), sub = simp(up(r, 'b5')), tgt = simp(up(r, '4')), I = voiceSimple({ r: tgt, id: 'maj7' });
      if (a === 'v') snd.prog([voiceSimple({ r, id: '7' }), I], 1.2);
      if (a === 's') snd.prog([voiceSimple({ r: sub, id: '7' }), I], 1.2);
      if (a === 'ii') snd.prog([voiceSimple({ r: simp(up(tgt, '2')), id: 'm7' }), voiceSimple({ r: sub, id: '7' }), I], 1.1);
    },
  };
  const REHARM = [
    ['r1', 'Dm7 | G7 | Cmaj7', 'Dm7 | D♭7 | Cmaj7'], ['r2', 'Dm7 | G7 | Cmaj7', 'Dm7 A♭m7 | D♭7 | Cmaj7'], ['r3', 'Cmaj7 Am7 | Dm7 G7', 'Cmaj7 A7 | D7 G7'],
    ['r4', 'Cmaj7 Am7 | Dm7 G7', 'Cmaj7 E♭7 | A♭maj7 D♭7'], ['r5', 'Cmaj7 | Dm7', 'Cmaj7 C♯°7 | Dm7'], ['r6', 'Cmaj7 | Cmaj7', 'Cmaj7 | C°7 Cmaj7'],
    ['r7', 'Fmaj7 | Cmaj7', 'Fmaj7 Fm6 | Cmaj7'], ['r8', 'Dm7 G7 | Cmaj7', 'Fm7 B♭7 | Cmaj7'], ['r9', 'G7 | G7 | Cmaj7', 'Dm7 | G7 | Cmaj7'],
    ['r10', 'Dm7 | Dm7', 'Dm7 | E♭m7 Dm7'], ['r11', 'Cm | Cm | Cm | Cm', 'Cm | Cm(maj7) | Cm7 | Cm6'], ['r12', 'Cmaj7 | Am7 | Dm7 | G7', 'Cmaj7 | E♭maj7 | A♭maj7 | D♭maj7'],
  ];
  const seqOf = (t) => t.replace(/\|/g, ' ').split(/\s+/).filter(Boolean).map(voiceSym);
  LABS.reharm = {
    st: { i: 0 },
    render(s) {
      const [k, a, b] = REHARM[s.i], bars = (t) => t.split('|').map((x) => '<span class="bx">' + esc(x.trim()) + '</span>').join('');
      return '<div class="bkctl">' + sel('i', REHARM.map((r, i) => [i, T('rh.' + r[0])]), s.i, T('ui.example')) + '</div><div class="ba"><div><small>' + T('rh.before') + '</small><div class="bxs">' + bars(a) + '</div>' + playBtn('data-a="a"') + '</div>' +
        '<div><small>' + T('rh.after') + '</small><div class="bxs new">' + bars(b) + '</div>' + playBtn('data-a="b"') + '</div></div><p class="bknote">' + T('rh.' + k + 'n') + '</p>';
    },
    on(s, a) { const x = REHARM[s.i]; if (a === 'a') snd.prog(seqOf(x[1]), 1); if (a === 'b') snd.prog(seqOf(x[2]), 1); },
  };
  LABS.dimsub = {
    st: { root: 'C' },
    render(s) {
      const r = rootN(s.root), roots = [0, 3, 6, 9].map((k) => (pcOf(r) + k) % 12), doms = roots.map((p) => MAJ_ROOTS[(p + 11) % 12] + '7♭9'), marks = {};
      roots.forEach((p) => { marks[60 + p] = { c: 'alt', t: ALL12.find((x) => pcOf(rootN(x)) === p) }; });
      return '<div class="bkctl">' + rootSel('root', s.root) + '</div><p>' + T('ds.text', { d: nm(r) + '°7', list: doms.join(', ') }) + '</p>' + keyboardSVG(marks, { lo: 59, hi: 72 }) +
        '<div class="bkchips">' + doms.map((d, i) => '<button class="chipc wide" data-a="d:' + i + '">' + d + ' → ' + MAJ_ROOTS[(roots[i] + 4) % 12] + '</button>').join('') + '</div>';
    },
    on(s, a) {
      if (!a.startsWith('d:')) return;
      const r = rootN(s.root), p = (pcOf(r) + [0, 3, 6, 9][+a.slice(2)]) % 12, bass = 36 + ((p + 11) % 12), dim = [0, 3, 6, 9].map((k) => 60 + ((pcOf(r) + k) % 12)).sort((x, y) => x - y);
      snd.prog([[bass, ...dim], voiceSimple({ r: rootN(MAJ_ROOTS[(p + 4) % 12]), id: 'maj7' })], 1.3);
    },
  };
  LABS.coltrane = {
    st: { key: 'C' },
    seq(s) { const k = rootN(s.key), K = (n) => rootN(MAJ_ROOTS[(pcOf(k) + n) % 12]); return [{ r: simp(up(k, '2')), id: 'm7' }, { r: K(3), id: '7' }, { r: K(8), id: 'maj7' }, { r: K(11), id: '7' }, { r: K(4), id: 'maj7' }, { r: simp(up(k, '5')), id: '7' }, { r: k, id: 'maj7' }]; },
    render(s) {
      const k = rootN(s.key), tri = [0, 8, 4].map((n) => MAJ_ROOTS[(pcOf(k) + n) % 12]);
      const pts = [0, 1, 2].map((i) => { const a = (-90 + i * 120) * Math.PI / 180; return [50 + 34 * Math.cos(a), 50 + 34 * Math.sin(a)]; });
      let svg = '<svg class="tri" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="34" class="tc"/><path class="tp" d="M' + pts[0] + 'L' + pts[2] + 'L' + pts[1] + 'Z"/>';
      pts.forEach((p, i) => { svg += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="9" class="tn"/><text x="' + p[0] + '" y="' + (p[1] + 2.4) + '">' + tri[i] + '</text>'; });
      return '<div class="bkctl">' + rootSel('key', s.key, ROOT_OPTS) + '</div><div class="bktwo"><div>' + svg + '</svg></div><div class="bkfacts"><p>' + T('ct.text', { path: tri.join(' → ') + ' → ' + tri[0] }) + '</p>' +
        '<div class="bxs new">' + this.seq(s).map((x) => '<span class="bx">' + iiviName(x) + '</span>').join('') + '</div>' + playBtn('data-a="p"') + '</div></div>';
    },
    on(s) { snd.prog(this.seq(s).map(voiceSimple), 0.9); },
  };
  const V7RES = [['4', 'maj7', 'v1'], ['4', 'm7', 'v2'], ['b2', 'maj7', 'v3'], ['2', 'm7', 'v4'], ['2', 'maj7', 'v5'], ['b6', 'maj7', 'v6'], ['b3', 'maj7', 'v7'], ['3', 'maj7', 'v8'], ['b7', 'maj7', 'v9'], ['5', 'maj7', 'v10']];
  LABS.v7res = {
    st: { root: 'G' },
    render(s) { const r = rootN(s.root); return '<div class="bkctl">' + rootSel('root', s.root) + '</div><div class="bklist">' + V7RES.map(([d, q, k], i) => '<button class="bkli" data-a="r:' + i + '"><b>' + nm(r) + '7 → ' + nm(simp(up(r, d))) + q + '</b><span>' + T('v7.' + k) + '</span></button>').join('') + '</div>'; },
    on(s, a) { const r = rootN(s.root), [d, q] = V7RES[+a.slice(2)]; snd.prog([voiceSimple({ r, id: '7' }), voiceSimple({ r: simp(up(r, d)), id: q })], 1.2); },
  };

  /* ---------- 10. Аккомпанемент ---------- */
  const COMP = [['c1', '10010000'], ['c2', '01000100'], ['c3', '00000001'], ['c4', '00100010'], ['c5', '01000101'], ['c6', '10001000'], ['c7', '10000110'], ['c8', '00000000']];
  LABS.comp = {
    st: { p: 0, grid: COMP[0][1] + COMP[0][1], bpm: 132, key: 'C' },
    render(s) {
      return '<div class="bkctl">' + sel('p', COMP.map((x, i) => [i, T('cp.' + x[0])]), s.p, T('ui.rhythm')) + rootSel('key', s.key, ROOT_OPTS) + seg('bpm', [[100, '100'], [132, '132'], [176, '176']], s.bpm) + '</div>' +
        '<div class="grid8">' + [...s.grid].map((v, i) => { const b = Math.floor(i / 2) % 4 + 1; return '<button class="g8' + (v === '1' ? ' on' : '') + (i % 2 ? ' off' : '') + '" data-a="g:' + i + '" aria-pressed="' + (v === '1') + '" aria-label="' + (i % 2 ? b + '&' : b) + '">' + (i % 2 ? '&' : b) + '</button>'; }).join('') + '</div>' +
        '<p class="bkhint">' + T('cp.hint') + '</p><div class="bkrow">' + playBtn('data-a="play"', T('cp.play')) + '</div>';
    },
    set(s, k) { if (k === 'p') s.grid = COMP[s.p][1] + COMP[s.p][1]; },
    on(s, a) {
      if (a.startsWith('g:')) { const i = +a.slice(2), g = [...s.grid]; g[i] = g[i] === '1' ? '0' : '1'; s.grid = g.join(''); return; }
      if (a !== 'play') return;
      const k = rootN(s.key), beat = 60 / s.bpm, hits = [];
      const ch = [voicing(up(k, '2'), 'm7', 'A'), voicing(up(k, '5'), '7', 'B'), voicing(k, 'maj7', 'A'), voicing(k, 'maj7', 'A')].map((v) => v.map((x) => x.m));
      const roots = [up(k, '2'), up(k, '5'), k, k].map((r) => 36 + pcOf(r));
      for (let bar = 0; bar < 4; bar++) {
        const g = s.grid.slice((bar % 2) * 8, (bar % 2) * 8 + 8);
        for (let e = 0; e < 8; e++) if (g[e] === '1') hits.push([bar * 4 * beat + Math.floor(e / 2) * beat + (e % 2 ? beat * 0.66 : 0), ch[bar], beat * 0.55]);
        const rp = roots[bar], nx = roots[(bar + 1) % 4];
        [rp, rp + 7, rp + 4, nx + (nx > rp ? -1 : 1)].forEach((m, b) => hits.push([bar * 4 * beat + b * beat, [m], beat * 0.9]));
      }
      snd.hits(hits);
    },
  };
  LABS.avoid = {
    st: {},
    render() { return '<div class="bktw"><table><thead><tr><th>' + T('ui.chord') + '</th><th>' + T('ui.scale') + '</th><th>' + T('av.notes') + '</th><th>' + T('av.alt') + '</th></tr></thead><tbody>' + [1, 2, 3, 4, 5, 6, 7, 8].map((i) => '<tr>' + [0, 1, 2, 3].map((j) => '<td>' + (j ? '' : '<b>') + T('av.r' + i + '.' + j) + (j ? '' : '</b>') + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>'; },
    on() {},
  };
  LABS.tens = {
    st: {},
    render() { return '<div class="bktw"><table><thead><tr><th>' + T('ui.chord') + '</th><th>' + T('tn.head') + '</th></tr></thead><tbody>' + [1, 2, 3, 4, 5, 6, 7].map((i) => '<tr><td><b>' + T('tn.r' + i + '.0') + '</b></td><td>' + T('tn.r' + i + '.1') + '</td></tr>').join('') + '</tbody></table></div>'; },
    on() {},
  };

  /* ---------- 11. Формы ---------- */
  const FORMS = {
    b3: ['I7', 'I7', 'I7', 'I7', 'IV7', 'IV7', 'I7', 'I7', 'V7', 'IV7', 'I7', 'V7'], bq: ['I7', 'IV7', 'I7', 'I7', 'IV7', 'IV7', 'I7', 'I7', 'V7', 'IV7', 'I7', 'V7'],
    bj: ['I7', 'IV7', 'I7', 'v7 I7', 'IV7', '♯iv°7', 'I7', 'vi7 VI7', 'ii7', 'V7', 'I7 VI7', 'ii7 V7'],
    bb: ['Imaj7', 'viiø VI7', 'vi7 II7', 'v7 I7', 'IV7', 'iv7 ♭VII7', 'iii7', '♭iii7 ♭VI7', 'ii7', 'V7', 'iii7 VI7', 'ii7 V7'],
    bm: ['i7', 'i7', 'i7', 'i7', 'iv7', 'iv7', 'i7', 'i7', '♭VI7', 'V7alt', 'i7', 'iiø V7alt'],
    rc: ['I vi7', 'ii7 V7', 'I vi7', 'ii7 V7', 'I I7', 'IV ♯iv°7', 'I V7', 'I'], rb: ['III7', 'III7', 'VI7', 'VI7', 'II7', 'II7', 'V7', 'V7'],
  };
  const RN_DEG = { I: '1', II: '2', III: '3', IV: '4', V: '5', VI: '6', VII: '7' };
  function rnChord(k, t) {
    const m = /^(♭|♯)?(VII|VI|V|IV|III|II|I|vii|vi|v|iv|iii|ii|i)(.*)$/.exec(t); if (!m) return null;
    const U = m[2].toUpperCase(), low = m[2] !== U;
    let d = RN_DEG[U]; if (m[1] === '♭') d = 'b' + d; if (m[1] === '♯') d = '#' + d;
    const rest = m[3], id = rest === '7' ? (low ? 'm7' : '7') : rest === '' ? (low ? 'm' : '6') : rest === 'ø' ? 'm7♭5' : rest;
    return { r: simp(up(k, d)), id };
  }
  LABS.form = {
    st: { f: 'bj', key: 'F' },
    render(s) {
      const k = rootN(s.key);
      return '<div class="bkctl">' + sel('f', Object.keys(FORMS).map((id) => [id, T('fm.' + id)]), s.f, T('ui.form')) + rootSel('key', s.key, ROOT_OPTS) + '</div><div class="fgrid">' +
        FORMS[s.f].map((b, i) => '<div class="bkfb" data-bar="' + i + '"><small>' + (i + 1) + '</small><b>' + b.split(' ').map((t) => { const c = rnChord(k, t); return c ? nm(c.r) + c.id : t; }).join(' ') + '</b><em>' + b + '</em></div>').join('') + '</div><div class="bkrow">' + playBtn('data-a="play"') + '</div>';
    },
    on(s, a, el) {
      if (a !== 'play') return;
      const k = rootN(s.key), bar = 1.7, hits = [], F = FORMS[s.f];
      let t = 0;
      F.forEach((b) => { const ts = b.split(' '); ts.forEach((x) => { const c = rnChord(k, x); if (c) hits.push([t, voiceSimple(c), (bar / ts.length) * 0.95]); t += bar / ts.length; }); });
      snd.hits(hits);
      F.forEach((_, i) => snd.mark(i * bar, () => el.querySelectorAll('.fb').forEach((c, j) => c.classList.toggle('on', j === i))));
      snd.mark(F.length * bar, () => el.querySelectorAll('.fb').forEach((c) => c.classList.remove('on')));
      return false;
    },
  };
  const AABA = { aaba: ['A', 'A', 'B', 'A'], aba: ['A', 'B', 'A'], abac: ['A', 'B', 'A', 'C'], ab: ['A', 'B'], blues: ['12'] };
  LABS.aaba = {
    st: { f: 'aaba' },
    render(s) {
      return '<div class="bkctl">' + seg('f', Object.keys(AABA).map((k) => [k, k === 'blues' ? '12' : k.toUpperCase()]), s.f) + '</div><p><b>' + T('ab.' + s.f) + '</b></p><div class="form">' +
        AABA[s.f].map((x) => '<div class="fs s' + x + '" style="flex:' + (x === '12' ? 12 : 8) + '"><b>' + (x === '12' ? T('ab.bars', { n: 12 }) : x) + '</b><small>' + (x === '12' ? '3 × 4' : T('ab.bars', { n: 8 })) + (x === 'B' && s.f === 'aaba' ? ' · ' + T('ab.bridge') : '') + '</small></div>').join('') + '</div>';
    },
    on() {},
  };

  /* ---------- 13. Импровизация ---------- */
  function matches(sym) {
    const c = parseChord(sym); if (!c) return { c: null, list: [] };
    const cc = chordOf(c), need = cc.f.map((d) => IV[d][1] % 12);
    const list = SCALES.filter((sc) => sc.f.length >= 6 && sc.g !== 'pent' && need.every((x) => sc.f.some((d) => IV[d][1] % 12 === x)));
    const rank = (sc) => (sc.chord && chordById(sc.chord) && chordById(sc.chord).fam === cc.fam ? 0 : 1) + ({ maj: 0, mel: 0.3, sym: 0.5, bebop: 0.6 }[sc.g] ?? 1);
    return { c, cc, list: list.sort((a, b) => rank(a) - rank(b)) };
  }
  LABS.cscale = {
    st: { sym: 'G7', pick: '' },
    render(s) {
      const fld = '<label class="bkfld">' + T('ui.chord') + ' <input data-in="sym" value="' + esc(s.sym) + '" size="8"></label>';
      const { c, cc, list } = matches(s.sym);
      if (!c) return '<div class="bkctl">' + fld + '</div><p class="bkhint">' + T('cs.bad') + '</p>';
      const pick = list.find((x) => x.id === s.pick) || list[0], ct = new Set(cc.f.map((d) => IV[d][1] % 12)), marks = {};
      if (pick) scaleNotes(c.root, pick.f, 60).forEach((x) => { const k = (x.m - 60 - pcOf(c.root) + 120) % 12; marks[x.m] = { c: k === 0 ? 'root' : ct.has(k) ? 'on' : 'alt', t: degLabel(x.d) }; });
      return '<div class="bkctl">' + fld + sp('cs.hint') + '</div><div class="bkchips">' + list.slice(0, 10).map((x) => '<button class="chipc wide' + (pick && x.id === pick.id ? ' on' : '') + '" data-a="s:' + x.id + '">' + nm(c.root) + ' · ' + scName(x.id) + '</button>').join('') + '</div>' +
        (pick ? keyboardSVG(marks, { lo: 59, hi: 84 }) + '<p class="bknote">' + T('cs.note') + (pick.avoid ? T('cs.avoid', { d: pick.avoid.map(degLabel).join(', ') }) : '') + '.</p>' : '') + '<div class="bkrow">' + playBtn('data-a="p"', T('sc.over')) + '</div>';
    },
    on(s, a) {
      if (a.startsWith('s:')) { s.pick = a.slice(2); return; }
      const { c, cc, list } = matches(s.sym), pick = list.find((x) => x.id === s.pick) || list[0]; if (!pick) return;
      const ms = pick.f.map((d) => scaleMidi(c.root, d, 60)).concat([midiOf(c.root, '1', 72)]), line = ms.concat(ms.slice(0, -1).reverse());
      snd.over(voiceSimple({ r: c.root, id: cc.id }), line.length * 0.2 + 0.5, line, 0.2, 0.35);
    },
  };
  const PARENT = { maj7: 'lydian', m7: 'dorian', 7: 'mixolydian', '7alt': 'altered', 'm7♭5': 'locnat2', 'm(maj7)': 'melmin', '7♯11': 'lyddom' };
  const pentas = (id) => { const pcs = new Set(scaleById(PARENT[id]).f.map((d) => IV[d][1] % 12)), out = []; for (let o = 0; o < 12; o++) { const p = [0, 2, 4, 7, 9].map((x) => (o + x) % 12); if (p.every((x) => pcs.has(x))) out.push({ o, p }); } return out; };
  LABS.penta = {
    st: { root: 'C', id: 'maj7' },
    render(s) {
      const r = rootN(s.root);
      return '<div class="bkctl">' + rootSel('root', s.root, ROOT_OPTS) + seg('id', ['maj7', 'm7', '7', '7♯11', '7alt', 'm7♭5', 'm(maj7)'].map((x) => [x, x === 'm7♭5' ? 'ø' : x]), s.id) + '</div>' +
        '<p class="bkhint">' + T('pt.src', { s: scName(PARENT[s.id]), r: nm(r) }) + '</p><div class="bklist">' + pentas(s.id).map((x, i) => '<button class="bkli" data-a="p:' + i + '"><b>' + T('pt.name', { a: nm(rootN(MAJ_ROOTS[(pcOf(r) + x.o) % 12])), b: nm(rootN(MIN_ROOTS[(pcOf(r) + x.o + 9) % 12])) }) + '</b><span>' + T('pt.degs', { c: nm(r) + s.id, d: x.p.map((k) => degOf(s.id, k)).join(' ') }) + '</span></button>').join('') + '</div>';
    },
    on(s, a) {
      const r = rootN(s.root), x = pentas(s.id)[+a.slice(2)]; if (!x) return;
      const line = [0, 2, 4, 7, 9, 12, 14, 16].map((k) => 60 + ((pcOf(r) + x.o) % 12) + k);
      snd.over(voiceSimple({ r, id: s.id === '7♯11' ? '7' : s.id }), 4, line.concat(line.slice(0, -1).reverse()), 0.22, 0.35);
    },
  };
  const ENCL = [['e1', ['-1']], ['e2', ['+d']], ['e3', ['+d', '-1']], ['e4', ['-1', '+d']], ['e5', ['+1', '-1']], ['e6', ['-2', '-1']], ['e7', ['+d', '+1']], ['e8', ['+d', '-d', '-1']]];
  const nearSpell = (m, sharp) => rootN((sharp ? ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'] : ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'])[((m % 12) + 12) % 12]);
  function enclosure(s) {
    const c = parseChord(s.sym) || parseChord('Cmaj7'), cc = chordOf(c);
    const dT = cc.f.find((d) => d.replace(/[b#]/g, '') === s.t) || '1', sc = scaleById({ min: 'dorian', dom: 'mixolydian', hdim: 'locrian' }[cc.fam] || 'ionian');
    const tm = midiOf(c.root, dT, 64), tn = simp(up(c.root, dT)), spc = sc.f.map((d) => (pcOf(c.root) + IV[d][1]) % 12);
    const dia = (dir) => { let m = tm + dir; while (!spc.includes(((m % 12) + 12) % 12)) m += dir; return m; };
    const ms = ENCL[s.p][1].map((k) => (k === '+d' ? dia(1) : k === '-d' ? dia(-1) : tm + parseInt(k, 10))).concat([tm]);
    return { c, ms, items: ms.map((m, i) => ({ n: i === ms.length - 1 ? tn : nearSpell(m, m < tm), m, c: i === ms.length - 1 ? 'root' : 'on' })) };
  }
  LABS.encl = {
    st: { sym: 'Cmaj7', t: '3', p: 2 },
    render(s) {
      return '<div class="bkctl"><label class="bkfld">' + T('ui.chord') + ' <input data-in="sym" value="' + esc(s.sym) + '" size="7"></label>' + seg('t', [['1', T('en.t1')], ['3', T('en.t3')], ['5', T('en.t5')], ['7', T('en.t7')]], s.t) + '</div>' +
        '<div class="bkctl">' + sel('p', ENCL.map((x, i) => [i, T('en.' + x[0])]), s.p, T('ui.pattern')) + '</div>' + staffSVG(enclosure(s).items, { mode: 'seq' }) + '<div class="bkrow">' + playBtn('data-a="p"') + '</div>';
    },
    on(s) { const { c, ms } = enclosure(s); snd.over([36 + pcOf(c.root)], ms.length * 0.22 + 1, ms, 0.22, 0.4); },
  };

  /* ---------- 15. Упражнения ---------- */
  const rnd = (n) => Math.floor(Math.random() * n), pick = (a) => a[rnd(a.length)];
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const opts = (right, pool, k = 4) => { const o = new Set([right]); for (const x of shuffle(pool)) { if (o.size >= k) break; o.add(x); } return shuffle([...o]); };
  const IVQ = () => INTERVALS.filter((x) => x.s > 0 && x.s <= 12 && x.k !== '#2' && x.k !== '#4' && x.k !== '#5' && x.k !== 'bb7');
  const EX = {
    ivname() { const iv = pick(IVQ()), r = rootN(pick(['C', 'D', 'E♭', 'E', 'F', 'G', 'A', 'B♭'])), m0 = 60 + pcOf(r) - (pcOf(r) > 7 ? 12 : 0); return { q: T('ex.q.ivname'), show: staffSVG([{ n: r, m: m0 }, { n: simp(up(r, iv.k)), m: m0 + iv.s }], { mode: 'seq' }), a: ivName(iv.k), o: opts(ivName(iv.k), IVQ().map((x) => ivName(x.k))), play: [[m0], [m0 + iv.s]] }; },
    ivear() { const iv = pick(IVQ()), m0 = 55 + rnd(10); return { q: T('ex.q.ivear'), a: ivName(iv.k), o: opts(ivName(iv.k), IVQ().map((x) => ivName(x.k))), play: [[m0], [m0 + iv.s], [m0, m0 + iv.s]], ear: true }; },
    chear() { const ids = ['maj7', 'm7', '7', 'm7♭5', '°7', 'm(maj7)'], c = chordById(pick(ids)), b = 50 + rnd(8); return { q: T('ex.q.chear'), a: chName(c.id), o: shuffle(ids.map(chName)), block: c.f.map((d) => b + IV[d][1]), ear: true }; },
    spell() { const ids = ['maj7', 'm7', '7', 'm7♭5', '°7', '6', 'm6'], id = pick(ids), r = rootN(pick(MAJ_ROOTS)), sp = (x) => chordById(x).f.map((d) => nm(simp(up(r, d)))).join(' '); return { q: T('ex.q.spell', { c: nm(r) + id }), a: sp(id), o: opts(sp(id), ids.filter((x) => x !== id).map(sp)), block: chordById(id).f.map((d) => midiOf(r, d, 48)) }; },
    iivi() { const minor = Math.random() < 0.35, key = pick(minor ? ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'E♭', 'B♭', 'F♯', 'C♯', 'G♯'] : MAJ_ROOTS), f = (k) => iiVI(k, minor).map(iiviName).join(' – '); return { q: T(minor ? 'ex.q.iivim' : 'ex.q.iivi', { k: key }), a: f(key), o: opts(f(key), MAJ_ROOTS.filter((x) => x !== key).map(f)), prog: iiVI(key, minor).map(voiceSimple) }; },
    subv() { const r = rootN(pick(ALL12)), sub = simp(up(r, 'b5')); return { q: T('ex.q.subv', { c: nm(r) + '7' }), a: nm(sub) + '7', o: opts(nm(sub) + '7', MAJ_ROOTS.map((x) => x + '7')), prog: [voiceSimple({ r, id: '7' }), voiceSimple({ r: sub, id: '7' })] }; },
    rn() { const k = rootN(pick(MAJ_ROOTS)), h = harmonize(k, scaleById('ionian')), x = pick(h), all = h.map((y) => roman(k, y.root, y.q)); return { q: T('ex.q.rn', { c: nm(simp(x.root)) + x.q, k: nm(k) }), a: roman(k, x.root, x.q), o: opts(roman(k, x.root, x.q), all), prog: [voiceSimple({ r: k, id: 'maj7' }), keyMs(x)] }; },
    scale() { const P = [['maj7', 'ionian'], ['m7', 'dorian'], ['7', 'mixolydian'], ['m7♭5', 'locnat2'], ['7alt', 'altered'], ['7♯11', 'lyddom'], ['maj7♯11', 'lydian'], ['m(maj7)', 'melmin'], ['7♭9', 'dimhw'], ['°7', 'dimwh'], ['7♯5', 'whole']], [id, sc] = pick(P), r = rootN(pick(MAJ_ROOTS)); return { q: T('ex.q.scale', { c: nm(r) + id }), a: scName(sc), o: opts(scName(sc), P.map((x) => scName(x[1]))), prog: [voiceSimple({ r, id })] }; },
    sig() { const i = rnd(12); return { q: T('ex.q.sig', { k: CIRCLE[i] }), a: sigText(SIG[i]), o: opts(sigText(SIG[i]), SIG.map(sigText)) }; },
    func() { const k = rootN(pick(MAJ_ROOTS)), h = harmonize(k, scaleById('ionian')), i = rnd(7); return { q: T('ex.q.func', { c: nm(simp(h[i].root)) + h[i].q, k: nm(k) }), a: T('fn.' + funcOf(i, false)), o: ['T', 'S', 'D'].map((f) => T('fn.' + f)), prog: [voiceSimple({ r: k, id: 'maj7' }), keyMs(h[i])] }; },
  };
  const hear = (q) => { if (!q) return; if (q.prog) snd.prog(q.prog, 1.1); else if (q.block) snd.chord(q.block, { dur: 1.8 }); else if (q.play) snd.seq(q.play, 0.7, 0.9); };
  LABS.ex = {
    st: { on: Object.keys(EX).join(','), q: null, ok: 0, n: 0, ans: null },
    next(s) { const on = s.on.split(',').filter(Boolean); if (!on.length) { s.q = null; return; } const id = pick(on); s.q = { ...EX[id](), id }; s.ans = null; if (s.q.ear) hear(s.q); },
    render(s) {
      if (!s.q && s.on) this.next(s);
      const on = s.on.split(','), q = s.q;
      return '<div class="extypes">' + Object.keys(EX).map((id) => '<button class="chk' + (on.includes(id) ? ' on' : '') + '" data-a="t:' + id + '" aria-pressed="' + on.includes(id) + '">' + T('ex.t.' + id) + '</button>').join('') + '</div>' +
        (q ? '<div class="excard"><div class="exq">' + q.q + '</div>' + (q.show || '') + (q.play || q.prog || q.block ? '<div class="bkrow">' + playBtn('data-a="hear"', T(q.ear ? 'ex.again' : 'ui.play')) + '</div>' : '') +
          '<div class="exo">' + q.o.map((o, i) => '<button class="eo' + (s.ans != null ? (o === q.a ? ' right' : i === s.ans ? ' wrong' : '') : '') + '" data-a="o:' + i + '"' + (s.ans != null ? ' disabled' : '') + '>' + o + '</button>').join('') + '</div>' +
          (s.ans != null ? '<div class="bkrow"><button class="primary" data-a="next">' + T('ex.next') + '</button></div>' : '') + '</div>' : '<p class="bkhint">' + T('ex.pick') + '</p>') +
        '<p class="score">' + T('ex.score', { ok: s.ok, n: s.n }) + '</p>';
    },
    on(s, a) {
      if (a.startsWith('t:')) { const id = a.slice(2), on = new Set(s.on.split(',').filter(Boolean)); if (on.has(id)) on.delete(id); else on.add(id); s.on = [...on].join(','); if (!s.q || !on.has(s.q.id)) this.next(s); return; }
      if (!s.q) return;
      if (a === 'hear') { hear(s.q); return false; }
      if (a.startsWith('o:') && s.ans == null) { s.ans = +a.slice(2); s.n++; if (s.q.o[s.ans] === s.q.a) s.ok++; if (!s.q.ear) hear(s.q); return; }
      if (a === 'next') this.next(s);
    },
  };
  LABS.plan = {
    st: { min: 45, focus: 'harm' },
    render(s) {
      const F = { harm: [0.3, 0.15, 0.35, 0.2], impro: [0.2, 0.2, 0.35, 0.25], ear: [0.3, 0.4, 0.3], rep: [0.25, 0.25, 0.3, 0.2] };
      return '<div class="bkctl">' + seg('focus', Object.keys(F).map((k) => [k, T('pl.' + k)]), s.focus) + seg('min', [[20, T('pl.min', { n: 20 })], [45, T('pl.min', { n: 45 })], [90, T('pl.min', { n: 90 })]], s.min) + '</div>' +
        '<div class="bkplan">' + F[s.focus].map((f, i) => '<div class="pl"><b>' + Math.round(s.min * f) + '′</b><span>' + T('pl.' + s.focus + i) + '</span></div>').join('') + '</div>' +
        '<p class="bknote">' + T('pl.keys', { list: [0, 1, 2, 3, 4, 5].map((i) => T('pl.d' + i) + ' — ' + CIRCLE[i * 2] + ', ' + CIRCLE[i * 2 + 1]).join('; ') }) + '</p>';
    },
    on() {},
  };

  /* ---------- 16. Справочник ---------- */
  LABS.refch = {
    st: { root: 'C', fam: 'all' },
    render(s) {
      const r = rootN(s.root), fams = ['all', 'maj', 'min', 'dom', 'hdim', 'sus', 'aug'];
      const list = CHORDS.filter((c) => s.fam === 'all' || c.fam === s.fam || (s.fam === 'hdim' && c.fam === 'dim'));
      return '<div class="bkctl">' + rootSel('root', s.root) + seg('fam', fams.map((f) => [f, T('fam.' + f)]), s.fam) + '</div><div class="bktw"><table><thead><tr><th>' + T('rf.sym') + '</th><th>' + T('ch.name') + '</th><th>' + T('ch.degs') + '</th><th>' + T('ch.notes') + '</th><th>' + T('ch.alt') + '</th></tr></thead><tbody>' +
        list.map((c) => '<tr class="click" data-a="c:' + c.id + '"><td><b>' + nm(r) + c.id + '</b></td><td>' + chName(c.id) + '</td><td>' + c.f.map(degLabel).join(' ') + '</td><td>' + c.f.map((d) => nm(simp(up(r, d)))).join(' ') + '</td><td class="dim">' + esc(c.alt.replace(/C/g, nm(r))) + '</td></tr>').join('') + '</tbody></table></div>';
    },
    on(s, a) { if (a.startsWith('c:')) { const c = chordById(a.slice(2)), r = rootN(s.root); snd.chord(c.f.map((d) => midiOf(r, d, 48)), { dur: 1.8 }); } },
  };
  LABS.refsc = {
    st: { root: 'C', g: 'maj' },
    render(s) {
      const r = rootN(s.root);
      return '<div class="bkctl">' + rootSel('root', s.root) + sel('g', SG.map((g) => [g, L.SG[g]]), s.g, T('ui.group')) + '</div><div class="bktw"><table><thead><tr><th>' + T('ui.scale') + '</th><th>' + T('ch.degs') + '</th><th>' + T('iv.from', { n: nm(r) }) + '</th><th>' + T('ui.chord') + '</th></tr></thead><tbody>' +
        SCALES.filter((x) => x.g === s.g).map((x) => '<tr class="click" data-a="s:' + x.id + '"><td><b>' + scName(x.id) + '</b></td><td>' + x.f.map(degLabel).join(' ') + '</td><td>' + x.f.map((d) => nm(simp(up(r, d)))).join(' ') + '</td><td>' + (x.chord ? nm(r) + x.chord : '') + '</td></tr>').join('') + '</tbody></table></div>';
    },
    on(s, a) { if (a.startsWith('s:')) { const sc = scaleById(a.slice(2)), r = rootN(s.root); snd.seq(sc.f.map((d) => scaleMidi(r, d, 60)).concat([midiOf(r, '1', 72)]), 0.2, 0.4); } },
  };
  // Словарь терминов: каждый — ссылка (index.js открывает определение и главу)
  LABS.gloss = {
    st: { q: '' },
    render(s) {
      const q = s.q.trim().toLowerCase(), list = Object.entries(L.TERMS).filter(([, [a, b]]) => !q || (a + ' ' + b).toLowerCase().includes(q)).sort((a, b) => a[1][0].localeCompare(b[1][0]));
      return '<div class="bkctl"><input data-in="q" data-live="1" placeholder="' + T('ui.search') + '" value="' + esc(s.q) + '" aria-label="' + T('ui.search') + '"></div><dl class="gloss">' +
        list.map(([id, [a, b]]) => '<dt><a class="bterm" data-term="' + id + '" role="button" tabindex="0">' + a + '</a></dt><dd>' + b + '</dd>').join('') + '</dl>';
    },
    on() {},
  };

  return LABS;
}
