// Ожидание (открывается книга, включается камера…): небольшая тематическая анимация вместо надписи «Загрузка».
// Без картинок и библиотек — разметка и CSS (loader.css), цвет — акцентный цвет темы.
//   book  — книга, страницы перелистываются (PDF);
//   wave  — синусоида дышит и бежит (терменвокс: его звук — почти чистая синусоида);
//   beat  — три точки в ритме метронома (всё остальное).
// «Уменьшить движение» в системе — анимация замирает, остаётся спокойная картинка.
import './loader.css';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Синусоида: путь на ширину w, высоту h, k периодов
function sine(w, h, k) {
  let d = '';
  for (let x = 0; x <= w; x += 2) d += (x ? 'L' : 'M') + x + ' ' + (h / 2 + Math.sin((x / w) * Math.PI * 2 * k) * (h / 2 - 3)).toFixed(1);
  return d;
}

export function loader(kind = 'beat', label = '') {
  const lab = label ? '<span class="ldlab">' + esc(label) + '</span>' : '';
  const aria = ' role="status" aria-label="' + esc(label || '…') + '"';
  if (kind === 'book') {
    return '<div class="ld ldbook"' + aria + '><div class="lbk" aria-hidden="true"><i class="lbl"></i><i class="lbr"></i>' +
      '<i class="lbp p1"></i><i class="lbp p2"></i><i class="lbp p3"></i></div>' + lab + '</div>';
  }
  if (kind === 'wave') {
    // две волны: основная и тень на октаву выше — как обертон
    return '<div class="ld ldwave"' + aria + '><svg class="lwv" viewBox="0 0 240 60" aria-hidden="true" preserveAspectRatio="none">' +
      '<path class="w2" d="' + sine(480, 60, 6) + '"/><path class="w1" d="' + sine(480, 60, 3) + '"/></svg>' + lab + '</div>';
  }
  return '<div class="ld ldbeat"' + aria + '><span class="lbt" aria-hidden="true"><i></i><i></i><i></i></span>' + lab + '</div>';
}
