// Кнопка и жест «Назад» на Android: закрывают то, что открыто сверху, а не всё приложение.
// Порядок: диалог подтверждения → регистрация (шаг назад) → шторка → панель профиля → окно инструмента → сессия
// (сворачивается, но продолжается) → песня → первая вкладка → приложение сворачивается (не закрывается).
// В браузере не используется: там «назад» — у самого браузера.
import { Capacitor } from '@capacitor/core';
import { closeTopSheet, leave } from '../ui/index.js';

const click = (sel) => { const b = document.querySelector(sel); if (b) { b.click(); return true; } return false; };

// Один шаг «назад». true — что-то закрыто; false — закрывать нечего (пора свернуть приложение)
export function backStep(app) {
  // уходящие с анимацией (.leaving) уже закрыты — их не трогаем
  const ask = document.querySelector('.ask:not(#tosGate):not(.leaving)');
  if (ask) return click('.ask:not(#tosGate):not(.leaving) [data-k="no"]') || (leave(ask, 160), true);
  if (document.getElementById('tosGate')) return false; // соглашение без ответа не закрывается
  if (document.getElementById('onboard')) return click('#onboard [data-obback]') || false;
  if (click('.pdffull [data-x="pfull0"]')) return true; // PDF во весь экран
  if (closeTopSheet()) return true;
  if (click('.stage [data-sg="exit"]')) return true; // сцена: выход — с подтверждением
  const panel = document.getElementById('panelLayer');
  if (panel) return click('#panelLayer .navrow [data-pp="root"]') || click('#panelLayer [data-act="pclose"]');
  const tv = document.querySelector('.tview.pure:not(.leaving)');
  if (tv && tv.parentElement.pureExit && tv.parentElement.pureExit()) return true; // полный экран инструмента — сначала из него
  if (click('.tview:not(.leaving) [data-tv="close"]')) return true;
  const ses = document.querySelector('.session.pure');
  if (ses && ses.parentElement.pureExit && ses.parentElement.pureExit()) return true; // окно сессии во весь экран — сначала из него
  if (click('.session [data-s="hide"]')) return true;
  return app.shellBack ? app.shellBack() : false;
}

export async function initBack(app) {
  if (!Capacitor.isNativePlatform()) return;
  const { App } = await import('@capacitor/app');
  App.addListener('backButton', () => { if (!backStep(app)) App.minimizeApp(); });
}
