// Звание музыканта — по всему опыту: часы до приложения плюс практика в приложении.
// Пять званий по три уровня. Значок мастерства (камень) считается отдельно — только по практике в приложении.
export const RANKS = ['student', 'amateur', 'musician', 'master', 'virtuoso'];
// Пороги в часах: [звание, уровень (1…3), с какого часа]
export const RANK_STEPS = [
  ['student', 1, 0], ['student', 2, 50], ['student', 3, 150],
  ['amateur', 1, 300], ['amateur', 2, 600], ['amateur', 3, 1000],
  ['musician', 1, 1500], ['musician', 2, 2200], ['musician', 3, 3000],
  ['master', 1, 4000], ['master', 2, 5500], ['master', 3, 7500],
  ['virtuoso', 1, 10000], ['virtuoso', 2, 15000], ['virtuoso', 3, 20000],
];

// hours → { i, id, level, from, next (null на последнем), frac 0…1 до следующего, left — часов до него }
export function rankOf(hours) {
  const h = Math.max(0, hours || 0);
  let i = 0;
  while (i + 1 < RANK_STEPS.length && h >= RANK_STEPS[i + 1][2]) i++;
  const [id, level, from] = RANK_STEPS[i], n = RANK_STEPS[i + 1] || null;
  return { i, id, level, from, next: n && { id: n[0], level: n[1], from: n[2] }, frac: n ? Math.min(1, (h - from) / (n[2] - from)) : 1, left: n ? n[2] - h : 0 };
}

export const ROMAN = ['', 'I', 'II', 'III'];
