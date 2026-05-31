# 阶段6/7补充功能实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补完阶段6（AI流式响应+对话历史）和阶段7（进程列表+系统通知）4个子系统。

**Architecture:** 遵循现有分层：Rust端 database→commands→lib.rs 注册；前端 AIClient→AIService→App.tsx 消费。对话历史存储于SQLite新表，流式响应通过SSE AsyncGenerator逐chunk推送，进程列表引入sysinfo crate，系统通知使用tauri-plugin-notification。

**Tech Stack:** Rust/rusqlite/sysinfo/tauri-plugin-notification, TypeScript/fetch SSE/React

---

### Task 1: 数据库迁移 v2 — chat_messages 表

**Files:**
- Modify: `cyber-pet-desktop/src-tauri/src/database/mod.rs:23` — 升级 TARGET_SCHEMA_VERSION
- Modify: `cyber-pet-desktop/src-tauri/src/database/mod.rs:75-77` — 触发 v2 迁移

- [ ] **Step 1: 编写 v2 迁移失败测试**

在 `database/mod.rs` 测试模块中添加：

```rust
#[test]
fn v2_migration_creates_chat_messages_table() {
    let db = memory_db();
    let conn = db.conn.lock().unwrap();

    // 验证 chat_messages 表存在且有正确的列。
    let mut stmt = conn
        .prepare("SELECT id, pet_id, role, content, created_at FROM chat_messages LIMIT 0")
        .expect("chat_messages 表应存在");

    // 验证 NOT NULL 约束。
    let result = conn.execute(
        "INSERT INTO chat_messages (pet_id, role, content) VALUES (NULL, 'user', 'test')",
        [],
    );
    assert!(result.is_err(), "pet_id 应拒绝 NULL");

    let result = conn.execute(
        "INSERT INTO chat_messages (pet_id, role, content) VALUES (1, 'invalid', 'test')",
        [],
    );
    assert!(result.is_err(), "role 应拒绝非法值");

    // 验证索引存在。
    conn.execute("SELECT 1 FROM chat_messages WHERE pet_id = 1", [])
        .expect("pet_id 索引应可用");
}
```

- [ ] **Step 2: 运行测试验证失败**

```bash
cd cyber-pet-desktop/src-tauri && cargo test database::tests::v2_migration_creates_chat_messages_table
```
预期: FAIL — chat_messages 表不存在

- [ ] **Step 3: 实现 v2 迁移**

修改 `database/mod.rs`：

```rust
// L23: 升级版本号
const TARGET_SCHEMA_VERSION: i64 = 2;

// L75-77: 在 migrate() 中添加
if current < 2 {
    apply_v2(&conn)?;
}
```

新增 `apply_v2` 函数：

```rust
/// 应用 v2 迁移：创建 chat_messages 表及索引（阶段6补充）。
fn apply_v2(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "BEGIN;
         CREATE TABLE chat_messages (
             id INTEGER PRIMARY KEY AUTOINCREMENT,
             pet_id INTEGER NOT NULL,
             role TEXT NOT NULL CHECK(role IN ('user','assistant')),
             content TEXT NOT NULL,
             created_at DATETIME NOT NULL DEFAULT (datetime('now'))
         );
         CREATE INDEX idx_chat_messages_pet_id ON chat_messages(pet_id, created_at);

         INSERT INTO schema_version (version, description) VALUES (2, 'Add chat_messages');
         COMMIT;",
    )
    .map_err(|e| format!("应用 v2 迁移失败: {e}"))
}
```

- [ ] **Step 4: 运行测试验证通过**

```bash
cd cyber-pet-desktop/src-tauri && cargo test database::tests::v2_migration_creates_chat_messages_table
```
预期: PASS

- [ ] **Step 5: 提交**

```bash
git add cyber-pet-desktop/src-tauri/src/database/mod.rs
git commit -m "feat(db): add v2 migration for chat_messages table"
```

---

### Task 2: Database CRUD — ChatMessage 结构体与消息持久化方法

**Files:**
- Modify: `cyber-pet-desktop/src-tauri/src/database/mod.rs` — 新增 ChatMessage、save_message、get_messages、clear_history

- [ ] **Step 1: 编写 CRUD 测试**

在 `database/mod.rs` 测试模块中添加：

```rust
use crate::database::ChatMessage;

#[test]
fn save_and_get_messages() {
    let db = memory_db();
    let pet = db.create_pet(&sample_pet()).expect("创建失败");
    let pid = pet.id.unwrap();

    // 保存消息。
    let id1 = db.save_message(pid, "user", "你好").expect("保存失败");
    let id2 = db.save_message(pid, "assistant", "你好呀~").expect("保存失败");
    assert!(id2 > id1);

    // 按时间正序获取。
    let msgs = db.get_messages(pid, 50).expect("查询失败");
    assert_eq!(msgs.len(), 2);
    assert_eq!(msgs[0].role, "user");
    assert_eq!(msgs[0].content, "你好");
    assert_eq!(msgs[1].role, "assistant");
    assert!(msgs[0].created_at.is_some());
}

#[test]
fn get_messages_respects_limit() {
    let db = memory_db();
    let pet = db.create_pet(&sample_pet()).expect("创建失败");
    let pid = pet.id.unwrap();

    for i in 0..5 {
        db.save_message(pid, "user", &format!("msg_{i}")).unwrap();
    }
    let msgs = db.get_messages(pid, 3).expect("查询失败");
    assert_eq!(msgs.len(), 3);
}

#[test]
fn clear_history_removes_all() {
    let db = memory_db();
    let pet = db.create_pet(&sample_pet()).expect("创建失败");
    let pid = pet.id.unwrap();

    db.save_message(pid, "user", "a").unwrap();
    db.save_message(pid, "assistant", "b").unwrap();

    let removed = db.clear_history(pid).expect("清除失败");
    assert_eq!(removed, 2);
    assert!(db.get_messages(pid, 10).unwrap().is_empty());
}

#[test]
fn get_messages_empty_pet_returns_empty() {
    let db = memory_db();
    let msgs = db.get_messages(999, 10).expect("查询失败");
    assert!(msgs.is_empty());
}
```

- [ ] **Step 2: 运行测试验证失败**

```bash
cd cyber-pet-desktop/src-tauri && cargo test database::tests::save_and_get_messages database::tests::get_messages_respects_limit database::tests::clear_history_removes_all database::tests::get_messages_empty_pet_returns_empty
```
预期: 全部 FAIL — save_message 等方法不存在

- [ ] **Step 3: 添加 ChatMessage 结构体和实现方法**

在 `database/mod.rs` 开头（`use` 之后、`Database` 定义之前）添加：

```rust
/// 对话消息记录。
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ChatMessage {
    pub id: Option<i64>,
    pub pet_id: i64,
    pub role: String,
    pub content: String,
    pub created_at: Option<String>,
}
```

在 `impl Database` 块末尾（`update_pet_state` 之后、`}` 之前）添加：

```rust
/// 保存一条对话消息，返回自增 id。
pub fn save_message(&self, pet_id: i64, role: &str, content: &str) -> Result<i64, String> {
    let conn = self.conn.lock().map_err(lock_err)?;
    conn.execute(
        "INSERT INTO chat_messages (pet_id, role, content) VALUES (?1, ?2, ?3)",
        rusqlite::params![pet_id, role, content],
    )
    .map_err(|e| format!("保存消息失败: {e}"))?;
    Ok(conn.last_insert_rowid())
}

/// 获取指定宠物的最近 N 条消息（按时间正序）。
pub fn get_messages(&self, pet_id: i64, limit: i64) -> Result<Vec<ChatMessage>, String> {
    let conn = self.conn.lock().map_err(lock_err)?;
    let mut stmt = conn
        .prepare(
            "SELECT id, pet_id, role, content, created_at
             FROM (
                 SELECT id, pet_id, role, content, created_at
                 FROM chat_messages
                 WHERE pet_id = ?1
                 ORDER BY created_at DESC
                 LIMIT ?2
             ) ORDER BY created_at ASC",
        )
        .map_err(|e| format!("准备查询失败: {e}"))?;

    let rows = stmt
        .query_map(rusqlite::params![pet_id, limit], |row| {
            Ok(ChatMessage {
                id: Some(row.get(0)?),
                pet_id: row.get(1)?,
                role: row.get(2)?,
                content: row.get(3)?,
                created_at: row.get(4)?,
            })
        })
        .map_err(|e| format!("查询消息失败: {e}"))?;

    let mut msgs = Vec::new();
    for r in rows {
        msgs.push(r.map_err(|e| format!("读取消息行失败: {e}"))?);
    }
    Ok(msgs)
}

/// 清空指定宠物的全部对话历史，返回删除条数。
pub fn clear_history(&self, pet_id: i64) -> Result<usize, String> {
    let conn = self.conn.lock().map_err(lock_err)?;
    let affected = conn
        .execute(
            "DELETE FROM chat_messages WHERE pet_id = ?1",
            rusqlite::params![pet_id],
        )
        .map_err(|e| format!("清除历史失败: {e}"))?;
    Ok(affected)
}
```

- [ ] **Step 4: 运行测试验证通过**

```bash
cd cyber-pet-desktop/src-tauri && cargo test database::tests::save_and_get_messages database::tests::get_messages_respects_limit database::tests::clear_history_removes_all database::tests::get_messages_empty_pet_returns_empty
```
预期: 全部 PASS

- [ ] **Step 5: 提交**

```bash
git add cyber-pet-desktop/src-tauri/src/database/mod.rs
git commit -m "feat(db): add chat message CRUD (save/get/clear)"
```

---

### Task 3: Chat History Tauri Commands

**Files:**
- Modify: `cyber-pet-desktop/src-tauri/src/commands/mod.rs` — 新增 3 个 command
- Modify: `cyber-pet-desktop/src-tauri/src/lib.rs` — 注册新命令

- [ ] **Step 1: 添加 chat history 命令**

在 `commands/mod.rs` 尾部添加：

```rust
/// 保存一条对话消息。
#[tauri::command]
pub fn save_chat_message(
    db: State<'_, Database>,
    pet_id: i64,
    role: String,
    content: String,
) -> Result<i64, String> {
    db.save_message(pet_id, &role, &content)
}

/// 获取指定宠物的最近 N 条对话历史。
#[tauri::command]
pub fn get_chat_history(
    db: State<'_, Database>,
    pet_id: i64,
    limit: i64,
) -> Result<Vec<crate::database::ChatMessage>, String> {
    db.get_messages(pet_id, limit)
}

/// 清空指定宠物的全部对话历史。
#[tauri::command]
pub fn clear_chat_history(
    db: State<'_, Database>,
    pet_id: i64,
) -> Result<usize, String> {
    db.clear_history(pet_id)
}
```

- [ ] **Step 2: 注册命令**

在 `lib.rs` 的 `invoke_handler` 宏中添加：

```rust
commands::save_chat_message,
commands::get_chat_history,
commands::clear_chat_history,
```

- [ ] **Step 3: 编译验证**

```bash
cd cyber-pet-desktop/src-tauri && cargo check
```
预期: 编译成功

- [ ] **Step 4: 提交**

```bash
git add cyber-pet-desktop/src-tauri/src/commands/mod.rs cyber-pet-desktop/src-tauri/src/lib.rs
git commit -m "feat(commands): add chat history Tauri commands"
```

---

### Task 4: Frontend Chat History API + Types

**Files:**
- Modify: `cyber-pet-desktop/src/services/pet-api.ts` — 新增类型和 API 函数

- [ ] **Step 1: 添加类型和 API**

在 `pet-api.ts` 尾部添加：

```typescript
// ── 对话历史（阶段6补充） ──

/** 对话消息记录。 */
export interface ChatMessage {
  id: number | null;
  pet_id: number;
  role: 'user' | 'assistant';
  content: string;
  created_at: string | null;
}

/** 保存一条对话消息，返回自增 id。 */
export async function saveChatMessage(
  petId: number,
  role: string,
  content: string,
): Promise<number> {
  return invoke<number>('save_chat_message', { petId, role, content });
}

/** 获取指定宠物的最近 N 条对话历史。 */
export async function getChatHistory(
  petId: number,
  limit: number = 50,
): Promise<ChatMessage[]> {
  return invoke<ChatMessage[]>('get_chat_history', { petId, limit });
}

/** 清空指定宠物的全部对话历史。 */
export async function clearChatHistory(petId: number): Promise<number> {
  return invoke<number>('clear_chat_history', { petId });
}
```

- [ ] **Step 2: TypeScript 编译验证**

```bash
cd cyber-pet-desktop && npx tsc --noEmit
```
预期: 无类型错误

- [ ] **Step 3: 提交**

```bash
git add cyber-pet-desktop/src/services/pet-api.ts
git commit -m "feat(api): add chat history frontend types and API"
```

---

### Task 5: AIClient — SSE 流式响应

**Files:**
- Modify: `cyber-pet-desktop/src/services/ai-client.ts` — 新增 chatStream 方法

- [ ] **Step 1: 编写流式响应测试**

在 `cyber-pet-desktop/src/services/pet-api.test.ts` 末尾添加：

```typescript
import { AIClient } from './ai-client';

describe('AIClient', () => {
  it('chatStream yields chunks from SSE response', async () => {
    const client = new AIClient({
      baseURL: 'http://localhost/fake',
      apiKey: 'test',
      model: 'test-model',
    });

    // Mock fetch 返回 SSE 格式流。
    const chunks = ['Hello', ' World', '!'];
    const sseBody = chunks
      .map((c) => `data: ${JSON.stringify({ choices: [{ delta: { content: c } }] })}\n\n`)
      .join('') + 'data: [DONE]\n\n';

    const mockReader = {
      read: vi
        .fn()
        .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(sseBody) })
        .mockResolvedValueOnce({ done: true, value: undefined }),
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: { getReader: () => mockReader },
    });

    const result: string[] = [];
    for await (const chunk of (client as any).chatStream([])) {
      result.push(chunk);
    }

    expect(result).toEqual(chunks);
  });

  it('chatStream throws on non-ok response', async () => {
    const client = new AIClient({
      baseURL: 'http://localhost/fake',
      apiKey: 'test',
      model: 'test-model',
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('Unauthorized'),
    });

    await expect(async () => {
      for await (const _ of (client as any).chatStream([])) { /* noop */ }
    }).rejects.toThrow('AI API 错误');
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

```bash
cd cyber-pet-desktop && npx vitest run --reporter=verbose src/services/pet-api.test.ts
```
预期: chatStream 测试 FAIL — 方法不存在

- [ ] **Step 3: 实现 chatStream 方法**

在 `ai-client.ts` 的 `AIClient` 类中添加（`chat()` 方法之后）：

```typescript
/** 流式聊天请求，返回 AsyncGenerator 逐 chunk yield delta content。 */
async *chatStream(messages: Message[]): AsyncGenerator<string> {
  const url = `${this.config.baseURL}/chat/completions`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.config.apiKey}`,
    },
    body: JSON.stringify({
      model: this.config.model,
      messages,
      temperature: 0.7,
      max_tokens: 1024,
      stream: true,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `AI API 错误 ${response.status}: ${text.slice(0, 200)}`
    );
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('流式响应不支持（response.body 为空）');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) continue;

      const data = trimmed.slice(6);
      if (data === '[DONE]') return;

      try {
        const parsed = JSON.parse(data);
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) yield content;
      } catch {
        // 跳过解析失败的行（如空行或注释）。
      }
    }
  }
}
```

- [ ] **Step 4: 运行测试验证通过**

```bash
cd cyber-pet-desktop && npx vitest run --reporter=verbose src/services/pet-api.test.ts
```
预期: chatStream 测试 PASS

- [ ] **Step 5: 提交**

```bash
git add cyber-pet-desktop/src/services/ai-client.ts cyber-pet-desktop/src/services/pet-api.test.ts
git commit -m "feat(ai): add SSE streaming support to AIClient"
```

---

### Task 6: AIService — 统一流式入口

**Files:**
- Modify: `cyber-pet-desktop/src/services/ai-service.ts` — 新增 chatStream 方法，注入历史上下文

- [ ] **Step 1: 编写 AIService 流式测试**

在 `pet-api.test.ts` 中添加：

```typescript
import { AIService } from './ai-service';

describe('AIService', () => {
  it('chatStream yields chunks and caches full response', async () => {
    const service = new AIService();
    // 注入 mock client。
    const mockClient = {
      chatStream: async function* () {
        yield 'Hello';
        yield ' World';
      },
      judgeComplexity: async () => 'simple' as const,
    };
    (service as any).simple = mockClient;
    (service as any).scheduler = mockClient;
    (service as any).initialized = true;

    const chunks: string[] = [];
    for await (const c of service.chatStream('playful', 'test', 'hi')) {
      chunks.push(c);
    }

    expect(chunks).toEqual(['Hello', ' World']);
    // Cache 应该有完整文本。
    const cached = (service as any).cache.get(
      'system:你是一只桌面宠物「test」。你古灵精怪、活泼好动，喜欢开玩笑。回复俏皮可爱，适当使用颜文字。|user:hi'
    );
    expect(cached).toBe('Hello World');
  });
});
```

- [ ] **Step 2: 实现 AIService.chatStream**

在 `ai-service.ts` 的 `AIService` 类中添加（`chat()` 方法之后）：

```typescript
/** 流式聊天请求。petId 可选，提供后会保存对话历史。 */
async *chatStream(
  personality: string,
  petName: string,
  userMessage: string,
  petId?: number,
): AsyncGenerator<string> {
  await this.init();

  const messages: Message[] = [
    { role: 'system', content: buildPrompt(personality, petName) },
    { role: 'user', content: userMessage },
  ];

  // 调度判断。
  let complexity: 'simple' | 'complex' = 'simple';
  if (this.scheduler) {
    try {
      complexity = await this.scheduler.judgeComplexity(userMessage);
    } catch {
      /* fallthrough */
    }
  }

  const ai =
    complexity === 'complex' && this.complex ? this.complex : this.simple;
  if (!ai) {
    const fallback = 'AI 服务未配置，请在管理窗口设置供应商信息。';
    yield fallback;
    return;
  }

  let fullResponse = '';
  try {
    for await (const chunk of ai.chatStream(messages)) {
      fullResponse += chunk;
      yield chunk;
    }
  } catch (err) {
    // 复杂AI失败降级简单AI。
    if (complexity === 'complex' && this.simple) {
      fullResponse = '';
      try {
        for await (const chunk of this.simple.chatStream(messages)) {
          fullResponse += chunk;
          yield chunk;
        }
      } catch {
        throw err; // 降级也失败，抛出原始错误。
      }
    } else {
      throw err;
    }
  }

  // 缓存完整回复。
  if (fullResponse) {
    const key = cacheKey(messages);
    this.cache.set(key, fullResponse);

    // 持久化对话历史。
    if (petId != null) {
      try {
        const { saveChatMessage } = await import('./pet-api');
        await saveChatMessage(petId, 'user', userMessage);
        await saveChatMessage(petId, 'assistant', fullResponse);
      } catch {
        // 历史保存失败不阻塞主流程。
      }
    }
  }
}
```

- [ ] **Step 3: 扩展 buildPrompt 注入历史上下文**

修改 `buildPrompt` 函数：

```typescript
function buildPrompt(
  personality: string,
  petName: string,
  history?: { role: string; content: string }[],
): string {
  const base = `你是一只桌面宠物「${petName}」。`;
  const map: Record<string, string> = {
    playful: `${base}你古灵精怪、活泼好动，喜欢开玩笑。回复俏皮可爱，适当使用颜文字。`,
    calm: `${base}你沉稳可靠、言辞得体。回复温和从容。`,
    smart: `${base}你聪明机智、知识渊博。回复逻辑清晰，保持亲切。`,
    shy: `${base}你文静害羞、不善言辞。回复简短含蓄，偶尔流露关心。`,
  };
  const prompt = map[personality] ?? `${base}你是一只可爱的桌面宠物。`;

  if (history && history.length > 0) {
    const context = history
      .map((m) => `${m.role === 'user' ? '用户' : '你'}: ${m.content}`)
      .join('\n');
    return `${prompt}\n\n对话历史（最近的在前）:\n${context}\n\n请根据历史上下文自然回复。`;
  }

  return prompt;
}
```

- [ ] **Step 4: TypeScript 编译验证**

```bash
cd cyber-pet-desktop && npx tsc --noEmit
```
预期: 无类型错误

- [ ] **Step 5: 提交**

```bash
git add cyber-pet-desktop/src/services/ai-service.ts cyber-pet-desktop/src/services/pet-api.test.ts
git commit -m "feat(ai): add unified streaming entry in AIService with history injection"
```

---

### Task 7: ChatBubble — 增量 append 模式

**Files:**
- Modify: `cyber-pet-desktop/src/components/ChatBubble.tsx` — 新增 append 模式

- [ ] **Step 1: 更新 ChatBubble 支持 append 模式**

用以下内容完全替换 `ChatBubble.tsx`：

```typescript
/**
 * ChatBubble — 宠物对话气泡。
 * 渲染在宠物上方，支持增量 append 模式（流式输出）。
 */

import { useEffect, useRef, useState } from 'react';

interface Props {
  text: string;
  x: number;
  y: number;
  /** true 时 text 追加而非替换，用于流式逐字显示。 */
  append?: boolean;
  /** 气泡消退时间（ms），0 表示不自动消退。 */
  duration?: number;
  onDone?: () => void;
}

export function ChatBubble({
  text,
  x,
  y,
  append = false,
  duration = 5000,
  onDone,
}: Props) {
  const [visible, setVisible] = useState(true);
  const [fullText, setFullText] = useState(text);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (append) {
      setFullText((prev) => prev + text);
    } else {
      setFullText(text);
    }
  }, [text, append]);

  useEffect(() => {
    if (duration <= 0) return;
    // 每次新内容重置消退计时。
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setVisible(false);
      onDone?.();
    }, duration);
    return () => clearTimeout(timerRef.current);
  }, [fullText, duration, onDone]);

  if (!visible || !fullText) return null;

  return (
    <div style={{ ...s.bubble, left: x, top: y - 60 }}>
      <span style={s.text}>{fullText}</span>
      <div style={s.arrow} />
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  bubble: {
    position: 'absolute',
    maxWidth: 200,
    padding: '8px 14px',
    borderRadius: 12,
    backgroundColor: 'rgba(30,30,46,0.92)',
    color: '#cdd6f4',
    fontSize: 13,
    lineHeight: 1.5,
    border: '1px solid #45475a',
    pointerEvents: 'none',
    zIndex: 10,
    transition: 'opacity 0.3s',
  },
  text: { wordBreak: 'break-word' },
  arrow: {
    position: 'absolute',
    bottom: -6,
    left: '50%',
    transform: 'translateX(-50%)',
    width: 0,
    height: 0,
    borderLeft: '6px solid transparent',
    borderRight: '6px solid transparent',
    borderTop: '6px solid rgba(30,30,46,0.92)',
  },
};
```

- [ ] **Step 2: 编译验证**

```bash
cd cyber-pet-desktop && npx tsc --noEmit
```
预期: 无类型错误

- [ ] **Step 3: 提交**

```bash
git add cyber-pet-desktop/src/components/ChatBubble.tsx
git commit -m "feat(ui): add append mode to ChatBubble for streaming"
```

---

### Task 8: App.tsx — 流式对话 + 历史上下文集成

**Files:**
- Modify: `cyber-pet-desktop/src/App.tsx` — handleSend 使用流式

- [ ] **Step 1: 重写 handleSend 函数**

在 `App.tsx` 中替换 `handleSend` 函数（L170-194）：

```typescript
// 发送消息 → AI 流式回复 → 气泡逐字展示。
const handleSend = async (message: string) => {
  if (activePetIds.length === 0) return;
  const petId = activePetIds[0];
  const pet = petsRef.current.find((p) => p.id === petId);
  const engine = engineRef.current;
  if (!engine || !pet) return;

  setChatting(true);
  const sprite = engine.getPet(String(petId));
  const baseX = sprite?.x ?? 100;
  const baseY = sprite?.y ?? 100;

  // 先设置空 bubble 占位，后续流式 append。
  setBubble({ text: '', x: baseX, y: baseY });

  let fullText = '';
  try {
    for await (const chunk of aiService.chatStream(
      pet.personality,
      pet.name,
      message,
      pet.id ?? undefined,
    )) {
      fullText += chunk;
      setBubble({ text: chunk, x: baseX, y: baseY });
    }
    // 流结束，成本统计。
    await invoke('record_ai_call', {
      tokens: Math.ceil(message.length / 2 + fullText.length / 2),
    });
  } catch (err) {
    setBubble({
      text: `(AI 请求失败: ${err})`,
      x: baseX,
      y: baseY,
    });
  }
  setChatting(false);
};
```

在 JSX 中更新 ChatBubble 调用（L213-219），添加 `append` 属性：

```tsx
{/* 对话气泡 */}
{bubble && (
  <ChatBubble
    text={bubble.text}
    x={bubble.x}
    y={bubble.y}
    append={chatting}
    duration={chatting ? 0 : 5000}
    onDone={() => setBubble(null)}
  />
)}
```

- [ ] **Step 2: TypeScript 编译验证**

```bash
cd cyber-pet-desktop && npx tsc --noEmit
```
预期: 无类型错误

- [ ] **Step 3: 提交**

```bash
git add cyber-pet-desktop/src/App.tsx
git commit -m "feat(app): integrate streaming AI chat with history persistence"
```

---

### Task 9: 进程列表 — sysinfo 集成

**Files:**
- Modify: `cyber-pet-desktop/src-tauri/Cargo.toml` — 添加 sysinfo 依赖
- Modify: `cyber-pet-desktop/src-tauri/src/tools.rs` — 新增 ProcessInfo + get_processes
- Modify: `cyber-pet-desktop/src-tauri/src/commands/mod.rs` — 新增 get_processes 命令
- Modify: `cyber-pet-desktop/src-tauri/src/lib.rs` — 注册命令
- Modify: `cyber-pet-desktop/src/services/pet-api.ts` — 新增前端 API

- [ ] **Step 1: 添加 sysinfo 依赖**

在 `Cargo.toml` 的 `[dependencies]` 中添加：

```toml
sysinfo = "0.32"
```

- [ ] **Step 2: 编写进程列表测试**

在 `tools.rs` 的 `tests` 模块中添加：

```rust
#[test]
fn get_processes_returns_non_empty() {
    let procs = get_processes();
    assert!(!procs.is_empty(), "应至少返回当前进程");
    // 验证返回数量不超过 50（限制）。
    assert!(procs.len() <= 50);
    // 验证字段有值。
    let first = &procs[0];
    assert!(first.pid > 0);
    assert!(!first.name.is_empty());
}

#[test]
fn get_processes_sorted_by_cpu() {
    let procs = get_processes();
    for w in procs.windows(2) {
        assert!(w[0].cpu_percent >= w[1].cpu_percent, "应按 CPU 降序排列");
    }
}
```

- [ ] **Step 3: 实现 get_processes**

在 `tools.rs` 中添加 `ProcessInfo` 结构体和 `get_processes` 函数：

```rust
/// 进程信息。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessInfo {
    pub pid: u32,
    pub name: String,
    pub cpu_percent: f32,
    pub memory_mb: f64,
}

/// 获取当前系统进程列表（按 CPU 使用率降序，最多 50 个）。
pub fn get_processes() -> Vec<ProcessInfo> {
    use sysinfo::System;

    let mut sys = System::new_all();
    sys.refresh_all();

    // 短暂等待让 CPU 采样生效。
    std::thread::sleep(std::time::Duration::from_millis(100));
    sys.refresh_all();

    let mut procs: Vec<ProcessInfo> = sys
        .processes()
        .iter()
        .map(|(pid, p)| ProcessInfo {
            pid: pid.as_u32(),
            name: p.name().to_string_lossy().into_owned(),
            cpu_percent: p.cpu_usage() as f32,
            memory_mb: p.memory() as f64 / (1024.0 * 1024.0),
        })
        .collect();

    // 按 CPU 降序，限制 50 个。
    procs.sort_by(|a, b| b.cpu_percent.partial_cmp(&a.cpu_percent).unwrap_or(std::cmp::Ordering::Equal));
    procs.truncate(50);
    procs
}
```

- [ ] **Step 4: 添加 Tauri 命令**

在 `commands/mod.rs` 末尾添加：

```rust
/// 获取当前系统进程列表（按 CPU 降序，最多 50 个）。
#[tauri::command]
pub fn get_processes() -> Vec<tools::ProcessInfo> {
    tools::get_processes()
}
```

在 `lib.rs` 的 `invoke_handler` 宏中添加：

```rust
commands::get_processes,
```

- [ ] **Step 5: 添加前端 API**

在 `pet-api.ts` 末尾添加：

```typescript
// ── 进程列表（阶段7补充） ──

/** 进程信息。 */
export interface ProcessInfo {
  pid: number;
  name: string;
  cpu_percent: number;
  memory_mb: number;
}

/** 获取当前系统进程列表。 */
export async function getProcesses(): Promise<ProcessInfo[]> {
  return invoke<ProcessInfo[]>('get_processes');
}
```

- [ ] **Step 6: 编译 + 测试**

```bash
cd cyber-pet-desktop/src-tauri && cargo test tools::tests::get_processes_returns_non_empty tools::tests::get_processes_sorted_by_cpu && cargo check
```
预期: 测试 PASS + 编译成功

- [ ] **Step 7: 提交**

```bash
git add cyber-pet-desktop/src-tauri/Cargo.toml cyber-pet-desktop/src-tauri/src/tools.rs cyber-pet-desktop/src-tauri/src/commands/mod.rs cyber-pet-desktop/src-tauri/src/lib.rs cyber-pet-desktop/src/services/pet-api.ts
git commit -m "feat(tools): add process list via sysinfo crate"
```

---

### Task 10: 系统通知

**Files:**
- Modify: `cyber-pet-desktop/src-tauri/Cargo.toml` — 添加 tauri-plugin-notification
- Modify: `cyber-pet-desktop/src-tauri/src/lib.rs` — 注册 plugin + add send_notification command

- [ ] **Step 1: 添加 notification plugin 依赖**

在 `Cargo.toml` 的 `[dependencies]` 中添加：

```toml
tauri-plugin-notification = "2"
```

- [ ] **Step 2: Rust 端集成**

在 `lib.rs` 中添加 plugin：

```rust
.plugin(tauri_plugin_notification::init())
```

在 `commands/mod.rs` 末尾添加：

```rust
/// 发送系统通知。
#[tauri::command]
pub fn send_notification(app: AppHandle, title: String, body: String) -> Result<(), String> {
    use tauri_plugin_notification::NotificationExt;
    app.notification()
        .builder()
        .title(&title)
        .body(&body)
        .show()
        .map_err(|e| format!("发送通知失败: {e}"))
}
```

在 `lib.rs` 的 `invoke_handler` 宏中添加：

```rust
commands::send_notification,
```

- [ ] **Step 3: 前端集成 — 窗口焦点感知通知**

在 `pet-api.ts` 末尾添加：

```typescript
/** 发送系统通知（OS 原生通知渠道）。 */
export async function sendNotification(
  title: string,
  body: string,
): Promise<void> {
  return invoke<void>('send_notification', { title, body });
}
```

在 `App.tsx` 中新增 hook（放在其他 useEffect 之后）：

```typescript
// 监听窗口焦点状态，用于通知渠道切换。
const [windowFocused, setWindowFocused] = useState(true);
useEffect(() => {
  let unlistenFocus: UnlistenFn | undefined;
  let unlistenBlur: UnlistenFn | undefined;
  import('@tauri-apps/api/event').then(({ listen }) => {
    listen<boolean>('tauri://focus', () => setWindowFocused(true)).then((fn) => { unlistenFocus = fn; });
    listen<boolean>('tauri://blur', () => setWindowFocused(false)).then((fn) => { unlistenBlur = fn; });
  });
  return () => {
    unlistenFocus?.();
    unlistenBlur?.();
  };
}, []);
```

更新礼物和通知场景，添加 `notify` 辅助函数：

```typescript
/** 发送提醒：聚焦用 Toast，失焦用系统通知。 */
const notify = async (title: string, message: string) => {
  if (windowFocused) {
    setToast(message);
  } else {
    try {
      await sendNotification(title, message);
    } catch {
      // 通知失败降级，静默忽略。
    }
  }
};
```

在 `handleClick` 中的礼物逻辑替换 `setToast` 为 `notify`：

```typescript
if (Math.random() < 0.1 && activePetIds.length > 1) {
  const gifter = petsRef.current.find((p) => p.id !== activePetIds[0]);
  if (gifter) {
    notify('🎁 礼物', `「${gifter.name}」送了你一份礼物！`);
  }
}
```

- [ ] **Step 4: 编译验证**

```bash
cd cyber-pet-desktop/src-tauri && cargo check
```
预期: 编译成功

- [ ] **Step 5: 前端编译验证**

```bash
cd cyber-pet-desktop && npx tsc --noEmit
```
预期: 无类型错误

- [ ] **Step 6: 提交**

```bash
git add cyber-pet-desktop/src-tauri/Cargo.toml cyber-pet-desktop/src-tauri/src/lib.rs cyber-pet-desktop/src-tauri/src/commands/mod.rs cyber-pet-desktop/src/services/pet-api.ts cyber-pet-desktop/src/App.tsx
git commit -m "feat(notify): add system notification via tauri-plugin-notification"
```

---

## 实施总结

| 序号 | 任务 | 涉及文件 | 预估耗时 |
|------|------|---------|---------|
| 1 | DB v2 迁移 | `database/mod.rs` | 10min |
| 2 | Chat CRUD | `database/mod.rs` | 15min |
| 3 | Chat 命令注册 | `commands/mod.rs`, `lib.rs` | 5min |
| 4 | 前端 Chat API | `pet-api.ts` | 5min |
| 5 | AIClient SSE | `ai-client.ts`, `pet-api.test.ts` | 15min |
| 6 | AIService 流式 | `ai-service.ts`, `pet-api.test.ts` | 15min |
| 7 | ChatBubble append | `ChatBubble.tsx` | 10min |
| 8 | App 流式集成 | `App.tsx` | 10min |
| 9 | 进程列表 | `Cargo.toml`, `tools.rs`, `commands`, `lib.rs`, `pet-api.ts` | 15min |
| 10 | 系统通知 | `Cargo.toml`, `lib.rs`, `commands`, `pet-api.ts`, `App.tsx` | 15min |

**总计**: 约 1.5 小时工作，10 次提交。
