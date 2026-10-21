// Приём файлов с телефона по протоколу LocalSend (v2, открытый протокол: github.com/localsend/protocol) — Windows.
// Melete на компьютере объявляет себя в сети (multicast 224.0.0.167:53317) и принимает файлы по HTTP на том же порту:
// телефон с приложением LocalSend (или другим совместимым) видит «Melete на <компьютер>» и отправляет записи, табы,
// PDF и тексты — они ложатся в папку Melete по подпапкам (Media, Tabs, PDF, Lyrics; как folder.js), а синхронизация
// папки подхватывает их в медиатеку. Включается кнопкой в настройках (сеть — только по воле человека) и живёт, пока
// открыто окно; без шифрования (protocol: http — LocalSend это допускает в своей сети Wi-Fi), чужие сессии не
// принимаются без подтверждения: каждый запрос prepare-upload показывается в окне (событие localsend-ask), ответ —
// командой localsend_answer; PIN не поддерживается (403 на чужой PIN не нужен — спрашиваем человека).
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{Ipv4Addr, SocketAddrV4, UdpSocket};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};

pub const PORT: u16 = 53317;
const MCAST: Ipv4Addr = Ipv4Addr::new(224, 0, 0, 167);
const MAX_BYTES: u64 = 4 << 30; // одна передача — до 4 ГБ

#[derive(Default)]
pub struct LocalSend {
    on: Arc<AtomicBool>,
    alias: Mutex<String>,
    dir: Mutex<String>,
    fingerprint: Mutex<String>,
    // ожидающие подтверждения: sessionId → (ответчик, файлы)
    asks: Arc<Mutex<HashMap<String, std::sync::mpsc::Sender<bool>>>>,
    sessions: Arc<Mutex<HashMap<String, Session>>>,
}

struct Session { files: HashMap<String, (FileMeta, String)>, done: usize } // id → (мета, token)

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FileMeta { pub id: String, pub file_name: String, pub size: u64, pub file_type: String, #[serde(default)] pub sha256: Option<String> }

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Info { alias: String, version: String, device_model: String, device_type: String, fingerprint: String, port: u16, protocol: String, download: bool, #[serde(skip_serializing_if = "Option::is_none")] announce: Option<bool> }

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Prepare { info: Peer, files: HashMap<String, FileMeta> }
#[derive(Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Peer { #[serde(default)] pub alias: String, #[serde(default)] pub device_model: Option<String>, #[serde(default)] pub device_type: Option<String>, #[serde(default)] pub fingerprint: Option<String> }

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Ask { pub session_id: String, pub from: Peer, pub files: Vec<FileMeta>, pub total: u64 }
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Got { pub session_id: String, pub file_name: String, pub path: String, pub size: u64, pub left: usize }
#[derive(Serialize, Clone)]
pub struct Status { pub on: bool, pub alias: String, pub port: u16, pub ips: Vec<String> }

fn rand_hex(n: usize) -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let mut x = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos() as u64).unwrap_or(1) ^ (std::process::id() as u64) << 32;
    let mut s = String::new();
    while s.len() < n { x ^= x << 13; x ^= x >> 7; x ^= x << 17; s.push_str(&format!("{:016x}", x)); }
    s.truncate(n); s
}
// Папка по расширению — как folder.js (kindOfName); неизвестное — Media
fn subdir(name: &str) -> &'static str {
    let e = name.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
    match e.as_str() {
        "pdf" => "PDF",
        "gp" | "gp3" | "gp4" | "gp5" | "gpx" | "gtp" | "musicxml" | "mxl" | "xml" | "mid" | "midi" | "txt" | "tab" | "tex" | "alphatex" => "Tabs",
        "chordpro" | "cho" | "crd" | "pro" | "lrc" => "Lyrics",
        _ => "Media",
    }
}
fn safe_name(s: &str) -> String {
    let n: String = s.chars().map(|c| if "\\/:*?\"<>|".contains(c) || (c as u32) < 32 { '_' } else { c }).collect();
    let n = n.trim().trim_end_matches('.').to_string();
    if n.is_empty() { "file".into() } else { n.chars().take(120).collect() }
}
fn free_path(dir: &Path, name: &str) -> PathBuf {
    let p = dir.join(name);
    if !p.exists() { return p; }
    let (stem, ext) = match name.rfind('.') { Some(i) if i > 0 => (&name[..i], &name[i..]), _ => (name, "") };
    for k in 2..1000 { let q = dir.join(format!("{stem} ({k}){ext}")); if !q.exists() { return q; } }
    dir.join(format!("{stem}-{}{ext}", rand_hex(6)))
}

fn json_resp(code: u16, body: String) -> tiny_http::Response<std::io::Cursor<Vec<u8>>> {
    tiny_http::Response::from_string(body).with_status_code(code)
        .with_header(tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).unwrap())
}
fn q_param(url: &str, key: &str) -> Option<String> {
    let q = url.split_once('?')?.1;
    q.split('&').find_map(|kv| { let (k, v) = kv.split_once('=')?; if k == key { Some(v.to_string()) } else { None } })
}

// Приём: HTTP-сервер в своём потоке, пока on; каждый запрос — в своём потоке (файлы идут параллельно)
fn serve(app: AppHandle, st: Arc<Shared>) {
    let server = match tiny_http::Server::http(("0.0.0.0", PORT)) { Ok(s) => s, Err(e) => { let _ = app.emit("localsend-error", e.to_string()); st.on.store(false, Ordering::Relaxed); return; } };
    while st.on.load(Ordering::Relaxed) {
        let req = match server.recv_timeout(Duration::from_millis(500)) { Ok(Some(r)) => r, Ok(None) => continue, Err(_) => break };
        let app = app.clone(); let st = st.clone();
        std::thread::spawn(move || handle(app, st, req));
    }
}
pub struct Shared { on: Arc<AtomicBool>, alias: String, dir: PathBuf, fingerprint: String, asks: Arc<Mutex<HashMap<String, std::sync::mpsc::Sender<bool>>>>, sessions: Arc<Mutex<HashMap<String, Session>>> }
fn my_info(st: &Shared, announce: Option<bool>) -> Info {
    Info { alias: st.alias.clone(), version: "2.1".into(), device_model: "Melete".into(), device_type: "desktop".into(), fingerprint: st.fingerprint.clone(), port: PORT, protocol: "http".into(), download: false, announce }
}
fn handle(app: AppHandle, st: Arc<Shared>, mut req: tiny_http::Request) {
    let url = req.url().to_string();
    let path = url.split('?').next().unwrap_or("").to_string();
    let mut body = Vec::new();
    let resp = match (req.method().as_str(), path.as_str()) {
        ("POST", "/api/localsend/v2/register") | ("GET", "/api/localsend/v2/info") => json_resp(200, serde_json::to_string(&my_info(&st, None)).unwrap_or_default()),
        ("POST", "/api/localsend/v2/prepare-upload") => {
            if req.as_reader().take(1 << 20).read_to_end(&mut body).is_err() { json_resp(400, "{}".into()) }
            else { match serde_json::from_slice::<Prepare>(&body) {
                Err(_) => json_resp(400, "{}".into()),
                Ok(p) => {
                    let total: u64 = p.files.values().map(|f| f.size).sum();
                    if p.files.is_empty() { json_resp(204, String::new()) }
                    else if total > MAX_BYTES { json_resp(403, "{}".into()) }
                    else {
                        let sid = rand_hex(24);
                        let (tx, rx) = std::sync::mpsc::channel::<bool>();
                        if let Ok(mut a) = st.asks.lock() { a.insert(sid.clone(), tx); }
                        let files: Vec<FileMeta> = p.files.values().cloned().collect();
                        let _ = app.emit("localsend-ask", Ask { session_id: sid.clone(), from: p.info.clone(), files: files.clone(), total });
                        // ждём ответа человека до 60 с (LocalSend на телефоне ждёт столько же)
                        let ok = rx.recv_timeout(Duration::from_secs(60)).unwrap_or(false);
                        if let Ok(mut a) = st.asks.lock() { a.remove(&sid); }
                        if !ok { json_resp(403, "{}".into()) }
                        else {
                            let mut tokens = HashMap::new();
                            let mut fs = HashMap::new();
                            for f in files { let t = rand_hex(16); tokens.insert(f.id.clone(), t.clone()); fs.insert(f.id.clone(), (f, t)); }
                            if let Ok(mut s) = st.sessions.lock() { s.insert(sid.clone(), Session { files: fs, done: 0 }); }
                            json_resp(200, serde_json::json!({ "sessionId": sid, "files": tokens }).to_string())
                        }
                    }
                }
            } }
        }
        ("POST", "/api/localsend/v2/upload") => {
            let sid = q_param(&url, "sessionId").unwrap_or_default();
            let fid = q_param(&url, "fileId").unwrap_or_default();
            let tok = q_param(&url, "token").unwrap_or_default();
            let meta = st.sessions.lock().ok().and_then(|s| s.get(&sid).and_then(|x| x.files.get(&fid)).filter(|(_, t)| *t == tok).map(|(m, _)| m.clone()));
            match meta {
                None => json_resp(403, "{}".into()),
                Some(m) => {
                    let dir = st.dir.join(subdir(&m.file_name));
                    let _ = std::fs::create_dir_all(&dir);
                    let target = free_path(&dir, &safe_name(&m.file_name));
                    let tmp = target.with_extension(format!("{}.part", target.extension().and_then(|e| e.to_str()).unwrap_or("bin")));
                    let res = (|| -> std::io::Result<u64> {
                        let mut f = std::fs::File::create(&tmp)?;
                        let mut r = req.as_reader().take(m.size.max(1) + 1);
                        let mut buf = vec![0u8; 1 << 20];
                        let mut n = 0u64;
                        loop { let k = r.read(&mut buf)?; if k == 0 { break; } f.write_all(&buf[..k])?; n += k as u64; }
                        f.flush()?;
                        Ok(n)
                    })();
                    match res {
                        Ok(n) if n == m.size || m.size == 0 => {
                            let _ = std::fs::rename(&tmp, &target);
                            let left = st.sessions.lock().ok().and_then(|mut s| s.get_mut(&sid).map(|x| { x.done += 1; x.files.len() - x.done })).unwrap_or(0);
                            if left == 0 { if let Ok(mut s) = st.sessions.lock() { s.remove(&sid); } }
                            let _ = app.emit("localsend-got", Got { session_id: sid.clone(), file_name: m.file_name.clone(), path: target.to_string_lossy().to_string(), size: n, left });
                            json_resp(200, "{}".into())
                        }
                        _ => { let _ = std::fs::remove_file(&tmp); json_resp(500, "{}".into()) }
                    }
                }
            }
        }
        ("POST", "/api/localsend/v2/cancel") => {
            let sid = q_param(&url, "sessionId").unwrap_or_default();
            if let Ok(mut a) = st.asks.lock() { if let Some(tx) = a.remove(&sid) { let _ = tx.send(false); } }
            if let Ok(mut s) = st.sessions.lock() { s.remove(&sid); }
            let _ = app.emit("localsend-cancel", sid);
            json_resp(200, "{}".into())
        }
        _ => json_resp(404, "{}".into()),
    };
    let _ = req.respond(resp);
}

// Объявление в сети: раз в 5 с, пока on; на чужие объявления (announce: true) — ответ по UDP с announce: false
fn announce(st: Arc<Shared>) {
    let sock = match UdpSocket::bind(SocketAddrV4::new(Ipv4Addr::UNSPECIFIED, PORT)) { Ok(s) => s, Err(_) => return };
    let _ = sock.join_multicast_v4(&MCAST, &Ipv4Addr::UNSPECIFIED);
    let _ = sock.set_read_timeout(Some(Duration::from_millis(500)));
    let to = SocketAddrV4::new(MCAST, PORT);
    let mut last = std::time::Instant::now() - Duration::from_secs(10);
    let mut buf = [0u8; 4096];
    while st.on.load(Ordering::Relaxed) {
        if last.elapsed() >= Duration::from_secs(5) {
            if let Ok(s) = serde_json::to_string(&my_info(&st, Some(true))) { let _ = sock.send_to(s.as_bytes(), to); }
            last = std::time::Instant::now();
        }
        if let Ok((n, from)) = sock.recv_from(&mut buf) {
            if let Ok(v) = serde_json::from_slice::<serde_json::Value>(&buf[..n]) {
                let fp = v.get("fingerprint").and_then(|x| x.as_str()).unwrap_or("");
                if fp != st.fingerprint && v.get("announce").and_then(|x| x.as_bool()) == Some(true) {
                    if let Ok(s) = serde_json::to_string(&my_info(&st, Some(false))) { let _ = sock.send_to(s.as_bytes(), from); }
                }
            }
        }
    }
}

fn local_ips() -> Vec<String> {
    let mut out = Vec::new();
    if let Ok(list) = local_ip_address::list_afinet_netifas() {
        for (_, ip) in list { if let std::net::IpAddr::V4(v4) = ip { if !v4.is_loopback() && !v4.is_link_local() { out.push(v4.to_string()); } } }
    }
    out
}

#[tauri::command]
pub fn localsend_start(app: AppHandle, st: State<'_, LocalSend>, alias: String, dir: String) -> Result<Status, String> {
    if st.on.swap(true, Ordering::Relaxed) { return Ok(localsend_status(st)); }
    let dir_p = PathBuf::from(&dir);
    if !dir_p.is_dir() { st.on.store(false, Ordering::Relaxed); return Err("no dir".into()); }
    if let Ok(mut a) = st.alias.lock() { *a = alias.clone(); }
    if let Ok(mut d) = st.dir.lock() { *d = dir.clone(); }
    let fp = { let mut f = st.fingerprint.lock().map_err(|_| "lock")?; if f.is_empty() { *f = rand_hex(32); } f.clone() };
    let sh = Arc::new(Shared { on: st.on.clone(), alias, dir: dir_p, fingerprint: fp, asks: st.asks.clone(), sessions: st.sessions.clone() });
    let (a1, s1, s2) = (app.clone(), sh.clone(), sh.clone());
    std::thread::spawn(move || serve(a1, s1));
    std::thread::spawn(move || announce(s2));
    Ok(localsend_status(st))
}
#[tauri::command]
pub fn localsend_stop(st: State<'_, LocalSend>) { st.on.store(false, Ordering::Relaxed); if let Ok(mut a) = st.asks.lock() { for (_, tx) in a.drain() { let _ = tx.send(false); } } }
#[tauri::command]
pub fn localsend_status(st: State<'_, LocalSend>) -> Status {
    Status { on: st.on.load(Ordering::Relaxed), alias: st.alias.lock().map(|a| a.clone()).unwrap_or_default(), port: PORT, ips: local_ips() }
}
// Ответ человека на запрос передачи
#[tauri::command]
pub fn localsend_answer(st: State<'_, LocalSend>, session_id: String, ok: bool) { if let Ok(mut a) = st.asks.lock() { if let Some(tx) = a.remove(&session_id) { let _ = tx.send(ok); } } }
