// Время и календарь. Неделя начинается с понедельника, всё по местному времени устройства.
export const DAY = 86400000;

export const pad2 = (n) => String(n).padStart(2, '0');

// Ключ дня 'YYYY-MM-DD' по местному времени
export const dayKey = (ts) => {
  const d = new Date(ts);
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
};

export function dayStart(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function weekStart(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

export function monthStart(ts) {
  const d = new Date(ts);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// День недели: 0 — понедельник … 6 — воскресенье
export const weekday = (ts) => (new Date(ts).getDay() + 6) % 7;

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
