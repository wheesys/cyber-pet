//! Tauri 命令模块
//!
//! 职责：聚合暴露给前端的 Tauri Command（invoke 入口）。
//! 参考《05-架构设计文档》7.1 Tauri 命令接口。
//!
//! 计划实现：
//! - 宠物管理命令（get_pets / create_pet / update_pet_state）
//! - 窗口管理命令（set_window_position / set_always_on_top）
//! - P2P 命令（p2p_connect / p2p_send，默认关闭）
