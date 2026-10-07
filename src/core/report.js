// Отчёт о проблеме: что написал человек + сведения об устройстве + технический журнал (src/core/log.js).
// Собирается и отправляется только по нажатию: системное меню «Поделиться» — человек сам выбирает Telegram,
// почту или другое приложение и получателя. Без названий песен и файлов, текстов, имени и скрытых настроек.
import { Capacitor, registerPlugin } from '@capacitor/core';
import { logText, entries, stamp } from './log.js';

// Почта разработчика — подставляется получателем, если для отправки выбрана почта
export const REPORT_EMAIL = '4hun4hunkim@gmail.com';
export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';

const Report = Capacitor.isNativePlatform() ? registerPlugin('Report') : null;

const mb = (n) => (n / 1048576).toFixed(1) + ' МБ';

// Сведения об устройстве и приложении — только технические, без личного
export async function deviceInfo(app) {
  const n = navigator, s = app.store.state.settings, out = [];
  out.push('Melete ' + APP_VERSION + (Capacitor.isNativePlatform() ? ' (Android)' : ' (веб)'));
  out.push('Система: ' + n.userAgent);
  out.push('Экран: ' + screen.width + '×' + screen.height + ' @' + (window.devicePixelRatio || 1) + ', окно ' + innerWidth + '×' + innerHeight);
  out.push('Память: ' + (n.deviceMemory ? n.deviceMemory + ' ГБ' : '?') + ', ядер: ' + (n.hardwareConcurrency || '?'));
  try { const e = await n.storage.estimate(); out.push('Хранилище: занято ' + mb(e.usage || 0) + ' из ' + mb(e.quota || 0)); } catch { /* нет оценки */ }
  // настройки — только безобидные (скрытое оформление и его язык не упоминаются)
  out.push('Язык: ' + (['ru', 'uz', 'en'].includes(s.lang) ? s.lang : 'системный') + ', тема: ' + (s.theme || 'system'));
  const off = Object.keys(s.off || {}).filter((k) => s.off[k]);
  if (off.length) out.push('Выключено: ' + off.join(', '));
  out.push('Записей о занятиях: ' + app.store.allSessions().length + ', песен: ' + app.store.songs().length);
  if (app.files && !app.files.noDb) {
    const by = (kind) => app.files.list(kind);
    const sum = (a) => a.reduce((x, r) => x + (r.size || 0), 0);
    const tabs = by('tab'), au = by('audio'), pdf = tabs.filter((r) => r.fmt === 'pdf' || r.type === 'application/pdf');
    out.push('Файлы: медиа ' + au.length + ' (' + mb(sum(au)) + '), ноты и табы ' + tabs.length + ' (' + mb(sum(tabs)) + '), из них PDF ' + pdf.length +
      (pdf.length ? ' — размеры: ' + pdf.map((r) => mb(r.size || 0)).join(', ') : ''));
  } else if (app.files && app.files.noDb) out.push('Файлы: хранилище недоступно');
  return out;
}

// Текст отчёта целиком (его и видит человек перед отправкой)
export async function reportText(app, what = '', withLog = true) {
  const now = new Date(), log = entries();
  const head = ['Отчёт о проблеме — Melete', now.toLocaleString('ru-RU'), ''];
  const body = [what.trim() ? 'Что случилось:\n' + what.trim() : 'Что случилось: (не описано)', '', '— Устройство —', ...(await deviceInfo(app)), ''];
  const tail = withLog ? ['— Журнал (' + (log.length ? stamp(log[0][0]) + '–' + stamp(log.at(-1)[0]) : 'пусто') + ', записей: ' + log.length + ') —', logText(log)] : ['— Журнал не приложен —'];
  return [...head, ...body, ...tail].join('\n');
}

const fileName = () => {
  const d = new Date(), p = (n) => String(n).padStart(2, '0');
  return 'melete-report-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + '.txt';
};

// Отправить: Android — файл и системный выбор приложения; веб — «Поделиться» браузера или сохранение файла.
// 'shared' | 'saved' | 'cancel'
export async function sendReport(text, { title, caption }) {
  const name = fileName();
  if (Report) {
    await Report.file({ name, text, title, body: caption, email: REPORT_EMAIL });
    return 'shared';
  }
  const file = new File([text], name, { type: 'text/plain' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title, text: caption }); return 'shared'; } catch (e) { if (e && e.name === 'AbortError') return 'cancel'; }
  }
  const url = URL.createObjectURL(file), a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'saved';
}
