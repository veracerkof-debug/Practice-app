fn main() {
    // свои команды (allow_dir, startup_files, stems_*) — права на них в capabilities/default.json: allow-allow-dir, allow-startup-files
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(&["allow_dir", "startup_files", "stems_begin", "stems_push", "stems_run", "stems_read", "stems_cancel", "stems_clean"])),
    )
    .expect("tauri-build");
}
