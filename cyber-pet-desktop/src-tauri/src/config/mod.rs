//! 配置管理系统模块
//!
//! 职责：应用配置的读写、默认值生成、便携模式信息暴露。
//! 参考《05-架构设计文档》、CLAUDE.md「绿色便携」与「AI 供应商配置」要求。
//!
//! 设计要点：
//! - 格式：TOML，存放于 `<data_root>/config/app.toml`，人可读、易手改。
//! - 默认：首次启动无配置文件时生成默认配置并落盘。
//! - 便携：路径由 `paths` 模块统一解析（便携优先）。
//! - 健壮：配置文件损坏时回退默认值并告警，不阻塞启动。
//!
//! 注意：AI 供应商密钥等敏感配置见阶段6，此处仅含基础应用配置。

use std::fs;

use serde::{Deserialize, Serialize};

use crate::paths;

/// 配置文件名。
const CONFIG_FILE: &str = "app.toml";

/// 应用基础配置。
///
/// 字段保持精简（YAGNI），随阶段推进按需扩展。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct AppConfig {
    /// 配置结构版本，便于未来迁移。
    pub version: u32,
    /// 界面主题：light / dark / system。
    pub theme: String,
    /// 界面语言：zh-CN / en-US 等。
    pub language: String,
    /// 是否开机自启动。
    pub auto_start: bool,
    /// 是否允许 P2P 接入（默认关闭，符合项目安全要求）。
    pub p2p_enabled: bool,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            version: 1,
            theme: "system".to_string(),
            language: "zh-CN".to_string(),
            auto_start: false,
            // P2P 默认关闭，由用户主动开启（见 CLAUDE.md）。
            p2p_enabled: false,
        }
    }
}

impl AppConfig {
    /// 加载配置：文件存在则解析，否则生成默认并落盘。
    ///
    /// 文件损坏（解析失败）时回退默认值并告警，不覆盖原文件。
    pub fn load() -> Self {
        let path = config_path();

        if !path.exists() {
            let cfg = Self::default();
            if let Err(e) = cfg.save() {
                tracing::warn!(error = %e, "默认配置写入失败，使用内存默认值");
            } else {
                tracing::info!(path = %path.display(), "已生成默认配置");
            }
            return cfg;
        }

        match fs::read_to_string(&path) {
            Ok(content) => match toml::from_str::<AppConfig>(&content) {
                Ok(cfg) => {
                    tracing::info!(path = %path.display(), "配置已加载");
                    cfg
                }
                Err(e) => {
                    tracing::warn!(error = %e, "配置解析失败，回退默认值");
                    Self::default()
                }
            },
            Err(e) => {
                tracing::warn!(error = %e, "配置读取失败，回退默认值");
                Self::default()
            }
        }
    }

    /// 将当前配置写入磁盘（TOML）。
    pub fn save(&self) -> Result<(), String> {
        let dir = paths::config_dir();
        paths::ensure_dir(&dir).map_err(|e| format!("创建配置目录失败: {e}"))?;

        let content = toml::to_string_pretty(self).map_err(|e| format!("序列化配置失败: {e}"))?;
        fs::write(config_path(), content).map_err(|e| format!("写入配置失败: {e}"))?;
        Ok(())
    }
}

/// 配置文件完整路径：`<data_root>/config/app.toml`。
fn config_path() -> std::path::PathBuf {
    paths::config_dir().join(CONFIG_FILE)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_config_is_safe() {
        let cfg = AppConfig::default();
        // P2P 必须默认关闭，符合项目安全要求。
        assert!(!cfg.p2p_enabled);
        assert!(!cfg.auto_start);
        assert_eq!(cfg.version, 1);
        assert_eq!(cfg.language, "zh-CN");
    }

    #[test]
    fn config_roundtrip_via_toml() {
        let original = AppConfig {
            version: 1,
            theme: "dark".to_string(),
            language: "en-US".to_string(),
            auto_start: true,
            p2p_enabled: true,
        };
        let text = toml::to_string_pretty(&original).expect("序列化失败");
        let parsed: AppConfig = toml::from_str(&text).expect("反序列化失败");
        assert_eq!(parsed.theme, "dark");
        assert_eq!(parsed.language, "en-US");
        assert!(parsed.auto_start);
        assert!(parsed.p2p_enabled);
    }

    #[test]
    fn partial_toml_fills_defaults() {
        // serde(default) 保证缺失字段回退默认值，旧配置文件向前兼容。
        let text = r#"theme = "light""#;
        let parsed: AppConfig = toml::from_str(text).expect("反序列化失败");
        assert_eq!(parsed.theme, "light");
        assert_eq!(parsed.language, "zh-CN"); // 默认值
        assert!(!parsed.p2p_enabled); // 默认值
    }
}
