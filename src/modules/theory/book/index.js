// «Теория» → «Учебник»: интерактивная книга по гармонии и джазу. Оглавление (части, главы, поиск термина) и чтение
// главы: текст из языкового файла (lang/*.js), в нём живые схемы ({{lab:id}} → labs.js) и термины-ссылки
// ([[id|слово]] → определение в шторке и переход к главе). Грузится по требованию (модуль «Теория» — import()).
// Состояние: глава — в настройках модуля (th.book), схемы — в памяти до закрытия окна.
import { createLabs } from './labs.js';
import { createSound, setLabels, esc } from './draw.js';
import './book.css';

const LANGS = { ru: () => import('./lang/ru.js'), uz: () => import('./lang/uz.js'), en: () => import('./lang/en.js') };
export const PARTS = [['iv', 'chords', 'scales', 'key'], ['iivi', 'ana', 'voice', 'mod', 'reharm'], ['comp', 'forms', 'arr', 'impro', 'trad'], ['practice', 'ref']];

// Языковой файл (el и прочие — английский)
const cache = {};
export async function loadLang(code) {
  const k = LANGS[code] ? code : 'en';
  if (!cache[k]) cache[k] = (await LANGS[k]()).default;
  return cache[k];
}
export const fill = (s, v) => String(s).replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m));

// Разметка текста главы → HTML: схемы и ссылки-термины
export function chapterHTML(ch, terms) {
  let n = 0;
  return ch.h.replace(/\{\{lab:([a-z0-9]+)\}\}/g, (m, id) => '<div class="blab" data-lab="' + id + '" data-k="' + ch.id + ':' + n++ + '"></div>')
    .replace(/\[\[([a-z0-9]+)\|([^\]]+)\]\]/g, (m, id, txt) => (terms[id] ? '<a class="bterm" data-term="' + id + '" role="button" tabindex="0">' + txt + '</a>' : txt));
}

// ctx — модуль «Теория»; L — языковой файл; th — настройки модуля (th.book)
export function createBook(ctx, L, { save }) {
  const T = (k, v) => fill(L.S[k] ?? k, v);
  setLabels({ kb: T('bk.kb'), staff: T('sc.staff'), fret: T('sc.fret'), circle: T('bk.circle'), signs: T('bk.signs'), play: T('ui.play') });
  const snd = createSound(() => ctx.audio);
  const LABS = createLabs({ T, L, snd });
  const states = new Map();
  const chs = L.CH, byId = (id) => chs.find((c) => c.id === id);
  const num = (id) => chs.findIndex((c) => c.id === id) + 1;
  let q = '', jumpTerm = null, toTop = false;

  function tocHTML() {
    const found = q.trim() ? Object.entries(L.TERMS).filter(([, [a, b]]) => (a + ' ' + b).toLowerCase().includes(q.trim().toLowerCase())).slice(0, 12) : null;
    return '<div class="bhero"><div class="bhicon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 5.5C6.5 4 9.5 4 12 6c2.5-2 5.5-2 8-.5v13c-2.5-1.5-5.5-1.5-8 .5-2.5-2-5.5-2-8-.5z"/><path d="M12 6v13.5"/></svg></div>' +
      '<h2>' + T('bk.title') + '</h2><p>' + T('bk.lead') + '</p>' +
      '<input class="bsearch" data-bq value="' + esc(q) + '" placeholder="' + T('bk.find') + '" aria-label="' + T('bk.find') + '"></div>' +
      (found ? '<div class="bfound">' + (found.length ? found.map(([id, [a, b]]) => '<button class="bfrow" data-term="' + id + '"><b>' + a + '</b><span>' + b + '</span></button>').join('') : '<p class="hint">' + T('bk.none') + '</p>') + '</div>' : '') +
      PARTS.map((ids, p) => '<section class="bpart"><h3><span>' + (p + 1) + '</span>' + T('bk.part' + p) + '</h3><div class="bcards">' +
        ids.map((id) => { const c = byId(id); return c ? '<button class="bcard p' + p + '" data-bch="' + id + '"><i class="num">' + num(id) + '</i><b>' + c.t + '</b><span>' + c.s + '</span></button>' : ''; }).join('') + '</div></section>').join('');
  }
  function readerHTML(id) {
    const c = byId(id), i = num(id), prev = chs[i - 2], next = chs[i];
    return '<div class="bkhbar"><button class="bback" data-btoc aria-label="' + T('bk.toc') + '">‹ ' + T('bk.toc') + '</button><span class="num">' + i + ' ' + T('bk.of', { n: chs.length }) + '</span></div>' +
      '<header class="bkhead"><small>' + T('bk.ch', { n: i }) + '</small><h2>' + c.t + '</h2><p>' + c.s + '</p></header><article class="bktext">' + chapterHTML(c, L.TERMS) + '</article>' +
      '<nav class="bpn">' + (prev ? '<button data-bch="' + prev.id + '">‹ ' + prev.t + '</button>' : '<span></span>') + (next ? '<button data-bch="' + next.id + '">' + next.t + ' ›</button>' : '<span></span>') + '</nav>';
  }
  // Схема: состояние по месту в главе, перерисовка только её
  function drawLab(el, focus) {
    const lab = LABS[el.dataset.lab]; if (!lab) return;
    if (!states.has(el.dataset.k)) states.set(el.dataset.k, JSON.parse(JSON.stringify(lab.st)));
    try { el.innerHTML = lab.render(states.get(el.dataset.k)); } catch (e) { ctx.log('учебник: схема ' + el.dataset.lab + ' — ' + (e && e.message), 'w'); el.innerHTML = ''; }
    if (focus) { const f = el.querySelector('[data-in="' + focus + '"]'); if (f) { f.focus(); try { f.setSelectionRange(f.value.length, f.value.length); } catch { /* select */ } } }
  }
  const coerce = (old, v) => (typeof old === 'number' ? +v : v);

  // Шторка термина: определение и переход к главе
  function termSheet(id) {
    const tm = L.TERMS[id]; if (!tm) return;
    const c = byId(tm[2]);
    ctx.ui.sheet(() => ctx.ui.snav(tm[0]) + '<p class="btdef">' + tm[1] + '</p>' + (c ? '<button class="btn fill" data-go style="width:100%;margin-top:12px">' + T('bk.inBook', { t: c.t }) + '</button>' : ''),
      (el, sh) => el.addEventListener('click', (e) => { if (e.target.closest('[data-go]')) { sh.close(); open(tm[2], id); } }));
  }
  function open(ch, term = null) { const th = ctx.store.all(); th.book = { ch }; jumpTerm = term; toTop = true; snd.stop(); save(); }

  return {
    T,
    html(th) { const b = th.book || {}; return '<div class="swrap bkwrap"><div class="book">' + (b.ch && byId(b.ch) ? readerHTML(b.ch) : tocHTML()) + '</div></div>'; },
    // после вставки в окно: схемы и события
    mount(root) {
      const box = root.querySelector('.book'); if (!box) return;
      box.querySelectorAll('.blab').forEach((el) => drawLab(el));
      if (toTop) { toTop = false; const w = root.querySelector('.bkwrap'); if (w) w.scrollTop = 0; }
      if (jumpTerm) { const t = box.querySelector('[data-term="' + jumpTerm + '"]'); jumpTerm = null; if (t) { t.scrollIntoView({ block: 'center' }); t.classList.add('flash'); } }
      box.addEventListener('click', (e) => {
        const t = e.target;
        const term = t.closest('[data-term]'); if (term) { termSheet(term.dataset.term); return; }
        const ch = t.closest('[data-bch]'); if (ch) { open(ch.dataset.bch); return; }
        if (t.closest('[data-btoc]')) { open(null); return; }
        const el = t.closest('.blab'); if (!el) return;
        const lab = LABS[el.dataset.lab], st = states.get(el.dataset.k);
        const sb = t.closest('.seg button');
        if (sb) { const k = sb.parentElement.dataset.seg; st[k] = coerce(st[k], sb.dataset.v); if (lab.set) lab.set(st, k); drawLab(el); return; }
        const key = t.closest('[data-midi]');
        if (key) { if (ctx.audio.unlock()) ctx.audio.playNote(+key.dataset.midi, { bus: 'theory', dur: 1 }); key.classList.add('hit'); setTimeout(() => key.classList.remove('hit'), 250); return; }
        const ci = t.closest('[data-ci]');
        if (ci) { if (lab.on(st, 'ci:' + ci.dataset.ci + (ci.dataset.min ? ':m' : ''), el) !== false) drawLab(el); return; }
        const a = t.closest('[data-a]');
        if (a && lab.on(st, a.dataset.a, el) !== false) drawLab(el);
      });
      box.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('a.bterm')) { e.preventDefault(); termSheet(e.target.dataset.term); } else if (e.key === 'Enter' && e.target.matches('input[data-in]')) e.target.blur(); });
      box.addEventListener('change', (e) => {
        const el = e.target.closest('.blab'), k = e.target.dataset.sel || e.target.dataset.in; if (!el || !k || e.target.dataset.live) return;
        const lab = LABS[el.dataset.lab], st = states.get(el.dataset.k);
        st[k] = coerce(st[k], e.target.value); if (lab.set) lab.set(st, k); drawLab(el);
      });
      box.addEventListener('input', (e) => {
        if (e.target.matches('[data-bq]')) { q = e.target.value; const f = box.querySelector('.bfound'), html = tocHTML(); const tmp = document.createElement('div'); tmp.innerHTML = html; const nf = tmp.querySelector('.bfound'); if (f) f.replaceWith(nf || document.createElement('i')); else if (nf) box.querySelector('.bhero').after(nf); return; }
        if (!e.target.dataset.live) return;
        const el = e.target.closest('.blab'); states.get(el.dataset.k)[e.target.dataset.in] = e.target.value; drawLab(el, e.target.dataset.in);
      });
    },
    stop: () => snd.stop(),
    open,
    chapterOf: (id) => byId(id),
  };
}
