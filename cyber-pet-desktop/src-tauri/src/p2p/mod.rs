//! P2P 网络模块（阶段11 — 基础框架）。
//! 默认关闭。真实 libp2p 接入待后续。

use serde::{Deserialize, Serialize};
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum P2pStatus {
    Disabled,
    Listening,
    Connected { peer_count: usize },
    Error(String),
}

pub struct P2pState {
    pub status: Mutex<P2pStatus>,
}

impl P2pState {
    pub fn new() -> Self {
        Self { status: Mutex::new(P2pStatus::Disabled) }
    }

    pub fn get_status(&self) -> P2pStatus {
        self.status.lock().map(|s| s.clone()).unwrap_or(P2pStatus::Error("锁失败".into()))
    }

    pub fn enable(&self) -> Result<(), String> {
        let mut s = self.status.lock().map_err(|e| format!("锁失败: {e}"))?;
        *s = P2pStatus::Listening;
        tracing::info!("P2P 已启用");
        Ok(())
    }

    pub fn disable(&self) -> Result<(), String> {
        let mut s = self.status.lock().map_err(|e| format!("锁失败: {e}"))?;
        *s = P2pStatus::Disabled;
        tracing::info!("P2P 已禁用");
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_disabled() {
        let s = P2pState::new();
        assert_eq!(s.get_status(), P2pStatus::Disabled);
    }

    #[test]
    fn enable_disable_roundtrip() {
        let s = P2pState::new();
        s.enable().unwrap();
        assert_eq!(s.get_status(), P2pStatus::Listening);
        s.disable().unwrap();
        assert_eq!(s.get_status(), P2pStatus::Disabled);
    }
}
