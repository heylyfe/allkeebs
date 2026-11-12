//! Raw HID for the desktop app, over hidapi. The web UI's Tauri transport (src/hid/tauri.js)
//! calls these commands; it builds WebHID-shaped devices on top so the same drivers run.
//!
//! Each open device gets two handles: one owned by a reader thread that forwards input reports
//! as "hid-input" events, and one for writes, so a pending read never delays a command. A
//! watcher thread polls the device list and emits "hid-connect" / "hid-disconnect".
//!
//! Bytes go out exactly as the drivers produce them. Nothing here writes on its own.

use hidapi::{HidApi, HidDevice, HidError};
use serde::Serialize;
use std::collections::HashMap;
use std::ffi::CString;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

#[derive(Serialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DeviceInfo {
    path: String,
    vendor_id: u16,
    product_id: u16,
    product_name: String,
    serial: String,
    usage_page: u16,
    usage: u16,
    interface: i32,
}

#[derive(Serialize, Clone)]
struct Input {
    path: String,
    data: Vec<u8>,
}

#[derive(Serialize, Clone)]
struct Gone {
    path: String,
}

struct Open {
    writer: Arc<Mutex<HidDevice>>,
    stop: Arc<AtomicBool>,
}

pub struct Hid {
    api: Mutex<HidApi>,
    open: Mutex<HashMap<String, Open>>,
}

type Res<T> = Result<T, String>;

fn text(e: HidError) -> String {
    e.to_string()
}

fn c_path(path: &str) -> Res<CString> {
    CString::new(path).map_err(|_| "Bad device path".to_string())
}

/// Input reports and replies are at most this long; hidapi truncates to the buffer.
const READ_BUFFER: usize = 4096;

impl Hid {
    pub fn new() -> Res<Self> {
        Ok(Self {
            api: Mutex::new(HidApi::new().map_err(text)?),
            open: Mutex::new(HashMap::new()),
        })
    }

    fn list(&self) -> Vec<DeviceInfo> {
        let mut api = self.api.lock().unwrap();
        let _ = api.refresh_devices();
        api.device_list()
            .map(|d| DeviceInfo {
                path: d.path().to_string_lossy().into_owned(),
                vendor_id: d.vendor_id(),
                product_id: d.product_id(),
                product_name: d.product_string().unwrap_or("").to_string(),
                serial: d.serial_number().unwrap_or("").to_string(),
                usage_page: d.usage_page(),
                usage: d.usage(),
                interface: d.interface_number(),
            })
            .collect()
    }

    fn open_path(&self, path: &str) -> Res<HidDevice> {
        self.api
            .lock()
            .unwrap()
            .open_path(&c_path(path)?)
            .map_err(text)
    }

    fn writer(&self, path: &str) -> Res<Arc<Mutex<HidDevice>>> {
        self.open
            .lock()
            .unwrap()
            .get(path)
            .map(|o| o.writer.clone())
            .ok_or_else(|| "The device must be opened first.".to_string())
    }

    fn close(&self, path: &str) {
        if let Some(o) = self.open.lock().unwrap().remove(path) {
            o.stop.store(true, Ordering::Relaxed);
        }
    }

    /// Polls for plugged and unplugged devices once a second, for reconnect handling.
    pub fn watch(self: Arc<Self>, app: AppHandle) {
        thread::spawn(move || {
            let mut known: HashMap<String, DeviceInfo> = self
                .list()
                .into_iter()
                .map(|d| (d.path.clone(), d))
                .collect();
            loop {
                thread::sleep(Duration::from_secs(1));
                let now: HashMap<String, DeviceInfo> = self
                    .list()
                    .into_iter()
                    .map(|d| (d.path.clone(), d))
                    .collect();
                for (path, d) in &now {
                    if !known.contains_key(path) {
                        let _ = app.emit("hid-connect", d.clone());
                    }
                }
                for path in known.keys() {
                    if !now.contains_key(path) {
                        self.close(path);
                        let _ = app.emit("hid-disconnect", Gone { path: path.clone() });
                    }
                }
                known = now;
            }
        });
    }
}

// Blocking hidapi calls run off the main thread so the window never stalls.
async fn blocking<T: Send + 'static>(f: impl FnOnce() -> Res<T> + Send + 'static) -> Res<T> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn hid_devices(hid: State<'_, Arc<Hid>>) -> Res<Vec<DeviceInfo>> {
    let hid = hid.inner().clone();
    blocking(move || Ok(hid.list())).await
}

#[tauri::command]
pub async fn hid_descriptor(hid: State<'_, Arc<Hid>>, path: String) -> Res<Vec<u8>> {
    let hid = hid.inner().clone();
    blocking(move || {
        let dev = hid.open_path(&path)?;
        let mut buf = vec![0u8; READ_BUFFER];
        let n = dev.get_report_descriptor(&mut buf).map_err(text)?;
        buf.truncate(n);
        Ok(buf)
    })
    .await
}

#[tauri::command]
pub async fn hid_open(app: AppHandle, hid: State<'_, Arc<Hid>>, path: String) -> Res<()> {
    let hid = hid.inner().clone();
    blocking(move || {
        if hid.open.lock().unwrap().contains_key(&path) {
            return Ok(());
        }
        let writer = hid.open_path(&path)?;
        let reader = hid.open_path(&path)?;
        let stop = Arc::new(AtomicBool::new(false));
        hid.open.lock().unwrap().insert(
            path.clone(),
            Open {
                writer: Arc::new(Mutex::new(writer)),
                stop: stop.clone(),
            },
        );
        thread::spawn(move || {
            let mut buf = vec![0u8; READ_BUFFER];
            while !stop.load(Ordering::Relaxed) {
                match reader.read_timeout(&mut buf, 100) {
                    Ok(0) => {}
                    Ok(n) => {
                        let _ = app.emit(
                            "hid-input",
                            Input {
                                path: path.clone(),
                                data: buf[..n].to_vec(),
                            },
                        );
                    }
                    // Unplugged: the watcher reports it and the UI drops the keyboard.
                    Err(_) => break,
                }
            }
        });
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn hid_close(hid: State<'_, Arc<Hid>>, path: String) -> Res<()> {
    hid.close(&path);
    Ok(())
}

/// `data` starts with the report id (0 for devices without numbered reports), as hidapi wants.
#[tauri::command]
pub async fn hid_write(hid: State<'_, Arc<Hid>>, path: String, data: Vec<u8>) -> Res<()> {
    let w = hid.writer(&path)?;
    blocking(move || w.lock().unwrap().write(&data).map(|_| ()).map_err(text)).await
}

#[tauri::command]
pub async fn hid_send_feature(hid: State<'_, Arc<Hid>>, path: String, data: Vec<u8>) -> Res<()> {
    let w = hid.writer(&path)?;
    blocking(move || w.lock().unwrap().send_feature_report(&data).map_err(text)).await
}

/// Returns the report with its id byte first; `length` is the report size without that byte.
#[tauri::command]
pub async fn hid_get_feature(
    hid: State<'_, Arc<Hid>>,
    path: String,
    report_id: u8,
    length: usize,
) -> Res<Vec<u8>> {
    let w = hid.writer(&path)?;
    blocking(move || {
        let mut buf = vec![0u8; length.clamp(1, READ_BUFFER) + 1];
        buf[0] = report_id;
        let n = w
            .lock()
            .unwrap()
            .get_feature_report(&mut buf)
            .map_err(text)?;
        buf.truncate(n);
        Ok(buf)
    })
    .await
}
