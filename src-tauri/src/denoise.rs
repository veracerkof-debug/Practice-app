// Шумоподавление записи — DeepFilterNet3 (Hendrik Schröter и др., MIT/Apache-2.0; крейт deep_filter, модель внутри
// крейта, tract) нативно на компьютере (Windows). Вход — 48 кГц моно float32 кусками (как у текста песни), выход —
// файл float32 в кэше, читается кусками (denoise_read). Сила: предел ослабления шума в дБ (atten: 100 — без предела,
// модель как есть; 12…30 — мягче, часть шума остаётся, голос естественнее). Запись не теряется: исходник в медиатеке
// остаётся, очищенная — рядом новым файлом (src/core/jobs.js).
use std::io::{Read, Seek, SeekFrom};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use serde::Serialize;
use tauri::ipc::{InvokeBody, Request, Response};
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Default)]
pub struct Denoise {
    input: Mutex<Vec<f32>>,
    cancel: Arc<AtomicBool>,
    busy: Arc<AtomicBool>,
}

#[derive(Serialize, Clone)]
struct Progress { f: f64 }
#[derive(Serialize)]
pub struct Out { total: usize, sr: usize }

fn out_path(app: &AppHandle) -> PathBuf { app.path().app_cache_dir().unwrap_or_else(|_| std::env::temp_dir()).join("denoise.f32") }

#[tauri::command]
pub fn denoise_begin(st: State<'_, Denoise>) -> Result<(), String> {
    if st.busy.load(Ordering::Relaxed) { return Err("busy".into()); }
    st.input.lock().map_err(|_| "lock")?.clear();
    st.cancel.store(false, Ordering::Relaxed);
    Ok(())
}
// Кусок звука: тело запроса — float32 LE, 48 кГц моно
#[tauri::command]
pub fn denoise_push(st: State<'_, Denoise>, request: Request<'_>) -> Result<(), String> {
    let bytes = match request.body() { InvokeBody::Raw(b) => b, _ => return Err("raw body expected".into()) };
    let mut inp = st.input.lock().map_err(|_| "lock")?;
    inp.reserve(bytes.len() / 4);
    for c in bytes.chunks_exact(4) { inp.push(f32::from_le_bytes([c[0], c[1], c[2], c[3]])); }
    Ok(())
}

#[tauri::command]
pub async fn denoise_run(app: AppHandle, st: State<'_, Denoise>, atten: Option<f32>) -> Result<Out, String> {
    if st.busy.swap(true, Ordering::Relaxed) { return Err("busy".into()); }
    let cancel = st.cancel.clone();
    let x = { let inp = st.input.lock().map_err(|_| "lock")?; inp.clone() };
    let path = out_path(&app);
    let app2 = app.clone();
    let res = tauri::async_runtime::spawn_blocking(move || -> Result<Out, String> {
        use df::tract::{DfParams, DfTract, RuntimeParams};
        use ndarray::Array2;
        let mut rp = RuntimeParams::default_with_ch(1);
        if let Some(a) = atten { if a > 0.0 && a < 100.0 { rp = rp.with_atten_lim(a); } }
        let mut m = DfTract::new(DfParams::default(), &rp).map_err(|e| e.to_string())?;
        let hop = m.hop_size;
        let sr = m.sr;
        let n = x.len();
        let frames = (n + hop - 1) / hop;
        let mut out = Vec::with_capacity(frames * hop);
        let mut buf = vec![0f32; hop];
        let mut last = -1.0;
        for f in 0..frames {
            if f % 50 == 0 && cancel.load(Ordering::Relaxed) { return Err("cancel".into()); }
            buf.fill(0.0);
            let s = f * hop; let e = (s + hop).min(n);
            buf[..e - s].copy_from_slice(&x[s..e]);
            let inp = Array2::from_shape_vec((1, hop), buf.clone()).map_err(|e| e.to_string())?;
            let mut enh = Array2::<f32>::zeros((1, hop));
            m.process(inp.view(), enh.view_mut()).map_err(|e| e.to_string())?;
            out.extend_from_slice(enh.as_slice().ok_or("shape")?);
            let p = (f + 1) as f64 / frames as f64;
            if p - last >= 0.01 { last = p; let _ = app2.emit("denoise-progress", Progress { f: p }); }
        }
        out.truncate(n);
        let mut bytes = Vec::with_capacity(n * 4);
        for v in &out { bytes.extend_from_slice(&v.to_le_bytes()); }
        std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
        Ok(Out { total: n, sr })
    }).await.map_err(|e| e.to_string());
    st.busy.store(false, Ordering::Relaxed);
    res?
}
// Результат кусками: off и len — в байтах (float32 LE, моно)
#[tauri::command]
pub fn denoise_read(app: AppHandle, off: usize, len: usize) -> Result<Response, String> {
    let mut f = std::fs::File::open(out_path(&app)).map_err(|e| e.to_string())?;
    f.seek(SeekFrom::Start(off as u64)).map_err(|e| e.to_string())?;
    let mut buf = vec![0u8; len];
    let mut got = 0;
    while got < len { let n = f.read(&mut buf[got..]).map_err(|e| e.to_string())?; if n == 0 { break; } got += n; }
    buf.truncate(got);
    Ok(Response::new(buf))
}
#[tauri::command]
pub fn denoise_cancel(st: State<'_, Denoise>) { st.cancel.store(true, Ordering::Relaxed); }
#[tauri::command]
pub fn denoise_clean(app: AppHandle, st: State<'_, Denoise>) { if let Ok(mut inp) = st.input.lock() { *inp = Vec::new(); } let _ = std::fs::remove_file(out_path(&app)); }
