// Вкладки настроек глайдера и терменвокса: значок и короткое название, закреплены под заголовком шторки.
// Каждая вкладка — одна тема (звук, ноты, эффекты, вид…), внутри — только то, что относится к ней.
export const TAB_IC = {
  sound: '<path d="M4 10v4h4l5 4V6L8 10z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>',
  notes: '<path d="M4 18h16M4 14h16M4 10h16M4 6h16"/><circle cx="9" cy="12" r="1.6" fill="currentColor"/><circle cx="15" cy="8" r="1.6" fill="currentColor"/>',
  fx: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  look: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18"/>',
  hands: '<path d="M8 20v-8.5a1.5 1.5 0 0 1 3 0V10a1.5 1.5 0 0 1 3 0v1a1.5 1.5 0 0 1 3 0v4a5 5 0 0 1-5 5z"/>',
  solo: '<path d="M3 15c3 0 4-7 9-7s6 4 9 4"/>',
  chord: '<rect x="5" y="4" width="14" height="16" rx="2"/><path d="M5 9h14M5 14h14M10 4v16M14 4v16"/>',
  guitar: '<path d="M14 10l6-6M18 4l2 2"/><path d="M13.5 10.5a4 4 0 0 0-5.5.5l-3 3a3.5 3.5 0 0 0 5 5l3-3a4 4 0 0 0 .5-5.5z"/><circle cx="9.5" cy="14.5" r="1.2"/>',
  screen: '<rect x="3" y="6" width="18" height="13" rx="3"/><circle cx="12" cy="12.5" r="3.5"/><path d="M8 6l1.5-2h5L16 6"/>',
};

// list — [[id, название, значок]]; cur — открытая вкладка
export function tabsHTML(ui, list, cur, label) {
  return '<div class="gltabs" role="tablist" aria-label="' + ui.esc(label) + '">' + list.map(([id, name, ic]) => '<button class="gltab" role="tab" data-tab="' + id + '" aria-selected="' + (id === cur) + '">' +
    '<svg viewBox="0 0 24 24" aria-hidden="true">' + TAB_IC[ic || id] + '</svg><span>' + ui.esc(name) + '</span></button>').join('') + '</div>';
}

// Ряд кнопок-выборов (звуки, тоника…)
export const chipHTML = (attr, on, label) => '<button class="lchip pick glck' + (on ? ' on' : '') + '" ' + attr + ' aria-pressed="' + on + '" style="--c:var(--tint);--t:var(--on-tint)">' + label + '</button>';
