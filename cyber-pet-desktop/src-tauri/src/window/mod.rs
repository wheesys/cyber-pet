//! 窗口管理模块
//!
//! 职责：管理宠物窗口的创建、显示、拖拽、置顶及系统托盘。
//! 参考《05-架构设计文档》3.3.1 窗口管理模块。
//!
//! 阶段4.1 实现范围：
//! - 系统托盘图标与菜单（显示/隐藏宠物、退出）
//! - 主窗口显示/隐藏切换
//!
//! 阶段5.4 实现范围：
//! - 管理窗口创建/聚焦
//! - "管理宠物"托盘菜单项
//!
//! 多宠物多窗口管理见阶段10，此处仅管理主窗口。

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, Runtime, WebviewUrl, WebviewWindowBuilder,
};

/// 托盘菜单项 ID 常量，避免字符串散落各处（DRY）。
const MENU_ID_TOGGLE: &str = "toggle_pet";
const MENU_ID_MANAGE: &str = "manage_pets";
const MENU_ID_QUIT: &str = "quit";

/// 主窗口 label，与 tauri.conf.json 中保持一致。
const MAIN_WINDOW_LABEL: &str = "main";

/// 管理窗口 label，与 tauri.conf.json 中保持一致。
const MANAGER_WINDOW_LABEL: &str = "manager";

/// 初始化系统托盘图标与菜单。
///
/// 在 `setup` 阶段调用，挂载到 `AppHandle` 上长期存在。
pub fn setup_tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let toggle_item = MenuItem::with_id(app, MENU_ID_TOGGLE, "显示/隐藏宠物", true, None::<&str>)?;
    let manage_item = MenuItem::with_id(app, MENU_ID_MANAGE, "管理宠物", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, MENU_ID_QUIT, "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&toggle_item, &manage_item, &quit_item])?;

    TrayIconBuilder::new()
        .icon(app.default_window_icon().cloned().ok_or_else(|| {
            tauri::Error::AssetNotFound("缺少默认窗口图标，无法创建托盘".into())
        })?)
        .tooltip("Cyber Pet")
        .menu(&menu)
        // 菜单仅右键弹出；左键单击用于切换宠物显隐。
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            MENU_ID_TOGGLE => toggle_main_window(app),
            MENU_ID_MANAGE => open_manager_window(app),
            MENU_ID_QUIT => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_main_window(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

/// 打开或聚焦管理窗口。
///
/// 若窗口已存在则 `set_focus`，否则以 800×600 常规尺寸创建。
pub fn open_manager_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window(MANAGER_WINDOW_LABEL) {
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }

    let builder = WebviewWindowBuilder::new(
        app,
        MANAGER_WINDOW_LABEL,
        WebviewUrl::App("index.html?window=manager".into()),
    )
    .title("宠物管理")
    .inner_size(800.0, 600.0)
    .resizable(true)
    .center();

    if let Err(e) = builder.build() {
        tracing::error!(error = %e, "创建管理窗口失败");
    }
}

/// 切换主窗口显示/隐藏。
fn toggle_main_window<R: Runtime>(app: &AppHandle<R>) {
    let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        return;
    };
    match window.is_visible() {
        Ok(true) => {
            let _ = window.hide();
        }
        _ => {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}
