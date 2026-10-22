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
| [Salamander Grand Piano V3](https://archive.org/details/SalamanderGrandPianoV3) — © Alexander Holm | Звук «Рояль» в пианино. APK и Windows: полный набор Ogg Vorbis автора (`build/models.json` → `public/models/piano/`, 78 МБ): 30 нот через малую терцию (A0–C8) × 16 слоёв силы удара и 88 звуков отпускания, без изменений. Веб-версия: облегчённый набор (`public/piano/`): один слой; **изменено:** моно, укорочены, выровнены по громкости, MP3 48 кбит/с | CC BY 3.0 |
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
| [Signalsmith Stretch](https://github.com/Signalsmith-Audio/signalsmith-stretch) 1.3.2 (`signalsmith-stretch`, WebAssembly в AudioWorklet) — © Signalsmith Audio Ltd | Проигрыватель медиатеки: скорость без смены высоты и тональность записей одним алгоритмом (`src/audio/stretchplayer.js`), тональность видео (`src/audio/pitchshift.js`); копия в `src/audio/vendor/signalsmith-stretch.mjs` с двумя правками (помечены «Melete»: вход не читается в простое, «живой вход» — только явно) | MIT |
| [ONNX Runtime Web](https://github.com/microsoft/onnxruntime) 1.30 (`onnxruntime-web`, WebAssembly) — © Microsoft Corporation | Выполнение модели разделения на дорожки (модуль «Дорожки»); файлы `ort/…` в сборке; пути к ним заданы явно — обращений к CDN нет | MIT |
| [ONNX Runtime](https://github.com/microsoft/onnxruntime) 1.31 (`com.microsoft.onnxruntime:onnxruntime-android`, нативная библиотека) — © Microsoft Corporation | Выполнение той же модели на Android на всех ядрах процессора (`StemsPlugin.java`, `Demucs.java`); обращений к сети нет | MIT |
| [HTDemucs v4](https://github.com/facebookresearch/demucs) — © Meta Platforms, Inc. и участники; ONNX-сборки [timcsy/demucs-web-onnx](https://huggingface.co/timcsy/demucs-web-onnx) (4 дорожки, `htdemucs_embedded.onnx`, 180 МБ) и [Andremi/audioweb-models](https://huggingface.co/Andremi/audioweb-models) (6 дорожек, `htdemucs_6s.onnx`, 55 МБ, fp16) | Модели разделения записи на дорожки (вокал, ударные, бас, остальное; ещё гитара и клавиши); скачиваются при сборке APK и Windows (`build/models.json`, проверка sha256), в веб-версию не входят. Спектрограммы, маски и склейка — свой код (`src/audio/demucs.js`, `Demucs.java`), по алгоритму demucs-web (MIT) | MIT |
| [Basic Pitch](https://github.com/spotify/basic-pitch-ts) 1.0.1 (`@spotify/basic-pitch`) — © Spotify AB | Ноты со слуха (модуль «Снять ноты»): модель (0,9 МБ, `public/bp/`, входит и в веб-версию) и обработка выхода; сеть не нужна | Apache-2.0 |
| [ort](https://github.com/pykeio/ort) 2.0 (крейт Rust) — © pyke.io; статические бинарники ONNX Runtime pyke — © Microsoft Corporation | Windows: выполнение модели HTDemucs нативно (`src-tauri/src/demucs.rs`), бинарники скачиваются при сборке установщика | MIT / Apache-2.0; ONNX Runtime — MIT |
| [Mel-Band RoFormer](https://huggingface.co/KimberleyJSN/melbandroformer) — веса © Kimberley Jensen; код [lucidrains/BS-RoFormer](https://github.com/lucidrains/BS-RoFormer) © Phil Wang и [ZFTurbo/Music-Source-Separation-Training](https://github.com/ZFTurbo/Music-Source-Separation-Training) © Roman Solovyev; ONNX-сборка [audiojs/mel-roformer](https://huggingface.co/audiojs/mel-roformer) (`mel-roformer.fp16.onnx`, 464 МБ) | Windows: вокал для «улучшенного разделения» (`src-tauri/src/roformer.rs`): спектр снаружи модели и склейка сегментов — свой код по алгоритму demix() (сверен с эталоном @audio/neural-separate, MIT); модель скачивается при сборке установщика (`build/models.json`, `platform: windows`), в APK и веб не входит | MIT |
| [DeepFilterNet](https://github.com/Rikorose/DeepFilterNet) (крейт `deep_filter` из репозитория, метка v0.5.6, с встроенной моделью DeepFilterNet3) — © Hendrik Schröter и др.; [tract](https://github.com/sonos/tract) — © Sonos, Inc. | Windows: шумоподавление записей голоса и речи (`src-tauri/src/denoise.rs`, `src/audio/denoise.js`): очищенная запись — новым файлом рядом с исходником | MIT / Apache-2.0 |
| [tiny_http](https://github.com/tiny-http/tiny-http) 0.12 — © tiny-http contributors; [local-ip-address](https://github.com/EstebanBorai/local-ip-address) 0.6 — © Esteban Borai | Windows: приём файлов с телефона по протоколу [LocalSend](https://github.com/localsend/protocol) (`src-tauri/src/localsend.rs`): HTTP-сервер и адреса сетевых интерфейсов | MIT / Apache-2.0 |
| [whisper.cpp](https://github.com/ggerganov/whisper.cpp) (крейт `whisper-rs` 0.16, статическая сборка cmake) — © Georgi Gerganov; модель [Whisper large-v3-turbo](https://huggingface.co/ggerganov/whisper.cpp) (`ggml-large-v3-turbo-q5_0.bin`, 574 МБ) — © OpenAI | Windows: текст песни из записи (`src-tauri/src/lyrics.rs`, `src/audio/lyrics.js`): по отделённому вокалу, строки со временем в плеере, в песню, файл .lrc; модель скачивается при сборке установщика (`build/models.json`, `platform: windows`) и лежит в ресурсах программы; в APK и веб не входит | MIT; модель — MIT |
| [realfft](https://github.com/HEnquist/realfft), [rustfft](https://github.com/ejmahler/RustFFT) (крейты Rust) | Windows: быстрое преобразование Фурье для спектра и обратного STFT в движке дорожек | MIT / Apache-2.0 |
| [S-KEY](https://github.com/deezer/skey) — © Deezer SA; ONNX-сборка [musetric/skey-onnx](https://huggingface.co/musetric/skey-onnx) (`skey.onnx`, 0,3 МБ) | Тональность записи в медиатеке; скачивается при сборке APK и Windows (`build/models.json`), в веб-версию не входит | MIT |
| [Beat This!](https://github.com/CPJKU/beat_this) — © Francesco Foscarin, Jan Schlüter, Gerhard Widmer (CPJKU); ONNX-сборки [ashudesai/songbird-models](https://huggingface.co/ashudesai/songbird-models) (`small0.onnx`, 10 МБ, и `mel_spectrogram.onnx`) | Доли, сильные доли и темп записи в медиатеке; при сборке APK и Windows, в веб-версию не входит | MIT |
| [ChordMini](https://github.com/ptnghia-j/ChordMini) ChordNet 2E1D — © ChordMini authors; ONNX-сборка [musetric/chordmini-onnx](https://huggingface.co/musetric/chordmini-onnx) (`chordnet.onnx`, 17 МБ) | Аккорды записи в медиатеке; лог-CQT по формулам librosa — свой код (`src/music/cqt.js`); при сборке APK и Windows, в веб-версию не входит | MIT |
| [TensorFlow.js](https://github.com/tensorflow/tfjs) 3.21 (`@tensorflow/tfjs`) — © Google LLC | Выполнение модели Basic Pitch (WebGL или процессор); модель — локальный файл, обращений к сети нет | Apache-2.0 |
| [@tonejs/midi](https://github.com/Tonejs/Midi) — © Yotam Mann | Часть пакета Basic Pitch (формат MIDI) | MIT |
| [sql.js](https://github.com/sql-js/sql.js) 1.14.2 — © sql.js authors; внутри — SQLite (общественное достояние) | Чтение баз EasyWorship при импорте песен, загружается только при импорте | MIT |
| [Capacitor](https://github.com/ionic-team/capacitor) 8.5.2 (`@capacitor/core`, `@capacitor/android`, `@capacitor/app` 8.1.2, `@capacitor/local-notifications` 8.3.1 — напоминания о практике) — © Ionic и участники | Приложение для Android: оболочка WebView и мост к системе | MIT |
| AndroidX (appcompat, coordinatorlayout, core-splashscreen, webkit и др.) — © The Android Open Source Project | Библиотеки Android, входят в APK через Capacitor | Apache-2.0 |

Все остальные звуки (метроном, пианино, дрон, пэды, клики) синтезируются в реальном времени, чужих записей нет.

## Только для сборки (в приложение не попадают)

| Компонент | Лицензия |
|---|---|
| Vite, Vitest, @capacitor/cli | MIT |
| @playwright/test — сквозные проверки в браузере (tests/e2e) | Apache-2.0 |
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
