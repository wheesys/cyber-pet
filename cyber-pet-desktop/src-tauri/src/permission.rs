//! 权限确认模块（阶段7.1）。
//!
//! 每次危险操作前弹出确认框，使用 oneshot channel 同步等待用户批准。

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::Emitter;
use tokio::sync::oneshot;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PermissionRequest {
    pub action: String,
    pub detail: String,
}

pub type PendingRequests = Mutex<HashMap<u64, oneshot::Sender<bool>>>;

pub fn create_request(
    pending: &PendingRequests,
    action: &str,
    detail: &str,
    app: &tauri::AppHandle,
) -> Result<(u64, oneshot::Receiver<bool>), String> {
    use std::time::{SystemTime, UNIX_EPOCH};
    let id = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos() as u64;

    let (tx, rx) = oneshot::channel();
    pending.lock().map_err(|e| format!("锁失败: {e}"))?.insert(id, tx);

    let req = PermissionRequest { action: action.to_string(), detail: detail.to_string() };
    let _ = app.emit("permission-request", serde_json::json!({ "id": id, "request": req }));

    Ok((id, rx))
}

pub fn confirm(pending: &PendingRequests, id: u64, granted: bool) -> Result<(), String> {
    if let Some(tx) = pending.lock().map_err(|e| format!("锁失败: {e}"))?.remove(&id) {
        let _ = tx.send(granted);
    }
    Ok(())
}
