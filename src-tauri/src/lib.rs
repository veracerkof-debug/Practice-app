// Melete для Windows: одно окно с веб-версией. Rust-части минимум: диалоги и файлы (сохранение, папка Melete),
// разрешение папки и файлов, открытых двойным щелчком, память о размере окна, микрофон и камера без лишних вопросов
// (страницы только свои, из сборки; наружу приложение не ходит). Дорожки — нативный ONNX Runtime (demucs.rs):
// команды stems_* повторяют плагин Stems на Android (src/audio/stems.js, src/audio/stemsdesktop.js). Текст песни из записи —
// whisper.cpp (lyrics.rs, команды lyrics_*, адаптер src/audio/lyrics.js). Приём файлов с телефона по протоколу LocalSend —
// localsend.rs (команды localsend_*, веб-часть src/core/localsend.js). Шумоподавление DeepFilterNet — denoise.rs (команды denoise_*,
// адаптер src/audio/denoise.js). Улучшенное разделение — вокал Mel-RoFormer (roformer.rs) внутри stems_run.
mod demucs;
mod lyrics;
mod roformer;
mod denoise;
mod localsend;

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};

use serde::Serialize;
use tauri::ipc::{InvokeBody, Request, Response};
use tauri::webview::{PermissionKind, PermissionResponse};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_fs::FsExt;

static ENV: OnceLock<ort::environment::Environment> = OnceLock::new();
// Одна среда ONNX Runtime на процесс
pub fn ort_env() -> Result<&'static ort::environment::Environment, String> {
    if let Some(e) = ENV.get() { return Ok(e); }
    let e = ort::init().with_name("melete").build().map_err(|e| e.to_string())?;
    let _ = ENV.set(e);
    ENV.get().ok_or_else(|| "ort env".to_string())
}

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

/* ---------- дорожки ---------- */

// Состояние разделения: вход (два канала float32), флаг отмены, занятость, загруженная модель (одна, по имени)
#[derive(Default)]
pub struct Stems {
    input: Mutex<[Vec<f32>; 2]>,
    cancel: Arc<AtomicBool>,
    busy: Arc<AtomicBool>,
    engine: Arc<Mutex<Option<(String, demucs::Demucs)>>>,
    voc: Arc<Mutex<Option<roformer::RoFormer>>>, // Mel-RoFormer — вокал для «улучшенного разделения»
}
pub const ROFORMER: &str = "models/roformer/mel-roformer.fp16.onnx";
// Файл из ресурсов установщика (bundle.resources) или из src-tauri/ в разработке
pub fn res_path(app: &AppHandle, rel: &str) -> Option<PathBuf> {
    let mut cands = Vec::new();
    if let Ok(r) = app.path().resource_dir() { cands.push(r.join(rel)); }
    for base in ["", "../", "src-tauri/", "../src-tauri/"] { cands.push(PathBuf::from(format!("{base}{rel}"))); }
    cands.into_iter().find(|p| p.is_file())
}

#[derive(Serialize, Clone)]
struct Progress { f: f64 }
#[derive(Serialize)]
struct RunResult { files: std::collections::HashMap<String, String>, stems: usize, total: usize, threads: usize, vocals: String }
// Дорожка в файл: float32 LE, чередование L R
fn write_part(path: &std::path::Path, l: &[f32], r: &[f32]) -> Result<(), String> {
    let mut bytes = Vec::with_capacity(l.len() * 8);
    for i in 0..l.len().min(r.len()) { bytes.extend_from_slice(&l[i].to_le_bytes()); bytes.extend_from_slice(&r[i].to_le_bytes()); }
    std::fs::write(path, bytes).map_err(|e| e.to_string())
}

fn out_dir(app: &AppHandle) -> PathBuf { app.path().app_cache_dir().unwrap_or_else(|_| std::env::temp_dir()).join("stems") }

#[tauri::command]
fn stems_begin(st: State<'_, Stems>) -> Result<(), String> {
    if st.busy.load(Ordering::Relaxed) { return Err("busy".into()); }
    let mut inp = st.input.lock().map_err(|_| "lock")?;
    inp[0].clear(); inp[1].clear();
    st.cancel.store(false, Ordering::Relaxed);
    Ok(())
}

// Кусок канала: тело запроса — float32 LE, заголовок ch — 0 или 1
#[tauri::command]
fn stems_push(st: State<'_, Stems>, request: Request<'_>) -> Result<(), String> {
    let ch: usize = request.headers().get("ch").and_then(|v| v.to_str().ok()).and_then(|v| v.parse().ok()).unwrap_or(0);
    let bytes = match request.body() { InvokeBody::Raw(b) => b, _ => return Err("raw body expected".into()) };
    let mut inp = st.input.lock().map_err(|_| "lock")?;
    let dst = &mut inp[ch.min(1)];
    dst.reserve(bytes.len() / 4);
    for c in bytes.chunks_exact(4) { dst.push(f32::from_le_bytes([c[0], c[1], c[2], c[3]])); }
    Ok(())
}

// Модель из сборки (dist/models/… встроен в exe; в режиме разработки — dist/ или public/ на диске)
fn model_bytes(app: &AppHandle, rel: &str) -> Result<Vec<u8>, String> {
    if let Some(a) = app.asset_resolver().get(rel.to_string()) { return Ok(a.bytes); }
    for base in ["../public/", "public/", "../dist/", "dist/"] {
        if let Ok(b) = std::fs::read(format!("{base}{rel}")) { return Ok(b); }
    }
    Err(format!("model not found: {rel}"))
}

#[tauri::command]
async fn stems_run(app: AppHandle, st: State<'_, Stems>, model: String, hq: bool) -> Result<RunResult, String> {
    if st.busy.swap(true, Ordering::Relaxed) { return Err("busy".into()); }
    let rel = if model == "6" { "models/demucs/htdemucs_6s.onnx" } else { "models/demucs/htdemucs_embedded.onnx" };
    let dir = out_dir(&app);
    let cancel = st.cancel.clone();
    let threads = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4).min(16);
    let (left, right) = { let inp = st.input.lock().map_err(|_| "lock")?; (inp[0].clone(), inp[1].clone()) };
    let app2 = app.clone();
    let engine = st.engine.clone();
    let voc_engine = st.voc.clone();
    // улучшенное разделение на компьютере: вокал — Mel-RoFormer (если модель на месте), остальное — HTDemucs по
    // инструменталу (запись минус вокал); режим «2» — только RoFormer
    let rof_path = if hq { res_path(&app, ROFORMER) } else { None };
    let res = tauri::async_runtime::spawn_blocking(move || -> Result<RunResult, String> {
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let total = left.len().min(right.len());
        let mut last = -1.0;
        let mut emit = |f: f64| { if f - last >= 0.005 { last = f; let _ = app2.emit("stems-progress", Progress { f }); } };
        let (mut inl, mut inr, mut vocals_src) = (None, None, String::new());
        if let Some(path) = rof_path {
            let mut ve = voc_engine.lock().map_err(|_| "lock")?;
            if ve.is_none() { let bytes = std::fs::read(&path).map_err(|e| e.to_string())?; *ve = Some(roformer::RoFormer::new(&bytes, threads)?); }
            let rf = ve.as_mut().ok_or("engine")?;
            let two = model == "2";
            let v = rf.vocals(&left, &right, &cancel, &mut |f| emit(if two { f } else { f * 0.45 }))?;
            write_part(&dir.join("vocals.f32"), &v[0], &v[1])?;
            let mut l = left.clone(); let mut r = right.clone();
            for i in 0..total { l[i] -= v[0][i]; r[i] -= v[1][i]; }
            if two {
                write_part(&dir.join("other.f32"), &l, &r)?;
                let mut files = std::collections::HashMap::new();
                for p in ["vocals", "other"] { files.insert(p.to_string(), dir.join(format!("{p}.f32")).to_string_lossy().to_string()); }
                return Ok(RunResult { files, stems: 2, total, threads, vocals: "roformer".into() });
            }
            inl = Some(l); inr = Some(r); vocals_src = "roformer".into();
        }
        let mut eng = engine.lock().map_err(|_| "lock")?;
        if eng.as_ref().map(|(m, _)| m != rel).unwrap_or(true) {
            let bytes = model_bytes(&app2, rel)?;
            *eng = Some((rel.to_string(), demucs::Demucs::new(&bytes, threads)?));
        }
        let (_, dm) = eng.as_mut().ok_or("engine")?;
        let rof = inl.is_some();
        let (l, r) = (inl.unwrap_or_else(|| left.clone()), inr.unwrap_or_else(|| right.clone()));
        if rof {
            let keep = std::fs::read(dir.join("vocals.f32")).map_err(|e| e.to_string())?;
            dm.separate(&l, &r, &dir, hq, &cancel, &mut |f| emit(0.45 + f * 0.55))?;
            std::fs::write(dir.join("vocals.f32"), keep).map_err(|e| e.to_string())?; // вокал — от RoFormer, остаток HTDemucs отбрасывается
        } else {
            dm.separate(&l, &r, &dir, hq, &cancel, &mut |f| emit(f))?;
        }
        let mut files = std::collections::HashMap::new();
        for p in demucs::parts_of(dm.stems) { files.insert(p.to_string(), dir.join(format!("{p}.f32")).to_string_lossy().to_string()); }
        Ok(RunResult { files, stems: dm.stems, total, threads, vocals: vocals_src })
    }).await.map_err(|e| e.to_string());
    st.busy.store(false, Ordering::Relaxed);
    res?
}

// Готовая дорожка кусками: part — имя, off и len — в байтах (float32 LE, чередование L R)
#[tauri::command]
fn stems_read(app: AppHandle, part: String, off: usize, len: usize) -> Result<Response, String> {
    use std::io::{Read, Seek, SeekFrom};
    let safe: String = part.chars().filter(|c| c.is_ascii_alphanumeric()).collect();
    let mut f = std::fs::File::open(out_dir(&app).join(format!("{safe}.f32"))).map_err(|e| e.to_string())?;
    f.seek(SeekFrom::Start(off as u64)).map_err(|e| e.to_string())?;
    let mut buf = vec![0u8; len];
    let mut got = 0;
    while got < len { let n = f.read(&mut buf[got..]).map_err(|e| e.to_string())?; if n == 0 { break; } got += n; }
    buf.truncate(got);
    Ok(Response::new(buf))
}

#[tauri::command]
fn stems_cancel(st: State<'_, Stems>) { st.cancel.store(true, Ordering::Relaxed); }

#[tauri::command]
fn stems_clean(app: AppHandle, st: State<'_, Stems>) {
    if let Ok(mut inp) = st.input.lock() { inp[0] = Vec::new(); inp[1] = Vec::new(); }
    let _ = std::fs::remove_dir_all(out_dir(&app));
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .manage(Stems::default())
        .manage(lyrics::Lyrics::default())
        .manage(localsend::LocalSend::default())
        .manage(denoise::Denoise::default())
        .on_permission_request(|_, kind| match kind {
            PermissionKind::Microphone | PermissionKind::Camera => PermissionResponse::Allow,
            _ => PermissionResponse::Default,
        })
        .invoke_handler(tauri::generate_handler![allow_dir, startup_files, stems_begin, stems_push, stems_run, stems_read, stems_cancel, stems_clean,
            lyrics::lyrics_supported, lyrics::lyrics_begin, lyrics::lyrics_push, lyrics::lyrics_run, lyrics::lyrics_cancel, lyrics::lyrics_clean,
            localsend::localsend_start, localsend::localsend_stop, localsend::localsend_status, localsend::localsend_answer,
            denoise::denoise_begin, denoise::denoise_push, denoise::denoise_run, denoise::denoise_read, denoise::denoise_cancel, denoise::denoise_clean])
        .run(tauri::generate_context!())
        .expect("Melete: не удалось запустить окно");
}
