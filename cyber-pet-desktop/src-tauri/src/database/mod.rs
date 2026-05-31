//! 数据库模块
//!
//! 职责：SQLite 连接管理、Schema 迁移、宠物及状态的持久化（CRUD）。
//! 参考《06-数据库设计文档》3.1/3.2 表结构、第六节 迁移方案。
//!
//! 设计要点：
//! - 连接：单连接 + `Mutex` 串行化（桌宠写并发极低，YAGNI 不引连接池）。
//! - 位置：`<data_root>/db/cyber-pet.db`，由 `paths::db_dir` 解析（便携优先）。
//! - PRAGMA：开启外键级联（设计文档要求）、WAL 模式（提升并发读）。
//! - 迁移：`schema_version` 表记录版本，启动时增量执行未应用的迁移。

use std::sync::Mutex;

use rusqlite::{params, Connection};

use crate::paths;
use crate::pet::{NewPet, Pet, PetState, Personality, PetType};

/// 数据库文件名。
const DB_FILE: &str = "cyber-pet.db";

/// 当前 Schema 目标版本。每次新增迁移时 +1。
const TARGET_SCHEMA_VERSION: i64 = 2;

/// 数据库句柄，通过 `Mutex` 串行化访问，作为 Tauri state 管理。
pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    /// 打开（或创建）数据库，应用 PRAGMA 与迁移。
    pub fn open() -> Result<Self, String> {
        let dir = paths::db_dir();
        paths::ensure_dir(&dir).map_err(|e| format!("创建数据库目录失败: {e}"))?;
        let db_path = dir.join(DB_FILE);

        let conn = Connection::open(&db_path).map_err(|e| format!("打开数据库失败: {e}"))?;

        // 外键级联（pet_states 随 pets 删除）与 WAL 模式。
        conn.execute_batch(
            "PRAGMA foreign_keys = ON;
             PRAGMA journal_mode = WAL;",
        )
        .map_err(|e| format!("设置 PRAGMA 失败: {e}"))?;

        let db = Self {
            conn: Mutex::new(conn),
        };
        db.migrate()?;
        tracing::info!(path = %db_path.display(), "数据库已就绪");
        Ok(db)
    }

    /// 执行增量迁移，将 Schema 升级到目标版本。
    fn migrate(&self) -> Result<(), String> {
        let conn = self.conn.lock().map_err(lock_err)?;

        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS schema_version (
                version INTEGER PRIMARY KEY,
                applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                description TEXT
            );",
        )
        .map_err(|e| format!("创建版本表失败: {e}"))?;

        let current: i64 = conn
            .query_row(
                "SELECT COALESCE(MAX(version), 0) FROM schema_version",
                [],
                |row| row.get(0),
            )
            .map_err(|e| format!("读取 Schema 版本失败: {e}"))?;

        if current < 1 {
            apply_v1(&conn)?;
        }
        if current < 2 {
            apply_v2(&conn)?;
        }

        tracing::info!(from = current, to = TARGET_SCHEMA_VERSION, "数据库迁移完成");
        Ok(())
    }

    /// 创建宠物并初始化其默认状态，返回带 id 的完整宠物。
    pub fn create_pet(&self, new_pet: &NewPet) -> Result<Pet, String> {
        let mut conn = self.conn.lock().map_err(lock_err)?;
        let tx = conn.transaction().map_err(|e| format!("开启事务失败: {e}"))?;

        tx.execute(
            "INSERT INTO pets (name, type, personality, avatar_path)
             VALUES (?1, ?2, ?3, ?4)",
            params![
                new_pet.name,
                new_pet.pet_type.as_str(),
                new_pet.personality.as_str(),
                new_pet.avatar_path,
            ],
        )
        .map_err(|e| format!("插入宠物失败: {e}"))?;

        let pet_id = tx.last_insert_rowid();

        // 初始化默认状态行。
        let state = PetState::default_for(pet_id);
        tx.execute(
            "INSERT INTO pet_states (pet_id, mood, energy, position_x, position_y, current_action)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                state.pet_id,
                state.mood,
                state.energy,
                state.position_x,
                state.position_y,
                state.current_action,
            ],
        )
        .map_err(|e| format!("初始化宠物状态失败: {e}"))?;

        tx.commit().map_err(|e| format!("提交事务失败: {e}"))?;
        drop(conn);

        self.get_pet(pet_id)?
            .ok_or_else(|| "创建后未能读回宠物".to_string())
    }

    /// 查询所有激活的宠物（按创建时间倒序）。
    pub fn list_pets(&self) -> Result<Vec<Pet>, String> {
        let conn = self.conn.lock().map_err(lock_err)?;
        let mut stmt = conn
            .prepare(
                "SELECT id, name, type, personality, avatar_path, level, experience,
                        created_at, updated_at
                 FROM pets WHERE is_active = 1
                 ORDER BY created_at DESC",
            )
            .map_err(|e| format!("准备查询失败: {e}"))?;

        let rows = stmt
            .query_map([], row_to_pet)
            .map_err(|e| format!("查询宠物失败: {e}"))?;

        let mut pets = Vec::new();
        for r in rows {
            pets.push(r.map_err(|e| format!("读取宠物行失败: {e}"))?);
        }
        Ok(pets)
    }

    /// 按 id 查询单个宠物（仅激活的）。
    pub fn get_pet(&self, pet_id: i64) -> Result<Option<Pet>, String> {
        let conn = self.conn.lock().map_err(lock_err)?;
        let result = conn.query_row(
            "SELECT id, name, type, personality, avatar_path, level, experience,
                    created_at, updated_at
             FROM pets WHERE id = ?1 AND is_active = 1",
            params![pet_id],
            row_to_pet,
        );

        match result {
            Ok(pet) => Ok(Some(pet)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(format!("查询宠物失败: {e}")),
        }
    }

    /// 更新宠物名称与性格（类型不可变，字段级验证由命令层负责）。
    pub fn update_pet(&self, pet_id: i64, name: &str, personality: &str) -> Result<Pet, String> {
        let conn = self.conn.lock().map_err(lock_err)?;
        let affected = conn
            .execute(
                "UPDATE pets SET name = ?1, personality = ?2, updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?3 AND is_active = 1",
                params![name, personality, pet_id],
            )
            .map_err(|e| format!("更新宠物失败: {e}"))?;

        if affected == 0 {
            return Err("宠物不存在或已删除".to_string());
        }
        drop(conn);

        self.get_pet(pet_id)?
            .ok_or_else(|| "更新后未能读回宠物".to_string())
    }

    /// 软删除宠物（标记 is_active = 0，保留历史）。
    pub fn delete_pet(&self, pet_id: i64) -> Result<bool, String> {
        let conn = self.conn.lock().map_err(lock_err)?;
        let affected = conn
            .execute(
                "UPDATE pets SET is_active = 0, updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?1 AND is_active = 1",
                params![pet_id],
            )
            .map_err(|e| format!("删除宠物失败: {e}"))?;
        Ok(affected > 0)
    }

    /// 读取宠物状态。
    pub fn get_pet_state(&self, pet_id: i64) -> Result<Option<PetState>, String> {
        let conn = self.conn.lock().map_err(lock_err)?;
        let result = conn.query_row(
            "SELECT pet_id, mood, energy, position_x, position_y, current_action
             FROM pet_states WHERE pet_id = ?1",
            params![pet_id],
            |row| {
                Ok(PetState {
                    pet_id: row.get(0)?,
                    mood: row.get(1)?,
                    energy: row.get(2)?,
                    position_x: row.get(3)?,
                    position_y: row.get(4)?,
                    current_action: row.get(5)?,
                })
            },
        );

        match result {
            Ok(state) => Ok(Some(state)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(format!("查询宠物状态失败: {e}")),
        }
    }

    /// 更新宠物状态（位置、动作、心情、能量）。
    pub fn update_pet_state(&self, state: &PetState) -> Result<(), String> {
        let conn = self.conn.lock().map_err(lock_err)?;
        conn.execute(
            "UPDATE pet_states
             SET mood = ?2, energy = ?3, position_x = ?4, position_y = ?5,
                 current_action = ?6, updated_at = CURRENT_TIMESTAMP,
                 last_active = CURRENT_TIMESTAMP
             WHERE pet_id = ?1",
            params![
                state.pet_id,
                state.mood,
                state.energy,
                state.position_x,
                state.position_y,
                state.current_action,
            ],
        )
        .map_err(|e| format!("更新宠物状态失败: {e}"))?;
        Ok(())
    }
}

/// 应用 v1 迁移：创建 pets / pet_states 表及索引。
fn apply_v1(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "BEGIN;
         CREATE TABLE pets (
             id INTEGER PRIMARY KEY AUTOINCREMENT,
             name TEXT NOT NULL,
             type TEXT NOT NULL,
             personality TEXT NOT NULL,
             avatar_path TEXT,
             level INTEGER DEFAULT 1,
             experience INTEGER DEFAULT 0,
             created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
             updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
             is_active INTEGER DEFAULT 1,
             CHECK (level >= 1 AND level <= 100),
             CHECK (experience >= 0),
             CHECK (is_active IN (0, 1))
         );
         CREATE INDEX idx_pets_is_active ON pets(is_active);
         CREATE INDEX idx_pets_created_at ON pets(created_at DESC);
         CREATE INDEX idx_pets_type ON pets(type);

         CREATE TABLE pet_states (
             id INTEGER PRIMARY KEY AUTOINCREMENT,
             pet_id INTEGER NOT NULL,
             mood INTEGER DEFAULT 50,
             energy INTEGER DEFAULT 100,
             position_x REAL DEFAULT 0,
             position_y REAL DEFAULT 0,
             current_action TEXT DEFAULT 'idle',
             last_active DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
             updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
             FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE CASCADE,
             CHECK (mood >= 0 AND mood <= 100),
             CHECK (energy >= 0 AND energy <= 100)
         );
         CREATE UNIQUE INDEX idx_pet_states_pet_id ON pet_states(pet_id);
         CREATE INDEX idx_pet_states_last_active ON pet_states(last_active DESC);

         INSERT INTO schema_version (version, description) VALUES (1, 'Initial schema');
         COMMIT;",
    )
    .map_err(|e| format!("应用 v1 迁移失败: {e}"))
}

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

/// 将查询行映射为 Pet（pets 表列顺序固定，集中此处避免重复，DRY）。
fn row_to_pet(row: &rusqlite::Row) -> rusqlite::Result<Pet> {
    let pet_type: String = row.get(2)?;
    let personality: String = row.get(3)?;
    Ok(Pet {
        id: Some(row.get(0)?),
        name: row.get(1)?,
        pet_type: PetType::from_str(&pet_type),
        personality: Personality::from_str(&personality),
        avatar_path: row.get(4)?,
        level: row.get(5)?,
        experience: row.get(6)?,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
    })
}

/// 统一锁错误信息。
fn lock_err<T>(e: std::sync::PoisonError<T>) -> String {
    format!("数据库锁获取失败: {e}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pet::{NewPet, Personality, PetType};

    /// 构造内存数据库并应用迁移，用于隔离测试。
    fn memory_db() -> Database {
        let conn = Connection::open_in_memory().expect("打开内存库失败");
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        let db = Database {
            conn: Mutex::new(conn),
        };
        db.migrate().expect("迁移失败");
        db
    }

    fn sample_pet() -> NewPet {
        NewPet {
            name: "小白".to_string(),
            pet_type: PetType::Cat,
            personality: Personality::Playful,
            avatar_path: Some("/assets/pets/cat_white.png".to_string()),
        }
    }

    #[test]
    fn create_and_get_pet() {
        let db = memory_db();
        let pet = db.create_pet(&sample_pet()).expect("创建失败");
        let id = pet.id.expect("应有 id");
        assert_eq!(pet.name, "小白");
        assert_eq!(pet.level, 1);

        let fetched = db.get_pet(id).expect("查询失败").expect("应存在");
        assert_eq!(fetched.name, "小白");
        assert_eq!(fetched.pet_type, PetType::Cat);
    }

    #[test]
    fn create_pet_initializes_state() {
        let db = memory_db();
        let pet = db.create_pet(&sample_pet()).expect("创建失败");
        let state = db
            .get_pet_state(pet.id.unwrap())
            .expect("查询失败")
            .expect("应有默认状态");
        assert_eq!(state.mood, 50);
        assert_eq!(state.energy, 100);
        assert_eq!(state.current_action, "idle");
    }

    #[test]
    fn soft_delete_hides_pet() {
        let db = memory_db();
        let pet = db.create_pet(&sample_pet()).expect("创建失败");
        let id = pet.id.unwrap();

        assert!(db.delete_pet(id).expect("删除失败"));
        assert!(db.get_pet(id).expect("查询失败").is_none());
        assert!(db.list_pets().expect("列表失败").is_empty());
        // 重复删除返回 false。
        assert!(!db.delete_pet(id).expect("删除失败"));
    }

    #[test]
    fn update_pet_name_and_personality() {
        let db = memory_db();
        let pet = db.create_pet(&sample_pet()).expect("创建失败");
        let id = pet.id.unwrap();

        let updated = db
            .update_pet(id, "小黑", "calm")
            .expect("更新失败");
        assert_eq!(updated.name, "小黑");
        assert_eq!(updated.personality, Personality::Calm);
        // 其他字段不应变化。
        assert_eq!(updated.pet_type, PetType::Cat);
        assert_eq!(updated.level, 1);

        // 数据库查询验证持久化。
        let fetched = db.get_pet(id).expect("查询失败").expect("应存在");
        assert_eq!(fetched.name, "小黑");
        assert_eq!(fetched.personality, Personality::Calm);
    }

    #[test]
    fn update_pet_not_found() {
        let db = memory_db();
        let result = db.update_pet(999, "不存在", "playful");
        assert!(result.is_err());
    }

    #[test]
    fn update_state_persists() {
        let db = memory_db();
        let pet = db.create_pet(&sample_pet()).expect("创建失败");
        let id = pet.id.unwrap();

        let mut state = PetState::default_for(id);
        state.position_x = 120.5;
        state.position_y = 80.0;
        state.current_action = "walk".to_string();
        state.mood = 70;
        db.update_pet_state(&state).expect("更新失败");

        let fetched = db.get_pet_state(id).expect("查询失败").expect("应存在");
        assert_eq!(fetched.position_x, 120.5);
        assert_eq!(fetched.current_action, "walk");
        assert_eq!(fetched.mood, 70);
    }

    #[test]
    fn v2_migration_creates_chat_messages_table() {
        let db = memory_db();
        let conn = db.conn.lock().unwrap();

        // 验证 chat_messages 表存在且有正确的列。
        conn.prepare("SELECT id, pet_id, role, content, created_at FROM chat_messages LIMIT 0")
            .expect("chat_messages 表应存在");

        // 验证 NOT NULL 约束（pet_id）。
        let result = conn.execute(
            "INSERT INTO chat_messages (pet_id, role, content) VALUES (NULL, 'user', 'test')",
            [],
        );
        assert!(result.is_err(), "pet_id 应拒绝 NULL");

        // 验证 CHECK 约束（role）。
        let result = conn.execute(
            "INSERT INTO chat_messages (pet_id, role, content) VALUES (1, 'invalid', 'test')",
            [],
        );
        assert!(result.is_err(), "role 应拒绝非法值");

        // 验证索引可用。
        conn.execute("SELECT 1 FROM chat_messages WHERE pet_id = 1", [])
            .expect("pet_id 索引应可用");
    }

    #[test]
    fn cascade_delete_removes_state() {
        // 硬删除验证外键级联（业务用软删除，此处验证约束本身）。
        let db = memory_db();
        let pet = db.create_pet(&sample_pet()).expect("创建失败");
        let id = pet.id.unwrap();

        let conn = db.conn.lock().unwrap();
        conn.execute("DELETE FROM pets WHERE id = ?1", params![id])
            .expect("硬删除失败");
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM pet_states WHERE pet_id = ?1",
                params![id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 0, "级联删除应移除状态行");
    }
}
