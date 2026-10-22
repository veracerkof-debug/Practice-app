// Раздача в своей сети (docs/guest-web.md): гости в той же сети Wi-Fi открывают в браузере адрес компьютера (или
// QR-код) и видят песни, тексты, аккорды и сет-лист, слушают записи — только чтение. Отдельный сервер на порту 53320,
// с синхронизацией (sync.rs) не связан: ключей синхронизации гость не видит.
// Rust отдаёт сам: гостевую страницу из встроенных файлов программы (guest.html, assets/…), записи — из своего кэша с
// перемоткой (HTTP Range — без неё Safari на iPhone не играет), поток «лидер переключил песню» (долгий опрос: ответ,
// как только версия сменилась, или через 25 с). Остальное (что раздавать, кто допущен) решает окно (src/core/guest.js):
// запрос уходит событием guest-req, ответ — командой guest_reply. Допущенных гостей окно сообщает guest_allow —
// записи и поток без окна отдаются только им.
use std::collections::{HashMap, HashSet, VecDeque};
use std::io::Read;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc;
use std::sync::{Arc, Condvar, Mutex};
use std::time::Duration;

use serde::Serialize;
use tauri::ipc::{InvokeBody, Request};
use tauri::{AppHandle, Emitter, State};

pub const PORT: u16 = 53320;
const MAX_BODY: u64 = 64 << 10; // гость шлёт только короткие запросы
const AUDIO_KEEP: usize = 4; // записей в кэше: гости слушают по одной песне, лидер ведёт всех к одной

type Reply = (u16, String, Vec<u8>, bool); // статус, тип, тело, положить в кэш записей

#[derive(Default)]
struct Live { ver: u64, json: String }

#[derive(Default)]
pub struct GuestSrv {
    on: Arc<AtomicBool>,
    next: Arc<AtomicU64>,
    waits: Arc<Mutex<HashMap<u64, mpsc::Sender<Reply>>>>,
    allowed: Arc<Mutex<HashSet<String>>>,
    live: Arc<(Mutex<Live>, Condvar)>,
    audio: Arc<Mutex<VecDeque<(String, Arc<Vec<u8>>, String)>>>,
}

#[derive(Clone)]
struct Shared {
    app: AppHandle,
    on: Arc<AtomicBool>,
    next: Arc<AtomicU64>,
    waits: Arc<Mutex<HashMap<u64, mpsc::Sender<Reply>>>>,
    allowed: Arc<Mutex<HashSet<String>>>,
    live: Arc<(Mutex<Live>, Condvar)>,
    audio: Arc<Mutex<VecDeque<(String, Arc<Vec<u8>>, String)>>>,
}

#[derive(Serialize, Clone)]
struct Req { rid: u64, method: String, path: String, query: String, body: String }

#[derive(Serialize, Clone)]
pub struct Status { pub on: bool, pub port: u16, pub ips: Vec<String>, pub name: String }

fn header(k: &str, v: &str) -> Option<tiny_http::Header> { tiny_http::Header::from_bytes(k.as_bytes(), v.as_bytes()).ok() }
fn resp(code: u16, ctype: &str, body: Vec<u8>) -> tiny_http::Response<std::io::Cursor<Vec<u8>>> {
    let mut r = tiny_http::Response::from_data(body).with_status_code(code);
    if let Some(h) = header("Content-Type", ctype) { r.add_header(h); }
    if let Some(h) = header("Cache-Control", "no-store") { r.add_header(h); }
    r
}
fn query_of(url: &str) -> HashMap<String, String> {
    let q = url.split_once('?').map(|x| x.1).unwrap_or("");
    q.split('&').filter_map(|kv| kv.split_once('=')).map(|(k, v)| (k.to_string(), percent_decode(v))).collect()
}
fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 3 <= b.len() {
            if let Ok(v) = u8::from_str_radix(std::str::from_utf8(&b[i + 1..i + 3]).unwrap_or("zz"), 16) { out.push(v); i += 3; continue; }
        }
        out.push(if b[i] == b'+' { b' ' } else { b[i] });
        i += 1;
    }
    String::from_utf8_lossy(&out).to_string()
}
// «bytes=a-b» → (начало, конец включительно) в пределах len
fn range_of(h: &str, len: usize) -> Option<(usize, usize)> {
    let r = h.trim().strip_prefix("bytes=")?;
    let (a, b) = r.split_once('-')?;
    if len == 0 { return None; }
    let (s, e) = if a.is_empty() { let n: usize = b.parse().ok()?; (len.saturating_sub(n), len - 1) } else {
        let s: usize = a.parse().ok()?;
        let e: usize = if b.is_empty() { len - 1 } else { b.parse::<usize>().ok()?.min(len - 1) };
        (s, e)
    };
    if s > e || s >= len { None } else { Some((s, e)) }
}
fn serve_audio(req: tiny_http::Request, data: Arc<Vec<u8>>, ctype: &str) {
    let range = req.headers().iter().find(|h| h.field.equiv("Range")).map(|h| h.value.as_str().to_string());
    let len = data.len();
    let (code, s, e) = match range.as_deref().and_then(|h| range_of(h, len)) { Some((s, e)) => (206, s, e), None => (200, 0, len.saturating_sub(1)) };
    let body = if len == 0 { Vec::new() } else { data[s..=e].to_vec() };
    let mut r = resp(code, ctype, body);
    if let Some(h) = header("Accept-Ranges", "bytes") { r.add_header(h); }
    if code == 206 { if let Some(h) = header("Content-Range", &format!("bytes {}-{}/{}", s, e, len)) { r.add_header(h); } }
    let _ = req.respond(r);
}
// Гостевая страница и её файлы — из встроенных в программу (только они, не основное приложение)
fn serve_static(sh: &Shared, req: tiny_http::Request, path: &str) {
    let p = if path == "/" || path.is_empty() { "/guest.html" } else { path };
    let okp = p == "/guest.html" || p.starts_with("/assets/") || p.starts_with("/guest/");
    let asset = if okp { sh.app.asset_resolver().get(p.to_string()) } else { None };
    match asset {
        Some(a) => { let _ = req.respond(resp(200, &a.mime_type, a.bytes)); }
        None => { let _ = req.respond(resp(404, "text/plain", Vec::new())); }
    }
}

fn handle(sh: Shared, mut req: tiny_http::Request) {
    let url = req.url().to_string();
    let path = url.split('?').next().unwrap_or("").to_string();
    if !path.starts_with("/g/v1/") { return serve_static(&sh, req, &path); }
    let q = query_of(&url);
    let gid = q.get("g").cloned().unwrap_or_default();
    let allowed = || sh.allowed.lock().map(|a| a.contains(&gid)).unwrap_or(false);
    // поток «лидер переключил песню»: долгий опрос, без окна
    if path == "/g/v1/live" {
        if !allowed() { let _ = req.respond(resp(401, "application/json", b"{}".to_vec())); return; }
        let since: u64 = q.get("since").and_then(|v| v.parse().ok()).unwrap_or(0);
        let (m, cv) = &*sh.live;
        let mut g = match m.lock() { Ok(g) => g, Err(_) => return };
        if g.ver <= since && sh.on.load(Ordering::Relaxed) {
            g = match cv.wait_timeout_while(g, Duration::from_secs(25), |l| l.ver <= since && sh.on.load(Ordering::Relaxed)) { Ok((g, _)) => g, Err(_) => return };
        }
        let body = format!("{{\"ver\":{},\"live\":{}}}", g.ver, if g.json.is_empty() { "null" } else { &g.json });
        drop(g);
        let _ = req.respond(resp(200, "application/json", body.into_bytes()));
        return;
    }
    // запись из кэша — без окна (перемотка шлёт много запросов подряд)
    if path == "/g/v1/audio" {
        if !allowed() { let _ = req.respond(resp(401, "text/plain", Vec::new())); return; }
        let key = q.get("id").cloned().unwrap_or_default();
        let hit = sh.audio.lock().ok().and_then(|c| c.iter().find(|x| x.0 == key).map(|x| (x.1.clone(), x.2.clone())));
        if let Some((data, ct)) = hit { return serve_audio(req, data, &ct); }
    }
    let mut body = Vec::new();
    if req.as_reader().take(MAX_BODY).read_to_end(&mut body).is_err() { let _ = req.respond(resp(400, "text/plain", Vec::new())); return; }
    let rid = sh.next.fetch_add(1, Ordering::Relaxed) + 1;
    let (tx, rx) = mpsc::channel::<Reply>();
    if let Ok(mut w) = sh.waits.lock() { w.insert(rid, tx); }
    let query = url.split_once('?').map(|x| x.1.to_string()).unwrap_or_default();
    let _ = sh.app.emit("guest-req", Req { rid, method: req.method().as_str().to_string(), path: path.clone(), query, body: String::from_utf8_lossy(&body).to_string() });
    let out = rx.recv_timeout(Duration::from_secs(60)).unwrap_or((504, "text/plain".into(), Vec::new(), false));
    if let Ok(mut w) = sh.waits.lock() { w.remove(&rid); }
    if out.3 && out.0 == 200 && path == "/g/v1/audio" {
        let key = q.get("id").cloned().unwrap_or_default();
        let data = Arc::new(out.2);
        if let Ok(mut c) = sh.audio.lock() {
            c.retain(|x| x.0 != key);
            c.push_back((key, data.clone(), out.1.clone()));
            while c.len() > AUDIO_KEEP { c.pop_front(); }
        }
        return serve_audio(req, data, &out.1);
    }
    let _ = req.respond(resp(out.0, &out.1, out.2));
}

fn serve(sh: Shared) {
    let server = match tiny_http::Server::http(("0.0.0.0", PORT)) { Ok(s) => s, Err(e) => { let _ = sh.app.emit("guest-error", e.to_string()); sh.on.store(false, Ordering::Relaxed); return; } };
    while sh.on.load(Ordering::Relaxed) {
        let req = match server.recv_timeout(Duration::from_millis(500)) { Ok(Some(r)) => r, Ok(None) => continue, Err(_) => break };
        let s = sh.clone();
        std::thread::spawn(move || handle(s, req));
    }
}

fn shared(app: AppHandle, st: &GuestSrv) -> Shared {
    Shared { app, on: st.on.clone(), next: st.next.clone(), waits: st.waits.clone(), allowed: st.allowed.clone(), live: st.live.clone(), audio: st.audio.clone() }
}

#[tauri::command]
pub fn guest_start(app: AppHandle, st: State<'_, GuestSrv>) -> Status {
    if !st.on.swap(true, Ordering::Relaxed) {
        let sh = shared(app, &st);
        std::thread::spawn(move || serve(sh));
    }
    guest_status(st)
}
#[tauri::command]
pub fn guest_stop(st: State<'_, GuestSrv>) {
    st.on.store(false, Ordering::Relaxed);
    if let Ok(mut w) = st.waits.lock() { for (_, tx) in w.drain() { let _ = tx.send((503, "text/plain".into(), Vec::new(), false)); } }
    if let Ok(mut a) = st.allowed.lock() { a.clear(); }
    if let Ok(mut c) = st.audio.lock() { c.clear(); }
    st.live.1.notify_all();
}
#[tauri::command]
pub fn guest_status(st: State<'_, GuestSrv>) -> Status {
    let s = crate::sync::sync_status_plain();
    Status { on: st.on.load(Ordering::Relaxed), port: PORT, ips: s.0, name: s.1 }
}
// Допущенные гости (номера) — им отдаются записи из кэша и поток
#[tauri::command]
pub fn guest_allow(st: State<'_, GuestSrv>, gids: Vec<String>) {
    if let Ok(mut a) = st.allowed.lock() { *a = gids.into_iter().collect(); }
}
// Новое состояние «что на экранах» — разбудить всех ждущих
#[tauri::command]
pub fn guest_live(st: State<'_, GuestSrv>, json: String) {
    let (m, cv) = &*st.live;
    if let Ok(mut g) = m.lock() { g.ver += 1; g.json = json; }
    cv.notify_all();
}
// Забыть записи в кэше (раздача записей выключена, песня удалена)
#[tauri::command]
pub fn guest_drop_audio(st: State<'_, GuestSrv>) { if let Ok(mut c) = st.audio.lock() { c.clear(); } }
// Ответ окна: тело — сырые байты; номер, статус, тип и «в кэш» — в заголовках
#[tauri::command]
pub fn guest_reply(st: State<'_, GuestSrv>, request: Request<'_>) -> Result<(), String> {
    let h = request.headers();
    let get = |k: &str| h.get(k).and_then(|v| v.to_str().ok()).unwrap_or("").to_string();
    let rid: u64 = get("rid").parse().map_err(|_| "rid")?;
    let code: u16 = get("status").parse().unwrap_or(200);
    let ctype = { let c = get("ctype"); if c.is_empty() { "application/json".to_string() } else { c } };
    let cache = get("cache") == "1";
    let body = match request.body() { InvokeBody::Raw(b) => b.clone(), InvokeBody::Json(v) => v.to_string().into_bytes() };
    if let Ok(mut w) = st.waits.lock() { if let Some(tx) = w.remove(&rid) { let _ = tx.send((code, ctype, body, cache)); } }
    Ok(())
}
