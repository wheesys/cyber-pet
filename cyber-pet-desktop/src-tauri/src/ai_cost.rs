//! AI 调用成本追踪模块（阶段6.4）。
//!
//! 职责：记录每次 AI 调用的 token 消耗与估算成本，持久化到 JSON。

use serde::{Deserialize, Serialize};

use crate::paths;

const COST_FILE: &str = "cost.json";
const PRICE_PER_M_TOKEN: f64 = 0.5; // 保守估计混合模型均价

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AiCostTracker {
    pub total_calls: u64,
    pub estimated_tokens: u64,
    pub estimated_cost_usd: f64,
}

impl AiCostTracker {
    pub fn load() -> Self {
        let path = cost_path();
        if !path.exists() {
            return Self::default();
        }
        std::fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    }

    pub fn record(&mut self, tokens: u64) -> Result<(), String> {
        self.total_calls += 1;
        self.estimated_tokens += tokens;
        self.estimated_cost_usd += tokens as f64 / 1_000_000.0 * PRICE_PER_M_TOKEN;
        self.save()
    }

    fn save(&self) -> Result<(), String> {
        let dir = paths::data_root().clone();
        paths::ensure_dir(&dir).map_err(|e| format!("创建数据目录失败: {e}"))?;
        let json = serde_json::to_string_pretty(self).map_err(|e| format!("序列化失败: {e}"))?;
        std::fs::write(cost_path(), json).map_err(|e| format!("写入失败: {e}"))
    }
}

fn cost_path() -> std::path::PathBuf {
    paths::data_root().join(COST_FILE)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_are_zero() {
        let t = AiCostTracker::default();
        assert_eq!(t.total_calls, 0);
    }

    #[test]
    fn record_increments() {
        let mut t = AiCostTracker::default();
        t.record(1000).unwrap();
        assert_eq!(t.total_calls, 1);
        assert!(t.estimated_cost_usd > 0.0);
    }

    #[test]
    fn json_roundtrip() {
        let t = AiCostTracker {
            total_calls: 10,
            estimated_tokens: 5000,
            estimated_cost_usd: 0.0025,
        };
        let json = serde_json::to_string(&t).unwrap();
        let parsed: AiCostTracker = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.total_calls, 10);
    }
}
