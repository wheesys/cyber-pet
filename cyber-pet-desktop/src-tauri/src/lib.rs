//! Cyber Pet 桌面端应用入口（库）。
//!
//! 负责装配 Tauri 应用：注册命令、初始化系统托盘。

mod commands;
mod window;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            window::setup_tray(app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::start_drag,
            commands::set_always_on_top,
            commands::set_window_position,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
