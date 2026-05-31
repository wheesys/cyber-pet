//! 日志系统模块
//!
//! 职责：初始化全局日志（tracing），按级别输出到控制台与文件，按天轮转。
//! 参考《05-架构设计文档》11.2 客户端日志。
//!
//! 设计要点：
//! - 级别：ERROR / WARN / INFO / DEBUG，通过 `CYBER_PET_LOG` 环境变量覆盖默认级别。
//! - 文件：写入 `<data_root>/logs/cyber-pet.log`，按天轮转（tracing-appender）。
//! - 便携：日志目录由 `paths` 模块统一解析，遵循绿色便携策略。
//!
//! 返回的 `WorkerGuard` 必须由调用方持有至程序结束，否则缓冲日志会丢失。

use tracing_appender::non_blocking::WorkerGuard;
use tracing_appender::rolling;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;
use tracing_subscriber::{fmt, EnvFilter};

use crate::paths;

/// 日志级别环境变量名。
const LOG_ENV: &str = "CYBER_PET_LOG";

/// 默认日志级别（release 用 info，debug 构建用 debug）。
fn default_level() -> &'static str {
    if cfg!(debug_assertions) {
        "debug"
    } else {
        "info"
    }
}

/// 初始化全局日志系统。
///
/// 返回的 `WorkerGuard` 需由调用方持有（通常存入 App state），
/// 以保证非阻塞写入线程在退出前刷新缓冲。
///
/// 即使日志目录创建失败也不会 panic：此时仅保留控制台输出。
pub fn init() -> Option<WorkerGuard> {
    let env_filter =
        EnvFilter::try_from_env(LOG_ENV).unwrap_or_else(|_| EnvFilter::new(default_level()));

    let logs_dir = paths::logs_dir();
    match paths::ensure_dir(&logs_dir) {
        Ok(_) => {
            // 按天轮转，文件名形如 cyber-pet.log.2026-05-31。
            let file_appender = rolling::daily(&logs_dir, "cyber-pet.log");
            let (non_blocking, guard) = tracing_appender::non_blocking(file_appender);

            tracing_subscriber::registry()
                .with(env_filter)
                // 控制台层：带颜色，便于开发观察。
                .with(fmt::layer().with_target(true))
                // 文件层：非阻塞写入，关闭 ANSI 颜色码。
                .with(
                    fmt::layer()
                        .with_ansi(false)
                        .with_target(true)
                        .with_writer(non_blocking),
                )
                .init();

            tracing::info!(dir = %logs_dir.display(), "日志系统已初始化");
            Some(guard)
        }
        Err(e) => {
            // 目录不可用：退化为仅控制台输出，保证程序仍可运行。
            tracing_subscriber::registry()
                .with(env_filter)
                .with(fmt::layer().with_target(true))
                .init();
            tracing::warn!(error = %e, "日志目录创建失败，仅启用控制台日志");
            None
        }
    }
}
