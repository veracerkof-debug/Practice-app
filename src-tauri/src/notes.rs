// Ноты со слуха на компьютере — YourMT3+ (Chang и др., 2024; код GPL-3.0, веса Apache-2.0): кодировщик Perceiver-TF
// со смесью экспертов и многоканальный T5 — 13 групп инструментов (рояль, гитара, бас, струнные, голос…) и ударные
// за один проход. Две модели ONNX рядом с программой (bundle.resources → models/ymt/, экспорт — build/ymt/export.py):
// ymt_enc.onnx — волна 16 кГц кусками по 32767 отсчётов → ключи и значения перекрёстного внимания всех слоёв;
// ymt_dec.onnx — один шаг декодера: токен строки + кеш [P,L,2,N,H,DK] (позиции снаружи: шаг дописывается в конец).
// Жадный разбор пачками по B кусков, закончившие строки (токен EOS) выбывают из пачки. Выход — токены
// [кусок][канал][…]; в ноты их переводит веб-часть (src/music/mt3.js), адаптер — src/audio/ymt.js. Сверено с
// оригиналом токен в токен (build/ymt/check.py).
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use ort::session::{builder::GraphOptimizationLevel, Session};
use ort::value::{Tensor, TensorRef};
use serde::Serialize;
use tauri::ipc::{InvokeBody, Request};
use tauri::{AppHandle, Emitter, State};

pub const ENC: &str = "models/ymt/ymt_enc.onnx";
pub const DEC: &str = "models/ymt/ymt_dec.onnx";
pub const SEG: usize = 32767;
const K: usize = 13; // каналов (групп инструментов)
const L: usize = 8; // слоёв декодера
const H: usize = 6;
const DK: usize = 64;
const MAXLEN: usize = 1024;
const EOS: i64 = 1;
const B: usize = 4; // кусков в пачке

#[derive(Default)]
pub struct Notes {
    input: Mutex<Vec<f32>>,
    cancel: Arc<AtomicBool>,
    busy: Arc<AtomicBool>,
    eng: Arc<Mutex<Option<Ymt>>>,
}

#[derive(Serialize, Clone)]
struct Progress { f: f64 }
#[derive(Serialize)]
pub struct Out { tokens: Vec<Vec<Vec<u16>>>, threads: usize, secs: f64 }

pub struct Ymt { enc: Session, dec: Session }

fn session(path: &PathBuf, threads: usize) -> Result<Session, String> {
    let env = crate::ort_env()?;
    let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
    Session::builder(env).map_err(|e| e.to_string())?
        .with_intra_threads(threads.max(1)).map_err(|e| e.to_string())?
        .with_inter_threads(1).map_err(|e| e.to_string())?
        .with_optimization_level(GraphOptimizationLevel::Level3).map_err(|e| e.to_string())?
        .commit_from_memory(&bytes).map_err(|e| e.to_string())
}

// Оставить строки keep (по старому номеру) в буфере вида [внешние…, n, блок]: outer — сколько внешних срезов
fn compact(buf: &[f32], outer: usize, n: usize, block: usize, keep: &[usize]) -> Vec<f32> {
    let mut o = Vec::with_capacity(outer * keep.len() * block);
    for p in 0..outer {
        let base = p * n * block;
        for &j in keep { o.extend_from_slice(&buf[base + j * block..base + (j + 1) * block]); }
    }
    o
}

impl Ymt {
    pub fn new(enc: &PathBuf, dec: &PathBuf, threads: usize) -> Result<Ymt, String> {
        Ok(Ymt { enc: session(enc, threads)?, dec: session(dec, threads)? })
    }

    // Пачка кусков (по SEG отсчётов подряд) → токены [кусок][канал]
    pub fn batch(&mut self, wave: &[f32], cancel: &AtomicBool, progress: &mut dyn FnMut(f64)) -> Result<Vec<Vec<Vec<u16>>>, String> {
        let b = wave.len() / SEG;
        let t = Tensor::<f32>::from_array((vec![b, 1, SEG], wave.to_vec())).map_err(|e| e.to_string())?;
        let res = self.enc.run(ort::inputs!["wave" => t]).map_err(|e| e.to_string())?;
        let (shape, data) = res["cross"].try_extract_tensor::<f32>().map_err(|e| e.to_string())?;
        let tt = shape[4] as usize; // кадров кодировщика (110)
        let rows = b * K;
        let mut cross: Vec<f32> = data.to_vec(); // [L,2,n,H,T,DK]
        drop(res);
        let mut out: Vec<Vec<u16>> = vec![Vec::new(); rows];
        let mut alive: Vec<usize> = (0..rows).collect();
        let mut cache: Vec<f32> = Vec::new(); // [P,L,2,n,H,DK]
        let mut ids: Vec<i64> = vec![0; rows];
        let kvb = H * DK; // блок строки в кеше
        let cb = H * tt * DK; // блок строки в перекрёстном
        for step in 0..MAXLEN - 1 {
            if cancel.load(Ordering::Relaxed) { return Err("cancel".into()); }
            let n = alive.len();
            let p = step;
            let (next, kv) = {
                let ti = TensorRef::from_array_view(([n, 1usize], &ids[..])).map_err(|e| e.to_string())?;
                let tp = TensorRef::from_array_view(([p, L, 2, n, H, DK], &cache[..])).map_err(|e| e.to_string())?;
                let tc = TensorRef::from_array_view(([L, 2, n, H, tt, DK], &cross[..])).map_err(|e| e.to_string())?;
                let r = self.dec.run(ort::inputs!["ids" => ti, "past" => tp, "cross" => tc]).map_err(|e| e.to_string())?;
                let (_, nx) = r["next"].try_extract_tensor::<i64>().map_err(|e| e.to_string())?;
                let (_, kv) = r["kv"].try_extract_tensor::<f32>().map_err(|e| e.to_string())?;
                (nx.to_vec(), kv.to_vec())
            };
            cache.extend_from_slice(&kv);
            for (j, &a) in alive.iter().enumerate() { out[a].push(next[j].clamp(0, u16::MAX as i64) as u16); }
            let keep: Vec<usize> = (0..n).filter(|&j| next[j] != EOS).collect();
            if keep.is_empty() { break; }
            if keep.len() < n {
                cache = compact(&cache, (p + 1) * L * 2, n, kvb, &keep);
                cross = compact(&cross, L * 2, n, cb, &keep);
                alive = keep.iter().map(|&j| alive[j]).collect();
                ids = keep.iter().map(|&j| next[j]).collect();
            } else {
                ids = next;
            }
            progress(1.0 - alive.len() as f64 / rows as f64);
        }
        Ok((0..b).map(|s| out[s * K..(s + 1) * K].to_vec()).collect())
    }
}

pub fn paths(app: &AppHandle) -> Option<(PathBuf, PathBuf)> {
    Some((crate::res_path(app, ENC)?, crate::res_path(app, DEC)?))
}

#[tauri::command]
pub fn notes_supported(app: AppHandle) -> bool { paths(&app).is_some() }

#[tauri::command]
pub fn notes_begin(st: State<'_, Notes>) -> Result<(), String> {
    if st.busy.load(Ordering::Relaxed) { return Err("busy".into()); }
    st.input.lock().map_err(|_| "lock")?.clear();
    st.cancel.store(false, Ordering::Relaxed);
    Ok(())
}

// Кусок звука: тело запроса — float32 LE, 16 кГц моно
#[tauri::command]
pub fn notes_push(st: State<'_, Notes>, request: Request<'_>) -> Result<(), String> {
    let bytes = match request.body() { InvokeBody::Raw(b) => b, _ => return Err("raw body expected".into()) };
    let mut inp = st.input.lock().map_err(|_| "lock")?;
    inp.reserve(bytes.len() / 4);
    for c in bytes.chunks_exact(4) { inp.push(f32::from_le_bytes([c[0], c[1], c[2], c[3]])); }
    Ok(())
}

#[tauri::command]
pub async fn notes_run(app: AppHandle, st: State<'_, Notes>) -> Result<Out, String> {
    if st.busy.swap(true, Ordering::Relaxed) { return Err("busy".into()); }
    let (enc, dec) = match paths(&app) { Some(p) => p, None => { st.busy.store(false, Ordering::Relaxed); return Err("no model".into()); } };
    let cancel = st.cancel.clone();
    let threads = crate::work_threads();
    let mut pcm = { let inp = st.input.lock().map_err(|_| "lock")?; inp.clone() };
    let eng = st.eng.clone();
    let app2 = app.clone();
    let res = tauri::async_runtime::spawn_blocking(move || -> Result<Out, String> {
        let t0 = std::time::Instant::now();
        let mut g = eng.lock().map_err(|_| "lock")?;
        if g.is_none() { *g = Some(Ymt::new(&enc, &dec, threads)?); }
        let ymt = g.as_mut().ok_or("engine")?;
        let n = pcm.len().div_ceil(SEG).max(1);
        pcm.resize(n * SEG, 0.0);
        let mut tokens = Vec::with_capacity(n);
        let mut last = -1.0;
        for s0 in (0..n).step_by(B) {
            let b = B.min(n - s0);
            let mut emit = |f: f64| { let v = (s0 as f64 + b as f64 * f) / n as f64; if v - last >= 0.005 { last = v; let _ = app2.emit("notes-progress", Progress { f: v }); } };
            tokens.extend(ymt.batch(&pcm[s0 * SEG..(s0 + b) * SEG], &cancel, &mut emit)?);
        }
        Ok(Out { tokens, threads, secs: t0.elapsed().as_secs_f64() })
    }).await.map_err(|e| e.to_string());
    st.busy.store(false, Ordering::Relaxed);
    res?
}

#[tauri::command]
pub fn notes_cancel(st: State<'_, Notes>) { st.cancel.store(true, Ordering::Relaxed); }

// Освободить память: звук и модели (≈ 0,5 ГБ) — после разбора
#[tauri::command]
pub fn notes_clean(st: State<'_, Notes>) {
    if st.busy.load(Ordering::Relaxed) { return; }
    if let Ok(mut i) = st.input.lock() { i.clear(); i.shrink_to_fit(); }
    if let Ok(mut e) = st.eng.lock() { *e = None; }
}

#[cfg(test)]
mod tests {
    use super::*;
    // Прогон на настоящих моделях: YMT_DIR — папка с ymt_enc.onnx и ymt_dec.onnx, YMT_WAV — сырой float32 16 кГц;
    // печатает токены в JSON для сверки с оригиналом (build/ymt/check.py). Без переменных — пропуск.
    #[test]
    fn ymt_tokens() {
        let (Ok(dir), Ok(wav)) = (std::env::var("YMT_DIR"), std::env::var("YMT_WAV")) else { return; };
        let dir = PathBuf::from(dir);
        let raw = std::fs::read(wav).unwrap();
        let mut pcm: Vec<f32> = raw.chunks_exact(4).map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]])).collect();
        let n = pcm.len().div_ceil(SEG).max(1);
        pcm.resize(n * SEG, 0.0);
        let mut y = Ymt::new(&dir.join("ymt_enc.onnx"), &dir.join("ymt_dec.onnx"), 4).unwrap();
        let t0 = std::time::Instant::now();
        let mut all = Vec::new();
        for s0 in (0..n).step_by(B) {
            let b = B.min(n - s0);
            all.extend(y.batch(&pcm[s0 * SEG..(s0 + b) * SEG], &AtomicBool::new(false), &mut |_| {}).unwrap());
        }
        eprintln!("secs {:.1}", t0.elapsed().as_secs_f64());
        std::fs::write(dir.join("rust_tokens.json"), serde_json::to_string(&all).unwrap()).unwrap();
    }
}
