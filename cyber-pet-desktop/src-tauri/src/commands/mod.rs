//! Tauri 命令模块
//!
//! 职责：聚合暴露给前端的 Tauri Command（invoke 入口）。
//! 参考《05-架构设计文档》7.1 Tauri 命令接口。
//!
//! 阶段4.1 实现范围：窗口拖拽、置顶、定位。
//! 后续：宠物管理命令（阶段5）、P2P 命令（阶段11，默认关闭）。

use tauri::{PhysicalPosition, WebviewWindow};

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
