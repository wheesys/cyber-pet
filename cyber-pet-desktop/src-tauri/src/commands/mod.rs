//! Tauri 命令模块
//!
//! 职责：聚合暴露给前端的 Tauri Command（invoke 入口）。
//! 参考《05-架构设计文档》7.1 Tauri 命令接口。
//!
//! 阶段4 实现范围：窗口拖拽/置顶/定位、应用配置读写。
//! 阶段5 实现范围：宠物管理（增删查、状态读写）。
//! 阶段5.4：宠物编辑、事件广播、管理窗口。
//! 后续：P2P 命令（阶段11，默认关闭）。

use std::sync::Mutex;

use serde::Serialize;
use serde_json::json;
use tauri::{AppHandle, Emitter, PhysicalPosition, State, WebviewWindow};

use crate::config::AppConfig;
use crate::database::Database;
use crate::p2p::P2pState;
use crate::permission::{self, PendingRequests};
use crate::pet::{NewPet, Pet, PetState, UpdatePet};
use crate::tools;
use crate::window;

/// 宠物名称最大长度（见《06-数据库设计文档》3.1）。
const PET_NAME_MAX_LEN: usize = 50;

/// 开始拖拽当前窗口。
///
/// 由前端在宠物本体 `mousedown` 时调用，交由系统接管拖拽，
/// 避免在 JS 侧逐帧 setPosition 带来的卡顿。
#[tauri::command]
pub fn start_drag(window: WebviewWindow) -> Result<(), String> {
    window.start_dragging().map_err(|e| e.to_string())
}

/// 设置当前窗口是否置顶。
#[tauri::command]
pub fn set_always_on_top(window: WebviewWindow, enabled: bool) -> Result<(), String> {
    window.set_always_on_top(enabled).map_err(|e| e.to_string())
}

/// 设置当前窗口的物理像素位置。
#[tauri::command]
pub fn set_window_position(window: WebviewWindow, x: i32, y: i32) -> Result<(), String> {
    window
        .set_position(PhysicalPosition::new(x, y))
        .map_err(|e| e.to_string())
}

/// 读取当前应用配置。
#[tauri::command]
pub fn get_config(config: State<'_, Mutex<AppConfig>>) -> Result<AppConfig, String> {
    config
        .lock()
        .map(|c| c.clone())
        .map_err(|e| format!("配置锁获取失败: {e}"))
}

/// 更新并持久化应用配置。
#[tauri::command]
pub fn set_config(config: State<'_, Mutex<AppConfig>>, new_config: AppConfig) -> Result<(), String> {
    new_config.save()?;
    let mut guard = config.lock().map_err(|e| format!("配置锁获取失败: {e}"))?;
    *guard = new_config;
    Ok(())
}

/// 查询所有激活的宠物。
#[tauri::command]
pub fn get_pets(db: State<'_, Database>) -> Result<Vec<Pet>, String> {
    db.list_pets()
}

/// 创建宠物（含名称校验，自动初始化默认状态）。
/// 成功后广播 `pets-changed` 事件通知所有窗口同步。
#[tauri::command]
pub fn create_pet(
    app: AppHandle,
    db: State<'_, Database>,
    new_pet: NewPet,
) -> Result<Pet, String> {
    let name = new_pet.name.trim();
    if name.is_empty() {
        return Err("宠物名称不能为空".to_string());
    }
    if name.chars().count() > PET_NAME_MAX_LEN {
        return Err(format!("宠物名称不能超过 {PET_NAME_MAX_LEN} 个字符"));
    }
    // 用去除首尾空白后的名称落库。
    let sanitized = NewPet {
        name: name.to_string(),
        ..new_pet
    };
    let pet = db.create_pet(&sanitized)?;

    // 广播事件（emit 失败不阻塞主流程，仅记录日志）。
    let payload = PetsChangedPayload::created(&pet);
    if let Err(e) = app.emit("pets-changed", &payload) {
        tracing::warn!(error = %e, "广播 pets-changed 事件失败");
    }

    Ok(pet)
}

/// 软删除宠物。返回是否实际删除了一行。
/// 成功后广播 `pets-changed` 事件通知所有窗口同步。
#[tauri::command]
pub fn delete_pet(app: AppHandle, db: State<'_, Database>, pet_id: i64) -> Result<bool, String> {
    let deleted = db.delete_pet(pet_id)?;

    if deleted {
        let payload = json!({ "kind": "deleted", "id": pet_id });
        if let Err(e) = app.emit("pets-changed", &payload) {
            tracing::warn!(error = %e, "广播 pets-changed 事件失败");
        }
    }

    Ok(deleted)
}

/// 读取宠物实时状态。
#[tauri::command]
pub fn get_pet_state(db: State<'_, Database>, pet_id: i64) -> Result<Option<PetState>, String> {
    db.get_pet_state(pet_id)
}

/// 更新宠物名称与性格（类型不可变，含名称校验）。
/// 成功后广播 `pets-changed` 事件通知所有窗口同步。
#[tauri::command]
pub fn update_pet(app: AppHandle, db: State<'_, Database>, update: UpdatePet) -> Result<Pet, String> {
    let name = update.name.trim();
    if name.is_empty() {
        return Err("宠物名称不能为空".to_string());
    }
    if name.chars().count() > PET_NAME_MAX_LEN {
        return Err(format!("宠物名称不能超过 {PET_NAME_MAX_LEN} 个字符"));
    }

    let pet = db.update_pet(update.id, name, update.personality.as_str())?;

    let payload = PetsChangedPayload::updated(&pet);
    if let Err(e) = app.emit("pets-changed", &payload) {
        tracing::warn!(error = %e, "广播 pets-changed 事件失败");
    }

    Ok(pet)
}

/// 打开宠物管理窗口（已存在则聚焦）。
#[tauri::command]
pub fn open_manager(app: AppHandle) -> Result<(), String> {
    window::open_manager_window(&app);
    Ok(())
}

/// 更新宠物实时状态（位置、动作、心情、能量）。
#[tauri::command]
pub fn update_pet_state(db: State<'_, Database>, state: PetState) -> Result<(), String> {
    db.update_pet_state(&state)
}

/// 读取 AI 供应商配置（返回脱敏版本，API Key 仅显示首尾4字符）。
#[tauri::command]
pub fn get_ai_config(ai_cfg: State<'_, Mutex<crate::config::ai::AiConfig>>) -> Result<crate::config::ai::AiConfig, String> {
    ai_cfg
        .lock()
        .map(|c| c.masked())
        .map_err(|e| format!("AI 配置锁获取失败: {e}"))
}

/// 更新并持久化 AI 供应商配置。
#[tauri::command]
pub fn set_ai_config(
    ai_cfg: State<'_, Mutex<crate::config::ai::AiConfig>>,
    new_config: crate::config::ai::AiConfig,
) -> Result<(), String> {
    new_config.save()?;
    let mut guard = ai_cfg.lock().map_err(|e| format!("AI 配置锁获取失败: {e}"))?;
    *guard = new_config;
    Ok(())
}

/// 获取 AI 调用成本统计。
#[tauri::command]
pub fn get_ai_cost(
    cost: State<'_, Mutex<crate::ai_cost::AiCostTracker>>,
) -> Result<crate::ai_cost::AiCostTracker, String> {
    cost.lock()
        .map(|c| c.clone())
        .map_err(|e| format!("成本追踪锁获取失败: {e}"))
}

/// 记录一次 AI 调用（由前端在 AI 回复后调用）。
#[tauri::command]
pub fn record_ai_call(
    cost: State<'_, Mutex<crate::ai_cost::AiCostTracker>>,
    tokens: u64,
) -> Result<(), String> {
    cost.lock()
        .map_err(|e| format!("成本追踪锁获取失败: {e}"))?
        .record(tokens)
}

/// 请求用户确认危险操作。返回 request_id，前端确认后调用 confirm_permission。
#[tauri::command]
pub async fn request_permission(
    app: AppHandle,
    pending: State<'_, PendingRequests>,
    action: String,
    detail: String,
) -> Result<bool, String> {
    let (_id, rx) = permission::create_request(&pending, &action, &detail, &app)?;
    rx.await.map_err(|_| "权限请求超时".to_string())
}

/// 用户确认/拒绝权限请求。
#[tauri::command]
pub fn confirm_permission(
    pending: State<'_, PendingRequests>,
    id: u64,
    granted: bool,
) -> Result<(), String> {
    permission::confirm(&pending, id, granted)
}

/// 列出目录内容。
#[tauri::command]
pub fn list_files(path: String) -> Result<Vec<tools::FileEntry>, String> {
    tools::list_files(&path)
}

/// 搜索文件（按名称模糊匹配）。
#[tauri::command]
pub fn search_files(query: String) -> Result<Vec<String>, String> {
    tools::search_files(&query)
}

/// 创建空文件（限制 ≤5 个，宠物玩笑功能）。
#[tauri::command]
pub fn create_empty_files(path: String, names: Vec<String>) -> Result<Vec<String>, String> {
    tools::create_empty_files(&path, &names)
}

/// 获取系统信息。
#[tauri::command]
pub fn get_system_info() -> tools::SystemInfo {
    tools::get_system_info()
}

/// 保存一条对话消息。
#[tauri::command]
pub fn save_chat_message(
    db: State<'_, Database>,
    pet_id: i64,
    role: String,
    content: String,
) -> Result<i64, String> {
    db.save_message(pet_id, &role, &content)
}

/// 获取指定宠物的最近 N 条对话历史。
#[tauri::command]
pub fn get_chat_history(
    db: State<'_, Database>,
    pet_id: i64,
    limit: i64,
) -> Result<Vec<crate::database::ChatMessage>, String> {
    db.get_messages(pet_id, limit)
}

/// 清空指定宠物的全部对话历史。
#[tauri::command]
pub fn clear_chat_history(
    db: State<'_, Database>,
    pet_id: i64,
) -> Result<usize, String> {
    db.clear_history(pet_id)
}

/// 获取 P2P 连接状态。
#[tauri::command]
pub fn get_p2p_status(p2p: State<'_, P2pState>) -> crate::p2p::P2pStatus {
    p2p.get_status()
}

/// 启用 P2P（用户主动开启，默认关闭）。
#[tauri::command]
pub fn enable_p2p(p2p: State<'_, P2pState>) -> Result<(), String> {
    p2p.enable()
}

/// 禁用 P2P。
#[tauri::command]
pub fn disable_p2p(p2p: State<'_, P2pState>) -> Result<(), String> {
    p2p.disable()
}

// ── 事件 payload ──

/// `pets-changed` 事件的 payload。
#[derive(Debug, Clone, Serialize)]
struct PetsChangedPayload {
    kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pet: Option<Pet>,
    #[serde(skip_serializing_if = "Option::is_none")]
    id: Option<i64>,
}

impl PetsChangedPayload {
    fn created(pet: &Pet) -> Self {
        Self {
            kind: "created".to_string(),
            pet: Some(pet.clone()),
            id: None,
        }
    }

    fn updated(pet: &Pet) -> Self {
        Self {
            kind: "updated".to_string(),
            pet: Some(pet.clone()),
            id: None,
        }
    }
}
