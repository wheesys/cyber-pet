# Changelog

All notable changes to Cyber Pet will be documented in this file.

## [v0.1.0] — 2026-06-01

### 🎉 MVP 首发

**桌面宠物核心体验**

#### ✨ Added
- 宠物系统：创建/编辑/删除宠物，支持4种类型（猫/狗/兔子/自定义）和4种性格（古灵精怪/沉稳/聪明/文静）
- Pixi.js v8 动画引擎：60fps 程序化精灵，支持 idle/walk/run/sit/sleep 动作
- 行为状态机：性格加权随机决策 + poke 交互响应
- 宠物管理窗口：主从布局（左列表+右详情），表单预校验
- AI 三层架构：调度AI自动路由简单/复杂问题，支持流式SSE输出
- AI 对话：点击宠物→输入消息→流式气泡回复，支持 ChatHistory 上下文注入
- AI 配置界面：三供应商自定义 base URL / API Key / Model，XOR混淆存储
- 窗口管理：透明无边框舞台窗口 + 独立管理窗口 + 托盘图标
- 权限确认系统：oneshot channel 同步等待用户批准
- 文件工具：list/search files + create_empty_files（≤5个）
- 系统工具：OS/主机名/CPU/进程列表查询
- 系统通知：tauri-plugin-notification，窗口焦点感知切换
- 配置管理：TOML 便携模式（优先当前目录，回退 ~/.cyber-pet）
- SQLite 持久化：WAL模式，外键级联，v2 schema迁移
- 成本追踪：调用次数/token/费用统计

#### 📊 Stats
- Rust: 34 tests, Clippy 0 warnings
- TypeScript: 23 tests, ESLint 0 errors
- Binary size: 7.2 MB (Linux, stripped + LTO)
- Lines of code: ~5,000 (Rust + TypeScript)

#### 🔧 Tech Stack
- Tauri 2.0 (Rust)
- React 19 + TypeScript
- Pixi.js v8
- SQLite (rusqlite bundled)
- sysinfo, tracing, tokio

