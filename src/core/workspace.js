// Рабочее пространство сессии: раскладка окон и что в каком окне. Логика без DOM.
// Раскладка: 'F' — весь экран, иначе две буквы — верхняя и нижняя половины: H — половина, Q — две четверти,
// S — две полосы. В окне — группа (rhythm: метроном и тюнер, keys: пианино и пэды) или модуль.
// Хранится на устройстве: tools.wsMap[ключ сессии] — { layout, panes, focus, sub, ratio, rt, rb }.
// Перенесено из legacy/practice.html (LMAP, lsizes, lpos, WS, wsFix, halves, setLayout, closePane, addPane, dropTool, sizeOf).

export const LMAP = { L1: 'F', L2: 'HH', L12: 'HQ', L21: 'QH', L4: 'QQ' };
export const DEFAULT_PANES = ['rhythm', 'keys', 'theory', 'audio', 'notes'];
// Окна старых версий прототипа
const LEGACY = { metro: 'rhythm', tuner: 'rhythm', piano: 'keys', drone: 'keys', circle: 'theory', scales: 'theory' };
const clone = (o) => JSON.parse(JSON.stringify(o));

export function lsizes(l) {
  if (LMAP[l]) l = LMAP[l];
  if (l === 'F') return ['full'];
  const m = { H: ['half'], Q: ['quarter', 'quarter'], S: ['strip', 'strip'] };
  return m[l[0]].concat(m[l[1]]);
}

// Положение окон в сетке 4×2 (для схем в шторке «Расположение»)
export function lpos(l) {
  if (LMAP[l]) l = LMAP[l];
  if (l === 'F') return ['1/1/5/3'];
  const p = [];
  [[0, l[0]], [2, l[1]]].forEach(([r, k]) => {
    if (k === 'H') p.push(r + 1 + '/1/' + (r + 3) + '/3');
    else if (k === 'Q') { p.push(r + 1 + '/1/' + (r + 3) + '/2'); p.push(r + 1 + '/2/' + (r + 3) + '/3'); }
    else { p.push(r + 1 + '/1/' + (r + 2) + '/3'); p.push(r + 2 + '/1/' + (r + 3) + '/3'); }
  });
  return p;
}

export const wsKey = (a) => (!a ? 'free' : a.type === 'song' ? 'song:' + a.songId : a.type === 'tool' ? 'tool:' + a.tool : 'free');

// Раскладка для сессии a; новая берётся из свободной практики
export function getWS(device, a) {
  device.wsMap ??= {};
  const k = wsKey(a);
  let w = device.wsMap[k];
  if (!w) {
    if (k.startsWith('tool:')) w = { layout: 'F', panes: [a.tool], focus: 0 };
    else {
      const base = device.wsMap.free || device.ws;
      w = base ? clone(base) : { layout: 'F', panes: DEFAULT_PANES.slice(), focus: 0 };
    }
    device.wsMap[k] = w;
  }
  if (LMAP[w.layout]) w.layout = LMAP[w.layout];
  if (!w.sub) w.sub = { rhythm: 'metro', keys: 'piano' };
  if (!w.ratio) w.ratio = 0.5;
  return w;
}

// Окна — только включённые инструменты (all), без повторов; не хватает — добавить
export function fixWS(w, all, a) {
  if (a && a.type === 'tool') { w.layout = 'F'; w.panes = [a.tool]; w.focus = 0; return w; }
  w.panes = w.panes.map((x) => LEGACY[x] || x).filter((x, i, arr) => all.includes(x) && arr.indexOf(x) === i);
  all.forEach((x) => { if (!w.panes.includes(x)) w.panes.push(x); });
  const n = lsizes(w.layout).length;
  while (w.panes.length < n) w.panes.push(all[0]);
  if (w.focus >= n) w.focus = 0;
  return w;
}

export const visible = (w) => w.panes.slice(0, lsizes(w.layout).length);

export function halves(w) {
  if (w.layout === 'F') return null;
  const tc = w.layout[0] === 'H' ? 1 : 2, bc = w.layout[1] === 'H' ? 1 : 2;
  return { t: w.layout[0], b: w.layout[1], tc, top: w.panes.slice(0, tc), bot: w.panes.slice(tc, tc + bc), rest: w.panes.slice(tc + bc) };
}

export function setLayout(w, layout, vis) {
  const rest = w.panes.filter((x) => !vis.includes(x));
  w.layout = layout;
  w.panes = vis.concat(rest);
  if (w.focus >= vis.length) w.focus = 0;
}

// Закрыть окно i: соседнее занимает место
export function closePane(w, i) {
  const H = halves(w);
  if (!H) return;
  const isTop = i < H.tc, arr = isTop ? H.top : H.bot, other = isTop ? H.bot : H.top;
  if (arr.length === 2) {
    const keep = arr.filter((_, k) => k !== (isTop ? i : i - H.tc));
    if (isTop) setLayout(w, 'H' + H.b, keep.concat(H.bot));
    else setLayout(w, H.t + 'H', H.top.concat(keep));
  } else if (other.length === 1) setLayout(w, 'F', other);
  else setLayout(w, 'HH', other);
}

export function swapHalves(w) {
  const H = halves(w);
  if (H) setLayout(w, H.b + H.t, H.bot.concat(H.top));
}

// Поставить инструмент в окно в фокусе (если он уже на экране — окна меняются местами)
export function assign(w, id) {
  const i = w.focus, old = w.panes[i];
  if (old === id) return -1;
  const j = w.panes.indexOf(id);
  if (j >= 0) w.panes[j] = old;
  w.panes[i] = id;
  return i;
}

export function swapPanes(w, a, b) {
  [w.panes[a], w.panes[b]] = [w.panes[b], w.panes[a]];
}

// Бросить инструмент id на окно i в зону zone ('center' | 'top' | 'bottom' | 'left' | 'right').
// Возвращает индекс нового окна (для анимации) или -1
export function dropTool(w, id, i, zone) {
  const sz = lsizes(w.layout), vis = w.panes.slice(0, sz.length);
  if (vis.includes(id)) {
    const j = vis.indexOf(id);
    if (j === i) return -1;
    swapPanes(w, i, j);
    return i;
  }
  if (zone === 'center' || sz[i] === 'quarter' || sz[i] === 'strip') { w.focus = i; return assign(w, id); }
  const first = zone === 'top' || zone === 'left';
  if (sz[i] === 'full') { const old = vis[0]; setLayout(w, 'HH', first ? [id, old] : [old, id]); return first ? 0 : 1; }
  const H = halves(w), isTop = i < H.tc, old = (isTop ? H.top : H.bot)[0], arr = first ? [id, old] : [old, id], ch = zone === 'left' || zone === 'right' ? 'Q' : 'S';
  if (isTop) { setLayout(w, ch + H.b, arr.concat(H.bot)); return first ? 0 : 1; }
  setLayout(w, H.t + ch, H.top.concat(arr));
  return H.tc + (first ? 0 : 1);
}

// Добавить окно снизу или справа от окна i — с первым инструментом, которого нет на экране.
// Возвращает индекс нового окна; null — все инструменты уже на экране
export function addPane(w, i, mode) {
  const vis = visible(w), nt = w.panes.find((x) => !vis.includes(x));
  if (!nt) return null;
  return dropTool(w, nt, i, mode);
}

// Размер окна по его пикселям (W×H — всё рабочее пространство)
export function sizeOf(layout, w, h, W, H) {
  if (!W || !w || !h) return null;
  if (layout === 'F') return 'full';
  if (h < 175) return 'strip';
  if (w >= W * 0.9 && h >= H * 0.66) return 'full';
  if (w < W * 0.66) return h >= H * 0.66 ? 'half' : 'quarter';
  return 'half';
}

// Перетаскивание границы: долю за пределами 10–90 % — закрыть половину; иначе 14–86 %
export const clampFrac = (f) => Math.max(0.14, Math.min(0.86, f));
