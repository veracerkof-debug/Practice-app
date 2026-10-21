fn main() {
    // свои команды (allow_dir, startup_files, stems_*) — права на них в capabilities/default.json: allow-allow-dir, allow-startup-files
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(&["allow_dir", "startup_files", "stems_begin", "stems_push", "stems_run", "stems_read", "stems_cancel", "stems_clean", "lyrics_supported", "lyrics_begin", "lyrics_push", "lyrics_run", "lyrics_cancel", "lyrics_clean", "localsend_start", "localsend_stop", "localsend_status", "localsend_answer", "denoise_begin", "denoise_push", "denoise_run", "denoise_read", "denoise_cancel", "denoise_clean"])),
    )
    .expect("tauri-build");
}
