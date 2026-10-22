// Связь с телефоном: синхронизация Melete на телефоне и на компьютере в одной сети Wi-Fi (Windows — сервер, телефон —
// клиент; веб-часть — src/core/sync.js). Здесь только посредник: HTTP-сервер на порту 53319 принимает запрос телефона,
// отдаёт его окну приложения (событие sync-req: номер, метод, путь, заголовок с ключом), тело окно читает командой
// sync_body, ответ отдаёт командой sync_reply — и сервер возвращает его телефону. Решает всё окно (src/core/sync.js):
// проверка ключа, слияние данных, файлы кусками. Сервер включается кнопкой в настройках (сеть — только по воле
// человека), живёт, пока открыто окно; без шифрования — только своя сеть, доступ — по коду сопряжения и ключу.
use std::collections::HashMap;
use std::io::Read;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::Serialize;
use tauri::ipc::{InvokeBody, Request, Response};
use tauri::{AppHandle, Emitter, State};

pub const PORT: u16 = 53319;
const MAX_BODY: u64 = 32 << 20; // один запрос — до 32 МБ (файлы идут кусками по 4 МБ)

type Reply = (u16, String, Vec<u8>); // статус, тип, тело

#[derive(Default)]
pub struct SyncSrv {
    on: Arc<AtomicBool>,
    next: Arc<AtomicU64>,
    bodies: Arc<Mutex<HashMap<u64, Vec<u8>>>>,
    waits: Arc<Mutex<HashMap<u64, mpsc::Sender<Reply>>>>,
}

#[derive(Serialize, Clone)]
struct Req { rid: u64, method: String, url: String, key: String, len: usize }

#[derive(Serialize, Clone)]
pub struct Status { pub on: bool, pub port: u16, pub ips: Vec<String>, pub name: String }

fn local_ips() -> Vec<String> {
    let mut out = Vec::new();
    if let Ok(list) = local_ip_address::list_afinet_netifas() {
        for (_, ip) in list { if let std::net::IpAddr::V4(v4) = ip { if !v4.is_loopback() && !v4.is_link_local() { out.push(v4.to_string()); } } }
    }
    out
}
fn host_name() -> String { std::env::var("COMPUTERNAME").unwrap_or_else(|_| "PC".into()) }

fn resp(code: u16, ctype: &str, body: Vec<u8>) -> tiny_http::Response<std::io::Cursor<Vec<u8>>> {
    let mut r = tiny_http::Response::from_data(body).with_status_code(code);
    if let Ok(h) = tiny_http::Header::from_bytes(&b"Content-Type"[..], ctype.as_bytes()) { r.add_header(h); }
    r
}

fn handle(app: AppHandle, on: Arc<AtomicBool>, next: Arc<AtomicU64>, bodies: Arc<Mutex<HashMap<u64, Vec<u8>>>>, waits: Arc<Mutex<HashMap<u64, mpsc::Sender<Reply>>>>, mut req: tiny_http::Request) {
    let url = req.url().to_string();
    let method = req.method().as_str().to_string();
    // знакомство — без ключа: телефон проверяет, что по адресу Melete, и узнаёт имя компьютера
    if url.starts_with("/melete/v1/hello") {
        let body = serde_json::json!({ "app": "melete", "v": 1, "name": host_name() }).to_string().into_bytes();
        let _ = req.respond(resp(200, "application/json", body));
        return;
    }
    if !url.starts_with("/melete/v1/") || !on.load(Ordering::Relaxed) { let _ = req.respond(resp(404, "text/plain", Vec::new())); return; }
    let key = req.headers().iter().find(|h| h.field.equiv("X-Melete-Key")).map(|h| h.value.as_str().to_string()).unwrap_or_default();
    let mut body = Vec::new();
    if req.as_reader().take(MAX_BODY).read_to_end(&mut body).is_err() { let _ = req.respond(resp(400, "text/plain", Vec::new())); return; }
    let rid = next.fetch_add(1, Ordering::Relaxed) + 1;
    let (tx, rx) = mpsc::channel::<Reply>();
    let len = body.len();
    if let Ok(mut b) = bodies.lock() { b.insert(rid, body); }
    if let Ok(mut w) = waits.lock() { w.insert(rid, tx); }
    let _ = app.emit("sync-req", Req { rid, method, url, key, len });
    // окно отвечает обычно за доли секунды; слияние большой истории — несколько секунд
    let out = rx.recv_timeout(Duration::from_secs(120)).unwrap_or((504, "text/plain".into(), Vec::new()));
    if let Ok(mut b) = bodies.lock() { b.remove(&rid); }
    if let Ok(mut w) = waits.lock() { w.remove(&rid); }
    let _ = req.respond(resp(out.0, &out.1, out.2));
}

fn serve(app: AppHandle, on: Arc<AtomicBool>, next: Arc<AtomicU64>, bodies: Arc<Mutex<HashMap<u64, Vec<u8>>>>, waits: Arc<Mutex<HashMap<u64, mpsc::Sender<Reply>>>>) {
    let server = match tiny_http::Server::http(("0.0.0.0", PORT)) { Ok(s) => s, Err(e) => { let _ = app.emit("sync-error", e.to_string()); on.store(false, Ordering::Relaxed); return; } };
    while on.load(Ordering::Relaxed) {
        let req = match server.recv_timeout(Duration::from_millis(500)) { Ok(Some(r)) => r, Ok(None) => continue, Err(_) => break };
        let (a, o, n, b, w) = (app.clone(), on.clone(), next.clone(), bodies.clone(), waits.clone());
        std::thread::spawn(move || handle(a, o, n, b, w, req));
    }
}

#[tauri::command]
pub fn sync_start(app: AppHandle, st: State<'_, SyncSrv>) -> Status {
    if !st.on.swap(true, Ordering::Relaxed) {
        let (o, n, b, w) = (st.on.clone(), st.next.clone(), st.bodies.clone(), st.waits.clone());
        std::thread::spawn(move || serve(app, o, n, b, w));
    }
    sync_status(st)
}
#[tauri::command]
pub fn sync_stop(st: State<'_, SyncSrv>) {
    st.on.store(false, Ordering::Relaxed);
    if let Ok(mut w) = st.waits.lock() { for (_, tx) in w.drain() { let _ = tx.send((503, "text/plain".into(), Vec::new())); } }
}
// Адреса компьютера в сети и его имя — и для раздачи гостям (guest.rs)
pub fn sync_status_plain() -> (Vec<String>, String) { (local_ips(), host_name()) }
#[tauri::command]
pub fn sync_status(st: State<'_, SyncSrv>) -> Status { Status { on: st.on.load(Ordering::Relaxed), port: PORT, ips: local_ips(), name: host_name() } }

// Тело запроса rid — окну (двоичное, без base64)
#[tauri::command]
pub fn sync_body(st: State<'_, SyncSrv>, rid: u64) -> Response {
    let b = st.bodies.lock().ok().and_then(|m| m.get(&rid).cloned()).unwrap_or_default();
    Response::new(b)
}
// Ответ окна на запрос: тело — сырые байты, номер, статус и тип — в заголовках
#[tauri::command]
pub fn sync_reply(st: State<'_, SyncSrv>, request: Request<'_>) -> Result<(), String> {
    let h = request.headers();
    let get = |k: &str| h.get(k).and_then(|v| v.to_str().ok()).unwrap_or("").to_string();
    let rid: u64 = get("rid").parse().map_err(|_| "rid")?;
    let code: u16 = get("status").parse().unwrap_or(200);
    let ctype = { let c = get("ctype"); if c.is_empty() { "application/json".to_string() } else { c } };
    let body = match request.body() { InvokeBody::Raw(b) => b.clone(), InvokeBody::Json(v) => v.to_string().into_bytes() };
    if let Ok(mut w) = st.waits.lock() { if let Some(tx) = w.remove(&rid) { let _ = tx.send((code, ctype, body)); } }
    Ok(())
}
