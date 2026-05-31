# Cyber Pet MVP 发布说明

**版本**: v0.1.0-MVP | **日期**: 2026-05-31 | **完成度**: 80%

## 已实现功能

### 宠物系统
- 数据模型 + SQLite CRUD + 状态管理
- Pixi.js v8 动画引擎 (60fps, idle/walk/run/sit/sleep)
- 行为状态机（性格加权随机决策 + poke 交互）
- 管理窗口（左列表+右详情 + 创建/编辑/删除 + 舞台联动）

### AI 集成
- 三层架构（调度AI → 简单/复杂AI 自动路由 + fallback）
- OpenAI 兼容接口（自定义 base URL/api key/model）
- 配置持久化（TOML + XOR 混淆 + 脱敏）
- 对话界面（ChatBubble + ChatInput + 性格化 Prompt）
- 成本追踪（调用次数/token/费用 JSON 持久化）

### 基础工具
- 权限确认（oneshot channel 同步等待用户批准）
- 文件管理（list/search + 空文件创建 ≤5个）
- 系统信息（OS/主机名/CPU）

## 技术栈

| 层 | 技术 |
|----|------|
| 桌面 | Tauri 2.0 (Rust) |
| 渲染 | React 19 + Pixi.js v8 |
| 存储 | SQLite + TOML + JSON |
| 测试 | cargo test (25) + Vitest (20) |

## 下一步

- 阶段10: 多宠物互动
- 阶段11: P2P 网络
- 阶段12: 账户体系
