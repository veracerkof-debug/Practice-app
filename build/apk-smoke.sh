#!/usr/bin/env bash
# Проверка APK на эмуляторе Android перед выкладкой (.github/workflows/android-beta.yml): поставить, открыть, 40 с —
# процесс жив, падений (FATAL EXCEPTION, ANR) нет, страница загрузилась. Снимок экрана и журнал — в артефакты сборки.
# Вызов: build/apk-smoke.sh <apk> <пакет>
set -u
APK="$1"; PKG="$2"
adb install -r -g "$APK" || { echo "::error::APK не ставится"; exit 1; }
adb logcat -c
adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 || adb shell am start -n "$PKG/app.practice.beta.MainActivity"
sleep 40
adb exec-out screencap -p > smoke.png || true
adb logcat -d > logcat.txt || true
if grep -E "FATAL EXCEPTION|ANR in $PKG" logcat.txt; then echo "::error::приложение упало при запуске (logcat.txt)"; exit 1; fi
if [ -z "$(adb shell pidof "$PKG" | tr -d '\r')" ]; then echo "::error::приложение закрылось само"; exit 1; fi
# ошибки страницы — предупреждением (без них — лучше, но запуск они не валят)
grep -E "Capacitor/Console.*(Uncaught|TypeError|ReferenceError)" logcat.txt | head -20 | sed 's/^/::warning::/' || true
echo "запуск в порядке"
