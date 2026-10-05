# Лицензии сторонних компонентов

Приложение распространяется по лицензии GPL-3.0. Ниже — всё, что входит в сборку от сторонних авторов
(тексты лицензий лежат рядом с пакетами в `node_modules`). Тот же список показывает экран «Лицензии» в приложении
(экран появится при переносе правовых экранов ядра).

## Входит в приложение

| Компонент | Назначение | Лицензия |
|---|---|---|
| [alphaTab](https://github.com/CoderLine/alphaTab) 1.8.4 — © CoderLine (Daniel Kuschny) и участники | Отображение и воспроизведение табулатур (модуль «Табы и текст»), используется без изменений | MPL-2.0 |
| ↳ внутри alphaTab: TinySoundFont, SFZero, Haxe Standard Library, SharpZipLib, NVorbis | Синтез по звуковому банку, разбор XML и zip, декодирование Vorbis | MIT |
| ↳ внутри alphaTab: libvorbis (через NVorbis) — © Xiph.org Foundation | Декодирование Vorbis | BSD-3-Clause |
| Bravura — © 2013 Steinberg Media Technologies GmbH, Reserved Font Name «Bravura» | Нотный шрифт (SMuFL) для alphaTab, файл `Bravura.woff2` из пакета alphaTab | SIL OFL 1.1 |
| SONiVOX EAS — © 2004–2006 Sonic Network Inc. | Звуковой банк для воспроизведения табулатур, файл `sonivox.sf3` из пакета alphaTab без изменений | Apache-2.0 |
| [Capacitor](https://github.com/ionic-team/capacitor) 8.5.2 (`@capacitor/core`, `@capacitor/android`) — © Ionic и участники | Приложение для Android: оболочка WebView и мост к системе | MIT |
| AndroidX (appcompat, coordinatorlayout, core-splashscreen, webkit и др.) — © The Android Open Source Project | Библиотеки Android, входят в APK через Capacitor | Apache-2.0 |

Все остальные звуки (метроном, пианино, дрон, пэды, клики) синтезируются в реальном времени, чужих записей нет.

## Только для сборки (в приложение не попадают)

| Компонент | Лицензия |
|---|---|
| Vite, Vitest, @capacitor/cli | MIT |
| @coderline/alphatab-vite — подключение воркеров alphaTab при сборке | MPL-2.0 |
