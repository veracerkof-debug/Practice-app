// Мелета — маскот: лицо из линий в круге. Брови — буква Μ из логотипа, нос — камертон; настроение меняют нотные
// знаки и греческие буквы (эскизы — docs/mascot/sketches.html). Цвет — currentColor, круг — цвета карточки: подходит
// ко всем темам; в «Минимале» — без круга. Касание — короткая реакция (poke): другое лицо и звенящий камертон.

const S = (d) => '<path class="ms" d="' + d + '"/>';
const T = (d) => '<path class="mt" d="' + d + '"/>';
const dot = (x, y, r = 3.2) => '<circle class="md" cx="' + x + '" cy="' + y + '" r="' + r + '"/>';
const G = (x, y, size, ch, extra = '') => '<text class="mg" x="' + x + '" y="' + y + '" font-size="' + size + '"' + extra + '>' + ch + '</text>';

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
  nose: '<g class="mfork">' + S('M45 51 v6 q0 5 5 5 q5 0 5 -5 v-6 M50 62 v8') + '</g>',
  noseLow: '<g class="mfork">' + S('M45.5 56 v4.5 q0 4.5 4.5 4.5 q4.5 0 4.5 -4.5 v-4.5 M50 65 v6') + '</g>',
  noseBob: '<g class="mbob"><g class="mfork">' + S('M45 51 v6 q0 5 5 5 q5 0 5 -5 v-6 M50 62 v8') + '</g></g>',
  mCalm: S('M43 74 q7 3 14 0'),
  mOmega: S('M38 71 q6 9 12 0 q6 9 12 0'),
  mSmile: S('M38 70 q12 12 24 0'),
  mDown: S('M41 77 q9 -7 18 0'),
  mFlat: S('M43 75 h14'),
  mO: '<ellipse class="ms" cx="50" cy="75" rx="4.5" ry="5.5"/>',
  mSmirk: S('M42 75 q10 3 17 -4'),
  mCoolSmirk: S('M41 76 q10 3 18 -4'),
  zz: '<g class="mzz">' + G(70, 30, 15, 'ζ') + G(79, 22, 10, 'ζ') + '</g>',
  note: '<g class="mbob mfast">' + dot(70, 73) + T('M73 73 v-14 q5 2 6 7') + '</g>',
  delta: G(66, 30, 18, 'Δ'),
};

// Настроения: что показывает Мелета
export const MOODS = {
  calm: ['brM', 'eyes', 'nose', 'mCalm'], // спокойна — по умолчанию
  glad: ['brMhi', 'eyes', 'nose', 'mOmega'], // рада — сегодня уже занимались
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
};

// ring: false — без круга («Минимал»); cls — доп. класс (mpoke — реакция на касание)
export function mascotSVG(mood = 'calm', { size = 56, label = '', ring = true, cls = '' } = {}) {
  const parts = (MOODS[mood] || MOODS.calm).map((k) => P[k]).join('');
  return '<svg class="mascot' + (cls ? ' ' + cls : '') + '" viewBox="0 0 100 100" width="' + size + '" height="' + size + '" data-mood="' + mood + '"' + (label ? ' role="img" aria-label="' + label.replace(/"/g, '&quot;') + '"' : ' aria-hidden="true"') +
    '>' + (ring ? '<circle class="mf" cx="50" cy="50" r="46"/>' : '') + parts + '</svg>';
}

// Реакции на касание: для каждого лица — своя (и запасные), цитата при этом не меняется
const POKE = { calm: ['wink', 'surprised', 'sing'], glad: ['delight', 'sing'], happy: ['delight', 'cool'], cool: ['delight', 'wink'], delight: ['happy'],
  surprised: ['glad'], sad: ['surprised', 'glad'], wait: ['surprised', 'wink'], sleep: ['surprised'], upset: ['sad', 'surprised'], rest: ['wink', 'glad'], focus: ['sing', 'surprised'],
  sing: ['delight'], wink: ['glad'], grow: ['delight'] };
let pokeT = 0;
// Любая кнопка с data-mascot (главная, конец занятия) — касание вызывает реакцию
if (typeof document !== 'undefined') document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('[data-mascot]'); if (b) pokeMascot(b); });
// Касание по кнопке с маскотом: другое лицо на 1,3 с, подпрыгивание и звон камертона, потом — прежнее лицо
export function pokeMascot(btn) {
  const svg = btn && btn.querySelector('svg.mascot');
  if (!svg) return;
  const base = btn.dataset.mood || svg.dataset.mood || 'calm', size = +svg.getAttribute('width') || 56, ring = !!svg.querySelector('.mf');
  btn.dataset.mood = base;
  const list = POKE[base] || POKE.calm, next = list[Math.floor(Math.random() * list.length)];
  btn.innerHTML = mascotSVG(next, { size, ring, cls: 'mpoke' });
  clearTimeout(pokeT);
  pokeT = setTimeout(() => { if (btn.isConnected) { btn.innerHTML = mascotSVG(base, { size, ring }); delete btn.dataset.mood; } }, 1300);
}
