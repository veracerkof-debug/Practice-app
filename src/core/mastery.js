// Значок мастерства: камень, который с часами практики становится самоцветом, а у профессионалов — алмазом.
// Внутри ступени камень постепенно ярче и чище (frac — путь до следующей ступени).
// Пороги — общее время практики в часах. Алмаз — только на профессиональных числах: «правило 10 000 часов».

export const GEMS = [
  { id: 'stone', h: 0 },
  { id: 'quartz', h: 10 },
  { id: 'amethyst', h: 50 },
  { id: 'topaz', h: 150 },
  { id: 'emerald', h: 500 },
  { id: 'sapphire', h: 1000 },
  { id: 'ruby', h: 3000 },
  { id: 'rough', h: 10000 },     // алмаз-сырец: профессиональный уровень
  { id: 'diamond', h: 20000 },   // алмаз
  { id: 'brilliant', h: 30000 }, // бриллиант — дальше только сияние
];

// hours → { i, gem, next (null на последней), frac 0…1 до следующей, left — часов до неё }
export function gemOf(hours) {
  const h = Math.max(0, hours || 0);
  let i = 0;
  while (i + 1 < GEMS.length && h >= GEMS[i + 1].h) i++;
  const gem = GEMS[i], next = GEMS[i + 1] || null;
  // на последней ступени сияние растёт ещё 20 000 часов
  const span = next ? next.h - gem.h : 20000;
  return { i, gem, next, frac: Math.min(1, (h - gem.h) / span), left: next ? next.h - h : 0 };
}
