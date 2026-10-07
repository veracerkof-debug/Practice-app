// Кнопка и жест «Назад» на Android: закрывают то, что открыто сверху, а не всё приложение.
// Порядок: диалог подтверждения → регистрация (шаг назад) → шторка → панель профиля → окно инструмента → сессия
// (сворачивается, но продолжается) → песня → первая вкладка → приложение сворачивается (не закрывается).
// В браузере не используется: там «назад» — у самого браузера.
import { Capacitor } from '@capacitor/core';
import { closeTopSheet } from '../ui/index.js';

const click = (sel) => { const b = document.querySelector(sel); if (b) { b.click(); return true; } return false; };

// Один шаг «назад». true — что-то закрыто; false — закрывать нечего (пора свернуть приложение)
export function backStep(app) {
  const ask = document.querySelector('.ask:not(#tosGate)');
  if (ask) return click('.ask:not(#tosGate) [data-k="no"]') || (ask.remove(), true);
  if (document.getElementById('tosGate')) return false; // соглашение без ответа не закрывается
  if (document.getElementById('onboard')) return click('#onboard [data-obback]') || false;
  if (closeTopSheet()) return true;
  const panel = document.getElementById('panelLayer');
  if (panel) return click('#panelLayer .navrow [data-pp="root"]') || click('#panelLayer [data-act="pclose"]');
  if (click('.tview [data-tv="close"]')) return true;
  if (click('.session [data-s="hide"]')) return true;
  return app.shellBack ? app.shellBack() : false;
}

export async function initBack(app) {
  if (!Capacitor.isNativePlatform()) return;
  const { App } = await import('@capacitor/app');
  App.addListener('backButton', () => { if (!backStep(app)) App.minimizeApp(); });
}
