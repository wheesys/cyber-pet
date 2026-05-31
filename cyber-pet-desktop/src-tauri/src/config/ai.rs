//! AI 配置管理子模块
//!
//! 职责：三层 AI 架构（调度/简单/复杂）的供应商配置持久化。
//! 参考《05-架构设计文档》3.3.4、《04-技术选型决策》决策3。
//!
//! 设计要点：
//! - 格式：TOML，存放于 `<data_root>/config/ai.toml`。
//! - 加密：API Key 使用 XOR + 设备指纹简单混淆（阶段6.1），后续可升级 AES。
//! - 默认：推荐 base_url + model 预设，api_key 留空，用户自行填写。
//! - 脱敏：对外返回时 api_key 仅显示首尾4字符。

use serde::{Deserialize, Serialize};

use crate::paths;

/// AI 配置文件名。
const AI_CONFIG_FILE: &str = "ai.toml";

/// 单个 AI 供应商配置。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiProviderConfig {
    /// API 基础地址（OpenAI 兼容接口）。
    pub base_url: String,
    /// API Key（存储时加密，内存中明文）。
    #[serde(
        serialize_with = "serialize_key",
        deserialize_with = "deserialize_key"
    )]
    pub api_key: String,
    /// 模型名称。
    pub model: String,
}

/// 三层 AI 总配置。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct AiConfig {
    /// 配置结构版本。
    pub version: u32,
    /// 调度 AI：判断用户问题是简单还是复杂。
    pub scheduler: AiProviderConfig,
    /// 简单问题 AI（闲聊、心情、桌面帮助等）。
    pub simple: AiProviderConfig,
    /// 复杂问题 AI（代码、分析、多步推理等）。
    pub complex: AiProviderConfig,
}

impl Default for AiConfig {
    fn default() -> Self {
        Self {
            version: 1,
            scheduler: AiProviderConfig {
                base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1".to_string(),
                api_key: String::new(),
                model: "qwen-plus".to_string(),
            },
            simple: AiProviderConfig {
                base_url: "https://api.deepseek.com/v1".to_string(),
                api_key: String::new(),
                model: "deepseek-chat".to_string(),
            },
            complex: AiProviderConfig {
                base_url: "https://api.anthropic.com/v1".to_string(),
                api_key: String::new(),
                model: "claude-sonnet-4-6".to_string(),
            },
        }
    }
}

impl AiConfig {
    /// 加载 AI 配置，不存在则生成默认并落盘。
    pub fn load() -> Self {
        let path = ai_config_path();

        if !path.exists() {
            let cfg = Self::default();
            if let Err(e) = cfg.save() {
                tracing::warn!(error = %e, "默认 AI 配置写入失败，使用内存默认值");
            } else {
                tracing::info!(path = %path.display(), "已生成默认 AI 配置");
            }
            return cfg;
        }

        match std::fs::read_to_string(&path) {
            Ok(content) => match toml::from_str::<AiConfig>(&content) {
                Ok(cfg) => {
                    tracing::info!(path = %path.display(), "AI 配置已加载");
                    cfg
                }
                Err(e) => {
                    tracing::warn!(error = %e, "AI 配置解析失败，回退默认值");
                    Self::default()
                }
            },
            Err(e) => {
                tracing::warn!(error = %e, "AI 配置读取失败，回退默认值");
                Self::default()
            }
        }
    }

    /// 持久化 AI 配置到磁盘（TOML）。
    pub fn save(&self) -> Result<(), String> {
        let dir = paths::config_dir();
        paths::ensure_dir(&dir).map_err(|e| format!("创建配置目录失败: {e}"))?;

        let content = toml::to_string_pretty(self)
            .map_err(|e| format!("序列化 AI 配置失败: {e}"))?;
        std::fs::write(ai_config_path(), content)
            .map_err(|e| format!("写入 AI 配置失败: {e}"))?;
        Ok(())
    }

    /// 返回脱敏后的配置（API Key 仅显示首尾4字符），供前端展示。
    pub fn masked(&self) -> AiConfig {
        AiConfig {
            version: self.version,
            scheduler: self.scheduler.masked(),
            simple: self.simple.masked(),
            complex: self.complex.masked(),
        }
    }
}

impl AiProviderConfig {
    /// 脱敏 API Key：保留首尾各4字符，中间替换为 `****`。
    fn masked(&self) -> Self {
        let masked_key = if self.api_key.len() <= 8 {
            "****".to_string()
        } else {
            let visible = 4;
            let prefix = &self.api_key[..visible];
            let suffix = &self.api_key[self.api_key.len() - visible..];
            format!("{prefix}****{suffix}")
        };

        Self {
            base_url: self.base_url.clone(),
            api_key: masked_key,
            model: self.model.clone(),
        }
    }
}

// ── API Key 混淆（XOR + 设备指纹） ──

/// 基于设备信息生成混淆密钥（非加密级，仅防明文浏览）。
fn obfuscation_key() -> Vec<u8> {
    let user = std::env::var("USER")
        .or_else(|_| std::env::var("USERNAME"))
        .unwrap_or_default();
    let host = std::env::var("HOSTNAME")
        .or_else(|_| std::env::var("COMPUTERNAME"))
        .unwrap_or_default();
    let seed = format!("cyber-pet-ai-config-{user}-{host}");
    seed.bytes().cycle().take(32).collect()
}

fn xor_bytes(data: &[u8], key: &[u8]) -> Vec<u8> {
    data.iter()
        .zip(key.iter().cycle())
        .map(|(d, k)| d ^ k)
        .collect()
}

/// 自定义 base64 编解码（零外部依赖，绿色便携）。
mod base64 {
    const ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

    pub fn encode(data: &[u8]) -> String {
        let mut result = Vec::new();
        for chunk in data.chunks(3) {
            let b0 = chunk[0] as u32;
            let b1 = if chunk.len() > 1 { chunk[1] as u32 } else { 0 };
            let b2 = if chunk.len() > 2 { chunk[2] as u32 } else { 0 };
            let triple = (b0 << 16) | (b1 << 8) | b2;
            result.push(ALPHABET[((triple >> 18) & 0x3F) as usize]);
            result.push(ALPHABET[((triple >> 12) & 0x3F) as usize]);
            result.push(if chunk.len() > 1 {
                ALPHABET[((triple >> 6) & 0x3F) as usize]
            } else {
                b'='
            });
            result.push(if chunk.len() > 2 {
                ALPHABET[(triple & 0x3F) as usize]
            } else {
                b'='
            });
        }
        String::from_utf8_lossy(&result).into_owned()
    }

    pub fn decode(encoded: &str) -> Result<Vec<u8>, String> {
        let mut lookup = [0u8; 128];
        for (i, &c) in ALPHABET.iter().enumerate() {
            lookup[c as usize] = i as u8;
        }
        let trimmed = encoded.trim_end_matches('=');
        let mut result = Vec::new();
        let bytes: Vec<u8> = trimmed.bytes().collect();
        for chunk in bytes.chunks(4) {
            let mut buf = 0u32;
            let mut count = 0;
            for &b in chunk {
                if (b as usize) >= 128 {
                    return Err(format!("无效的 Base64 字符: 0x{b:02x}"));
                }
                let val = lookup[b as usize];
                if val == 0 && b != b'A' {
                    return Err(format!("无效的 Base64 字符: {}", b as char));
                }
                buf = (buf << 6) | (val as u32);
                count += 1;
            }
            match count {
                4 => {
                    result.push(((buf >> 16) & 0xFF) as u8);
                    result.push(((buf >> 8) & 0xFF) as u8);
                    result.push((buf & 0xFF) as u8);
                }
                3 => {
                    result.push(((buf >> 10) & 0xFF) as u8);
                    result.push(((buf >> 2) & 0xFF) as u8);
                }
                2 => {
                    result.push(((buf >> 4) & 0xFF) as u8);
                }
                _ => return Err("无效的 Base64 块".to_string()),
            }
        }
        Ok(result)
    }
}

fn serialize_key<S: serde::Serializer>(key: &str, s: S) -> Result<S::Ok, S::Error> {
    if key.is_empty() {
        return s.serialize_str("");
    }
    let obfuscated = xor_bytes(key.as_bytes(), &obfuscation_key());
    s.serialize_str(&base64::encode(&obfuscated))
}

fn deserialize_key<'de, D: serde::Deserializer<'de>>(d: D) -> Result<String, D::Error> {
    let encoded: String = Deserialize::deserialize(d)?;
    if encoded.is_empty() {
        return Ok(String::new());
    }
    let bytes = base64::decode(&encoded).map_err(serde::de::Error::custom)?;
    let decrypted = xor_bytes(&bytes, &obfuscation_key());
    String::from_utf8(decrypted).map_err(serde::de::Error::custom)
}

fn ai_config_path() -> std::path::PathBuf {
    paths::config_dir().join(AI_CONFIG_FILE)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_config_has_presets() {
        let cfg = AiConfig::default();
        assert_eq!(cfg.version, 1);
        // api_key 默认为空。
        assert!(cfg.scheduler.api_key.is_empty());
        assert!(!cfg.scheduler.base_url.is_empty());
        assert_eq!(cfg.scheduler.model, "qwen-plus");
        assert_eq!(cfg.simple.model, "deepseek-chat");
    }

    #[test]
    fn obfuscation_roundtrip() {
        let original = "sk-test-api-key-12345678";
        let key = obfuscation_key();
        let bytes = xor_bytes(original.as_bytes(), &key);
        let decoded = xor_bytes(&bytes, &key);
        assert_eq!(String::from_utf8(decoded).unwrap(), original);
    }

    #[test]
    fn base64_roundtrip() {
        let data = b"hello world test data";
        let encoded = base64::encode(data);
        let decoded = base64::decode(&encoded).expect("解码失败");
        assert_eq!(decoded, data);
    }

    #[test]
    fn base64_empty() {
        let decoded = base64::decode("").expect("解码失败");
        assert!(decoded.is_empty());
    }

    #[test]
    fn masked_key_short() {
        let cfg = AiProviderConfig {
            base_url: "https://example.com".into(),
            api_key: "short".into(),
            model: "test".into(),
        };
        let masked = cfg.masked();
        assert_eq!(masked.api_key, "****");
    }

    #[test]
    fn masked_key_long() {
        let cfg = AiProviderConfig {
            base_url: "https://example.com".into(),
            api_key: "sk-1234567890abcdef".into(),
            model: "test".into(),
        };
        let masked = cfg.masked();
        assert!(masked.api_key.starts_with("sk-1"));
        assert!(masked.api_key.ends_with("cdef"));
        assert!(masked.api_key.contains("****"));
    }

    #[test]
    fn config_serialize_roundtrip() {
        let original = AiConfig::default();
        let toml_str = toml::to_string_pretty(&original).expect("序列化失败");
        let parsed: AiConfig = toml::from_str(&toml_str).expect("反序列化失败");
        assert_eq!(parsed.version, original.version);
        assert_eq!(parsed.scheduler.model, original.scheduler.model);
    }
}
