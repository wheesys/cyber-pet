//! Cyber Pet 桌面端应用入口（库）。
//!
//! 负责装配 Tauri 应用：初始化日志、加载配置、打开数据库、注册命令、初始化系统托盘。

mod commands;
mod config;
mod database;
mod logging;
mod paths;
mod pet;
mod window;

use std::sync::Mutex;

use config::AppConfig;
use database::Database;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 日志须最先初始化，guard 存入 state 以保证退出前刷新缓冲。
    let log_guard = logging::init();

    // 加载应用配置（首次启动生成默认值）。
    let app_config = AppConfig::load();

    // 打开数据库并应用迁移；失败则属致命错误，直接退出。
    let database = match Database::open() {
        Ok(db) => db,
        Err(e) => {
            tracing::error!(error = %e, "数据库初始化失败，应用退出");
            panic!("数据库初始化失败: {e}");
        }
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(Mutex::new(app_config))
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
            commands::get_pet_state,
            commands::update_pet_state,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
