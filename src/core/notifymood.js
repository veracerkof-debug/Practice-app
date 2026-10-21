// Лицо маскота в уведомлении — одно, маленьким значком (строка состояния и слева в шторке), по смыслу повода
// (картинки — build/notifyicons.mjs → res/drawable-nodpi/ns_<f|m>_<лицо>.png; большой картинки нет)
const MOOD_OF = { 'lead:60': 'wink', 'lead:5': 'surprised', call: 'sing', soon: 'sing', quote: 'sing', after: 'sad',
  morning: 'wait', lunch: 'wink', afternoon: 'sad', dinner: 'delight', late: 'upset' };
const MOOD_PUSHY = { 'lead:60': 'happy', 'lead:5': 'surprised' };
export const NOTIFY_MOODS = [...new Set(['calm', ...Object.values(MOOD_OF), ...Object.values(MOOD_PUSHY)])];
// Имя значка (smallIcon) или '' — без маскота (тогда нота ic_stat_melete)
export function notifyIcon(slot, mode, g = 'f') {
  if (g === 'none') return '';
  const k = String(slot).startsWith('soon:') ? 'soon' : String(slot).startsWith('lead:') && slot !== 'lead:5' ? 'lead:60' : slot;
  return 'ns_' + (g === 'm' ? 'm' : 'f') + '_' + ((mode === 'pushy' && MOOD_PUSHY[k]) || MOOD_OF[k] || 'calm');
}

