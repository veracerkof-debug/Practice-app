# Модель распознавания рук (модуль «Терменвокс»)

`hand_landmarker.task` — MediaPipe Hand Landmarker, float16, версия 1 (© Google LLC, Apache-2.0), без изменений.
Внутри — две модели TensorFlow Lite: поиск ладони и 21 точка руки.

- Источник: https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task
- SHA-256: `fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1`
- Карточка модели: https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker

Лежит в репозитории, чтобы приложение работало без сети и собиралось без скачиваний (в том числе на F-Droid).
В сборку попадает как `mediapipe/hand_landmarker.task` (`build/mediapipe.js`).
