fn main() {
    // свои команды (allow_dir, startup_files) — права на них в capabilities/default.json: allow-allow-dir, allow-startup-files
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(&["allow_dir", "startup_files"])),
    )
    .expect("tauri-build");
}
