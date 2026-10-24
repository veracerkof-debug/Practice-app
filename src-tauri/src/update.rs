// Обновление из GitHub (веб-часть — src/core/update.js): установщик своего канала скачивается во временную папку
// (ход — событием update-progress), ставится молча (NSIS /S) — сразу по кнопке с перезапуском или, в режиме
// «автоматически», при закрытии окна: звук, запись и занятие не обрываются. Тот же идентификатор приложения —
// данные остаются. Качать можно только из релизов Melete на GitHub
use std::fs::File;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::Mutex;

use tauri::{AppHandle, Emitter, State};

const ALLOWED: &str = "https://github.com/veracerkof-debug/";

#[derive(Default)]
pub struct Upd { pub pending: Mutex<Option<PathBuf>> }

fn setup_path() -> PathBuf { std::env::temp_dir().join("Melete-Update-Setup.exe") }

// Скачать по ссылке в файл; progress(доля) — не чаще чем раз в полпроцента
pub fn fetch(url: &str, to: &PathBuf, mut progress: impl FnMut(f64)) -> Result<(), String> {
    if !url.starts_with(ALLOWED) { return Err("url".into()); }
    let resp = ureq::get(url).call().map_err(|e| e.to_string())?;
    let total: u64 = resp.header("Content-Length").and_then(|s| s.parse().ok()).unwrap_or(0);
    let mut r = resp.into_reader();
    let part = to.with_extension("part");
    let mut f = File::create(&part).map_err(|e| e.to_string())?;
    let (mut buf, mut got, mut last) = (vec![0u8; 1 << 20], 0u64, -1.0f64);
    loop {
        let n = r.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 { break; }
        f.write_all(&buf[..n]).map_err(|e| e.to_string())?;
        got += n as u64;
        if total > 0 { let p = got as f64 / total as f64; if p - last >= 0.005 { last = p; progress(p); } }
    }
    f.flush().map_err(|e| e.to_string())?;
    drop(f);
    if total > 0 && got != total { let _ = std::fs::remove_file(&part); return Err(format!("short: {got} of {total}")); }
    std::fs::rename(&part, to).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_download(app: AppHandle, url: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let to = setup_path();
        fetch(&url, &to, |p| { let _ = app.emit("update-progress", p); })?;
        Ok(to.to_string_lossy().into_owned())
    }).await.map_err(|e| e.to_string())?
}

// «Автоматически»: поставить при закрытии окна (lib.rs: on_window_event)
#[tauri::command]
pub fn update_pending(st: State<'_, Upd>, path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if p != setup_path() || !p.is_file() { return Err("path".into()); }
    if let Ok(mut g) = st.pending.lock() { *g = Some(p); }
    Ok(())
}

// Сейчас: установщик молча, затем снова Melete; окно закрывается
#[tauri::command]
pub fn update_install(app: AppHandle, st: State<'_, Upd>, path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if p != setup_path() || !p.is_file() { return Err("path".into()); }
    if let Ok(mut g) = st.pending.lock() { *g = None; }
    run_setup(&p, true)?;
    app.exit(0);
    Ok(())
}

// Отложенная установка при закрытии — без перезапуска
pub fn on_exit(st: &Upd) {
    let p = st.pending.lock().ok().and_then(|mut g| g.take());
    if let Some(p) = p { let _ = run_setup(&p, false); }
}

// Пакетный файл рядом: подождать, пока окно закроется, поставить молча, по желанию — запустить снова, удалить себя.
// Через .cmd, а не строкой в cmd /C: кавычки путей с пробелами (имя пользователя) cmd разбирает по своим правилам
fn run_setup(setup: &PathBuf, relaunch: bool) -> Result<(), String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let bat = std::env::temp_dir().join("melete-update.cmd");
    let mut s = String::from("@echo off\r\ntimeout /t 2 /nobreak >nul\r\n");
    s += &format!("\"{}\" /S\r\n", setup.display());
    if relaunch { s += &format!("start \"\" \"{}\"\r\n", exe.display()); }
    s += "del \"%~f0\"\r\n";
    std::fs::write(&bat, s).map_err(|e| e.to_string())?;
    let mut cmd = std::process::Command::new("cmd");
    cmd.arg("/C").arg(&bat);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000 | 0x0000_0008); // без окна консоли, отдельно от Melete
    }
    cmd.spawn().map_err(|e| e.to_string())?;
    Ok(())
}
