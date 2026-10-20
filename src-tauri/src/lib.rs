// Melete для Windows: одно окно с веб-версией. Rust-части минимум: диалоги и файлы (сохранение, папка Melete),
// разрешение папки и файлов, открытых двойным щелчком, память о размере окна, микрофон и камера без лишних вопросов
// (страницы только свои, из сборки; наружу приложение не ходит).
use tauri::webview::{PermissionKind, PermissionResponse};
use tauri_plugin_fs::FsExt;

// Папка Melete, выбранная человеком: разрешить файловому модулю на этот запуск (путь помнит веб-часть)
#[tauri::command]
fn allow_dir(app: tauri::AppHandle, path: String) -> Result<(), String> {
    app.fs_scope().allow_directory(&path, true).map_err(|e| e.to_string())
}

// Файлы, с которыми приложение запустили («Открыть с помощью», двойной щелчок по .melete, табам, .mid)
#[tauri::command]
fn startup_files(app: tauri::AppHandle) -> Vec<String> {
    std::env::args()
        .skip(1)
        .filter(|a| !a.starts_with('-') && std::path::Path::new(a).is_file())
        .map(|a| {
            let _ = app.fs_scope().allow_file(&a);
            a
        })
        .collect()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .on_permission_request(|_, kind| match kind {
            PermissionKind::Microphone | PermissionKind::Camera => PermissionResponse::Allow,
            _ => PermissionResponse::Default,
        })
        .invoke_handler(tauri::generate_handler![allow_dir, startup_files])
        .run(tauri::generate_context!())
        .expect("Melete: не удалось запустить окно");
}
