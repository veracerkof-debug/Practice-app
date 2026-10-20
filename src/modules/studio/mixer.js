// Микшер студии — по форме n-Track: полоски дорожек в ряд (прокрутка), у каждой — уровень (пик, пока микшер
// открыт), фейдер громкости, панорама, выкл и соло, эффекты; справа — мастер (открывает микшер приложения).
// Без зависимости от модуля: получает проект и обратные вызовы.
const FX_ICON = '<svg viewBox="0 0 24 24"><path d="M4 12h3M11 12h9M4 6h9M17 6h3M4 18h5M13 18h7"/><circle cx="9" cy="12" r="2"/><circle cx="15" cy="6" r="2"/><circle cx="11" cy="18" r="2"/></svg>';
const MASTER_ICON = '<svg viewBox="0 0 24 24"><path d="M6 4v16M12 4v16M18 4v16"/><circle cx="6" cy="14" r="2.5" style="fill:currentColor"/><circle cx="12" cy="8" r="2.5" style="fill:currentColor"/><circle cx="18" cy="16" r="2.5" style="fill:currentColor"/></svg>';
const VOL_MAX = 1.5;

// ctx — { t, ui }, p — проект, names(tr) → имя
export function mixerHTML(ctx, p, names) {
  const { t, ui } = ctx, solo = p.tracks.some((x) => x.solo);
  const strip = (tr) => {
    const dim = tr.mute || (solo && !tr.solo), pct = Math.round(tr.vol * 100);
    return '<div class="smf' + (dim ? ' dim' : '') + '" data-tr="' + tr.id + '" style="--c:' + tr.color + '">' +
      '<button class="smn" data-mx="sound" aria-label="' + ui.esc(names(tr)) + '"><b>' + ui.esc(names(tr)) + '</b></button>' +
      '<button class="smx' + (tr.fx && Object.keys(tr.fx).length ? ' on' : '') + '" data-mx="fx" aria-label="' + ui.esc(t('tr.fx')) + '">' + FX_ICON + '</button>' +
      '<span class="smv num">' + pct + '</span>' +
      '<div class="smt" role="slider" aria-label="' + ui.esc(t('vol')) + '" aria-valuemin="0" aria-valuemax="' + VOL_MAX * 100 + '" aria-valuenow="' + pct + '" tabindex="0" data-fader>' +
      '<u class="smm"></u><b style="height:' + (tr.vol / VOL_MAX) * 100 + '%"></b><i style="bottom:' + (tr.vol / VOL_MAX) * 100 + '%"></i><em style="bottom:' + (1 / VOL_MAX) * 100 + '%"></em></div>' +
      '<div class="smp" role="slider" aria-label="' + ui.esc(t('mix.pan')) + '" aria-valuemin="-100" aria-valuemax="100" aria-valuenow="' + Math.round(tr.pan * 100) + '" tabindex="0" data-pan><i style="left:' + ((tr.pan + 1) / 2) * 100 + '%"></i><em></em></div>' +
      '<div class="smb"><button class="smi' + (tr.mute ? ' on' : '') + '" data-mx="mute" aria-pressed="' + !!tr.mute + '" aria-label="' + ui.esc(t('mute')) + '">M</button>' +
      '<button class="smi s' + (tr.solo ? ' on' : '') + '" data-mx="solo" aria-pressed="' + !!tr.solo + '" aria-label="' + ui.esc(t('solo')) + '">S</button></div></div>';
  };
  return '<div class="smix"><div class="smrow">' + p.tracks.map(strip).join('') +
    '<div class="smf master" style="--c:var(--ink)"><button class="smn" data-mx="master" aria-label="' + ui.esc(t('mix.master')) + '"><b>' + ui.esc(t('mix.master')) + '</b></button>' +
    '<button class="smx big" data-mx="master" aria-label="' + ui.esc(t('mixer'))+ '">' + MASTER_ICON + '</button><p class="ftr">' + ui.esc(t('mix.masterHint')) + '</p></div></div></div>';
}

// Жесты и уровни. on: { vol(tr, v), pan(tr, v), mute(tr), solo(tr), fx(tr), sound(tr), master(), save() }
export function mixerBind(host, p, seq, on) {
  const trOf = (el) => { const f = el.closest('.smf'); return f && p.tracks.find((x) => x.id === f.dataset.tr); };
  let drag = null, raf = 0;
  const fromY = (d, y) => { const r = d.el.getBoundingClientRect(); return Math.max(0, Math.min(VOL_MAX, (1 - (y - r.top) / r.height) * VOL_MAX)); };
  const fromX = (d, x) => { const r = d.el.getBoundingClientRect(); let v = Math.max(-1, Math.min(1, ((x - r.left) / r.width) * 2 - 1)); if (Math.abs(v) < 0.06) v = 0; return v; };
  const showVol = (f, v) => { f.querySelector('.smv').textContent = Math.round(v * 100); f.querySelector('.smt b').style.height = (v / VOL_MAX) * 100 + '%'; f.querySelector('.smt i').style.bottom = (v / VOL_MAX) * 100 + '%'; f.querySelector('.smt').setAttribute('aria-valuenow', Math.round(v * 100)); };
  const showPan = (f, v) => { f.querySelector('.smp i').style.left = ((v + 1) / 2) * 100 + '%'; f.querySelector('.smp').setAttribute('aria-valuenow', Math.round(v * 100)); };
  host.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('[data-fader],[data-pan]'), tr = el && trOf(el);
    if (!el || !tr || !e.isPrimary) return;
    drag = { id: e.pointerId, el, tr, f: el.closest('.smf'), pan: el.hasAttribute('data-pan') };
    try { host.setPointerCapture(e.pointerId); } catch { /* */ }
    move(e); e.preventDefault();
  });
  const move = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (drag.pan) { const v = fromX(drag, e.clientX); on.pan(drag.tr, v); showPan(drag.f, v); } else { const v = fromY(drag, e.clientY); on.vol(drag.tr, v); showVol(drag.f, v); }
  };
  const up = (e) => { if (!drag || e.pointerId !== drag.id) return; drag = null; on.save(); };
  host.addEventListener('pointermove', move); host.addEventListener('pointerup', up); host.addEventListener('pointercancel', up);
  host.addEventListener('dblclick', (e) => { const el = e.target.closest('[data-pan]'), tr = el && trOf(el); if (tr) { on.pan(tr, 0); showPan(el.closest('.smf'), 0); on.save(); } });
  host.addEventListener('keydown', (e) => { // с клавиатуры: стрелки
    const el = e.target.closest('[data-fader],[data-pan]'), tr = el && trOf(el);
    if (!tr) return;
    const d = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    if (el.hasAttribute('data-pan')) { const v = Math.max(-1, Math.min(1, tr.pan + d * 0.1)); on.pan(tr, v); showPan(el.closest('.smf'), v); } else { const v = Math.max(0, Math.min(VOL_MAX, tr.vol + d * 0.05)); on.vol(tr, v); showVol(el.closest('.smf'), v); }
    on.save();
  });
  host.addEventListener('click', (e) => {
    const b = e.target.closest('[data-mx]'); if (!b) return;
    const k = b.dataset.mx, tr = trOf(b);
    if (k === 'master') on.master(); else if (tr && on[k]) on[k](tr);
  });
  // уровни: анализаторы включены, пока микшер открыт
  seq.meters(true);
  const tick = () => {
    host.querySelectorAll('.smf[data-tr]').forEach((f) => { const u = f.querySelector('.smm'); if (u) u.style.height = Math.round(Math.min(1, seq.level(f.dataset.tr) * 1.2) * 100) + '%'; });
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => { cancelAnimationFrame(raf); seq.meters(false); };
}
