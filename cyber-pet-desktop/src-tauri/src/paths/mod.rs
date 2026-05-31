//! 应用路径解析模块（全局方案）
//!
//! 职责：统一解析配置、日志、数据等目录，供 logging / config / database 复用。
//! 参考《05-架构设计文档》11.2 客户端日志，并遵循 CLAUDE.md「绿色便携」要求。
//!
//! 路径策略（便携优先）：
//! - 便携模式（默认）：所有数据存放在可执行文件同级 `data/` 下，
//!   删除该目录即彻底卸载，不污染用户主目录。
//! - 安装模式：若可执行文件目录不可写（如装在系统只读路径），
//!   回退到用户主目录 `~/.cyber-pet/`。
//!
//! 模式判定：以可执行文件所在目录能否写入为准，运行时自动探测一次。

use std::fs;
use std::path::PathBuf;
use std::sync::OnceLock;

/// 应用数据根目录名（便携模式下位于可执行文件同级）。
const PORTABLE_DIR_NAME: &str = "data";

/// 安装模式下用户主目录中的应用目录名。
const INSTALLED_DIR_NAME: &str = ".cyber-pet";

/// 全局缓存的数据根目录，避免重复探测文件系统。
static DATA_ROOT: OnceLock<PathBuf> = OnceLock::new();

/// 获取应用数据根目录，首次调用时探测并缓存。
///
/// 优先使用便携目录；若不可写则回退到用户主目录。
/// 二者均不可用时回退到当前工作目录下的 `data/`（极端兜底）。
pub fn data_root() -> &'static PathBuf {
    DATA_ROOT.get_or_init(resolve_data_root)
}

/// 日志目录：`<data_root>/logs`。
pub fn logs_dir() -> PathBuf {
    data_root().join("logs")
}

/// 配置目录：`<data_root>/config`。
pub fn config_dir() -> PathBuf {
    data_root().join("config")
}

/// 数据库目录：`<data_root>/db`（供阶段5 使用）。
#[allow(dead_code)] // 阶段5 database 模块接入后移除
pub fn db_dir() -> PathBuf {
    data_root().join("db")
}

/// 确保给定目录存在，不存在则递归创建。
pub fn ensure_dir(dir: &PathBuf) -> std::io::Result<()> {
    if !dir.exists() {
        fs::create_dir_all(dir)?;
    }
    Ok(())
}

/// 解析数据根目录（仅在 OnceLock 首次初始化时调用）。
fn resolve_data_root() -> PathBuf {
    // 1. 便携模式：可执行文件同级 data/，要求该位置可写。
    if let Some(portable) = portable_root() {
        if is_writable(&portable) {
            return portable;
        }
    }

    // 2. 安装模式：用户主目录 ~/.cyber-pet/。
    if let Some(home) = dirs::home_dir() {
        return home.join(INSTALLED_DIR_NAME);
    }

    // 3. 兜底：当前工作目录下 data/。
    PathBuf::from(PORTABLE_DIR_NAME)
}

/// 计算便携模式根目录（可执行文件所在目录的 data/ 子目录）。
fn portable_root() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let dir = exe.parent()?;
    Some(dir.join(PORTABLE_DIR_NAME))
}

/// 探测目录是否可写：尝试创建目录并写入临时探针文件。
fn is_writable(dir: &PathBuf) -> bool {
    if fs::create_dir_all(dir).is_err() {
        return false;
    }
    let probe = dir.join(".write_probe");
    match fs::write(&probe, b"") {
        Ok(_) => {
            let _ = fs::remove_file(&probe);
            true
        }
        Err(_) => false,
    }
}
