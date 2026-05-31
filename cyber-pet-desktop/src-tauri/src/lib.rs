//! Cyber Pet 桌面端应用入口（库）。

mod ai_cost;
mod commands;
mod config;
mod database;
mod logging;
mod p2p;
mod paths;
mod permission;
mod pet;
mod tools;
mod window;

use std::sync::Mutex;

use ai_cost::AiCostTracker;
use config::{ai::AiConfig, AppConfig};
use database::Database;
use p2p::P2pState;
use permission::PendingRequests;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let log_guard = logging::init();
    let app_config = AppConfig::load();
    let ai_config = AiConfig::load();
    let cost_tracker = AiCostTracker::load();
    let pending_requests = PendingRequests::default();
    let p2p_state = P2pState::new();

    let database = match Database::open() {
        Ok(db) => db,
        Err(e) => {
            tracing::error!(error = %e, "数据库初始化失败，应用退出");
            panic!("数据库初始化失败: {e}");
        }
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .manage(Mutex::new(app_config))
        .manage(Mutex::new(ai_config))
        .manage(Mutex::new(cost_tracker))
        .manage(pending_requests)
        .manage(p2p_state)
        .manage(log_guard)
        .manage(database)
        .setup(|app| {
            window::setup_tray(app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::start_drag,
            commands::set_always_on_top,
            commands::set_window_position,
            commands::get_config,
            commands::set_config,
            commands::get_pets,
            commands::create_pet,
            commands::delete_pet,
            commands::update_pet,
            commands::get_pet_state,
            commands::update_pet_state,
            commands::open_manager,
            commands::get_ai_config,
            commands::set_ai_config,
            commands::get_ai_cost,
            commands::record_ai_call,
            commands::request_permission,
            commands::confirm_permission,
            commands::list_files,
            commands::search_files,
            commands::create_empty_files,
            commands::get_system_info,
            commands::get_p2p_status,
            commands::enable_p2p,
            commands::disable_p2p,
            commands::save_chat_message,
            commands::get_chat_history,
            commands::clear_chat_history,
            commands::get_processes,
            commands::send_notification,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
