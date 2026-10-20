# Лицензии сторонних компонентов

Приложение распространяется по лицензии GPL-3.0. Ниже — всё, что входит в сборку от сторонних авторов
(тексты лицензий лежат рядом с пакетами в `node_modules`). Тот же список показывает экран «Лицензии» в приложении
(«Профиль → Лицензии», внизу). Текст GPL-3.0 — файл `LICENSE` в корне.

## Входит в приложение

| Компонент | Назначение | Лицензия |
|---|---|---|
| [alphaTab](https://github.com/CoderLine/alphaTab) 1.8.4 — © CoderLine (Daniel Kuschny) и участники | Отображение и воспроизведение табулатур (модуль «Табы и текст»), используется без изменений | MPL-2.0 |
| [Tauri](https://github.com/tauri-apps/tauri) 2 (с tauri-plugin-dialog, tauri-plugin-fs, tauri-plugin-window-state, @tauri-apps/api) — © Tauri Programme within The Commons Conservancy | Окно и сохранение файлов в версии для Windows; в веб-версию и APK не входит | MIT / Apache-2.0 |
| ↳ внутри alphaTab: TinySoundFont, SFZero, Haxe Standard Library, SharpZipLib, NVorbis | Синтез по звуковому банку, разбор XML и zip, декодирование Vorbis | MIT |
| ↳ внутри alphaTab: libvorbis (через NVorbis) — © Xiph.org Foundation | Декодирование Vorbis | BSD-3-Clause |
| Bravura — © 2013 Steinberg Media Technologies GmbH, Reserved Font Name «Bravura» | Нотный шрифт (SMuFL) для alphaTab, файл `Bravura.woff2` из пакета alphaTab | SIL OFL 1.1 |
| SONiVOX EAS — © 2004–2006 Sonic Network Inc. | Звуковой банк для воспроизведения табулатур, файл `sonivox.sf3` из пакета alphaTab без изменений | Apache-2.0 |
| [Salamander Grand Piano V3](https://archive.org/details/SalamanderGrandPianoV3) — © Alexander Holm | Звук «Рояль» в пианино: 30 нот (через малую терцию, A0–C8) из облегчённого набора Tone.js; **изменено:** моно, укорочены, выровнены по громкости, MP3 48 кбит/с (`public/piano/`) | CC BY 3.0 |
| Comfortaa 400 — © 2011 The Comfortaa Project Authors (Johan Aakerlund), Reserved Font Name «Comfortaa», пакет `@fontsource/comfortaa` 5.3.0 | Шрифт крупной ноты на доске глайдера (латиница и кириллица), файлы woff2 внутри приложения | SIL OFL 1.1 |
| [pdf.js](https://github.com/mozilla/pdf.js) 6.4.299 (`pdfjs-dist`, сборка legacy) — © Mozilla Foundation и участники | Просмотр нот и табов в PDF (модуль «Табы, ноты и текст»), используется без изменений | Apache-2.0 |
| ↳ ресурсы pdf.js: шрифты Foxit (© PDFium Authors), декодеры OpenJPEG и JBIG2 (PDFium), qcms (© Mozilla, Marti Maria), таблицы cmaps (© Adobe) | Стандартные шрифты PDF, декодирование JPEG 2000 и JBIG2, цветовые профили, кодировки — файлы `pdfjs/…` в сборке | BSD-3-Clause / BSD-2-Clause / MIT |
| ↳ Liberation Sans — © Red Hat | Замена шрифта Helvetica/Arial для PDF без встроенных шрифтов | Liberation 1.x (GPLv2 с исключением для шрифтов) |
| [MediaPipe Tasks Vision](https://github.com/google-ai-edge/mediapipe) 1.1.0 (`@mediapipe/tasks-vision`) — © Google LLC | Распознавание рук в модуле «Терменвокс», целиком на устройстве: код и движок WebAssembly (`mediapipe/vision_wasm_internal.*`). **Изменён при сборке:** вырезан встроенный сборщик статистики, отправлявший данные в Google (`build/mediapipe.js`) | Apache-2.0 |
| ↳ внутри движка MediaPipe: TensorFlow Lite, XNNPACK, OpenCV, Protocol Buffers, Abseil и др. | Выполнение модели, обработка изображения | Apache-2.0 / BSD-3-Clause |
| Модель MediaPipe Hand Landmarker (float16, v1) — © Google LLC | Модель распознавания 21 точки руки, файл `vendor/mediapipe/hand_landmarker.task` (7,8 МБ) без изменений | Apache-2.0 |
| GFS Didot — © Greek Font Society, пакет `@fontsource/gfs-didot` 5.3.0 (греческий набор) | Шрифт логотипа «Μελέτη» и греческих цитат | SIL OFL 1.1 |
| Onest (вариативный) — © 2023 The Onest Project Authors, пакет `@fontsource-variable/onest` 5.3.1 | Дополнительный шрифт интерфейса, кириллица и латиница | SIL OFL 1.1 |
| Библия, Синодальный перевод (1876), 66 книг — из архива [eBible.org](https://ebible.org/find/details.php?id=russyn) (russyn) | Текст Библии в церковном режиме, файлы `public/bible/synodal/*.json` (разбивка по книгам и главам — `build/bible-import.mjs`), текст без изменений | Общественное достояние |
| [Ponomar](https://github.com/slavonic/Ponomar) — © 2025 The Ponomar Project Authors | Шрифт церковнославянских цитат у названий разделов; урезан до букв цитат (`src/styles/fonts/ponomar-verses.woff2`, текст лицензии — `Ponomar-OFL.txt` рядом) | SIL OFL 1.1 |
| Стихи разделов: Елизаветинская Библия (1751, церковнославянский; набор по [azbyka.ru](https://azbyka.ru/biblia/)), [World English Bible](https://ebible.org/find/details.php?id=engwebp) (eBible.org), Синодальный перевод | Цитаты у названий разделов (`src/core/verses.js`) | Общественное достояние |
| Стихи разделов на узбекском: «Muqaddas Kitob» — © Muqaddas Kitobni tarjima qilish instituti, 2016, 2018, 2020 | 37 коротких цитат с указанием места (`src/core/verses.js`) | Цитирование; права — у правообладателя |
| [fflate](https://github.com/101arrowz/fflate) 0.8.3 — © Arjun Barrett | Распаковка zip при импорте песен (PowerPoint, ProPresenter, архивы) | MIT |
| [Signalsmith Stretch](https://github.com/Signalsmith-Audio/signalsmith-stretch) 1.3.2 (`signalsmith-stretch`, WebAssembly в AudioWorklet) — © Signalsmith Audio Ltd | Тональность записей в медиатеке без изменения скорости (`src/audio/pitchshift.js`), загружается при первом сдвиге, используется без изменений | MIT |
| [sql.js](https://github.com/sql-js/sql.js) 1.14.2 — © sql.js authors; внутри — SQLite (общественное достояние) | Чтение баз EasyWorship при импорте песен, загружается только при импорте | MIT |
| [Capacitor](https://github.com/ionic-team/capacitor) 8.5.2 (`@capacitor/core`, `@capacitor/android`, `@capacitor/app` 8.1.2, `@capacitor/local-notifications` 8.3.1 — напоминания о практике) — © Ionic и участники | Приложение для Android: оболочка WebView и мост к системе | MIT |
| AndroidX (appcompat, coordinatorlayout, core-splashscreen, webkit и др.) — © The Android Open Source Project | Библиотеки Android, входят в APK через Capacitor | Apache-2.0 |

Все остальные звуки (метроном, пианино, дрон, пэды, клики) синтезируются в реальном времени, чужих записей нет.

## Только для сборки (в приложение не попадают)

| Компонент | Лицензия |
|---|---|
| Vite, Vitest, @capacitor/cli | MIT |
| @coderline/alphatab-vite — подключение воркеров alphaTab при сборке | MPL-2.0 |

## Демо-набор
Папка `public/demo/` — демо-набор (ставится при регистрации; убирается в «Песнях» и в «Данных и копиях»). Ноты в PDF — Mutopia Project
(mutopiaproject.org), общественное достояние: И. С. Бах — Менуэт соль мажор BWV Anh. 114 (с табулатурой),
Прелюдия ре минор BWV 999; М. Каркасси — Этюд op. 60 № 3; Greensleeves (народная). Табулатуры (MusicXML) и тексты
с аккордами — народные песни (Amazing Grace, Greensleeves, The House of the Rising Sun, Scarborough Fair,
«Калинка»), общественное достояние; табулатуры набраны заново.
Записи в медиатеке синтезируются на устройстве (`src/core/demoaudio.js`). Мелодии глайдера и терменвокса
(`src/music/melodies.js`; в интерфейсе сейчас скрыты) — общественное достояние: «Ода к радости» (Бетховен, Шиллер), «Twinkle, Twinkle, Little Star»,
«Frère Jacques», «Jingle Bells» (Пирпонт, 1857), «Amazing Grace» (Ньютон, 1779), «Greensleeves».
