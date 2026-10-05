// Тайм-коды (метки в треке) и вид файла — без DOM.
// Метки хранятся в записи файла: marks = [{ t: секунды, name: '' }, …], по возрастанию времени.

// Видео: определено при загрузке по самому файлу (есть картинка), иначе — по типу или расширению
export const isVideo = (r) => (r.video != null ? !!r.video : /^video\//.test(r.type || ''));
export const VIDEO_EXT = /\.(mp4|m4v|mov|webm|mkv|3gp|ogv)$/i;

// Добавить метку на время t. Если рядом (ближе gap секунд) уже есть метка — новую не ставим.
// Возвращает { marks — новый массив, i — индекс метки, added }
export function addMark(marks = [], t, gap = 0.5) {
  const list = marks.slice();
  const near = list.findIndex((m) => Math.abs(m.t - t) < gap);
  if (near >= 0) return { marks: list, i: near, added: false };
  list.push({ t: Math.max(0, Math.round(t * 10) / 10), name: '' });
  list.sort((a, b) => a.t - b.t);
  return { marks: list, i: list.findIndex((m) => Math.abs(m.t - t) < 0.06), added: true };
}

// Отрезок от метки i до следующей (или до конца трека) — для повтора A–B
export function markSpan(marks, i, dur) {
  const a = marks[i].t, next = marks[i + 1];
  return [a, next ? next.t : dur];
}

// Ближайшая к t метка не дальше tol секунд; -1 — нет
export function nearMark(marks = [], t, tol) {
  let best = -1, bd = tol;
  marks.forEach((m, i) => { const d = Math.abs(m.t - t); if (d <= bd) { bd = d; best = i; } });
  return best;
}

// Метка, внутри отрезка которой сейчас позиция (для подсветки); -1 — до первой
export function currentMark(marks = [], t) {
  let k = -1;
  marks.forEach((m, i) => { if (m.t <= t + 0.05) k = i; });
  return k;
}
