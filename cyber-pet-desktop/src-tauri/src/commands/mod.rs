//! Tauri 命令模块
//!
//! 职责：聚合暴露给前端的 Tauri Command（invoke 入口）。
//! 参考《05-架构设计文档》7.1 Tauri 命令接口。
//!
//! 阶段4 实现范围：窗口拖拽/置顶/定位、应用配置读写。
//! 阶段5 实现范围：宠物管理（增删查、状态读写）。
//! 后续：P2P 命令（阶段11，默认关闭）。

use std::sync::Mutex;

use tauri::{PhysicalPosition, State, WebviewWindow};

use crate::config::AppConfig;
use crate::database::Database;
use crate::pet::{NewPet, Pet, PetState};

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
#[tauri::command]
pub fn create_pet(db: State<'_, Database>, new_pet: NewPet) -> Result<Pet, String> {
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
    db.create_pet(&sanitized)
}

/// 软删除宠物。返回是否实际删除了一行。
#[tauri::command]
pub fn delete_pet(db: State<'_, Database>, pet_id: i64) -> Result<bool, String> {
    db.delete_pet(pet_id)
}

/// 读取宠物实时状态。
#[tauri::command]
pub fn get_pet_state(db: State<'_, Database>, pet_id: i64) -> Result<Option<PetState>, String> {
    db.get_pet_state(pet_id)
}

/// 更新宠物实时状态（位置、动作、心情、能量）。
#[tauri::command]
pub fn update_pet_state(db: State<'_, Database>, state: PetState) -> Result<(), String> {
    db.update_pet_state(&state)
}
