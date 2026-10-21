// Текст песни из записи — whisper.cpp (OpenAI Whisper, MIT) нативно, модель large-v3-turbo (q5_0, 574 МБ) лежит
// рядом с программой (bundle.resources → models/whisper/). Вход — 16 кГц моно float32 (лучше отделённый вокал,
// src/core/jobs.js), выход — отрезки с временем и токены с временем (строки режет веб-часть, src/audio/lyrics.js).
// Для песен важно: no_context (иначе модель зацикливается на повторах), подавление неречевых токенов, без перевода.
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use serde::Serialize;
use tauri::ipc::{InvokeBody, Request};
use tauri::{AppHandle, Emitter, State};
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

pub const MODEL: &str = "models/whisper/ggml-large-v3-turbo-q5_0.bin";

#[derive(Default)]
pub struct Lyrics {
    input: Mutex<Vec<f32>>,
    cancel: Arc<AtomicBool>,
    busy: Arc<AtomicBool>,
    ctx: Arc<Mutex<Option<WhisperContext>>>,
}

#[derive(Serialize, Clone)]
struct Progress { f: f64 }
#[derive(Serialize)]
pub struct Tok { t0: f64, t1: f64, p: f32, text: String }
#[derive(Serialize)]
pub struct Seg { t0: f64, t1: f64, text: String, tokens: Vec<Tok> }
#[derive(Serialize)]
pub struct Out { lang: String, segments: Vec<Seg>, threads: usize }

// Файл модели: в установленной программе — папка ресурсов; в разработке — src-tauri/models/ на диске
pub fn model_path(app: &AppHandle) -> Option<PathBuf> { crate::res_path(app, MODEL) }

#[tauri::command]
pub fn lyrics_supported(app: AppHandle) -> bool { model_path(&app).is_some() }

#[tauri::command]
pub fn lyrics_begin(st: State<'_, Lyrics>) -> Result<(), String> {
    if st.busy.load(Ordering::Relaxed) { return Err("busy".into()); }
    st.input.lock().map_err(|_| "lock")?.clear();
    st.cancel.store(false, Ordering::Relaxed);
    Ok(())
}

// Кусок звука: тело запроса — float32 LE, 16 кГц моно
#[tauri::command]
pub fn lyrics_push(st: State<'_, Lyrics>, request: Request<'_>) -> Result<(), String> {
    let bytes = match request.body() { InvokeBody::Raw(b) => b, _ => return Err("raw body expected".into()) };
    let mut inp = st.input.lock().map_err(|_| "lock")?;
    inp.reserve(bytes.len() / 4);
    for c in bytes.chunks_exact(4) { inp.push(f32::from_le_bytes([c[0], c[1], c[2], c[3]])); }
    Ok(())
}

#[tauri::command]
pub async fn lyrics_run(app: AppHandle, st: State<'_, Lyrics>, lang: Option<String>) -> Result<Out, String> {
    if st.busy.swap(true, Ordering::Relaxed) { return Err("busy".into()); }
    let path = match model_path(&app) { Some(p) => p, None => { st.busy.store(false, Ordering::Relaxed); return Err("no model".into()); } };
    let cancel = st.cancel.clone();
    let threads = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4).min(16);
    let pcm = { let inp = st.input.lock().map_err(|_| "lock")?; inp.clone() };
    let ctx = st.ctx.clone();
    let app2 = app.clone();
    let res = tauri::async_runtime::spawn_blocking(move || -> Result<Out, String> {
        let mut g = ctx.lock().map_err(|_| "lock")?;
        if g.is_none() {
            let mut cp = WhisperContextParameters::default();
            cp.use_gpu(false);
            *g = Some(WhisperContext::new_with_params(path.to_string_lossy().as_ref(), cp).map_err(|e| e.to_string())?);
        }
        let wc = g.as_ref().ok_or("ctx")?;
        let mut state = wc.create_state().map_err(|e| e.to_string())?;
        let mut p = FullParams::new(SamplingStrategy::BeamSearch { beam_size: 5, patience: -1.0 });
        let lang_s = lang.filter(|l| !l.is_empty() && l != "auto");
        p.set_language(lang_s.as_deref());
        p.set_detect_language(false);
        p.set_translate(false);
        p.set_no_context(true);
        p.set_token_timestamps(true);
        p.set_suppress_blank(true);
        p.set_suppress_nst(true);
        p.set_print_special(false); p.set_print_progress(false); p.set_print_realtime(false); p.set_print_timestamps(false);
        p.set_n_threads(threads as i32);
        let c2 = cancel.clone();
        p.set_abort_callback_safe(move || c2.load(Ordering::Relaxed));
        let a3 = app2.clone();
        let mut last = -1;
        p.set_progress_callback_safe(move |pc: i32| { if pc != last { last = pc; let _ = a3.emit("lyrics-progress", Progress { f: pc as f64 / 100.0 }); } });
        state.full(p, &pcm).map_err(|e| e.to_string())?;
        if cancel.load(Ordering::Relaxed) { return Err("cancel".into()); }
        let lang_id = state.full_lang_id_from_state();
        let lang = whisper_rs::get_lang_str(lang_id).unwrap_or("").to_string();
        let mut segments = Vec::new();
        for s in state.as_iter() {
            let text = s.to_str_lossy().map(|c| c.to_string()).unwrap_or_default();
            let mut tokens = Vec::new();
            for i in 0..s.n_tokens() {
                if let Some(tk) = s.get_token(i) {
                    let tt = tk.to_str_lossy().map(|c| c.to_string()).unwrap_or_default();
                    if tt.starts_with("[_") && tt.ends_with(']') { continue; } // служебные ([_BEG_], [_TT_…])
                    let d = tk.token_data();
                    tokens.push(Tok { t0: d.t0 as f64 / 100.0, t1: d.t1 as f64 / 100.0, p: d.p, text: tt });
                }
            }
            segments.push(Seg { t0: s.start_timestamp() as f64 / 100.0, t1: s.end_timestamp() as f64 / 100.0, text: text.trim().to_string(), tokens });
        }
        Ok(Out { lang, segments, threads })
    }).await.map_err(|e| e.to_string());
    st.busy.store(false, Ordering::Relaxed);
    res?
}

#[tauri::command]
pub fn lyrics_cancel(st: State<'_, Lyrics>) { st.cancel.store(true, Ordering::Relaxed); }

#[tauri::command]
pub fn lyrics_clean(st: State<'_, Lyrics>) { if let Ok(mut inp) = st.input.lock() { *inp = Vec::new(); } }
