# 阶段6/7补充功能设计文档

**日期**: 2026-05-31
**版本**: v1.0
**状态**: 已确认

---

## 1. 概述

补充阶段6（AI集成）和阶段7（基础工具）剩余功能，共4个子系统：

| 优先级 | 子系统 | 涉及范围 |
|--------|--------|---------|
| P0 | AI 流式响应 | AIClient SSE + AIService 统一入口 + ChatBubble 逐字显示 |
| P1 | 对话历史 | SQLite 表 + Rust CRUD + 前端历史 UI |
| P2 | 进程列表 | sysinfo crate + Rust tools 扩展 + Tauri command |
| P3 | 系统通知 | tauri-plugin-notification + 失焦通知/聚焦 Toast 切换 |

---

## 2. 子系统1: AI 流式响应 (P0)

### 2.1 数据流

```
App.tsx                    AIService                  AIClient
  │                           │                          │
  ├─ chatStream(msg) ────────>│                          │
  │                           ├─ 调度判断复杂度           │
  │                           ├─ chatStream(messages) ──>│
  │                           │                          ├─ fetch POST
  │                           │                          │  (stream:true)
  │                           │   AsyncGenerator<string> │
  │                           │<─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┤
  │   AsyncGenerator<string>   │                          │
  │<─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┤                          │
  ├─ 逐 chunk 更新 bubble     │                          │
  ├─ 流结束 → 保存到历史      │                          │
```

### 2.2 AIClient 改动

- 新增 `chatStream(messages: Message[]): AsyncGenerator<string>`
- POST body 增加 `stream: true`
- 使用 `response.body.getReader()` 逐行读取 SSE
- 解析 `data: {"choices":[{"delta":{"content":"..."}}]}` 行
- yield 每个 delta.content chunk
- 保持现有 `chat()` 方法不变（非流式场景仍可用）

### 2.3 AIService 改动

- 新增 `chatStream(personality, petName, userMessage): AsyncGenerator<string>`
- 内部流程：调度判断 → 选择供应商流式调用 → 失败降级
- 流结束后缓存完整回复（复用现有 cache Map）
- 流结束后自动保存对话历史（调用 save_chat_message）

### 2.4 ChatBubble 改动

- 新增 `append` 模式：支持增量文本追加，不替换已有内容
- 流式过程中显示打字效果，完成后进入消退计时

### 2.5 App.tsx 改动

- `handleSend` 改用 `aiService.chatStream()`
- `for await (const chunk of stream)` 逐 chunk 更新 bubble
- 流结束后触发气泡消退

---

## 3. 子系统2: 对话历史 (P1)

### 3.1 数据库表

```sql
CREATE TABLE chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pet_id INTEGER NOT NULL COMMENT '关联宠物ID',
    role TEXT NOT NULL CHECK(role IN ('user','assistant')) COMMENT '消息角色',
    content TEXT NOT NULL COMMENT '消息内容',
    created_at DATETIME NOT NULL DEFAULT (datetime('now')) COMMENT '创建时间'
);
CREATE INDEX idx_chat_messages_pet_id ON chat_messages(pet_id, created_at);
```

### 3.2 Rust 端

**database/mod.rs** 新增方法：
- `save_message(pet_id: i64, role: &str, content: &str) -> Result<i64>`
- `get_messages(pet_id: i64, limit: i64) -> Result<Vec<ChatMessage>>`
- `clear_history(pet_id: i64) -> Result<usize>`

**commands/mod.rs** 新增命令：
- `save_chat_message(db, pet_id, role, content) -> i64`
- `get_chat_history(db, pet_id, limit) -> Vec<ChatMessage>`
- `clear_chat_history(db, pet_id) -> usize`

### 3.3 前端

**AIService 集成**：
- `chatStream()` 完成后自动保存 user 和 assistant 消息
- `buildPrompt()` 注入最近 20 条历史消息作为上下文

**ChatHistory 组件（可选）**：
- 点击气泡或长按宠物展示历史面板
- 列表展示 user/assistant 消息，时间倒序

### 3.4 数据库迁移

- database 模块 schema_version 升级
- 新增 `chat_messages` 迁移 SQL

---

## 4. 子系统3: 进程列表 (P2)

### 4.1 依赖

```toml
# Cargo.toml
sysinfo = "0.32"
```

### 4.2 Rust 实现

**tools.rs** 扩展：
```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessInfo {
    pub pid: u32,
    pub name: String,
    pub cpu_percent: f32,
    pub memory_mb: f64,
}

pub fn get_processes() -> Vec<ProcessInfo> {
    // sysinfo::System::new_all() → processes() → 排序取 top 50
}
```

**commands/mod.rs** 新增：
- `get_processes() -> Vec<ProcessInfo>` — 需权限确认

### 4.3 前端

- pet-api.ts 新增 `getProcesses(): Promise<ProcessInfo[]>`
- 通过 AI 工具调用链路使用

---

## 5. 子系统4: 系统通知 (P3)

### 5.1 依赖

```toml
# Cargo.toml
tauri-plugin-notification = "2"
```

### 5.2 Rust 实现

**lib.rs**：
- `.plugin(tauri_plugin_notification::init())`

**commands/mod.rs** 新增：
- `send_notification(title: String, body: String)` — 发送系统通知

### 5.3 前端逻辑

**App.tsx** 新增判断逻辑：
- 触发提醒时检查窗口焦点状态
- 窗口失焦 → `send_notification`（系统通知）
- 窗口聚焦 → 现有 `Toast` 组件

---

## 6. 实施顺序

| 序号 | 子系统 | 预估工作量 |
|------|--------|-----------|
| 1 | 对话历史（DB 表 + Rust CRUD） | 先行，为流式提供存储基础 |
| 2 | AI 流式响应 | 核心功能 |
| 3 | 进程列表 | 轻量改动 |
| 4 | 系统通知 | 轻量改动 |

---

## 7. 测试策略

### 7.1 Rust 单元测试
- `chat_messages` 表 CRUD 测试（database 模块）
- `get_processes` 返回非空列表测试

### 7.2 前端 Vitest
- `AIClient.chatStream()` mock SSE 响应测试
- `AIService.chatStream()` 调度降级测试
- `ChatBubble` append 模式渲染测试
