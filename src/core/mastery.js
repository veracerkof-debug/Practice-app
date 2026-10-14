// Лиги (решение автора): самоцвет, который растёт только от часов практики в приложении. Часы «до приложения»
// (вводятся при регистрации) — воображаемые: ни в лигу, ни в статистику не идут. Званий нет.
// Внутри лиги самоцвет постепенно ярче и чище (frac — путь до следующей).
// Пороги — общее время практики в приложении, ч. Обсидиан — легенда: «правило 10 000 часов».

export const GEMS = [
  { id: 'stone', h: 0 },
  { id: 'quartz', h: 10 },
  { id: 'amethyst', h: 50 },
  { id: 'topaz', h: 150 },
  { id: 'emerald', h: 400 },
  { id: 'sapphire', h: 1000 },
  { id: 'ruby', h: 2500 },
  { id: 'diamond', h: 5000 },
  { id: 'obsidian', h: 10000 }, // легенда — дальше только глубже блеск
];
export const LEAGUES = GEMS;

// hours → { i, gem, next (null в последней), frac 0…1 до следующей, left — часов до неё }
export function gemOf(hours) {
  const h = Math.max(0, hours || 0);
  let i = 0;
  while (i + 1 < GEMS.length && h >= GEMS[i + 1].h) i++;
  const gem = GEMS[i], next = GEMS[i + 1] || null;
  // в последней лиге блеск растёт ещё 10 000 часов
  const span = next ? next.h - gem.h : 10000;
  return { i, gem, next, frac: Math.min(1, (h - gem.h) / span), left: next ? next.h - h : 0 };
}
export const leagueOf = gemOf;
