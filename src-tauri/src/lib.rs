// Melete для Windows: одно окно с веб-версией; диалоги и файлы — для сохранения записей, копий и экспорта на компьютер.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .run(tauri::generate_context!())
        .expect("Melete: не удалось запустить окно");
}
