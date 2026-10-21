// Мелета — маскот: лицо из линий в круге. Брови — буква Μ из логотипа, нос — камертон; настроение меняют нотные
// знаки и греческие буквы (эскизы — docs/mascot/sketches.html). Цвет — currentColor, круг — цвета карточки: подходит
// ко всем темам; в «Минимале» — без круга. Касание — короткая реакция (poke): другое лицо и звенящий камертон.

const S = (d) => '<path class="ms" d="' + d + '"/>';
const T = (d) => '<path class="mt" d="' + d + '"/>';
const K = (d) => '<path class="mt mk" d="' + d + '"/>'; // камертон
const dot = (x, y, r = 3.2) => '<circle class="md" cx="' + x + '" cy="' + y + '" r="' + r + '"/>';
const G = (x, y, size, ch, extra = '') => '<text class="mg" x="' + x + '" y="' + y + '" font-size="' + size + '"' + extra + '>' + ch + '</text>';

const FORK = 'M47 45 v10.5 q0 3 3 3 q3 0 3 -3 v-10.5 M50 58.5 v6';
const FORK_LOW = 'M47.5 57 v6 q0 2.5 2.5 2.5 q2.5 0 2.5 -2.5 v-6 M50 65.5 v5';
const P = {
  brM: S('M27 41 q11 -13 22 0 q11 -13 22 0'),
  brMhi: S('M27 36 q11 -15 22 -2 q11 -15 22 -2'),
  brAngry: S('M28 37 l18 7') + S('M72 37 l-18 7'),
  brSad: S('M30 42 l15 -6') + S('M70 42 l-15 -6'),
  brFlat: S('M30 39 h15') + S('M55 39 h15'),
  eyes: '<g class="mblink">' + dot(38, 47) + dot(60, 47) + '</g>',
  eyesSide: '<g class="mblink">' + dot(42, 47) + dot(64, 47) + '</g>',
  eyesHappy: S('M33 49 q5 -6 10 0') + S('M55 49 q5 -6 10 0'),
  eyesShut: S('M33 47 q5 5 10 0') + S('M55 47 q5 5 10 0'),
  eyesWhole: '<ellipse class="ms" cx="38" cy="47" rx="5" ry="3.6" transform="rotate(-20 38 47)"/><ellipse class="ms" cx="60" cy="47" rx="5" ry="3.6" transform="rotate(-20 60 47)"/>',
  wink: dot(38, 47) + S('M55 47 q5 4 10 0'),
  sharps: '<g class="mblink">' + T('M33 43 v10 M37 42 v10 M31 46 l8 -2.2 M31 50 l8 -2.2') + T('M57 43 v10 M61 42 v10 M55 46 l8 -2.2 M55 50 l8 -2.2') + '</g>',
  rests: S('M28 41 h44') + '<rect class="md" x="33" y="41" width="10" height="5" rx="1"/><rect class="md" x="55" y="41" width="10" height="5" rx="1"/>',
  // очки — две восьмые с ребром (♫)
  shades: S('M28 36 q7 -4 14 -1') + '<ellipse class="md" cx="38" cy="51" rx="9.5" ry="6.8" transform="rotate(-15 38 51)"/><ellipse class="md" cx="62" cy="51" rx="9.5" ry="6.8" transform="rotate(-15 62 51)"/>' +
    S('M46.8 48 V39 M70.8 48 V39') + '<path class="md" d="M45.2 36 L72.4 36 L72.4 41 L45.2 41 Z"/>',
  // нос — камертон: ветви и ножка
  // ветви длинные и узкие, ножка короткая; рот — заметно ниже, чтобы нос и рот не сливались в «мордочку»
  nose: '<g class="mfork">' + K(FORK) + '</g>',
  noseLow: '<g class="mfork">' + K(FORK_LOW) + '</g>',
  noseBob: '<g class="mbob"><g class="mfork">' + K(FORK) + '</g></g>',
  mCalm: S('M42 77 q8 3.5 16 0'),
  mGrin: S('M40 75 q10 8 20 0'),
  mSmile: S('M37 74 q13 12 26 0'),
  mDown: S('M41 80 q9 -6 18 0'),
  mFlat: S('M43 78 h14'),
  mO: '<ellipse class="ms" cx="50" cy="78" rx="4" ry="5"/>',
  mSmirk: S('M42 78 q10 3 17 -4'),
  mCoolSmirk: S('M42 79 q10 3 17 -4'),
  zz: '<g class="mzz">' + G(70, 30, 15, 'ζ') + G(79, 22, 10, 'ζ') + '</g>',
  note: '<g class="mbob mfast">' + dot(70, 73) + T('M73 73 v-14 q5 2 6 7') + '</g>',
  delta: G(66, 30, 18, 'Δ'),
};

// Настроения: что показывает Мелета
export const MOODS = {
  calm: ['brM', 'eyes', 'nose', 'mCalm'], // спокойна — по умолчанию
  glad: ['brMhi', 'eyes', 'nose', 'mGrin'], // рада — сегодня уже занимались
  happy: ['brMhi', 'eyesHappy', 'nose', 'mSmile'], // довольна — цель недели выполнена
  cool: ['shades', 'noseLow', 'mCoolSmirk'], // крутая — цель недели перевыполнена
  delight: ['brMhi', 'sharps', 'nose', 'mSmile'], // в восторге — новое звание, рекорд
  surprised: ['brMhi', 'eyesWhole', 'nose', 'mO'], // удивлена
  sad: ['brSad', 'eyes', 'nose', 'mDown'], // скучает — давно не занимались
  upset: ['brAngry', 'eyes', 'nose', 'mDown'], // дуется — настойчивая Мелета вечером без занятий
  wait: ['brM', 'eyesSide', 'nose', 'mSmirk'], // ждёт — день практики, а занятия ещё не было
  sleep: ['brM', 'eyesShut', 'nose', 'mCalm', 'zz'], // спит — ночь
  rest: ['rests', 'nose', 'mCalm'], // перерыв помодоро — глаза-паузы
  focus: ['brFlat', 'eyes', 'noseBob', 'mFlat'], // занятие идёт: нос качается
  sing: ['brMhi', 'eyes', 'nose', 'mO', 'note'], // поёт
  wink: ['brM', 'wink', 'nose', 'mSmirk'], // подмигивает
  grow: ['brM', 'eyes', 'nose', 'mCalm', 'delta'], // рост к прошлой неделе
  // кадры моргания для уведомления (build/notifyicons.mjs, KeepAliveService): те же лица с закрытыми глазами
  calmB: ['brM', 'eyesShut', 'nose', 'mCalm'], singB: ['brMhi', 'eyesShut', 'nose', 'mO', 'note'], waitB: ['brM', 'eyesShut', 'nose', 'mSmirk'], focusB: ['brFlat', 'eyesShut', 'noseBob', 'mFlat'],
};

// Вариант маскота (settings.mascot): 'f' — Мелета: бантик-завиток (как флажок восьмой) и ресницы;
// 'm' — Мелетий: прежнее лицо (нос-камертон), без украшений; у Мелеты нос — нотка
let GENDER = 'f';
export const setMascotLook = (g) => { GENDER = g === 'm' ? 'm' : 'f'; };
// Ресницы — у внешних уголков открытых глаз (смещение глаз по настроению)
const LASH = { eyes: [38, 60], eyesSide: [42, 64], eyesWhole: [38, 60], wink: [38, null] };
const lashes = (keys) => {
  const k = keys.find((x) => LASH[x]);
  if (!k) return '';
  const [l, r] = LASH[k];
  return T('M' + (l - 4.5) + ' 44.5 l-3 -2.4 M' + (l - 2.5) + ' 43 l-1.6 -3') + (r != null ? T('M' + (r + 4.5) + ' 44.5 l3 -2.4 M' + (r + 2.5) + ' 43 l1.6 -3') : '');
};
// бантик сидит на макушке справа и наклонён вдоль линии головы
const BOW = '<g class="mbow" transform="translate(73 17) rotate(35)"><path class="md mbw" d="M0 0 L-8.5 -5 Q-10.5 0 -8.5 5 Z"/><path class="md mbw" d="M0 0 L8.5 -5 Q10.5 0 8.5 5 Z"/><circle class="md" cx="0" cy="0" r="2.5"/></g>';
// Нос Мелеты — нотка: головка наклонным овалом и штиль вверх, без флажка (вместо камертона)
const NOTE = (dy = 0) => '<g class="mfork mnote"><ellipse class="md" cx="48" cy="' + (60 + dy) + '" rx="4.2" ry="3" transform="rotate(-22 48 ' + (60 + dy) + ')"/>' +
  T('M51.6 ' + (59 + dy) + ' V' + (46 + dy)) + '</g>';
const NOSE_F = { nose: NOTE(0), noseLow: NOTE(6), noseBob: '<g class="mbob">' + NOTE(0) + '</g>',
  // у Мелеты справа наверху бантик: «ζζ» сна и «Δ» роста — слева
  zz: '<g class="mzz">' + G(22, 30, 15, 'ζ') + G(13, 22, 10, 'ζ') + '</g>', delta: G(20, 30, 18, 'Δ') };

// ring: false — без круга («Минимал»); cls — доп. класс (mpoke — реакция на касание); gender — вариант (по умолчанию — выбранный)
export function mascotSVG(mood = 'calm', { size = 56, label = '', ring = true, cls = '', gender = GENDER } = {}) {
  const keys = MOODS[mood] || MOODS.calm;
  const parts = keys.map((k) => (gender !== 'm' && NOSE_F[k]) || P[k]).join('') + (gender === 'm' ? '' : BOW + lashes(keys));
  return '<svg class="mascot' + (cls ? ' ' + cls : '') + '" viewBox="0 0 100 100" width="' + size + '" height="' + size + '" data-mood="' + mood + '"' + (label ? ' role="img" aria-label="' + label.replace(/"/g, '&quot;') + '"' : ' aria-hidden="true"') +
    ' data-g="' + gender + '">' + (ring ? '<circle class="mf" cx="50" cy="50" r="46"/>' : '') + parts + '</svg>';
}

// Реакции на касание: для каждого лица — своя (и запасные), цитата при этом не меняется
const POKE = { calm: ['wink', 'surprised', 'sing'], glad: ['delight', 'sing'], happy: ['delight', 'cool'], cool: ['delight', 'wink'], delight: ['happy'],
  surprised: ['glad'], sad: ['surprised', 'glad'], wait: ['surprised', 'wink'], sleep: ['surprised'], upset: ['sad', 'surprised'], rest: ['wink', 'glad'], focus: ['sing', 'surprised'],
  sing: ['delight'], wink: ['glad'], grow: ['delight'] };
let pokeT = 0;
// Любая кнопка с data-mascot (главная, конец занятия) — касание вызывает реакцию
if (typeof document !== 'undefined' && document.addEventListener) document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('[data-mascot]'); if (b) pokeMascot(b); });
// Касание по кнопке с маскотом: другое лицо на 1,3 с, подпрыгивание и звон камертона, потом — прежнее лицо
export function pokeMascot(btn) {
  const svg = btn && btn.querySelector('svg.mascot');
  if (!svg) return;
  const base = btn.dataset.mood || svg.dataset.mood || 'calm', size = +svg.getAttribute('width') || 56, ring = !!svg.querySelector('.mf'), gender = svg.dataset.g || GENDER;
  btn.dataset.mood = base;
  const list = POKE[base] || POKE.calm, next = list[Math.floor(Math.random() * list.length)];
  btn.innerHTML = mascotSVG(next, { size, ring, cls: 'mpoke', gender });
  clearTimeout(pokeT);
  pokeT = setTimeout(() => { if (btn.isConnected) { btn.innerHTML = mascotSVG(base, { size, ring, gender }); delete btn.dataset.mood; } }, 1300);
}
